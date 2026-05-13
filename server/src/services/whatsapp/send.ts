import { eq } from 'drizzle-orm'
import { getDb } from '../../db.js'
import { companies, whatsappMessages } from '../../../../db/schema.js'
import { getWhatsApp } from './client.js'

export interface TemplateComponent {
  type: 'header' | 'body' | 'button'
  parameters?: Array<Record<string, unknown>>
  sub_type?: string
  index?: string | number
}

export interface SendTemplateInput {
  projectId: string
  to: string
  templateName: string
  components?: TemplateComponent[]
  languageCode?: string
  /** Optional: associate this send with a CRM contact for log lookups */
  contactId?: string
  /** Optional: associate this send with a campaign */
  campaignId?: string
}

export interface SendTemplateResult {
  success: boolean
  messageId?: string
  to: string
  error?: string
}

const isProduction = process.env.NODE_ENV === 'production'
const DEV_PHONE = process.env.WHATSAPP_DEV_PHONE

function normalizePhoneNumber(phone: string): string {
  let normalized = phone.replace(/[\s\-()]/g, '')
  if (!normalized.startsWith('+')) normalized = '+' + normalized
  if (normalized.startsWith('+521') && normalized.length === 13) {
    normalized = '+52' + normalized.slice(4)
  }
  return normalized
}

function getRecipient(phone: string): string {
  const normalized = normalizePhoneNumber(phone)
  if (!isProduction && DEV_PHONE) return normalizePhoneNumber(DEV_PHONE)
  return normalized
}

async function resolveCompanyId(projectId: string): Promise<string> {
  const db = getDb()
  const [company] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.project, projectId))
    .limit(1)
  if (!company) throw new Error(`No company found with project=${projectId}`)
  return company.id
}

export async function sendTemplate(input: SendTemplateInput): Promise<SendTemplateResult> {
  const db = getDb()
  const normalizedTo = normalizePhoneNumber(input.to)
  const recipient = getRecipient(input.to)
  const companyId = await resolveCompanyId(input.projectId)

  const { client, phoneNumberId, defaultLanguageCode } = getWhatsApp(input.projectId)

  const templatePayload: Record<string, unknown> = {
    name: input.templateName,
    language: { code: input.languageCode || defaultLanguageCode },
  }
  if (input.components && input.components.length > 0) {
    templatePayload.components = input.components
  }

  try {
    const result = await client.messages.sendTemplate({
      phoneNumberId,
      to: recipient,
      template: templatePayload as never,
    })
    const messageId = (result as { messages?: Array<{ id?: string }> })?.messages?.[0]?.id

    await db.insert(whatsappMessages).values({
      companyId,
      campaignId: input.campaignId,
      contactId: input.contactId,
      phone: normalizedTo,
      templateName: input.templateName,
      status: 'sent',
      metaMessageId: messageId,
      sentAt: new Date(),
    })

    return { success: true, messageId, to: normalizedTo }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    await db.insert(whatsappMessages).values({
      companyId,
      campaignId: input.campaignId,
      contactId: input.contactId,
      phone: normalizedTo,
      templateName: input.templateName,
      status: 'failed',
      error: message,
    })

    return { success: false, to: normalizedTo, error: message }
  }
}
