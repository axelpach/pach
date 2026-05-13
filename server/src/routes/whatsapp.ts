import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { getDb } from '../db.js'
import { crmContacts } from '../../../db/schema.js'
import { sendTemplate, type TemplateComponent } from '../services/whatsapp/send.js'
import { syncTemplates } from '../services/whatsapp/sync.js'
import { handleWebhook } from '../services/whatsapp/webhook.js'
import { fireCampaign } from '../services/whatsapp/fire.js'

const router = Router()

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
  if (!to && body.contactId) {
    const db = getDb()
    const [contact] = await db
      .select({ phone: crmContacts.phone })
      .from(crmContacts)
      .where(eq(crmContacts.id, body.contactId))
      .limit(1)
    if (!contact) return res.status(404).json({ error: 'contact not found' })
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
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  if (mode === 'subscribe' && expected && token === expected) {
    return res.status(200).send(String(challenge ?? ''))
  }
  return res.sendStatus(403)
})

router.post('/webhook', async (req, res) => {
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
    const result = await syncTemplates(projectId)
    return res.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ error: message })
  }
})

router.post('/campaigns/:id/fire', async (req, res) => {
  const id = req.params.id
  try {
    const result = await fireCampaign(id)
    return res.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ error: message })
  }
})

export default router
