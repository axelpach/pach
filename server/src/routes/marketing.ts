import { createHmac, timingSafeEqual } from 'node:crypto'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { getDb } from '../db.js'
import {
  designSystems,
  documents,
  mktAudienceMembers,
  mktAudienceSubscriptions,
  mktContentEvents,
  mktContentItems,
  mktCtas,
  mktDistributionRuns,
  mktPublications,
  mktSenderProfiles,
  mktSegmentMembers,
  organizations,
} from '../../../db/schema.js'

const router = Router()
export const publicMarketingRouter = Router()

const DEV_EMAIL_RECIPIENT = process.env.MKT_DEV_EMAIL_RECIPIENT || 'axel@ardia.mx'
const isProduction = process.env.NODE_ENV === 'production'

type UnsubscribeTokenPayload = {
  v: 1
  organizationId: string
  audienceMemberId: string
  publicationId?: string | null
  distributionRunId?: string | null
  contentItemId?: string | null
  iat: number
}

class MarketingInputError extends Error {
  status: number

  constructor(message: string, status = 422) {
    super(message)
    this.name = 'MarketingInputError'
    this.status = status
  }
}

publicMarketingRouter.get('/organizations/:project/marketing/posts', asyncRoute(async (req, res) => {
  const project = readRequiredString(req.params.project)
  const organization = await findPublicOrganization(project)
  if (!organization) {
    res.status(404).json({ error: 'Organization not found' })
    return
  }

  const rows = await getDb()
    .select()
    .from(mktDistributionRuns)
    .where(and(
      eq(mktDistributionRuns.organizationId, organization.id),
      eq(mktDistributionRuns.channel, 'blog'),
      eq(mktDistributionRuns.status, 'published'),
    ))
    .orderBy(desc(mktDistributionRuns.completedAt), desc(mktDistributionRuns.updatedAt))

  const contentIds = unique(rows.map((row) => row.contentItemId))
  const items = contentIds.length
    ? await getDb().select().from(mktContentItems).where(inArray(mktContentItems.id, contentIds))
    : []
  const byId = new Map(items.map((item) => [item.id, item]))

  res.json({
    organization: publicOrganization(organization),
    posts: rows
      .map((run) => {
        const item = run.contentItemId ? byId.get(run.contentItemId) : null
        if (!item || !isPublicBlogContentItem(item)) return null
        return publicPostSummary(item, run)
      })
      .filter(Boolean),
  })
}))

publicMarketingRouter.get('/organizations/:project/marketing/posts/:slug', asyncRoute(async (req, res) => {
  const project = readRequiredString(req.params.project)
  const slug = readRequiredString(req.params.slug)
  const organization = await findPublicOrganization(project)
  if (!organization) {
    res.status(404).json({ error: 'Organization not found' })
    return
  }

  const [item] = await getDb()
    .select()
    .from(mktContentItems)
    .where(and(eq(mktContentItems.organizationId, organization.id), eq(mktContentItems.slug, slug)))
    .limit(1)

  if (!item || !isPublicBlogContentItem(item)) {
    res.status(404).json({ error: 'Post not found' })
    return
  }

  const [run] = await getDb()
    .select()
    .from(mktDistributionRuns)
    .where(and(
      eq(mktDistributionRuns.organizationId, organization.id),
      eq(mktDistributionRuns.contentItemId, item.id),
      eq(mktDistributionRuns.channel, 'blog'),
      eq(mktDistributionRuns.status, 'published'),
    ))
    .orderBy(desc(mktDistributionRuns.completedAt), desc(mktDistributionRuns.updatedAt))
    .limit(1)

  if (!run) {
    res.status(404).json({ error: 'Post not found' })
    return
  }

  const [primaryCta] = item.primaryCtaId
    ? await getDb().select().from(mktCtas).where(eq(mktCtas.id, item.primaryCtaId)).limit(1)
    : []

  await recordEvent({
    organizationId: organization.id,
    contentItemId: item.id,
    distributionRunId: run.id,
    eventType: 'view',
    channel: 'blog',
    source: readOptionalString(req.query.source) ?? 'public_api',
    url: req.originalUrl,
  })

  res.json({
    organization: publicOrganization(organization),
    post: {
      ...publicPostSummary(item, run),
      body: item.body,
      format: item.format,
      tags: item.tags,
      metadata: item.metadata,
      primaryCta: primaryCta && primaryCta.status === 'active' ? {
        id: primaryCta.id,
        label: primaryCta.label,
        destinationUrl: primaryCta.url,
        type: 'link',
      } : null,
    },
  })
}))

publicMarketingRouter.post('/organizations/:project/marketing/subscribe', asyncRoute(async (req, res) => {
  const project = readRequiredString(req.params.project)
  const email = normalizeEmail(readRequiredString(req.body.email))
  const name = readOptionalString(req.body.name)
  const publicationSlug = readOptionalString(req.body.publicationSlug)
  const source = readOptionalString(req.body.source) ?? 'public_blog'
  const pageUrl = readOptionalString(req.body.pageUrl)
  const contentItemId = readOptionalString(req.body.contentItemId)
  const distributionRunId = readOptionalString(req.body.distributionRunId)

  if (!hasPublicMarketingWriteAccess(req)) {
    res.status(401).json({ error: 'Unauthorized marketing write' })
    return
  }

  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Invalid email' })
    return
  }

  const organization = await findPublicOrganization(project)
  if (!organization) {
    res.status(404).json({ error: 'Organization not found' })
    return
  }

  const publication = await findPublicNewsletterPublication(organization.id, publicationSlug)
  if (!publication) {
    res.status(404).json({ error: 'Publication not found' })
    return
  }

  const db = getDb()
  const now = new Date()
  const [existingMember] = await db
    .select()
    .from(mktAudienceMembers)
    .where(and(
      eq(mktAudienceMembers.organizationId, organization.id),
      sql`lower(${mktAudienceMembers.email}) = ${email}`,
    ))
    .limit(1)

  const member = existingMember
    ? (await db
      .update(mktAudienceMembers)
      .set({
        name: name ?? existingMember.name,
        email,
        source: existingMember.source ?? source,
        status: 'active',
        metadata: {
          ...readRecord(existingMember.metadata),
          lastSubscribeSource: source,
          lastSubscribePageUrl: pageUrl,
          lastSubscribedAt: now.toISOString(),
        },
        updatedAt: now,
      })
      .where(eq(mktAudienceMembers.id, existingMember.id))
      .returning())[0]
    : (await db
      .insert(mktAudienceMembers)
      .values({
        id: crypto.randomUUID(),
        organizationId: organization.id,
        name,
        email,
        source,
        status: 'active',
        tags: ['newsletter'],
        metadata: {
          firstSubscribeSource: source,
          firstSubscribePageUrl: pageUrl,
          firstSubscribedAt: now.toISOString(),
        },
        createdAt: now,
        updatedAt: now,
      })
      .returning())[0]

  const [existingSubscription] = await db
    .select()
    .from(mktAudienceSubscriptions)
    .where(and(
      eq(mktAudienceSubscriptions.organizationId, organization.id),
      eq(mktAudienceSubscriptions.audienceMemberId, member.id),
      eq(mktAudienceSubscriptions.publicationId, publication.id),
      eq(mktAudienceSubscriptions.channel, 'newsletter'),
    ))
    .limit(1)

  const subscription = existingSubscription
    ? (await db
      .update(mktAudienceSubscriptions)
      .set({
        status: 'subscribed',
        consentSource: source,
        consentedAt: now,
        unsubscribedAt: null,
        metadata: {
          ...readRecord(existingSubscription.metadata),
          lastSubscribePageUrl: pageUrl,
        },
        updatedAt: now,
      })
      .where(eq(mktAudienceSubscriptions.id, existingSubscription.id))
      .returning())[0]
    : (await db
      .insert(mktAudienceSubscriptions)
      .values({
        id: crypto.randomUUID(),
        organizationId: organization.id,
        audienceMemberId: member.id,
        publicationId: publication.id,
        channel: 'newsletter',
        status: 'subscribed',
        consentSource: source,
        consentedAt: now,
        metadata: { pageUrl },
        createdAt: now,
        updatedAt: now,
      })
      .returning())[0]

  await recordEvent({
    organizationId: organization.id,
    contentItemId,
    distributionRunId,
    audienceMemberId: member.id,
    eventType: 'subscribe',
    channel: 'newsletter',
    source,
    url: pageUrl,
    metadata: {
      publicationId: publication.id,
      publicationSlug: publication.slug,
    },
  })

  const confirmation = await sendSubscriptionConfirmationSafely({
    organization,
    publication,
    member,
    recipientEmail: email,
    pageUrl,
  })
  if (confirmation.error) {
    console.warn('[Marketing subscribe] confirmation email failed:', confirmation.error)
  }

  res.status(201).json({
    ok: true,
    confirmationEmail: confirmation.ok ? { sent: true, redirectedTo: confirmation.redirectedTo } : { sent: false },
    audienceMember: {
      id: member.id,
      email: member.email,
      status: member.status,
    },
    subscription: {
      id: subscription.id,
      status: subscription.status,
    },
    publication: {
      id: publication.id,
      name: publication.name,
      slug: publication.slug,
    },
  })
}))

