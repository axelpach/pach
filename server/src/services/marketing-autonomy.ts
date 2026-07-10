import { createHash, randomUUID } from 'node:crypto'
import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import {
  activityEvents,
  agentConversations,
  agentMessages,
  agentRuns,
  documents,
  mktContentItems,
  mktDistributionRuns,
  mktEditorialIdeas,
  mktPublicationSlots,
  mktPublications,
  organizations,
} from '../../../db/schema.js'
import { getDb } from '../db.js'
import { computeNextRunAt, getPeriodKey, type TaskTriggerSchedule } from './task-triggers/schedule.js'

export type MarketingCadenceConfig = {
  enabled: boolean
  mode: 'autonomous' | 'issue'
  frequency: 'weekly' | 'monthly' | 'quarterly'
  lookaheadDays: number
  cooldownDays: number
  timezone: string
  time: string
  dayOfWeek: number
  dayOfMonth: number
  minIdeaBacklog: number
  teamId?: string
  statusId?: string
  assigneeId?: string
  creatorId?: string
  projectId?: string
}

export type MarketingAutonomySummary = {
  checked: number
  slotsCreated: number
  slotsLinked: number
  blogRunsPaired: number
  ideaRunsQueued: number
  slotRunsQueued: number
  skipped: number
  failed: number
}

export type CreateEditorialIdeaInput = {
  organizationId?: string
  publicationId: string
  title: string
  angle?: string
  sourceNotes?: string
  dedupeKey?: string
  status?: string
  priority?: number
  metadata?: Record<string, unknown>
  agentRunId?: string
}

export type FulfillPublicationSlotInput = {
  slotId: string
  documentId: string
  ideaId?: string
  runId?: string
  subject?: string
  preheader?: string
  metadata?: Record<string, unknown>
}

type PublicationRow = typeof mktPublications.$inferSelect
type SlotRow = typeof mktPublicationSlots.$inferSelect
type DistributionRunRow = typeof mktDistributionRuns.$inferSelect
type OrganizationRow = typeof organizations.$inferSelect

const DEFAULT_LOOKAHEAD_DAYS = 14
const DEFAULT_COOLDOWN_DAYS = 7
const DEFAULT_TIMEZONE = 'America/Mexico_City'
const DEFAULT_TIME = '09:00'
const DEFAULT_MIN_IDEA_BACKLOG = 4
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const ACTIVE_AGENT_RUN_STATUSES = ['queued', 'reserved', 'bootstrapping', 'running', 'needs_human'] as const
const LIVE_DISTRIBUTION_STATUSES = ['draft', 'scheduled', 'sending', 'sent'] as const

export async function runAutonomousPublicationChecks(params: { now?: Date; limit?: number } = {}): Promise<MarketingAutonomySummary> {
  const db = getDb()
  const now = params.now ?? new Date()
  const publications = await db
    .select()
    .from(mktPublications)
    .where(and(eq(mktPublications.type, 'newsletter'), eq(mktPublications.status, 'active')))
    .orderBy(asc(mktPublications.name))
    .limit(params.limit ?? 50)

  const summary: MarketingAutonomySummary = {
    checked: 0,
    slotsCreated: 0,
    slotsLinked: 0,
    blogRunsPaired: 0,
    ideaRunsQueued: 0,
    slotRunsQueued: 0,
    skipped: 0,
    failed: 0,
  }

  for (const publication of publications) {
    const cadence = readMarketingCadenceConfig(publication.metadata)
    if (!cadence.enabled || cadence.mode !== 'autonomous') continue

    summary.checked += 1
    try {
      const result = await reconcilePublicationAutonomy(publication, cadence, now)
      summary.slotsCreated += result.slotsCreated
      summary.slotsLinked += result.slotsLinked
      summary.blogRunsPaired += result.blogRunsPaired
      summary.ideaRunsQueued += result.ideaRunsQueued
      summary.slotRunsQueued += result.slotRunsQueued
      if (result.skipped) summary.skipped += 1
    } catch (error) {
      summary.failed += 1
      console.error(`[marketing-autonomy] Failed publication ${publication.id}:`, error)
      await recordPublicationActivity({
        organizationId: publication.organizationId,
        publication,
        eventType: 'newsletter_autonomy_failed',
        activityKind: 'incident',
        severity: 'error',
        summary: `Newsletter autonomy failed for ${publication.name}`,
        details: { error: error instanceof Error ? error.message : String(error) },
        metadata: { publicationId: publication.id, publicationSlug: publication.slug },
      })
    }
  }

  return summary
}

