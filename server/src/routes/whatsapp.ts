import { Router, type Request } from 'express'
import { eq } from 'drizzle-orm'
import { getDb } from '../db.js'
import { crmContacts, organizations, whatsappCampaigns } from '../../../db/schema.js'
import { sendTemplate, type TemplateComponent } from '../services/whatsapp/send.js'
import { sendText } from '../services/whatsapp/send-text.js'
import { syncTemplates } from '../services/whatsapp/sync.js'
import { handleWebhook } from '../services/whatsapp/webhook.js'
import { fireCampaign } from '../services/whatsapp/fire.js'

export const publicWhatsAppRouter = Router()
const router = Router()

function requireOrganizationAccess(req: Request, organizationId: string | null | undefined) {
  if (!organizationId) {
    if (!req.user?.canAccessUnscoped) throw new Error('Not authorized for no-organization content')
    return
  }
  if (!req.user?.organizationIds.includes(organizationId)) {
    throw new Error('Not authorized for this organization')
  }
}

async function organizationIdForProject(projectId: string) {
  const db = getDb()
  const [organization] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.project, projectId))
    .limit(1)
  return organization?.id
}

interface SendTemplateBody {
  projectId: string
  contactId?: string
  to?: string
  templateName: string
  components?: TemplateComponent[]
  languageCode?: string
}

router.post('/send-template', async (req, res) => {
  const body = req.body as SendTemplateBody

  if (!body?.projectId || !body?.templateName) {
    return res.status(400).json({ error: 'projectId and templateName are required' })
  }
  if (!body.to && !body.contactId) {
    return res.status(400).json({ error: 'either to or contactId is required' })
  }

  let to = body.to
  const organizationId = await organizationIdForProject(body.projectId)
  if (!organizationId) return res.status(404).json({ error: `No organization found for project=${body.projectId}` })

  try {
    requireOrganizationAccess(req, organizationId)
  } catch (error) {
    return res.status(403).json({ error: error instanceof Error ? error.message : 'Not authorized' })
  }

  if (!to && body.contactId) {
    const db = getDb()
    const [contact] = await db
      .select({ phone: crmContacts.phone, organizationId: crmContacts.organizationId })
      .from(crmContacts)
      .where(eq(crmContacts.id, body.contactId))
      .limit(1)
    if (!contact) return res.status(404).json({ error: 'contact not found' })
    if (contact.organizationId !== organizationId) return res.status(403).json({ error: 'Contact is not in this organization' })
    if (!contact.phone) return res.status(400).json({ error: 'contact has no phone' })
    to = contact.phone
  }

  try {
    const result = await sendTemplate({
      projectId: body.projectId,
      to: to!,
      templateName: body.templateName,
      components: body.components,
      languageCode: body.languageCode,
      contactId: body.contactId,
    })
    return res.status(result.success ? 200 : 502).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ error: message })
  }
})

// Meta webhook verification (GET) and event delivery (POST).
publicWhatsAppRouter.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || process.env.WHATSAPP_WEBHOOK_VERIFICATION_TOKEN
  if (mode === 'subscribe' && expected && token === expected) {
    return res.status(200).send(String(challenge ?? ''))
  }
  return res.sendStatus(403)
})

publicWhatsAppRouter.post('/webhook', async (req, res) => {
  // Always 200 quickly so Meta doesn't retry; process async.
  res.sendStatus(200)
  try {
    await handleWebhook(req.body)
  } catch (error) {
    console.error('[whatsapp webhook] error processing payload:', error)
  }
})

router.post('/templates/sync', async (req, res) => {
  const projectId = (req.body?.projectId || req.query?.projectId) as string | undefined
  if (!projectId) return res.status(400).json({ error: 'projectId is required' })
  try {
    const organizationId = await organizationIdForProject(projectId)
    if (!organizationId) return res.status(404).json({ error: `No organization found for project=${projectId}` })
    requireOrganizationAccess(req, organizationId)
    const result = await syncTemplates(projectId)
    return res.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return res.status(message.includes('Not authorized') ? 403 : 500).json({ error: message })
  }
})

router.post('/send-text', async (req, res) => {
  const body = req.body as { projectId?: string; to?: string; contactId?: string; body?: string }
  if (!body?.projectId || !body?.body) {
    return res.status(400).json({ error: 'projectId and body are required' })
  }
  if (!body.to && !body.contactId) {
    return res.status(400).json({ error: 'either to or contactId is required' })
  }

  let to = body.to
  const organizationId = await organizationIdForProject(body.projectId)
  if (!organizationId) return res.status(404).json({ error: `No organization found for project=${body.projectId}` })

  try {
    requireOrganizationAccess(req, organizationId)
  } catch (error) {
    return res.status(403).json({ error: error instanceof Error ? error.message : 'Not authorized' })
  }

  if (!to && body.contactId) {
    const db = getDb()
    const [contact] = await db
      .select({ phone: crmContacts.phone, organizationId: crmContacts.organizationId })
      .from(crmContacts)
      .where(eq(crmContacts.id, body.contactId))
      .limit(1)
    if (!contact) return res.status(404).json({ error: 'contact not found' })
    if (contact.organizationId !== organizationId) return res.status(403).json({ error: 'Contact is not in this organization' })
    if (!contact.phone) return res.status(400).json({ error: 'contact has no phone' })
    to = contact.phone
  }

  try {
    const result = await sendText({
      projectId: body.projectId,
      to: to!,
      body: body.body,
      contactId: body.contactId,
    })
    return res.status(result.success ? 200 : 422).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ error: message })
  }
})

router.post('/campaigns/:id/fire', async (req, res) => {
  const id = req.params.id
  try {
    const db = getDb()
    const [campaign] = await db
      .select({ organizationId: whatsappCampaigns.organizationId })
      .from(whatsappCampaigns)
      .where(eq(whatsappCampaigns.id, id))
      .limit(1)
    if (!campaign) return res.status(404).json({ error: 'campaign not found' })
    requireOrganizationAccess(req, campaign.organizationId)
    const result = await fireCampaign(id)
    return res.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return res.status(message.includes('Not authorized') ? 403 : 500).json({ error: message })
  }
})

export default router