publicMarketingRouter.get('/marketing/unsubscribe', asyncRoute(async (req, res) => {
  const token = readRequiredString(req.query.t)
  const payload = verifyUnsubscribeToken(token)
  if (!payload) {
    res.status(400).type('html').send(renderNeutralMarketingPage({
      title: 'Link inválido',
      eyebrow: 'Newsletter',
      message: 'No pudimos validar este enlace de cancelación.',
    }))
    return
  }

  const db = getDb()
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, payload.organizationId))
    .limit(1)

  if (!organization) {
    res.status(404).type('html').send(renderNeutralMarketingPage({
      title: 'No encontramos la organización',
      eyebrow: 'Newsletter',
      message: 'Este enlace ya no apunta a una organización activa.',
    }))
    return
  }

  const [member] = await db
    .select()
    .from(mktAudienceMembers)
    .where(and(
      eq(mktAudienceMembers.id, payload.audienceMemberId),
      eq(mktAudienceMembers.organizationId, payload.organizationId),
    ))
    .limit(1)

  const [publication] = payload.publicationId
    ? await db
      .select()
      .from(mktPublications)
      .where(and(
        eq(mktPublications.id, payload.publicationId),
        eq(mktPublications.organizationId, payload.organizationId),
      ))
      .limit(1)
    : []

  const [subscription] = await db
    .select()
    .from(mktAudienceSubscriptions)
    .where(and(
      eq(mktAudienceSubscriptions.organizationId, payload.organizationId),
      eq(mktAudienceSubscriptions.audienceMemberId, payload.audienceMemberId),
      eq(mktAudienceSubscriptions.channel, 'newsletter'),
      payload.publicationId
        ? eq(mktAudienceSubscriptions.publicationId, payload.publicationId)
        : isNull(mktAudienceSubscriptions.publicationId),
    ))
    .limit(1)

  const now = new Date()
  const alreadyUnsubscribed = subscription?.status === 'unsubscribed'
  if (subscription && !alreadyUnsubscribed) {
    await db
      .update(mktAudienceSubscriptions)
      .set({
        status: 'unsubscribed',
        unsubscribedAt: now,
        metadata: {
          ...readRecord(subscription.metadata),
          lastUnsubscribeSource: 'email_footer',
          lastUnsubscribeAt: now.toISOString(),
        },
        updatedAt: now,
      })
      .where(eq(mktAudienceSubscriptions.id, subscription.id))
  }

  await recordEvent({
    organizationId: payload.organizationId,
    contentItemId: payload.contentItemId,
    distributionRunId: payload.distributionRunId,
    audienceMemberId: payload.audienceMemberId,
    eventType: 'unsubscribe',
    channel: 'newsletter',
    source: 'email_footer',
    metadata: {
      publicationId: payload.publicationId,
      subscriptionId: subscription?.id,
      alreadyUnsubscribed,
      memberFound: Boolean(member),
    },
  })

  const designSystem = await organizationDesignSystem(payload.organizationId)
  res.type('html').send(renderUnsubscribePage({
    organization,
    publication,
    designSystem,
    member,
    subscriptionFound: Boolean(subscription),
    alreadyUnsubscribed,
  }))
}))

publicMarketingRouter.get('/marketing/track/click', asyncRoute(async (req, res) => {
  const url = readOptionalString(req.query.url)
  const organizationId = readOptionalString(req.query.organizationId)
  if (!url || !isSafeRedirectUrl(url)) {
    res.status(400).json({ error: 'Invalid URL' })
    return
  }

  if (organizationId) {
    await recordEvent({
      organizationId,
      contentItemId: readOptionalString(req.query.contentItemId),
      distributionRunId: readOptionalString(req.query.distributionRunId),
      audienceMemberId: readOptionalString(req.query.audienceMemberId),
      ctaId: readOptionalString(req.query.ctaId),
      eventType: 'click',
      channel: readOptionalString(req.query.channel),
      source: readOptionalString(req.query.source),
      url,
      metadata: {
        userAgent: req.headers['user-agent'],
        referer: req.headers.referer,
      },
    })
  }

  res.redirect(302, url)
}))

router.get('/content-items', asyncRoute(async (req, res) => {
  const organizationId = readRequiredString(req.query.organizationId)
  const sourceDocumentId = readOptionalString(req.query.sourceDocumentId)
  requireOrganizationAccess(req, organizationId)

  const rows = await getDb()
    .select()
    .from(mktContentItems)
    .where(sourceDocumentId
      ? and(eq(mktContentItems.organizationId, organizationId), eq(mktContentItems.sourceDocumentId, sourceDocumentId))
      : eq(mktContentItems.organizationId, organizationId))
    .orderBy(desc(mktContentItems.updatedAt))

  res.json({ contentItems: serializeDates(rows) })
}))