export async function reconcilePublicationAutonomy(publication: PublicationRow, cadence: MarketingCadenceConfig, now = new Date()) {
  const db = getDb()
  const organization = await readOrganization(publication.organizationId)
  const targets = buildSlotTargets(cadence, now)
  const horizon = new Date(now.getTime() + cadence.lookaheadDays * ONE_DAY_MS)
  const result = {
    slotsCreated: 0,
    slotsLinked: 0,
    blogRunsPaired: 0,
    ideaRunsQueued: 0,
    slotRunsQueued: 0,
    skipped: targets.length === 0,
  }

  if (targets.length === 0) return result

  const existingSlots = await db
    .select()
    .from(mktPublicationSlots)
    .where(and(
      eq(mktPublicationSlots.publicationId, publication.id),
      gte(mktPublicationSlots.scheduledAt, now),
      lte(mktPublicationSlots.scheduledAt, horizon),
    ))
    .orderBy(asc(mktPublicationSlots.scheduledAt))

  const existingRuns = await db
    .select()
    .from(mktDistributionRuns)
    .where(and(
      eq(mktDistributionRuns.organizationId, publication.organizationId),
      eq(mktDistributionRuns.publicationId, publication.id),
      eq(mktDistributionRuns.channel, 'newsletter'),
      inArray(mktDistributionRuns.status, [...LIVE_DISTRIBUTION_STATUSES]),
      gte(mktDistributionRuns.scheduledAt, now),
      lte(mktDistributionRuns.scheduledAt, horizon),
    ))

  const slotsByKey = new Map(existingSlots.map((slot) => [slot.slotKey, slot]))
  const runsByKey = new Map<string, DistributionRunRow>()
  for (const run of existingRuns) {
    if (!run.scheduledAt) continue
    const key = slotKeyForScheduledAt(cadence, run.scheduledAt)
    if (!runsByKey.has(key)) runsByKey.set(key, run)
  }

  for (const target of targets) {
    let slot = slotsByKey.get(target.slotKey)
    const run = runsByKey.get(target.slotKey)
    const nowForWrite = new Date()

    if (!slot) {
      const [created] = await db.insert(mktPublicationSlots).values({
        id: randomUUID(),
        organizationId: publication.organizationId,
        publicationId: publication.id,
        distributionRunId: run?.id,
        contentItemId: run?.contentItemId,
        slotKey: target.slotKey,
        status: run ? slotStatusForDistributionRun(run.status) : 'planned',
        scheduledAt: run?.scheduledAt ?? target.scheduledAt,
        scheduledTimezone: run?.scheduledTimezone ?? cadence.timezone,
        metadata: {
          source: 'marketing_autonomy',
          cadence: cadencePayload(cadence),
          adoptedDistributionRunId: run?.id,
        },
        createdAt: nowForWrite,
        updatedAt: nowForWrite,
      }).returning()
      slot = created
      slotsByKey.set(target.slotKey, created)
      result.slotsCreated += 1
      await recordPublicationActivity({
        organizationId: publication.organizationId,
        publication,
        slot: created,
        eventType: 'newsletter_slot_created',
        summary: `Created newsletter slot for ${publication.name} on ${target.scheduledAt.toISOString()}`,
        metadata: { publicationId: publication.id, slotId: created.id, slotKey: target.slotKey },
      })
    } else if (run && slot.distributionRunId !== run.id) {
      const [updated] = await db.update(mktPublicationSlots).set({
        distributionRunId: run.id,
        contentItemId: run.contentItemId,
        status: slotStatusForDistributionRun(run.status),
        scheduledAt: run.scheduledAt ?? slot.scheduledAt,
        scheduledTimezone: run.scheduledTimezone ?? slot.scheduledTimezone,
        error: null,
        metadata: {
          ...readRecord(slot.metadata),
          adoptedDistributionRunId: run.id,
          adoptedAt: nowForWrite.toISOString(),
        },
        updatedAt: nowForWrite,
      }).where(eq(mktPublicationSlots.id, slot.id)).returning()
      slot = updated
      slotsByKey.set(target.slotKey, updated)
      result.slotsLinked += 1
    }
  }

  for (const run of existingRuns) {
    if (run.status !== 'scheduled' || !run.scheduledAt || !run.contentItemId) continue
    const slot = slotsByKey.get(slotKeyForScheduledAt(cadence, run.scheduledAt))
    const paired = await ensureBlogRunForScheduledNewsletter({
      publication,
      newsletterRun: run,
      slot,
      now,
      source: 'marketing_autonomy_reconcile',
    })
    if (!paired) continue
    result.blogRunsPaired += 1
    await recordPublicationActivity({
      organizationId: publication.organizationId,
      publication,
      slot,
      eventType: 'newsletter_blog_schedule_paired',
      subjectType: 'marketing_broadcast',
      subjectId: run.id,
      subjectLabel: run.subject ?? run.name,
      summary: `${paired.action === 'created' ? 'Scheduled' : 'Linked'} blog publication for newsletter "${run.subject ?? run.name}"`,
      metadata: {
        publicationId: publication.id,
        newsletterDistributionRunId: run.id,
        blogDistributionRunId: paired.run.id,
        action: paired.action,
      },
    })
  }

  const availableIdeas = await db
    .select()
    .from(mktEditorialIdeas)
    .where(and(
      eq(mktEditorialIdeas.publicationId, publication.id),
      eq(mktEditorialIdeas.status, 'available'),
    ))
    .orderBy(desc(mktEditorialIdeas.priority), asc(mktEditorialIdeas.createdAt))

  if (availableIdeas.length < cadence.minIdeaBacklog) {
    const queued = await queueIdeaBacklogRunIfNeeded({
      publication,
      organization,
      cadence,
      neededIdeas: cadence.minIdeaBacklog - availableIdeas.length,
      now,
    })
    if (queued) result.ideaRunsQueued += 1
  }

  const reservableIdeas = [...availableIdeas]
  const slotsToFill = [...slotsByKey.values()]
    .filter((slot) => !slot.distributionRunId && !['scheduled', 'sending', 'sent', 'canceled', 'skipped'].includes(slot.status))
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())

  for (const slot of slotsToFill) {
    const queued = await queueSlotRunIfNeeded({
      publication,
      organization,
      cadence,
      slot,
      reservableIdeas,
      now,
    })
    if (queued) result.slotRunsQueued += 1
  }

  return result
}

