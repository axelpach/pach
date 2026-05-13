import { eq, inArray } from 'drizzle-orm'
import { getDb } from '../../db.js'
import { companies, crmContacts, whatsappCampaigns, whatsappTemplates } from '../../../../db/schema.js'
import { sendTemplate, type TemplateComponent } from './send.js'

export interface FireResult {
  campaignId: string
  total: number
  sent: number
  failed: number
  results: Array<{ contactId: string | null; phone: string; success: boolean; error?: string }>
}

interface RecipientFilter {
  contactIds?: string[]
}

function buildComponents(variableValues: Record<string, string>, variables: readonly string[], mediaId?: string, headerFormat?: string | null): TemplateComponent[] {
  const components: TemplateComponent[] = []

  if (mediaId && headerFormat) {
    const fmt = headerFormat.toLowerCase()
    if (fmt === 'image' || fmt === 'video' || fmt === 'document') {
      components.push({
        type: 'header',
        parameters: [{ type: fmt, [fmt]: { id: mediaId } }],
      })
    }
  }

  if (variables.length > 0) {
    const sorted = [...variables].sort((a, b) => {
      const ai = parseInt(a.replace(/[^\d]/g, ''), 10)
      const bi = parseInt(b.replace(/[^\d]/g, ''), 10)
      return ai - bi
    })
    components.push({
      type: 'body',
      parameters: sorted.map(v => ({ type: 'text', text: variableValues[v] ?? '' })),
    })
  }

  return components
}

export async function fireCampaign(campaignId: string): Promise<FireResult> {
  const db = getDb()

  const [campaign] = await db.select().from(whatsappCampaigns).where(eq(whatsappCampaigns.id, campaignId)).limit(1)
  if (!campaign) throw new Error('campaign not found')

  const [template] = await db.select().from(whatsappTemplates).where(eq(whatsappTemplates.id, campaign.templateId)).limit(1)
  if (!template) throw new Error('template not found')

  const [company] = await db.select().from(companies).where(eq(companies.id, campaign.companyId)).limit(1)
  if (!company?.project) throw new Error('company has no project')

  const filter = (campaign.recipientFilter || {}) as RecipientFilter
  const contactIds = filter.contactIds || []
  if (contactIds.length === 0) {
    throw new Error('campaign has no recipients')
  }

  const recipients = await db
    .select({ id: crmContacts.id, phone: crmContacts.phone })
    .from(crmContacts)
    .where(inArray(crmContacts.id, contactIds))

  await db
    .update(whatsappCampaigns)
    .set({ status: 'sending', updatedAt: new Date() })
    .where(eq(whatsappCampaigns.id, campaignId))

  const components = buildComponents(
    (campaign.variableValues || {}) as Record<string, string>,
    template.variables,
    campaign.mediaId || undefined,
    template.headerFormat,
  )

  const results: FireResult['results'] = []
  let sent = 0
  let failed = 0

  for (const r of recipients) {
    if (!r.phone) {
      results.push({ contactId: r.id, phone: '', success: false, error: 'no phone' })
      failed++
      continue
    }
    const result = await sendTemplate({
      projectId: company.project,
      to: r.phone,
      templateName: template.name,
      languageCode: template.language,
      components,
      contactId: r.id,
      campaignId,
    })
    results.push({ contactId: r.id, phone: r.phone, success: result.success, error: result.error })
    if (result.success) sent++
    else failed++
  }

  await db
    .update(whatsappCampaigns)
    .set({
      status: failed === 0 ? 'sent' : sent === 0 ? 'failed' : 'sent',
      firedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(whatsappCampaigns.id, campaignId))

  return { campaignId, total: recipients.length, sent, failed, results }
}