router.post('/content/from-document', asyncRoute(async (req, res) => {
  const documentId = readRequiredString(req.body.documentId)
  const channels = readStringArray(req.body.supportedChannels, ['blog', 'newsletter'])
  const primaryCtaId = readOptionalString(req.body.primaryCtaId)
  const status = readOptionalString(req.body.status) ?? 'draft'
  const excerptInput = readOptionalString(req.body.excerpt)

  const [document] = await getDb().select().from(documents).where(eq(documents.id, documentId)).limit(1)
  if (!document || document.status === 'archived') {
    res.status(404).json({ error: 'Document not found' })
    return
  }
  requireOrganizationAccess(req, document.organizationId)
  if (!document.organizationId) {
    res.status(400).json({ error: 'Document must belong to an organization' })
    return
  }

  const [existing] = await getDb()
    .select()
    .from(mktContentItems)
    .where(and(
      eq(mktContentItems.organizationId, document.organizationId),
      eq(mktContentItems.sourceDocumentId, document.id),
    ))
    .orderBy(desc(mktContentItems.updatedAt))
    .limit(1)

  if (existing) {
    res.status(200).json({ ok: true, alreadyExists: true, contentItem: serializeDates(existing) })
    return
  }

  const slug = await uniqueSlug(readOptionalString(req.body.slug) ?? document.slug ?? document.title, document.organizationId)
  const now = new Date()
  const [created] = await getDb()
    .insert(mktContentItems)
    .values({
      id: crypto.randomUUID(),
      organizationId: document.organizationId,
      sourceDocumentId: document.id,
      primaryCtaId,
      title: readOptionalString(req.body.title) ?? document.title,
      slug,
      excerpt: excerptInput ?? firstParagraph(document.body),
      contentKind: 'article',
      supportedChannels: channels,
      status,
      body: document.body,
      format: document.format,
      tags: readStringArray(req.body.tags, []),
      metadata: {
        sourceDocumentTitle: document.title,
        snapshotAt: now.toISOString(),
      },
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  res.status(201).json({ ok: true, contentItem: serializeDates(created) })
}))

router.post('/content/:id/snapshot', asyncRoute(async (req, res) => {
  const contentItemId = readRequiredString(req.params.id)
  const [item] = await getDb().select().from(mktContentItems).where(eq(mktContentItems.id, contentItemId)).limit(1)
  if (!item) {
    res.status(404).json({ error: 'Content item not found' })
    return
  }
  requireOrganizationAccess(req, item.organizationId)
  if (!item.sourceDocumentId) {
    res.status(400).json({ error: 'Content item has no source document' })
    return
  }
  const [document] = await getDb().select().from(documents).where(eq(documents.id, item.sourceDocumentId)).limit(1)
  if (!document) {
    res.status(404).json({ error: 'Source document not found' })
    return
  }

  const [updated] = await getDb()
    .update(mktContentItems)
    .set({
      title: readOptionalString(req.body.title) ?? document.title,
      excerpt: readOptionalString(req.body.excerpt) ?? item.excerpt ?? firstParagraph(document.body),
      body: document.body,
      format: document.format,
      status: readOptionalString(req.body.status) ?? item.status,
      metadata: { ...(item.metadata ?? {}), snapshotAt: new Date().toISOString() },
      updatedAt: new Date(),
    })
    .where(eq(mktContentItems.id, item.id))
    .returning()

  res.json({ ok: true, contentItem: serializeDates(updated) })
}))

router.post('/content/:id/publish-blog', asyncRoute(async (req, res) => {
  const contentItemId = readRequiredString(req.params.id)
  const [item] = await getDb().select().from(mktContentItems).where(eq(mktContentItems.id, contentItemId)).limit(1)
  if (!item) {
    res.status(404).json({ error: 'Content item not found' })
    return
  }
  requireOrganizationAccess(req, item.organizationId)
  if (!item.supportedChannels.includes('blog')) {
    res.status(400).json({ error: 'Content item does not support the blog channel' })
    return
  }
  const now = new Date()
  const existing = await getDb()
    .select()
    .from(mktDistributionRuns)
    .where(and(
      eq(mktDistributionRuns.organizationId, item.organizationId),
      eq(mktDistributionRuns.contentItemId, item.id),
      eq(mktDistributionRuns.channel, 'blog'),
    ))
    .limit(1)

  const run = existing[0]
  const payload = {
    status: 'published',
    completedAt: now,
    metrics: run?.metrics ?? {},
    metadata: { ...(run?.metadata ?? {}), publishedAt: now.toISOString() },
    updatedAt: now,
  }

  const [savedRun] = run
    ? await getDb().update(mktDistributionRuns).set(payload).where(eq(mktDistributionRuns.id, run.id)).returning()
    : await getDb().insert(mktDistributionRuns).values({
      id: crypto.randomUUID(),
      organizationId: item.organizationId,
      contentItemId: item.id,
      channel: 'blog',
      distributionType: 'publish',
      name: item.title,
      status: 'published',
      completedAt: now,
      recipientFilter: {},
      metrics: {},
      metadata: { publishedAt: now.toISOString() },
      createdAt: now,
      updatedAt: now,
    }).returning()

  await getDb().update(mktContentItems).set({ status: 'ready', updatedAt: now }).where(eq(mktContentItems.id, item.id))
  res.json({ ok: true, distributionRun: serializeDates(savedRun) })
}))

router.post('/distribution-runs/:id/send', asyncRoute(async (req, res) => {
  const distributionRunId = readRequiredString(req.params.id)
  const [run] = await getDb().select().from(mktDistributionRuns).where(eq(mktDistributionRuns.id, distributionRunId)).limit(1)
  if (!run) {
    res.status(404).json({ error: 'Distribution run not found' })
    return
  }
  requireOrganizationAccess(req, run.organizationId)
  if (run.channel !== 'newsletter') {
    res.status(400).json({ error: 'Only newsletter runs can be sent by this route' })
    return
  }

  const result = await sendNewsletterRun(run.id, Boolean(req.body.testOnly))
  res.json({ ok: true, ...result })
}))

router.post('/distribution-runs/:id/render', asyncRoute(async (req, res) => {
  const distributionRunId = readRequiredString(req.params.id)
  const [run] = await getDb().select().from(mktDistributionRuns).where(eq(mktDistributionRuns.id, distributionRunId)).limit(1)
  if (!run) {
    res.status(404).json({ error: 'Distribution run not found' })
    return
  }
  requireOrganizationAccess(req, run.organizationId)
  if (run.channel !== 'newsletter') {
    res.status(400).json({ error: 'Only newsletter runs can be rendered by this route' })
    return
  }

  const result = await renderNewsletterRun(run.id, readOptionalString(req.body.recipientName) ?? 'Test recipient')
  res.json({ ok: true, ...result })
}))

async function sendNewsletterRun(runId: string, testOnly: boolean) {
  const db = getDb()
  const [run] = await db.select().from(mktDistributionRuns).where(eq(mktDistributionRuns.id, runId)).limit(1)
  if (!run) throw new MarketingInputError('Distribution run not found', 404)
  const [item] = run.contentItemId ? await db.select().from(mktContentItems).where(eq(mktContentItems.id, run.contentItemId)).limit(1) : []
  if (!item) throw new MarketingInputError('Broadcast is missing a content item')
  const [publication] = run.publicationId ? await db.select().from(mktPublications).where(eq(mktPublications.id, run.publicationId)).limit(1) : []
  const senderProfileId = run.senderProfileId ?? publication?.defaultSenderProfileId
  const [sender] = senderProfileId ? await db.select().from(mktSenderProfiles).where(eq(mktSenderProfiles.id, senderProfileId)).limit(1) : []
  if (!sender) {
    throw new MarketingInputError(
      run.senderProfileId
        ? 'Selected sender profile was not found'
        : 'Publication default sender profile is missing. Pick a sender on this broadcast or set a default sender on the publication.',
    )
  }
  const designSystem = await organizationDesignSystem(run.organizationId)
  const primaryCta = await activePrimaryCta(item)

  const recipients = testOnly
    ? []
    : await newsletterRecipients(run.organizationId, run.publicationId ?? undefined, run.segmentId ?? undefined)
  const sendList = testOnly
    ? [{ email: DEV_EMAIL_RECIPIENT, name: 'Test recipient', id: null as string | null, originalEmail: DEV_EMAIL_RECIPIENT }]
    : recipients.map((recipient) => ({
      email: isProduction ? recipient.email as string : DEV_EMAIL_RECIPIENT,
      name: recipient.name,
      id: recipient.id,
      originalEmail: recipient.email,
    }))

  const now = new Date()
  if (!testOnly) {
    await db.update(mktDistributionRuns).set({ status: 'sending', startedAt: now, error: null, updatedAt: now }).where(eq(mktDistributionRuns.id, run.id))
  }

  let sent = 0
  let failed = 0
  const errors: string[] = []
  for (const recipient of sendList) {
    try {
      const unsubscribeUrl = recipient.id
        ? marketingUnsubscribeUrl({
          organizationId: run.organizationId,
          audienceMemberId: recipient.id,
          publicationId: run.publicationId,
          distributionRunId: run.id,
          contentItemId: item.id,
        })
        : undefined
      const response = await sendViaResend({
        from: formatAddress(sender.fromName, sender.fromEmail),
        replyTo: sender.replyToEmail ? formatAddress(sender.replyToName ?? sender.fromName, sender.replyToEmail) : undefined,
        to: recipient.email,
        subject: run.subject || item.title,
        html: renderNewsletterHtml({ item, run, publication, sender, designSystem, primaryCta, audienceMemberId: recipient.id, unsubscribeUrl }),
        text: renderNewsletterText({ item, publication, primaryCta, unsubscribeUrl }),
        tags: [
          { name: 'run_id', value: run.id },
          { name: 'content_id', value: item.id },
        ],
      })
      if (!response.ok) throw new Error(response.error ?? 'Resend send failed')
      sent += 1
      if (recipient.id) {
        await recordEvent({
          organizationId: run.organizationId,
          contentItemId: item.id,
          distributionRunId: run.id,
          audienceMemberId: recipient.id,
          eventType: 'send',
          channel: 'newsletter',
          source: testOnly ? 'test' : 'broadcast',
          metadata: {
            resendId: response.id,
            redirectedTo: !isProduction ? recipient.email : undefined,
            originalEmail: !isProduction ? recipient.originalEmail : undefined,
          },
        })
      }
    } catch (error) {
      failed += 1
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }

  const completedAt = new Date()
  const status = failed > 0 && sent === 0 ? 'failed' : 'sent'
  const metrics = testOnly
    ? { ...(run.metrics ?? {}), lastTest: { sent, failed, attempted: sendList.length, at: completedAt.toISOString() } }
    : { ...(run.metrics ?? {}), sent, failed, attempted: sendList.length, testOnly }
  const [updated] = testOnly
    ? await db
      .update(mktDistributionRuns)
      .set({
        metrics,
        error: errors[0] ?? null,
        updatedAt: completedAt,
      })
      .where(eq(mktDistributionRuns.id, run.id))
      .returning()
    : await db
      .update(mktDistributionRuns)
      .set({
        status,
        completedAt,
        metrics,
        error: errors[0] ?? null,
        updatedAt: completedAt,
      })
      .where(eq(mktDistributionRuns.id, run.id))
      .returning()

  return { distributionRun: serializeDates(updated), metrics, errors }
}

async function renderNewsletterRun(runId: string, recipientName: string) {
  const db = getDb()
  const [run] = await db.select().from(mktDistributionRuns).where(eq(mktDistributionRuns.id, runId)).limit(1)
  if (!run) throw new MarketingInputError('Distribution run not found', 404)
  const [item] = run.contentItemId ? await db.select().from(mktContentItems).where(eq(mktContentItems.id, run.contentItemId)).limit(1) : []
  if (!item) throw new MarketingInputError('Broadcast is missing a content item')
  const [publication] = run.publicationId ? await db.select().from(mktPublications).where(eq(mktPublications.id, run.publicationId)).limit(1) : []
  const senderProfileId = run.senderProfileId ?? publication?.defaultSenderProfileId
  const [sender] = senderProfileId ? await db.select().from(mktSenderProfiles).where(eq(mktSenderProfiles.id, senderProfileId)).limit(1) : []
  if (!sender) {
    throw new MarketingInputError(
      run.senderProfileId
        ? 'Selected sender profile was not found'
        : 'Publication default sender profile is missing. Pick a sender on this broadcast or set a default sender on the publication.',
    )
  }
  const designSystem = await organizationDesignSystem(run.organizationId)
  const primaryCta = await activePrimaryCta(item)

  return {
    html: renderNewsletterHtml({ item, run, publication, sender, designSystem, primaryCta, recipientName }),
    text: renderNewsletterText({ item, publication, primaryCta }),
    warnings: newsletterRenderWarnings(item.body),
    mode: emailThemeMode(run, publication, designSystem),
  }
}

function newsletterRenderWarnings(markdown: string) {
  const warnings: Array<{ code: string; message: string; severity: 'info' | 'warning' | 'error' }> = []
  if (markdown.length > 90000) {
    warnings.push({
      code: 'large_email',
      message: 'This email is large and may be clipped by some email clients.',
      severity: 'warning',
    })
  }
  if (/!\[[^\]]*]\([^)]*\.webp(?:\?[^)]*)?\)/i.test(markdown)) {
    warnings.push({
      code: 'webp_email_image',
      message: 'WebP images may not render in every email client. Use PNG or JPEG for production broadcasts.',
      severity: 'warning',
    })
  }
  return warnings
}