async function ensureBlogRunForScheduledNewsletter({
  publication,
  newsletterRun,
  slot,
  now,
  source,
}: {
  publication: PublicationRow
  newsletterRun: DistributionRunRow
  slot?: SlotRow
  now: Date
  source: string
}): Promise<{ run: DistributionRunRow; action: 'created' | 'updated' | 'linked' } | null> {
  if (newsletterRun.channel !== 'newsletter') return null
  if (newsletterRun.status !== 'scheduled' || !newsletterRun.scheduledAt || !newsletterRun.contentItemId) return null

  const db = getDb()
  const [contentItem] = await db
    .select()
    .from(mktContentItems)
    .where(and(
      eq(mktContentItems.organizationId, newsletterRun.organizationId),
      eq(mktContentItems.id, newsletterRun.contentItemId),
    ))
    .limit(1)
  if (!contentItem) return null

  const channels = ensureArticleChannels(contentItem.supportedChannels)
  if (channels.length !== contentItem.supportedChannels.length) {
    await db.update(mktContentItems).set({ supportedChannels: channels, updatedAt: now }).where(eq(mktContentItems.id, contentItem.id))
  }

  const linkedBlogDistributionRunId = readOptionalString(readRecord(slot?.metadata).blogDistributionRunId)
  const existingBlogRuns = await db
    .select()
    .from(mktDistributionRuns)
    .where(and(
      eq(mktDistributionRuns.organizationId, newsletterRun.organizationId),
      eq(mktDistributionRuns.contentItemId, contentItem.id),
      eq(mktDistributionRuns.channel, 'blog'),
      inArray(mktDistributionRuns.status, ['draft', 'scheduled', 'sending', 'published']),
    ))
  const reusableBlogRun = existingBlogRuns.find((run) => run.id === linkedBlogDistributionRunId)
    ?? existingBlogRuns.find((run) => readOptionalString(readRecord(run.metadata).pairedNewsletterRunId) === newsletterRun.id)
    ?? existingBlogRuns.find((run) => ['draft', 'scheduled'].includes(run.status))
    ?? existingBlogRuns.find((run) => ['sending', 'published'].includes(run.status))
  if (reusableBlogRun && isBlogRunAlreadyPaired({ publication, newsletterRun, blogRun: reusableBlogRun, slot })) {
    return null
  }
  const blogRunMetadata = {
    ...(reusableBlogRun ? readRecord(reusableBlogRun.metadata) : {}),
    source: 'newsletter_schedule_pair',
    pairedNewsletterRunId: newsletterRun.id,
    publicationSlotId: slot?.id,
    sourceDocumentId: contentItem.sourceDocumentId,
    pairedBy: source,
    pairedAt: now.toISOString(),
  }

  const blogRun = reusableBlogRun
    ? ['sending', 'published'].includes(reusableBlogRun.status)
      ? reusableBlogRun
      : (await db.update(mktDistributionRuns).set({
        publicationId: publication.id,
        contentItemId: contentItem.id,
        distributionType: 'publish',
        name: newsletterRun.subject?.trim() || newsletterRun.name || contentItem.title,
        status: 'scheduled',
        scheduledAt: newsletterRun.scheduledAt,
        scheduledTimezone: newsletterRun.scheduledTimezone,
        recipientFilter: {},
        error: null,
        metadata: blogRunMetadata,
        updatedAt: now,
      }).where(eq(mktDistributionRuns.id, reusableBlogRun.id)).returning())[0]
    : (await db.insert(mktDistributionRuns).values({
      id: randomUUID(),
      organizationId: newsletterRun.organizationId,
      publicationId: publication.id,
      contentItemId: contentItem.id,
      channel: 'blog',
      distributionType: 'publish',
      name: newsletterRun.subject?.trim() || newsletterRun.name || contentItem.title,
      status: 'scheduled',
      scheduledAt: newsletterRun.scheduledAt,
      scheduledTimezone: newsletterRun.scheduledTimezone,
      recipientFilter: {},
      metrics: {},
      metadata: blogRunMetadata,
      createdAt: now,
      updatedAt: now,
    }).returning())[0]
  if (!blogRun) return null

  if (slot && readOptionalString(readRecord(slot.metadata).blogDistributionRunId) !== blogRun.id) {
    await db.update(mktPublicationSlots).set({
      metadata: {
        ...readRecord(slot.metadata),
        blogDistributionRunId: blogRun.id,
        blogDistributionRunPairedAt: now.toISOString(),
      },
      updatedAt: now,
    }).where(eq(mktPublicationSlots.id, slot.id))
  }

  return {
    run: blogRun,
    action: reusableBlogRun
      ? ['sending', 'published'].includes(reusableBlogRun.status) ? 'linked' : 'updated'
      : 'created',
  }
}

function isBlogRunAlreadyPaired({
  publication,
  newsletterRun,
  blogRun,
  slot,
}: {
  publication: PublicationRow
  newsletterRun: DistributionRunRow
  blogRun: DistributionRunRow
  slot?: SlotRow
}) {
  const metadata = readRecord(blogRun.metadata)
  const slotMetadata = readRecord(slot?.metadata)
  const slotLinked = !slot || readOptionalString(slotMetadata.blogDistributionRunId) === blogRun.id
  return blogRun.status === 'scheduled' &&
    blogRun.publicationId === publication.id &&
    blogRun.contentItemId === newsletterRun.contentItemId &&
    readOptionalString(metadata.pairedNewsletterRunId) === newsletterRun.id &&
    blogRun.scheduledAt?.getTime() === newsletterRun.scheduledAt?.getTime() &&
    blogRun.scheduledTimezone === newsletterRun.scheduledTimezone &&
    slotLinked
}

export async function createEditorialIdea(input: CreateEditorialIdeaInput) {
  const db = getDb()
  const now = new Date()
  const [publication] = await db.select().from(mktPublications).where(eq(mktPublications.id, input.publicationId)).limit(1)
  if (!publication) throw new Error('Publication not found')

  const organizationId = input.organizationId ?? publication.organizationId
  if (organizationId !== publication.organizationId) throw new Error('Idea organization does not match publication')
  const dedupeKey = normalizeDedupeKey(input.dedupeKey ?? input.title)

  const [existing] = await db
    .select()
    .from(mktEditorialIdeas)
    .where(and(eq(mktEditorialIdeas.publicationId, publication.id), eq(mktEditorialIdeas.dedupeKey, dedupeKey)))
    .limit(1)

  if (existing) return { idea: existing, alreadyExists: true }

  const [idea] = await db.insert(mktEditorialIdeas).values({
    id: randomUUID(),
    organizationId,
    publicationId: publication.id,
    agentRunId: input.agentRunId,
    title: input.title.trim(),
    angle: input.angle?.trim() || undefined,
    sourceNotes: input.sourceNotes?.trim() || undefined,
    dedupeKey,
    status: input.status ?? 'available',
    priority: input.priority ?? 0,
    metadata: input.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  }).returning()

  await recordPublicationActivity({
    organizationId,
    publication,
    eventType: 'newsletter_idea_created',
    subjectType: 'newsletter_idea',
    subjectId: idea.id,
    subjectLabel: idea.title,
    summary: `Created newsletter idea: ${idea.title}`,
    metadata: { publicationId: publication.id, ideaId: idea.id, source: 'marketing_autonomy' },
  })

  return { idea, alreadyExists: false }
}