async function organizationDesignSystem(organizationId: string) {
  const [designSystem] = await getDb()
    .select()
    .from(designSystems)
    .where(eq(designSystems.organizationId, organizationId))
    .orderBy(desc(designSystems.updatedAt))
    .limit(1)
  return designSystem ?? null
}

async function newsletterRecipients(organizationId: string, publicationId?: string, segmentId?: string) {
  const db = getDb()
  let subscriptions = await db
    .select()
    .from(mktAudienceSubscriptions)
    .where(and(
      eq(mktAudienceSubscriptions.organizationId, organizationId),
      eq(mktAudienceSubscriptions.channel, 'newsletter'),
      eq(mktAudienceSubscriptions.status, 'subscribed'),
      publicationId ? eq(mktAudienceSubscriptions.publicationId, publicationId) : isNull(mktAudienceSubscriptions.publicationId),
    ))

  if (segmentId) {
    const segmentMembers = await db
      .select()
      .from(mktSegmentMembers)
      .where(and(
        eq(mktSegmentMembers.organizationId, organizationId),
        eq(mktSegmentMembers.segmentId, segmentId),
      ))
    const allowedMemberIds = new Set(segmentMembers.map((member) => member.audienceMemberId))
    subscriptions = subscriptions.filter((subscription) => allowedMemberIds.has(subscription.audienceMemberId))
  }

  const memberIds = unique(subscriptions.map((sub) => sub.audienceMemberId))
  const members = memberIds.length ? await db.select().from(mktAudienceMembers).where(inArray(mktAudienceMembers.id, memberIds)) : []
  const byId = new Map(members.map((member) => [member.id, member]))
  return subscriptions
    .map((sub) => byId.get(sub.audienceMemberId))
    .filter((member): member is typeof mktAudienceMembers.$inferSelect => Boolean(member?.email && member.status === 'active'))
}

async function sendViaResend(input: {
  from: string
  replyTo?: string
  to: string
  subject: string
  html: string
  text: string
  tags?: Array<{ name: string; value: string }>
}) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log('[Marketing email] RESEND_API_KEY not configured. Would send:', input)
    return { ok: true, id: 'simulated' }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: input.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: input.replyTo,
      tags: input.tags,
    }),
  })
  const payload = await response.json().catch(() => null) as { id?: string; message?: string; error?: { message?: string } } | null
  if (!response.ok) {
    return { ok: false, error: payload?.message ?? payload?.error?.message ?? `Resend ${response.status}` }
  }
  return { ok: true, id: payload?.id }
}

async function sendSubscriptionConfirmation({
  organization,
  publication,
  member,
  recipientEmail,
  pageUrl,
}: {
  organization: typeof organizations.$inferSelect
  publication: typeof mktPublications.$inferSelect
  member: typeof mktAudienceMembers.$inferSelect
  recipientEmail: string
  pageUrl?: string
}) {
  const sender = await senderForPublication(publication)
  if (!sender) return { ok: false, error: 'sender profile not found' }

  const designSystem = await organizationDesignSystem(organization.id)
  const to = isProduction ? recipientEmail : DEV_EMAIL_RECIPIENT
  const unsubscribeUrl = marketingUnsubscribeUrl({
    organizationId: organization.id,
    audienceMemberId: member.id,
    publicationId: publication.id,
  })
  const response = await sendViaResend({
    from: formatAddress(sender.fromName, sender.fromEmail),
    replyTo: sender.replyToEmail ? formatAddress(sender.replyToName ?? sender.fromName, sender.replyToEmail) : undefined,
    to,
    subject: `Ya estás suscrito a ${organization.name}`,
    html: renderSubscriptionConfirmationHtml({ organization, publication, sender, designSystem, pageUrl, unsubscribeUrl }),
    text: renderSubscriptionConfirmationText({ organization, pageUrl, unsubscribeUrl }),
    tags: [
      { name: 'publication_id', value: publication.id },
      { name: 'audience_member_id', value: member.id },
      { name: 'event', value: 'subscribe_confirmation' },
    ],
  })

  if (!response.ok) return { ok: false, error: response.error }

  await recordEvent({
    organizationId: organization.id,
    audienceMemberId: member.id,
    eventType: 'confirmation_send',
    channel: 'newsletter',
    source: 'subscribe',
    url: pageUrl,
    metadata: {
      resendId: response.id,
      publicationId: publication.id,
      redirectedTo: !isProduction ? to : undefined,
      originalEmail: !isProduction ? recipientEmail : undefined,
    },
  })

  return { ok: true, id: response.id, redirectedTo: !isProduction ? to : undefined }
}

async function sendSubscriptionConfirmationSafely(input: Parameters<typeof sendSubscriptionConfirmation>[0]) {
  try {
    return await sendSubscriptionConfirmation(input)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function senderForPublication(publication: typeof mktPublications.$inferSelect) {
  if (publication.defaultSenderProfileId) {
    const [sender] = await getDb()
      .select()
      .from(mktSenderProfiles)
      .where(and(
        eq(mktSenderProfiles.id, publication.defaultSenderProfileId),
        eq(mktSenderProfiles.organizationId, publication.organizationId),
        eq(mktSenderProfiles.status, 'active'),
      ))
      .limit(1)
    if (sender) return sender
  }

  const [fallback] = await getDb()
    .select()
    .from(mktSenderProfiles)
    .where(and(
      eq(mktSenderProfiles.organizationId, publication.organizationId),
      eq(mktSenderProfiles.status, 'active'),
    ))
    .orderBy(desc(mktSenderProfiles.updatedAt))
    .limit(1)
  return fallback ?? null
}

function renderSubscriptionConfirmationHtml({
  organization,
  publication,
  sender,
  designSystem,
  pageUrl,
  unsubscribeUrl,
}: {
  organization: typeof organizations.$inferSelect
  publication: typeof mktPublications.$inferSelect
  sender: typeof mktSenderProfiles.$inferSelect
  designSystem?: typeof designSystems.$inferSelect | null
  pageUrl?: string
  unsubscribeUrl?: string
}) {
  const mode: EmailThemeMode = 'light'
  const palette = newsletterEmailPalette(designSystem, mode)
  const wrapper = publicationEmailWrapper(publication)
  const headerBlock = renderEmailBrandHeader({ wrapper, sender, designSystem, mode, palette })
  const blogUrl = `${publicSiteBase(organization, pageUrl)}/blog`
  return `<!doctype html>
<html>
  ${emailHeadHtml()}
  <body style="margin:0;padding:0;background:${palette.bodyBg};color:${palette.text};font-family:${palette.fontSans};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;">
    <div style="display:none;max-height:0;overflow:hidden">Confirmamos tu suscripción a ${escapeHtml(organization.name)}.</div>
    <div style="background:${palette.bodyBg};padding:40px 16px;">
      <main style="max-width:560px;margin:0 auto 40px;padding:40px 36px;background:${palette.containerBg};border:1px solid ${palette.containerBorder};">
        ${headerBlock}
        <h1 style="font-size:28px;line-height:1.2;font-weight:200;letter-spacing:-0.04em;margin:0 0 24px;color:${palette.text};">Ya estás suscrito<span style="color:${palette.accent};">.</span></h1>
        <p style="font-size:15px;line-height:1.6;font-weight:300;color:${palette.textSoft};margin:0 0 14px;">Te enviaremos los próximos análisis sobre cobranza, conciliación y operación inmobiliaria en México.</p>
        <p style="font-size:15px;line-height:1.6;font-weight:300;color:${palette.textSoft};margin:0 0 24px;">Mientras tanto, puedes seguir leyendo el blog de ${escapeHtml(organization.name)}.</p>
        <div style="text-align:left;margin:24px 0;"><a href="${escapeAttribute(blogUrl)}" style="display:inline-block;border:1px solid ${palette.accent};border-radius:0;color:${palette.buttonText};background:${palette.buttonBg};padding:11px 22px;text-decoration:none;text-align:center;font-size:13px;font-weight:500;line-height:1.2;">Leer el blog</a></div>
        <footer style="border-top:1px solid ${palette.hairline};margin:40px 0 0;padding:20px 0 0;color:${palette.textMuted};font-family:${palette.fontSerif};font-style:italic;font-size:12.5px;line-height:20px;">Si no pediste esta suscripción, puedes ${unsubscribeUrl ? `<a href="${escapeAttribute(unsubscribeUrl)}" style="color:${palette.textMuted};text-decoration:underline;">cancelarla aquí</a>` : 'ignorar este correo'}.</footer>
      </main>
    </div>
  </body>
</html>`
}

function renderSubscriptionConfirmationText({
  organization,
  pageUrl,
  unsubscribeUrl,
}: {
  organization: typeof organizations.$inferSelect
  pageUrl?: string
  unsubscribeUrl?: string
}) {
  return [
    `Ya estás suscrito a ${organization.name}.`,
    'Te enviaremos los próximos análisis sobre cobranza, conciliación y operación inmobiliaria en México.',
    `Leer el blog: ${publicSiteBase(organization, pageUrl)}/blog`,
    unsubscribeUrl ? `Cancelar suscripción: ${unsubscribeUrl}` : null,
  ].filter(Boolean).join('\n\n')
}

function publicSiteBase(organization: typeof organizations.$inferSelect, pageUrl?: string) {
  const configured = process.env.ARDIA_PUBLIC_URL || process.env.PUBLIC_SITE_URL
  if (configured) return configured.replace(/\/+$/, '')
  if (pageUrl && isSafeRedirectUrl(pageUrl)) {
    return new URL(pageUrl).origin.replace(/\/+$/, '')
  }
  if (organization.project === 'ardia') return 'https://ardia.mx'
  return 'https://pach.world'
}

type EmailThemeMode = 'dark' | 'light'

type EmailPalette = {
  mode: EmailThemeMode
  bodyBg: string
  containerBg: string
  containerBorder: string
  surface: string
  text: string
  textSoft: string
  textMuted: string
  hairline: string
  hairlineStrong: string
  accent: string
  buttonBg: string
  buttonText: string
  codeBg: string
  fontSans: string
  fontSerif: string
  fontMono: string
}

const DEFAULT_EMAIL_PALETTE: EmailPalette = {
  mode: 'light',
  bodyBg: '#ffffff',
  containerBg: '#ffffff',
  containerBorder: 'rgba(30, 22, 16, 0.12)',
  surface: '#ffffff',
  text: '#1a1612',
  textSoft: 'rgba(26, 22, 18, 0.72)',
  textMuted: 'rgba(26, 22, 18, 0.45)',
  hairline: 'rgba(30, 22, 16, 0.06)',
  hairlineStrong: 'rgba(30, 22, 16, 0.12)',
  accent: '#E43F3F',
  buttonBg: '#E43F3F',
  buttonText: '#ffffff',
  codeBg: '#f5f0e8',
  fontSans: "'Inter Tight', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  fontSerif: "'Instrument Serif', Georgia, 'Times New Roman', serif",
  fontMono: "'Geist Mono', 'SFMono-Regular', Menlo, Consolas, 'Courier New', monospace",
}

function renderNewsletterHtml({
  item,
  run,
  publication,
  sender,
  designSystem,
  primaryCta,
  audienceMemberId,
  recipientName,
}: {
  item: typeof mktContentItems.$inferSelect
  run: typeof mktDistributionRuns.$inferSelect
  publication?: typeof mktPublications.$inferSelect
  sender: typeof mktSenderProfiles.$inferSelect
  designSystem?: typeof designSystems.$inferSelect | null
  primaryCta?: typeof mktCtas.$inferSelect | null
  audienceMemberId?: string | null
  recipientName?: string | null
  unsubscribeUrl?: string | null
}) {
  const mode = emailThemeMode(run, publication, designSystem)
  const palette = newsletterEmailPalette(designSystem, mode)
  const preheader = run.preheader ? `<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(run.preheader)}</div>` : ''
  const wrapper = publicationEmailWrapper(publication)
  const headerBlock = renderEmailBrandHeader({ wrapper, sender, designSystem, mode, palette })
  const beforeContentBlock = wrapper.beforeContent
    ? `<section style="border-bottom:1px solid ${palette.hairline};margin:0 0 24px;padding:0 0 18px;color:${palette.textSoft};">${markdownToEmailHtml(wrapper.beforeContent, palette)}</section>`
    : ''
  const selectedCta = primaryCta
    ? { id: primaryCta.id, label: primaryCta.label, url: primaryCta.url }
    : wrapper.cta?.label && wrapper.cta.url
      ? { id: null, label: wrapper.cta.label, url: wrapper.cta.url }
      : null
  const ctaBlock = selectedCta
    ? `<div style="text-align:left;margin:24px 0;"><a href="${escapeAttribute(marketingClickUrl({ run, item, ctaId: selectedCta.id, audienceMemberId, url: selectedCta.url }))}" style="display:inline-block;border:1px solid ${palette.accent};border-radius:0;color:${palette.buttonText};background:${palette.buttonBg};padding:11px 22px;text-decoration:none;text-align:center;font-size:13px;font-weight:500;line-height:1.2;">${escapeHtml(selectedCta.label)}</a></div>`
    : ''
  const footerInner = [
    wrapper.footer ? markdownToEmailHtml(wrapper.footer, palette) : '',
    unsubscribeUrl
      ? `<p style="margin:14px 0 0;">Si no quieres recibir estos correos, puedes <a href="${escapeAttribute(unsubscribeUrl)}" style="color:${palette.textMuted};text-decoration:underline;">cancelar tu suscripción</a>.</p>`
      : '',
  ].filter(Boolean).join('')
  const footerBlock = footerInner
    ? `<footer style="border-top:1px solid ${palette.hairline};margin:40px 0 0;padding:20px 0 0;color:${palette.textMuted};font-family:${palette.fontSerif};font-style:italic;font-size:12.5px;line-height:20px;">${footerInner}</footer>`
    : ''
  return `<!doctype html>
<html>
  ${emailHeadHtml()}
  <body style="margin:0;padding:0;background:${palette.bodyBg};color:${palette.text};font-family:${palette.fontSans};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;">
    ${preheader}
    <div style="background:${palette.bodyBg};padding:40px 16px;">
      <main style="max-width:560px;margin:0 auto 40px;padding:40px 36px;background:${palette.containerBg};border:1px solid ${palette.containerBorder};">
        ${headerBlock}
        ${beforeContentBlock}
        <h1 style="font-size:28px;line-height:1.2;font-weight:200;letter-spacing:-0.04em;margin:0 0 24px;color:${palette.text};">${escapeHtml(item.title)}</h1>
        ${item.excerpt ? `<p style="font-size:15px;line-height:1.6;font-weight:300;color:${palette.textSoft};margin:0 0 14px;">${escapeHtml(item.excerpt)}</p>` : ''}
        <div style="font-size:15px;line-height:1.6;font-weight:300;color:${palette.textSoft};">${markdownToEmailHtml(item.body, palette)}</div>
        ${ctaBlock}
        ${footerBlock}
      </main>
    </div>
  </body>
</html>`
}

async function activePrimaryCta(item: typeof mktContentItems.$inferSelect) {
  if (!item.primaryCtaId) return null
  const [cta] = await getDb()
    .select()
    .from(mktCtas)
    .where(and(eq(mktCtas.id, item.primaryCtaId), eq(mktCtas.organizationId, item.organizationId)))
    .limit(1)
  return cta?.status === 'active' ? cta : null
}

function renderNewsletterText({
  item,
  publication,
  primaryCta,
  unsubscribeUrl,
}: {
  item: typeof mktContentItems.$inferSelect
  publication?: typeof mktPublications.$inferSelect
  primaryCta?: typeof mktCtas.$inferSelect | null
  unsubscribeUrl?: string | null
}) {
  const wrapper = publicationEmailWrapper(publication)
  const selectedCta = primaryCta
    ? { label: primaryCta.label, url: primaryCta.url }
    : wrapper.cta?.label && wrapper.cta.url
      ? { label: wrapper.cta.label, url: wrapper.cta.url }
      : null
  return [
    item.title,
    item.excerpt,
    markdownToText(item.body),
    selectedCta ? `${selectedCta.label}: ${selectedCta.url}` : null,
    unsubscribeUrl ? `Cancelar suscripción: ${unsubscribeUrl}` : null,
  ].filter(Boolean).join('\n\n')
}

function marketingClickUrl({
  run,
  item,
  ctaId,
  audienceMemberId,
  url,
}: {
  run: typeof mktDistributionRuns.$inferSelect
  item: typeof mktContentItems.$inferSelect
  ctaId?: string | null
  audienceMemberId?: string | null
  url: string
}) {
  const trackUrl = new URL(`${pachPublicApiBase()}/public/marketing/track/click`)
  trackUrl.searchParams.set('organizationId', run.organizationId)
  trackUrl.searchParams.set('contentItemId', item.id)
  trackUrl.searchParams.set('distributionRunId', run.id)
  trackUrl.searchParams.set('channel', 'newsletter')
  trackUrl.searchParams.set('source', 'email')
  trackUrl.searchParams.set('url', url)
  if (ctaId) trackUrl.searchParams.set('ctaId', ctaId)
  if (audienceMemberId) trackUrl.searchParams.set('audienceMemberId', audienceMemberId)
  return trackUrl.toString()
}

function marketingUnsubscribeUrl(input: Omit<UnsubscribeTokenPayload, 'v' | 'iat'>) {
  const unsubscribeUrl = new URL(`${pachPublicApiBase()}/public/marketing/unsubscribe`)
  unsubscribeUrl.searchParams.set('t', signUnsubscribeToken(input))
  return unsubscribeUrl.toString()
}

function signUnsubscribeToken(input: Omit<UnsubscribeTokenPayload, 'v' | 'iat'>) {
  const payload: UnsubscribeTokenPayload = {
    v: 1,
    organizationId: input.organizationId,
    audienceMemberId: input.audienceMemberId,
    publicationId: input.publicationId ?? null,
    distributionRunId: input.distributionRunId ?? null,
    contentItemId: input.contentItemId ?? null,
    iat: Math.floor(Date.now() / 1000),
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', unsubscribeSigningSecret()).update(encodedPayload).digest('base64url')
  return `${encodedPayload}.${signature}`
}

function verifyUnsubscribeToken(token: string): UnsubscribeTokenPayload | null {
  const [encodedPayload, signature] = token.split('.')
  if (!encodedPayload || !signature) return null
  const expectedSignature = createHmac('sha256', unsubscribeSigningSecret()).update(encodedPayload).digest('base64url')
  if (!safeEqual(signature, expectedSignature)) return null

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Partial<UnsubscribeTokenPayload>
    if (
      payload.v !== 1 ||
      typeof payload.organizationId !== 'string' ||
      typeof payload.audienceMemberId !== 'string' ||
      typeof payload.iat !== 'number'
    ) {
      return null
    }
    return {
      v: 1,
      organizationId: payload.organizationId,
      audienceMemberId: payload.audienceMemberId,
      publicationId: typeof payload.publicationId === 'string' ? payload.publicationId : null,
      distributionRunId: typeof payload.distributionRunId === 'string' ? payload.distributionRunId : null,
      contentItemId: typeof payload.contentItemId === 'string' ? payload.contentItemId : null,
      iat: payload.iat,
    }
  } catch {
    return null
  }
}

function unsubscribeSigningSecret() {
  const secret = process.env.MKT_UNSUBSCRIBE_SECRET || process.env.ZERO_AUTH_SECRET || process.env.RESEND_API_KEY
  if (!secret && isProduction) throw new Error('MKT_UNSUBSCRIBE_SECRET or ZERO_AUTH_SECRET is required for unsubscribe links')
  return secret || 'pach-local-unsubscribe-secret'
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function hasPublicMarketingWriteAccess(req: Request) {
  const secret = publicMarketingWriteSecret()
  if (!secret) return !isProduction
  const headerToken = req.header('x-pach-write-token') || req.header('x-pach-marketing-token') || req.header('x-pach-public-write-token')
  const bearerToken = req.header('authorization')?.replace(/^Bearer\s+/i, '')
  const token = headerToken || bearerToken
  return Boolean(token && safeEqual(token, secret))
}

function publicMarketingWriteSecret() {
  return process.env.PACH_WRITE_TOKEN || ''
}

function renderEmailBrandHeader({
  wrapper,
  sender,
  designSystem,
  mode,
  palette,
}: {
  wrapper: ReturnType<typeof publicationEmailWrapper>
  sender: typeof mktSenderProfiles.$inferSelect
  designSystem?: typeof designSystems.$inferSelect | null
  mode: EmailThemeMode
  palette: EmailPalette
}) {
  return renderEmailBrandHeaderBlock({ wrapper, fallbackTitle: sender.fromName, designSystem, mode, palette })
}

function renderEmailBrandHeaderBlock({
  wrapper,
  fallbackTitle,
  designSystem,
  mode,
  palette,
}: {
  wrapper: ReturnType<typeof publicationEmailWrapper>
  fallbackTitle: string
  designSystem?: typeof designSystems.$inferSelect | null
  mode: EmailThemeMode
  palette: EmailPalette
}) {
  const title = wrapper.header || fallbackTitle
  const logoUrl = emailWrapperLogoUrl(wrapper.headerLogo, designSystem, mode)
  if (!title && !logoUrl) return ''
  const logo = logoUrl
    ? `<img src="${escapeAttribute(logoUrl)}" alt="${escapeAttribute(wrapper.headerLogoAlt || title || 'Ardia')}" width="140" height="58" style="display:block;width:140px;height:auto;border:0;outline:0;text-decoration:none;">`
    : `<div style="font-size:13px;line-height:1.2;letter-spacing:.22em;text-transform:uppercase;color:${palette.textMuted};font-family:${palette.fontMono};">${escapeHtml(title)}</div>`
  return [
    `<section style="text-align:left;margin-bottom:32px;padding-bottom:20px;border-bottom:1px solid ${palette.hairline};">`,
    logo,
    '</section>',
  ].join('')
}

function emailHeadHtml() {
  return `<head>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Geist+Mono&family=Instrument+Serif:ital@1&family=Inter+Tight:wght@200;300;400;500&display=swap" rel="stylesheet">
    <style>
      body, table, td, div, p, a, h1, h2, h3, h4 {
        -webkit-text-size-adjust: 100%;
        -ms-text-size-adjust: 100%;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-rendering: optimizeLegibility;
      }
    </style>
  </head>`
}

function renderUnsubscribePage({
  organization,
  publication,
  designSystem,
  member,
  subscriptionFound,
  alreadyUnsubscribed,
}: {
  organization: typeof organizations.$inferSelect
  publication?: typeof mktPublications.$inferSelect | null
  designSystem?: typeof designSystems.$inferSelect | null
  member?: typeof mktAudienceMembers.$inferSelect | null
  subscriptionFound: boolean
  alreadyUnsubscribed: boolean
}) {
  const designEmail = readRecord(readRecord(designSystem?.metadata).email)
  const mode = readEmailThemeMode(designEmail.defaultMode) ?? DEFAULT_EMAIL_PALETTE.mode
  const palette = newsletterEmailPalette(designSystem, mode)
  const wrapper = publicationEmailWrapper(publication ?? undefined)
  const headerBlock = renderEmailBrandHeaderBlock({ wrapper, fallbackTitle: organization.name, designSystem, mode, palette })
  const title = subscriptionFound
    ? alreadyUnsubscribed
      ? 'Ya estabas fuera de la lista.'
      : 'Suscripción cancelada.'
    : 'No encontramos una suscripción activa.'
  const message = subscriptionFound
    ? `No enviaremos más correos de ${publication?.name ?? organization.name}${member?.email ? ` a ${member.email}` : ''}.`
    : 'Este enlace ya fue usado, expiró en el sistema, o la suscripción ya no existe.'
  const blogUrl = `${publicSiteBase(organization)}/blog`
  return `<!doctype html>
<html lang="es">
  ${emailHeadHtml()}
  <body style="margin:0;padding:0;background:${palette.bodyBg};color:${palette.text};font-family:${palette.fontSans};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;">
    <div style="background:${palette.bodyBg};min-height:100vh;padding:48px 16px;">
      <main style="max-width:560px;margin:0 auto;padding:40px 36px;background:${palette.containerBg};border:1px solid ${palette.containerBorder};">
        ${headerBlock}
        <div style="font-family:${palette.fontMono};font-size:11px;line-height:1.4;letter-spacing:.18em;text-transform:uppercase;color:${palette.accent};margin:0 0 18px;">newsletter</div>
        <h1 style="font-size:28px;line-height:1.2;font-weight:200;letter-spacing:-0.04em;margin:0 0 18px;color:${palette.text};">${escapeHtml(title)}</h1>
        <p style="font-size:15px;line-height:1.6;font-weight:300;color:${palette.textSoft};margin:0 0 24px;">${escapeHtml(message)}</p>
        <p style="font-size:15px;line-height:1.6;font-weight:300;color:${palette.textSoft};margin:0 0 24px;">Si fue un error, puedes volver a suscribirte desde el blog.</p>
        <div style="text-align:left;margin:24px 0 0;"><a href="${escapeAttribute(blogUrl)}" style="display:inline-block;border:1px solid ${palette.accent};border-radius:0;color:${palette.buttonText};background:${palette.buttonBg};padding:11px 22px;text-decoration:none;text-align:center;font-size:13px;font-weight:500;line-height:1.2;">Ir al blog</a></div>
      </main>
    </div>
  </body>
</html>`
}

function renderNeutralMarketingPage({
  title,
  eyebrow,
  message,
}: {
  title: string
  eyebrow: string
  message: string
}) {
  const palette = DEFAULT_EMAIL_PALETTE
  return `<!doctype html>
<html lang="es">
  ${emailHeadHtml()}
  <body style="margin:0;padding:0;background:${palette.bodyBg};color:${palette.text};font-family:${palette.fontSans};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
    <div style="background:${palette.bodyBg};min-height:100vh;padding:48px 16px;">
      <main style="max-width:560px;margin:0 auto;padding:40px 36px;background:${palette.containerBg};border:1px solid ${palette.containerBorder};">
        <div style="font-family:${palette.fontMono};font-size:11px;line-height:1.4;letter-spacing:.18em;text-transform:uppercase;color:${palette.accent};margin:0 0 18px;">${escapeHtml(eyebrow)}</div>
        <h1 style="font-size:28px;line-height:1.2;font-weight:200;letter-spacing:-0.04em;margin:0 0 18px;color:${palette.text};">${escapeHtml(title)}</h1>
        <p style="font-size:15px;line-height:1.6;font-weight:300;color:${palette.textSoft};margin:0;">${escapeHtml(message)}</p>
      </main>
    </div>
  </body>
</html>`
}

function emailThemeMode(
  run: typeof mktDistributionRuns.$inferSelect,
  publication?: typeof mktPublications.$inferSelect,
  designSystem?: typeof designSystems.$inferSelect | null,
): EmailThemeMode {
  const runMode = readEmailThemeMode(readRecord(run.metadata).emailThemeMode)
  if (runMode) return runMode
  const publicationMode = readEmailThemeMode(readRecord(publication?.metadata).emailThemeMode)
  if (publicationMode) return publicationMode
  const designEmail = readRecord(readRecord(designSystem?.metadata).email)
  return readEmailThemeMode(designEmail.defaultMode) ?? DEFAULT_EMAIL_PALETTE.mode
}

function readEmailThemeMode(value: unknown): EmailThemeMode | null {
  return value === 'light' || value === 'dark' ? value : null
}

function newsletterEmailPalette(designSystem: typeof designSystems.$inferSelect | null | undefined, mode: EmailThemeMode): EmailPalette {
  const tokens = readRecord(designSystem?.tokens)
  const modes = readRecord(tokens.modes)
  const selectedMode = readRecord(modes[mode])
  const selectedColors = readRecord(selectedMode.colors)
  const selectedEmail = readRecord(selectedMode.email)
  const legacyColors = readRecord(tokens.colors)
  const typography = readRecord(tokens.typography)
  const fallback = mode === 'light'
    ? {
      ...DEFAULT_EMAIL_PALETTE,
      mode,
      bodyBg: '#ffffff',
      containerBg: '#ffffff',
      containerBorder: 'rgba(30, 22, 16, 0.12)',
      surface: '#ffffff',
      text: '#1a1612',
      textSoft: 'rgba(26, 22, 18, 0.72)',
      textMuted: 'rgba(26, 22, 18, 0.45)',
      hairline: 'rgba(30, 22, 16, 0.06)',
      hairlineStrong: 'rgba(30, 22, 16, 0.12)',
      codeBg: '#f5f0e8',
    }
    : {
      ...DEFAULT_EMAIL_PALETTE,
      mode,
      bodyBg: '#14110f',
      containerBg: '#14110f',
      containerBorder: 'rgba(237, 230, 219, 0.10)',
      surface: '#1a1614',
      text: '#ede6db',
      textSoft: 'rgba(237, 230, 219, 0.78)',
      textMuted: 'rgba(237, 230, 219, 0.42)',
      hairline: 'rgba(237, 230, 219, 0.10)',
      hairlineStrong: 'rgba(237, 230, 219, 0.16)',
      codeBg: '#0f0d0b',
    }

  const pick = (emailKey: string, colorKey: string, defaultValue: string) =>
    readOptionalString(selectedEmail[emailKey]) ??
    readOptionalString(selectedColors[colorKey]) ??
    readOptionalString(legacyColors[colorKey]) ??
    defaultValue

  return {
    mode,
    bodyBg: pick('bodyBg', 'bg', fallback.bodyBg),
    containerBg: pick('containerBg', 'bg', fallback.containerBg),
    containerBorder: pick('containerBorder', 'hairline2', fallback.containerBorder),
    surface: pick('surface', 'surface', fallback.surface),
    text: pick('text', 'fg', fallback.text),
    textSoft: pick('textSoft', 'fg2', fallback.textSoft),
    textMuted: pick('textMuted', 'fgDim', fallback.textMuted),
    hairline: pick('hairline', 'hairline', fallback.hairline),
    hairlineStrong: pick('hairlineStrong', 'hairline2', fallback.hairlineStrong),
    accent: pick('accent', 'accent', fallback.accent),
    buttonBg: pick('buttonBg', 'accent', fallback.buttonBg),
    buttonText: pick('buttonText', 'buttonText', fallback.buttonText),
    codeBg: pick('codeBg', 'surface', fallback.codeBg),
    fontSans: readOptionalString(typography.sans) ?? fallback.fontSans,
    fontSerif: readOptionalString(typography.serif) ?? fallback.fontSerif,
    fontMono: readOptionalString(typography.mono) ?? fallback.fontMono,
  }
}

function markdownToEmailHtml(markdown: string, palette: EmailPalette = DEFAULT_EMAIL_PALETTE) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []
  let index = 0

  while (index < lines.length) {
    const raw = lines[index]
    const line = raw.trimEnd()
    const trimmed = line.trim()

    if (line.startsWith('```')) {
      const content: string[] = []
      index += 1
      while (index < lines.length && !lines[index].startsWith('```')) {
        content.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      html.push(`<pre style="white-space:pre-wrap;background:${palette.codeBg};border:1px solid ${palette.hairline};color:${palette.text};border-radius:0;margin:22px 0;padding:16px;font-family:${palette.fontMono};font-size:13px;line-height:1.55;"><code>${escapeHtml(content.join('\n'))}</code></pre>`)
      continue
    }

    if (line.startsWith(':::toggle')) {
      const title = lines[index + 1]?.trim() ?? 'Details'
      const content: string[] = []
      index += 2
      while (index < lines.length && lines[index] !== ':::') {
        content.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      html.push([
        `<div style="border:1px solid ${palette.hairline};margin:22px 0;padding:16px;background:${palette.surface};">`,
        `<div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:${palette.accent};margin:0 0 12px;">${inlineMarkdownToHtml(title, palette)}</div>`,
        `<div>${markdownToEmailHtml(content.join('\n'), palette)}</div>`,
        '</div>',
      ].join(''))
      continue
    }

    if (/^::file\[([^\]]*)]\(([^)]+)\)\{size=(\d+)(?: type=([^}]+))?}$/.test(line)) {
      const [, fileName, src, sizeBytes, mimeType] = line.match(/^::file\[([^\]]*)]\(([^)]+)\)\{size=(\d+)(?: type=([^}]+))?}$/) ?? []
      html.push(renderEmailAttachment(fileName ?? 'file', src ?? '', Number(sizeBytes ?? 0), mimeType ? decodeURIComponent(mimeType) : undefined, palette))
      index += 1
      continue
    }

    if (/^!\[([^\]]*)]\(([^)]+)\)$/.test(line)) {
      const [, alt, src] = line.match(/^!\[([^\]]*)]\(([^)]+)\)$/) ?? []
      html.push(renderEmailImage(alt ?? '', src ?? '', palette))
      index += 1
      continue
    }

    if (line.startsWith('# ')) {
      html.push(`<h2 style="font-size:28px;line-height:1.15;font-weight:400;margin:30px 0 12px;color:${palette.text};">${inlineMarkdownToHtml(line.slice(2), palette)}</h2>`)
      index += 1
      continue
    }
    if (line.startsWith('## ')) {
      html.push(`<h3 style="font-size:22px;line-height:1.25;font-weight:400;margin:26px 0 10px;color:${palette.text};">${inlineMarkdownToHtml(line.slice(3), palette)}</h3>`)
      index += 1
      continue
    }
    if (line.startsWith('### ')) {
      html.push(`<h4 style="font-size:18px;line-height:1.35;font-weight:700;margin:24px 0 10px;color:${palette.text};">${inlineMarkdownToHtml(line.slice(4), palette)}</h4>`)
      index += 1
      continue
    }

    if (line.startsWith('- [x] ') || line.startsWith('- [ ] ')) {
      const checked = line.startsWith('- [x] ')
      const label = line.slice(6)
      html.push(`<div style="margin:10px 0;color:${palette.text};"><span style="display:inline-block;width:16px;color:${palette.accent};">${checked ? '☑' : '☐'}</span> ${inlineMarkdownToHtml(label, palette)}</div>`)
      index += 1
      continue
    }

    if (/^-\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^-\s+/.test(lines[index]) && !lines[index].startsWith('- [x] ') && !lines[index].startsWith('- [ ] ')) {
        items.push(`<li style="margin:0 0 8px;">${inlineMarkdownToHtml(lines[index].replace(/^-\s+/, ''), palette)}</li>`)
        index += 1
      }
      html.push(`<ul style="padding-left:24px;margin:18px 0;color:${palette.text};">${items.join('')}</ul>`)
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(`<li style="margin:0 0 8px;">${inlineMarkdownToHtml(lines[index].replace(/^\d+\.\s+/, ''), palette)}</li>`)
        index += 1
      }
      html.push(`<ol style="padding-left:24px;margin:18px 0;color:${palette.text};">${items.join('')}</ol>`)
      continue
    }

    if (line.startsWith('> ')) {
      const quote: string[] = []
      while (index < lines.length && lines[index].startsWith('> ')) {
        quote.push(lines[index].slice(2))
        index += 1
      }
      html.push(`<blockquote style="border-left:2px solid ${palette.accent};margin:22px 0;padding-left:16px;color:${palette.textSoft};">${quote.map((item) => `<p style="margin:0 0 10px;">${inlineMarkdownToHtml(item, palette)}</p>`).join('')}</blockquote>`)
      continue
    }

    if (trimmed) html.push(`<p style="margin:0 0 16px;">${inlineMarkdownToHtml(trimmed, palette)}</p>`)
    else html.push('<div style="height:12px;line-height:12px;">&nbsp;</div>')
    index += 1
  }

  return html.join('')
}