export async function fulfillPublicationSlot(input: FulfillPublicationSlotInput) {
  const db = getDb()
  const now = new Date()

  return await db.transaction(async (tx) => {
    const [slot] = await tx.select().from(mktPublicationSlots).where(eq(mktPublicationSlots.id, input.slotId)).limit(1)
    if (!slot) throw new Error('Publication slot not found')
    if (['sent', 'canceled', 'skipped'].includes(slot.status)) throw new Error(`Slot cannot be fulfilled from status ${slot.status}`)

    const [publication] = await tx.select().from(mktPublications).where(eq(mktPublications.id, slot.publicationId)).limit(1)
    if (!publication) throw new Error('Publication not found')

    const [document] = await tx.select().from(documents).where(eq(documents.id, input.documentId)).limit(1)
    if (!document || document.status === 'archived') throw new Error('Document not found')
    if (document.organizationId !== slot.organizationId) throw new Error('Document organization does not match slot')

    const ideaId = input.ideaId ?? slot.ideaId ?? undefined
    let idea: typeof mktEditorialIdeas.$inferSelect | undefined
    if (ideaId) {
      const [ideaRow] = await tx.select().from(mktEditorialIdeas).where(eq(mktEditorialIdeas.id, ideaId)).limit(1)
      if (!ideaRow) throw new Error('Editorial idea not found')
      if (ideaRow.publicationId !== slot.publicationId) throw new Error('Idea publication does not match slot')
      idea = ideaRow
    }

    const [existingContent] = await tx
      .select()
      .from(mktContentItems)
      .where(and(
        eq(mktContentItems.organizationId, slot.organizationId),
        eq(mktContentItems.sourceDocumentId, document.id),
      ))
      .orderBy(desc(mktContentItems.updatedAt))
      .limit(1)

    const contentItem = existingContent
      ? (await tx.update(mktContentItems).set({
        title: document.title,
        excerpt: firstParagraph(document.body),
        status: 'ready',
        body: document.body,
        format: document.format,
        supportedChannels: ensureArticleChannels(existingContent.supportedChannels),
        metadata: {
          ...readRecord(existingContent.metadata),
          sourceDocumentTitle: document.title,
          snapshotAt: now.toISOString(),
          publicationSlotId: slot.id,
        },
        updatedAt: now,
      }).where(eq(mktContentItems.id, existingContent.id)).returning())[0]
      : (await tx.insert(mktContentItems).values({
        id: randomUUID(),
        organizationId: slot.organizationId,
        sourceDocumentId: document.id,
        title: document.title,
        slug: await uniqueContentSlug(tx, document.slug || document.title, slot.organizationId),
        excerpt: firstParagraph(document.body),
        contentKind: 'article',
        supportedChannels: ['blog', 'newsletter'],
        status: 'ready',
        body: document.body,
        format: document.format,
        tags: [],
        metadata: {
          sourceDocumentTitle: document.title,
          snapshotAt: now.toISOString(),
          publicationSlotId: slot.id,
          source: 'newsletter_slot_fulfill',
        },
        createdAt: now,
        updatedAt: now,
      }).returning())[0]

    if (!contentItem) throw new Error('Could not snapshot document into marketing content')

    const duplicateRuns = await tx
      .select()
      .from(mktDistributionRuns)
      .where(and(
        eq(mktDistributionRuns.organizationId, slot.organizationId),
        eq(mktDistributionRuns.publicationId, slot.publicationId),
        eq(mktDistributionRuns.channel, 'newsletter'),
        eq(mktDistributionRuns.contentItemId, contentItem.id),
        inArray(mktDistributionRuns.status, ['scheduled', 'sending', 'sent']),
      ))
    const duplicate = duplicateRuns.find((run) => run.id !== slot.distributionRunId)
    if (duplicate) throw new Error(`Content item is already ${duplicate.status} for this publication`)

    let distributionRun: typeof mktDistributionRuns.$inferSelect
    const subject = input.subject?.trim() || document.title
    const paragraphPreview = firstParagraph(document.body)
    const inputPreheader = input.preheader?.trim()
    const preheader = inputPreheader && !isSameMarketingText(inputPreheader, subject)
      ? inputPreheader
      : paragraphPreview?.slice(0, 180) || undefined
    const runMetadata = {
      ...(slot.distributionRunId ? {} : { createdBy: 'newsletter_slot_fulfill' }),
      publicationSlotId: slot.id,
      editorialIdeaId: idea?.id,
      sourceDocumentId: document.id,
      fulfilledByRunId: input.runId,
      fulfilledAt: now.toISOString(),
      ...readRecord(input.metadata),
    }

    if (slot.distributionRunId) {
      const [existingRun] = await tx.select().from(mktDistributionRuns).where(eq(mktDistributionRuns.id, slot.distributionRunId)).limit(1)
      if (!existingRun) throw new Error('Linked distribution run not found')
      if (['sending', 'sent'].includes(existingRun.status)) throw new Error(`Linked distribution run is already ${existingRun.status}`)
      distributionRun = (await tx.update(mktDistributionRuns).set({
        contentItemId: contentItem.id,
        name: subject,
        subject,
        preheader,
        status: 'scheduled',
        scheduledAt: slot.scheduledAt,
        scheduledTimezone: slot.scheduledTimezone,
        recipientFilter: { publicationId: slot.publicationId },
        error: null,
        metadata: { ...readRecord(existingRun.metadata), ...runMetadata },
        updatedAt: now,
      }).where(eq(mktDistributionRuns.id, existingRun.id)).returning())[0]
    } else {
      distributionRun = (await tx.insert(mktDistributionRuns).values({
        id: randomUUID(),
        organizationId: slot.organizationId,
        publicationId: slot.publicationId,
        contentItemId: contentItem.id,
        channel: 'newsletter',
        distributionType: 'broadcast',
        name: subject,
        subject,
        preheader,
        status: 'scheduled',
        scheduledAt: slot.scheduledAt,
        scheduledTimezone: slot.scheduledTimezone,
        recipientFilter: { publicationId: slot.publicationId },
        metrics: {},
        metadata: runMetadata,
        createdAt: now,
        updatedAt: now,
      }).returning())[0]
    }

    const linkedBlogDistributionRunId = readOptionalString(readRecord(slot.metadata).blogDistributionRunId)
    const existingBlogRuns = await tx
      .select()
      .from(mktDistributionRuns)
      .where(and(
        eq(mktDistributionRuns.organizationId, slot.organizationId),
        eq(mktDistributionRuns.contentItemId, contentItem.id),
        eq(mktDistributionRuns.channel, 'blog'),
        inArray(mktDistributionRuns.status, ['draft', 'scheduled', 'sending', 'published']),
      ))
    const reusableBlogRun = existingBlogRuns.find((run) => run.id === linkedBlogDistributionRunId)
      ?? existingBlogRuns.find((run) => readOptionalString(readRecord(run.metadata).pairedNewsletterRunId) === distributionRun.id)
      ?? existingBlogRuns.find((run) => ['draft', 'scheduled'].includes(run.status))
      ?? existingBlogRuns.find((run) => ['sending', 'published'].includes(run.status))
    const blogRunMetadata = {
      ...(reusableBlogRun ? readRecord(reusableBlogRun.metadata) : {}),
      source: 'newsletter_schedule_pair',
      pairedNewsletterRunId: distributionRun.id,
      publicationSlotId: slot.id,
      editorialIdeaId: idea?.id,
      sourceDocumentId: document.id,
      fulfilledByRunId: input.runId,
      pairedAt: now.toISOString(),
    }
    const blogDistributionRun = reusableBlogRun
      ? ['sending', 'published'].includes(reusableBlogRun.status)
        ? reusableBlogRun
        : (await tx.update(mktDistributionRuns).set({
          publicationId: slot.publicationId,
          contentItemId: contentItem.id,
          distributionType: 'publish',
          name: subject,
          status: 'scheduled',
          scheduledAt: slot.scheduledAt,
          scheduledTimezone: slot.scheduledTimezone,
          recipientFilter: {},
          error: null,
          metadata: blogRunMetadata,
          updatedAt: now,
        }).where(eq(mktDistributionRuns.id, reusableBlogRun.id)).returning())[0]
      : (await tx.insert(mktDistributionRuns).values({
        id: randomUUID(),
        organizationId: slot.organizationId,
        publicationId: slot.publicationId,
        contentItemId: contentItem.id,
        channel: 'blog',
        distributionType: 'publish',
        name: subject,
        status: 'scheduled',
        scheduledAt: slot.scheduledAt,
        scheduledTimezone: slot.scheduledTimezone,
        recipientFilter: {},
        metrics: {},
        metadata: blogRunMetadata,
        createdAt: now,
        updatedAt: now,
      }).returning())[0]

    const [updatedSlot] = await tx.update(mktPublicationSlots).set({
      ideaId: idea?.id ?? slot.ideaId,
      documentId: document.id,
      contentItemId: contentItem.id,
      distributionRunId: distributionRun.id,
      agentRunId: input.runId ?? slot.agentRunId,
      status: 'scheduled',
      error: null,
      metadata: {
        ...readRecord(slot.metadata),
        fulfilledAt: now.toISOString(),
        fulfilledByRunId: input.runId,
        blogDistributionRunId: blogDistributionRun.id,
      },
      updatedAt: now,
    }).where(eq(mktPublicationSlots.id, slot.id)).returning()
    if (!updatedSlot) throw new Error('Could not update publication slot')

    if (idea) {
      await tx.update(mktEditorialIdeas).set({
        documentId: document.id,
        contentItemId: contentItem.id,
        agentRunId: input.runId ?? idea.agentRunId,
        status: 'used',
        usedAt: now,
        metadata: {
          ...readRecord(idea.metadata),
          publicationSlotId: slot.id,
          distributionRunId: distributionRun.id,
          blogDistributionRunId: blogDistributionRun.id,
          usedAt: now.toISOString(),
        },
        updatedAt: now,
      }).where(eq(mktEditorialIdeas.id, idea.id))
    }

    const blogActivityLabel = blogDistributionRun.status === 'scheduled'
      ? 'scheduled blog'
      : `linked ${blogDistributionRun.status} blog`
    await tx.insert(activityEvents).values({
      id: randomUUID(),
      organizationId: slot.organizationId,
      occurredAt: now,
      createdAt: now,
      eventType: 'newsletter_slot_fulfilled',
      activityKind: 'progress',
      origin: 'pach_work',
      subjectType: 'publication_slot',
      subjectId: slot.id,
      subjectLabel: subject,
      actorType: 'agent',
      actorName: 'editorial_agent',
      source: 'marketing_autonomy',
      severity: 'info',
      summary: `Scheduled newsletter and ${blogActivityLabel} "${subject}" for ${slot.scheduledAt.toISOString()}`,
      details: {
        publicationId: publication.id,
        publicationSlug: publication.slug,
        ideaId: idea?.id,
        documentId: document.id,
        contentItemId: contentItem.id,
        distributionRunId: distributionRun.id,
        blogDistributionRunId: blogDistributionRun.id,
        blogDistributionRunStatus: blogDistributionRun.status,
      },
      metadata: {
        publicationId: publication.id,
        publicationSlug: publication.slug,
        publicationSlotId: slot.id,
        blogDistributionRunId: blogDistributionRun.id,
        agentRunId: input.runId,
      },
    })

    return { slot: updatedSlot, publication, document, idea, contentItem, distributionRun, blogDistributionRun }
  })
}