function inlineMarkdownToHtml(value: string, palette: EmailPalette = DEFAULT_EMAIL_PALETTE) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, `<code style="background:${palette.codeBg};color:${palette.text};padding:2px 5px;font-family:${palette.fontMono};font-size:.9em;">$1</code>`)
    .replace(/\*\*([^*]+)\*\*/g, `<strong style="color:${palette.text};">$1</strong>`)
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, (_match, label: string, href: string) => {
      return `<a href="${escapeAttribute(href)}" style="color:${palette.accent};text-decoration:underline;">${label}</a>`
    })
    .replace(/\[\[([^\]]+)]]/g, '$1')
}

function publicationEmailWrapper(publication?: typeof mktPublications.$inferSelect) {
  const metadata = readRecord(publication?.metadata)
  const emailWrapper = readRecord(metadata.emailWrapper)
  const emailBlocks = readRecord(metadata.emailBlocks)
  const source = Object.keys(emailWrapper).length ? emailWrapper : emailBlocks
  const cta = readRecord(source.cta)
  const headerLogo = readRecord(source.headerLogo)
  const label = readOptionalString(cta.label)
  const url = readOptionalString(cta.url)
  return {
    header: readOptionalString(source.header) ?? '',
    headerLogo,
    headerLogoAlt: readOptionalString(headerLogo.alt),
    beforeContent: readOptionalString(source.beforeContent) ?? '',
    footer: readOptionalString(source.footer) ?? '',
    cta: label && url ? { label, url } : null,
  }
}