export async function markPublicationSlotForDistributionRun(runId: string, status: 'scheduled' | 'sending' | 'sent' | 'failed', error?: string | null) {
  const db = getDb()
  const now = new Date()
  await db.update(mktPublicationSlots).set({
    status: status === 'failed' ? 'failed' : status,
    error: error ?? null,
    updatedAt: now,
  }).where(eq(mktPublicationSlots.distributionRunId, runId))
}

export function readMarketingCadenceConfig(metadata: Record<string, unknown> | null | undefined): MarketingCadenceConfig {
  const raw = readRecord(readRecord(metadata).marketingCadence)
  const frequency = readEnum(raw.frequency, ['weekly', 'monthly', 'quarterly']) ?? 'weekly'
  return {
    enabled: raw.enabled === true,
    mode: readEnum(raw.mode, ['autonomous', 'issue']) ?? 'autonomous',
    frequency,
    lookaheadDays: clampPositiveInteger(raw.lookaheadDays, DEFAULT_LOOKAHEAD_DAYS),
    cooldownDays: clampPositiveInteger(raw.cooldownDays, DEFAULT_COOLDOWN_DAYS),
    timezone: readOptionalString(raw.timezone) ?? DEFAULT_TIMEZONE,
    time: normalizeTime(readOptionalString(raw.time) ?? DEFAULT_TIME),
    dayOfWeek: clampInteger(raw.dayOfWeek, 1, 0, 6),
    dayOfMonth: clampInteger(raw.dayOfMonth, 1, 1, 31),
    minIdeaBacklog: clampPositiveInteger(raw.minIdeaBacklog, DEFAULT_MIN_IDEA_BACKLOG),
    teamId: readOptionalString(raw.teamId),
    statusId: readOptionalString(raw.statusId),
    assigneeId: readOptionalString(raw.assigneeId),
    creatorId: readOptionalString(raw.creatorId),
    projectId: readOptionalString(raw.projectId),
  }
}

export function cadencePayload(cadence: MarketingCadenceConfig) {
  return {
    enabled: cadence.enabled,
    mode: cadence.mode,
    frequency: cadence.frequency,
    lookaheadDays: cadence.lookaheadDays,
    cooldownDays: cadence.cooldownDays,
    timezone: cadence.timezone,
    time: cadence.time,
    dayOfWeek: cadence.dayOfWeek,
    dayOfMonth: cadence.dayOfMonth,
    minIdeaBacklog: cadence.minIdeaBacklog,
    teamId: cadence.teamId,
    statusId: cadence.statusId,
    assigneeId: cadence.assigneeId,
    creatorId: cadence.creatorId,
    projectId: cadence.projectId,
  }
}

function buildSlotTargets(cadence: MarketingCadenceConfig, now: Date) {
  const horizon = new Date(now.getTime() + cadence.lookaheadDays * ONE_DAY_MS)
  const schedule = cadenceSchedule(cadence)
  const targets: Array<{ slotKey: string; scheduledAt: Date }> = []
  let cursor = now

  for (let i = 0; i < 20; i += 1) {
    const scheduledAt = computeNextRunAt(schedule, cursor)
    if (scheduledAt > horizon) break
    targets.push({ slotKey: slotKeyForScheduledAt(cadence, scheduledAt), scheduledAt })
    cursor = new Date(scheduledAt.getTime() + 1000)
  }

  return targets
}

function slotKeyForScheduledAt(cadence: MarketingCadenceConfig, scheduledAt: Date) {
  const schedule = cadenceSchedule(cadence)
  return `${cadence.frequency}:${getPeriodKey(schedule, scheduledAt)}`
}

function cadenceSchedule(cadence: MarketingCadenceConfig): TaskTriggerSchedule {
  return {
    kind: 'recurring',
    frequency: cadence.frequency,
    timezone: cadence.timezone,
    time: cadence.time,
    dayOfWeek: cadence.dayOfWeek,
    dayOfMonth: cadence.dayOfMonth,
  }
}

async function queueIdeaBacklogRunIfNeeded({
  publication,
  organization,
  cadence,
  neededIdeas,
  now,
}: {
  publication: PublicationRow
  organization: OrganizationRow | null
  cadence: MarketingCadenceConfig
  neededIdeas: number
  now: Date
}) {
  const existing = await findActiveAgentRun('mkt_publication', publication.id, 'newsletter_idea_backlog')
  if (existing) return false

  const run = await queueEditorialMcpRun({
    organization,
    subjectType: 'mkt_publication',
    subjectId: publication.id,
    title: `Create ${neededIdeas} ideas for ${publication.name}`,
    workflow: 'newsletter_idea_backlog',
    metadata: {
      publicationId: publication.id,
      publicationSlug: publication.slug,
      neededIdeas,
      minIdeaBacklog: cadence.minIdeaBacklog,
      cadence: cadencePayload(cadence),
    },
    userMessage: `Create at least ${neededIdeas} unused editorial ideas for ${publication.name}.`,
    now,
  })

  await recordPublicationActivity({
    organizationId: publication.organizationId,
    publication,
    eventType: 'newsletter_idea_run_queued',
    summary: `Queued editorial idea backlog run for ${publication.name}`,
    metadata: { publicationId: publication.id, agentRunId: run.id, neededIdeas },
  })
  return true
}

async function queueSlotRunIfNeeded({
  publication,
  organization,
  cadence,
  slot,
  reservableIdeas,
  now,
}: {
  publication: PublicationRow
  organization: OrganizationRow | null
  cadence: MarketingCadenceConfig
  slot: SlotRow
  reservableIdeas: Array<typeof mktEditorialIdeas.$inferSelect>
  now: Date
}) {
  const existing = await findActiveAgentRun('publication_slot', slot.id, 'newsletter_slot_fulfillment')
  if (existing) return false

  const db = getDb()
  let ideaId = slot.ideaId
  if (!ideaId) {
    const idea = reservableIdeas.shift()
    if (idea) {
      const [updatedIdea] = await db.update(mktEditorialIdeas).set({
        status: 'reserved',
        reservedAt: now,
        metadata: {
          ...readRecord(idea.metadata),
          reservedForSlotId: slot.id,
          reservedAt: now.toISOString(),
        },
        updatedAt: now,
      }).where(eq(mktEditorialIdeas.id, idea.id)).returning()
      ideaId = updatedIdea.id
      await db.update(mktPublicationSlots).set({
        ideaId,
        metadata: { ...readRecord(slot.metadata), reservedIdeaId: ideaId },
        updatedAt: now,
      }).where(eq(mktPublicationSlots.id, slot.id))
    }
  }

  const run = await queueEditorialMcpRun({
    organization,
    subjectType: 'publication_slot',
    subjectId: slot.id,
    title: `Fulfill ${publication.name} newsletter slot`,
    workflow: 'newsletter_slot_fulfillment',
    metadata: {
      publicationId: publication.id,
      publicationSlug: publication.slug,
      slotId: slot.id,
      slotKey: slot.slotKey,
      ideaId,
      scheduledAt: slot.scheduledAt.toISOString(),
      scheduledTimezone: slot.scheduledTimezone,
      cadence: cadencePayload(cadence),
    },
    userMessage: `Create and schedule the newsletter for ${publication.name} slot ${slot.slotKey}.`,
    now,
  })

  await db.update(mktPublicationSlots).set({
    agentRunId: run.id,
    status: 'drafting',
    metadata: {
      ...readRecord(slot.metadata),
      queuedAgentRunId: run.id,
      queuedAt: now.toISOString(),
      ideaId,
    },
    updatedAt: now,
  }).where(eq(mktPublicationSlots.id, slot.id))

  await recordPublicationActivity({
    organizationId: publication.organizationId,
    publication,
    slot,
    eventType: 'newsletter_slot_run_queued',
    summary: `Queued editorial run for ${publication.name} slot ${slot.slotKey}`,
    metadata: { publicationId: publication.id, slotId: slot.id, agentRunId: run.id, ideaId },
  })

  return true
}