function emailWrapperLogoUrl(headerLogo: Record<string, unknown>, designSystem: typeof designSystems.$inferSelect | null | undefined, mode: EmailThemeMode) {
  if (headerLogo.enabled === false) return ''
  const assets = readRecord(designSystem?.assets)
  const modeKey = mode === 'dark'
    ? readOptionalString(headerLogo.darkModeAssetKey)
    : readOptionalString(headerLogo.lightModeAssetKey)
  const fallbackKey = readOptionalString(headerLogo.assetKey)
    ?? 'logos.wordmarkTransactional'
  const directUrl = readOptionalString(headerLogo.url)
  const assetUrl = readDesignAssetValue(assets, modeKey ?? fallbackKey)
  return emailAssetUrl(directUrl ?? assetUrl ?? '')
}

function readDesignAssetValue(assets: Record<string, unknown>, key: string | undefined) {
  if (!key) return undefined
  let current: unknown = assets
  for (const part of key.split('.')) {
    current = readRecord(current)[part]
  }
  return readOptionalString(current)
}

function renderEmailImage(alt: string, src: string, palette: EmailPalette = DEFAULT_EMAIL_PALETTE) {
  const imageSrc = emailAssetUrl(src)
  if (!imageSrc) {
    return `<div style="border:1px solid ${palette.hairline};margin:22px 0;padding:24px;text-align:center;color:${palette.textMuted};font-size:12px;letter-spacing:.16em;text-transform:uppercase;">${escapeHtml(alt || 'image')}</div>`
  }
  return `<img src="${escapeAttribute(imageSrc)}" alt="${escapeAttribute(alt)}" style="display:block;width:100%;max-width:100%;height:auto;margin:22px 0;border:0;">`
}