async function queueEditorialMcpRun({
  organization,
  subjectType,
  subjectId,
  title,
  workflow,
  metadata,
  userMessage,
  now,
}: {
  organization: OrganizationRow | null
  subjectType: string
  subjectId: string
  title: string
  workflow: string
  metadata: Record<string, unknown>
  userMessage: string
  now: Date
}) {
  const db = getDb()
  const runId = randomUUID()
  const conversationId = randomUUID()
  const messageId = randomUUID()
  const branchName = `mcp/editorial-${subjectId.slice(0, 8)}-${runId.slice(0, 8)}`

  await db.insert(agentConversations).values({
    id: conversationId,
    title,
    status: 'open',
    metadata: {
      source: 'marketing_autonomy',
      workflow,
      ...metadata,
    },
    createdAt: now,
    updatedAt: now,
  })

  const runMetadata = {
    executionClass: 'general',
    handler: 'editorial-mcp',
    intent: 'editorial',
    executionMode: 'mcp',
    agentProfile: 'editorial',
    requiredCapabilities: ['codex.local', 'pach-mcp'],
    queuedVia: 'marketing_autonomy',
    conversationId,
    editorialWorkflow: workflow,
    editorialIntent: 'newsletter_article',
    guidelinesPolicy: 'newsletter_guidelines_required',
    routeReason: 'Queued by autonomous newsletter schedule maintenance.',
    ...metadata,
  }

  const [run] = await db.insert(agentRuns).values({
    id: runId,
    conversationId,
    projectKey: organization?.project ?? 'pach',
    repoFullName: 'pach/mcp',
    baseBranch: 'main',
    branchName,
    agentKind: 'codex',
    status: 'queued',
    statusMessage: 'queued editorial agent worker',
    subjectType,
    subjectId,
    metadata: runMetadata,
    createdAt: now,
    updatedAt: now,
  }).returning()

  await db.insert(agentMessages).values({
    id: messageId,
    conversationId,
    runId: run.id,
    role: 'user',
    body: userMessage,
    metadata: { source: 'marketing_autonomy', workflow, ...metadata },
    createdAt: now,
  })

  return run
}

async function findActiveAgentRun(subjectType: string, subjectId: string, workflow: string) {
  const rows = await getDb()
    .select()
    .from(agentRuns)
    .where(and(
      eq(agentRuns.subjectType, subjectType),
      eq(agentRuns.subjectId, subjectId),
      inArray(agentRuns.status, [...ACTIVE_AGENT_RUN_STATUSES]),
    ))
    .orderBy(desc(agentRuns.createdAt))
    .limit(10)
  return rows.find((run) => readRecord(run.metadata).editorialWorkflow === workflow) ?? null
}

async function readOrganization(organizationId: string) {
  const [organization] = await getDb().select().from(organizations).where(eq(organizations.id, organizationId)).limit(1)
  return organization ?? null
}

async function uniqueContentSlug(tx: any, input: string, organizationId: string) {
  const base = slugify(input) || 'content'
  const rows = await tx
    .select({ id: mktContentItems.id, slug: mktContentItems.slug })
    .from(mktContentItems)
    .where(eq(mktContentItems.organizationId, organizationId))
    .limit(1000)
  const existing = new Set(rows.map((row: { slug: string }) => row.slug))
  if (!existing.has(base)) return base
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`
    if (!existing.has(candidate)) return candidate
  }
  return `${base}-${randomUUID().slice(0, 8)}`
}

async function recordPublicationActivity({
  organizationId,
  publication,
  slot,
  eventType,
  activityKind = 'operational',
  severity = 'info',
  subjectType = slot ? 'publication_slot' : 'mkt_publication',
  subjectId = slot?.id ?? publication.id,
  subjectLabel = slot?.slotKey ?? publication.name,
  summary,
  details = {},
  metadata = {},
}: {
  organizationId: string
  publication: PublicationRow
  slot?: SlotRow
  eventType: string
  activityKind?: string
  severity?: string
  subjectType?: string
  subjectId?: string
  subjectLabel?: string
  summary: string
  details?: Record<string, unknown>
  metadata?: Record<string, unknown>
}) {
  const now = new Date()
  await getDb().insert(activityEvents).values({
    id: randomUUID(),
    organizationId,
    occurredAt: now,
    createdAt: now,
    eventType,
    activityKind,
    origin: 'pach_work',
    subjectType,
    subjectId,
    subjectLabel,
    actorType: 'agent',
    actorName: 'marketing_autonomy',
    source: 'marketing_autonomy',
    severity,
    summary,
    details,
    metadata: { publicationId: publication.id, publicationSlug: publication.slug, ...metadata },
  })
}

function slotStatusForDistributionRun(status: string) {
  if (status === 'sent') return 'sent'
  if (status === 'sending') return 'sending'
  if (status === 'scheduled') return 'scheduled'
  return 'planned'
}

function ensureArticleChannels(channels: unknown) {
  const values = Array.isArray(channels) ? channels.filter((entry): entry is string => typeof entry === 'string') : []
  const next = [...values]
  for (const channel of ['blog', 'newsletter']) {
    if (!next.includes(channel)) next.push(channel)
  }
  return next
}

function firstParagraph(markdown: string) {
  for (const block of markdown.replace(/\r\n/g, '\n').split(/\n{2,}/)) {
    const paragraph = block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !/^#{1,6}\s+/.test(line) && !line.startsWith(':::') && !line.startsWith('![') && !line.startsWith('```'))
      .join(' ')
      .trim()
    if (paragraph) return stripInlineMarkdown(paragraph).slice(0, 280)
  }
  return undefined
}

function stripInlineMarkdown(value: string) {
  return value
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[*_`~]/g, '')
}

function isSameMarketingText(value: string | null | undefined, candidate: string | null | undefined) {
  const left = marketingTextDedupeKey(value)
  const right = marketingTextDedupeKey(candidate)
  return Boolean(left && right && left === right)
}

function marketingTextDedupeKey(value: string | null | undefined) {
  return (value ?? '')
    .replace(/^#{1,6}\s+/, '')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizeDedupeKey(value: string) {
  const slug = slugify(value)
  if (slug) return slug.slice(0, 140)
  return createHash('sha256').update(value).digest('hex').slice(0, 32)
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[]) {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : undefined
}

function clampPositiveInteger(value: unknown, fallback: number) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number) || number <= 0) return fallback
  return Math.trunc(number)
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(number)))
}

function normalizeTime(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return DEFAULT_TIME
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return DEFAULT_TIME
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return DEFAULT_TIME
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}