function emailAssetUrl(src: string) {
  if (!src) return ''
  if (!src.startsWith('s3://')) return src
  return marketingMediaAssetUrl(src.slice('s3://'.length))
}

function marketingMediaAssetUrl(key: string) {
  return `${pachPublicApiBase()}/media/marketing-assets?key=${encodeURIComponent(key.replace(/^\/+/, ''))}`
}

function pachPublicApiBase() {
  return normalizePublicBaseUrl(
    process.env.PACH_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_PACH_API_URL ||
    process.env.PACH_API_URL ||
    process.env.API_PUBLIC_URL ||
    process.env.PUBLIC_API_URL ||
    'http://localhost:3002',
  )
}

function normalizePublicBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^(localhost|127\.0\.0\.1|\[::1])(?::\d+)?(?:\/|$)/i.test(trimmed)) return `http://${trimmed}`
  return `https://${trimmed}`
}

function renderEmailAttachment(fileName: string, src: string, sizeBytes: number, mimeType?: string, palette: EmailPalette = DEFAULT_EMAIL_PALETTE) {
  const size = Number.isFinite(sizeBytes) && sizeBytes > 0 ? ` · ${formatBytes(sizeBytes)}` : ''
  const type = mimeType ? ` · ${escapeHtml(mimeType)}` : ''
  const label = `${escapeHtml(fileName)}${size}${type}`
  if (!src || src.startsWith('s3://')) {
    return `<div style="border-top:1px solid ${palette.hairline};border-bottom:1px solid ${palette.hairline};margin:22px 0;padding:14px 0;"><div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${palette.accent};margin-bottom:6px;">archivo</div><div style="color:${palette.text};">${label}</div></div>`
  }
  return `<div style="border-top:1px solid ${palette.hairline};border-bottom:1px solid ${palette.hairline};margin:22px 0;padding:14px 0;"><div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${palette.accent};margin-bottom:6px;">archivo</div><a href="${escapeAttribute(src)}" style="color:${palette.text};text-decoration:none;">${label}</a></div>`
}

function markdownToText(markdown: string) {
  return markdown
    .replace(/^#{1,6}\s/gm, '')
    .replace(/^- \[[ x]]\s/gm, '')
    .replace(/^::file\[([^\]]*)]\(([^)]+)\)\{[^}]*}$/gm, '$1')
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/^:::.+$/gm, '')
    .replace(/```/g, '')
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

async function findPublicOrganization(project: string) {
  const [organization] = await getDb().select().from(organizations).where(eq(organizations.project, project)).limit(1)
  return organization
}

async function findPublicNewsletterPublication(organizationId: string, slug?: string) {
  const conditions = [
    eq(mktPublications.organizationId, organizationId),
    eq(mktPublications.type, 'newsletter'),
    eq(mktPublications.status, 'active'),
  ]
  if (slug) conditions.push(eq(mktPublications.slug, slug))

  const [publication] = await getDb()
    .select()
    .from(mktPublications)
    .where(and(...conditions))
    .orderBy(desc(mktPublications.updatedAt))
    .limit(1)

  return publication
}

function publicOrganization(organization: typeof organizations.$inferSelect) {
  return {
    id: organization.id,
    name: organization.name,
    project: organization.project,
  }
}

function publicPostSummary(item: typeof mktContentItems.$inferSelect, run: typeof mktDistributionRuns.$inferSelect) {
  return {
    id: item.id,
    distributionRunId: run.id,
    title: item.title,
    slug: item.slug,
    excerpt: item.excerpt,
    contentKind: item.contentKind,
    supportedChannels: item.supportedChannels,
    publishedAt: run.completedAt?.toISOString() ?? run.updatedAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    primaryCtaId: item.primaryCtaId,
  }
}

function isPublicBlogContentItem(item: Pick<typeof mktContentItems.$inferSelect, 'status' | 'supportedChannels'>) {
  return ['ready', 'published'].includes(item.status) && item.supportedChannels.includes('blog')
}

async function recordEvent(input: {
  organizationId: string
  eventType: string
  contentItemId?: string | null
  distributionRunId?: string | null
  audienceMemberId?: string | null
  ctaId?: string | null
  channel?: string | null
  source?: string | null
  url?: string | null
  metadata?: Record<string, unknown>
}) {
  await getDb().insert(mktContentEvents).values({
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    contentItemId: input.contentItemId || undefined,
    distributionRunId: input.distributionRunId || undefined,
    audienceMemberId: input.audienceMemberId || undefined,
    ctaId: input.ctaId || undefined,
    eventType: input.eventType,
    channel: input.channel || undefined,
    source: input.source || undefined,
    url: input.url || undefined,
    metadata: input.metadata ?? {},
  })
}

function requireOrganizationAccess(req: { user?: { organizationIds?: string[]; canAccessUnscoped?: boolean } }, organizationId: string | null | undefined) {
  if (!organizationId) {
    if (req.user?.canAccessUnscoped) return
    throw new Error('Not authorized')
  }
  if (!req.user?.organizationIds?.includes(organizationId)) throw new Error('Not authorized')
}

function readRequiredString(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Required string missing')
  return value.trim()
}

function readOptionalString(value: unknown) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length ? trimmed : undefined
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function readStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function firstParagraph(markdown: string) {
  return markdown
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#') && !line.startsWith(':::') && !line.startsWith('!['))
    ?.slice(0, 280)
}

async function uniqueSlug(input: string, organizationId: string) {
  const base = slugify(input)
  const existing = await getDb()
    .select({ slug: mktContentItems.slug })
    .from(mktContentItems)
    .where(eq(mktContentItems.organizationId, organizationId))
  const taken = new Set(existing.map((item) => item.slug))
  if (!taken.has(base)) return base
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${Date.now()}`
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'content'
}

function unique<T>(values: Array<T | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is T => Boolean(value))))
}

function serializeDates<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value))
}

function formatAddress(name: string, email: string) {
  return `${name.replace(/[<>]/g, '').trim()} <${email}>`
}

function isSafeRedirectUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next)
  }
}

publicMarketingRouter.use(handleMarketingError)
router.use(handleMarketingError)

function handleMarketingError(error: unknown, _req: Request, res: Response, next: NextFunction) {
  if (error instanceof MarketingInputError) {
    res.status(error.status).json({ error: error.message })
    return
  }
  if (error instanceof Error && error.message === 'Not authorized') {
    res.status(403).json({ error: 'Not authorized' })
    return
  }
  if (error instanceof Error && error.message === 'Required string missing') {
    res.status(400).json({ error: 'Required field missing' })
    return
  }
  next(error)
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] ?? char))
}

function escapeAttribute(value: string) {
  return escapeHtml(value)
}

export default router
