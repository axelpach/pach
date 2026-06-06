import { eq } from 'drizzle-orm'
import { getDb } from '../../db.js'
import { organizations, whatsappMessages } from '../../../../db/schema.js'
import { getWhatsApp } from './client.js'
import { normalizeWhatsAppPhone } from './phone.js'

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
  debug?: {
    projectId: string
    phoneNumberId: string
    wabaId: string
    languageCode: string
    templateName: string
    recipient: string
    components?: TemplateComponent[]
  }
}

const isDeployed = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID)
const isProduction = process.env.NODE_ENV === 'production' || isDeployed
const DEV_PHONE = process.env.WHATSAPP_DEV_PHONE

function getRecipient(phone: string): string {
  const normalized = normalizeWhatsAppPhone(phone)
  if (!isProduction && DEV_PHONE) return normalizeWhatsAppPhone(DEV_PHONE)
  return normalized
}

async function resolveCompanyId(projectId: string): Promise<string> {
  const db = getDb()
  const [company] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.project, projectId))
    .limit(1)
  if (!company) throw new Error(`No organization found with project=${projectId}`)
  return company.id
}

export async function sendTemplate(input: SendTemplateInput): Promise<SendTemplateResult> {
  const db = getDb()
  const normalizedTo = normalizeWhatsAppPhone(input.to)
  const recipient = getRecipient(input.to)
  const organizationId = await resolveCompanyId(input.projectId)

  const { client, phoneNumberId, wabaId, defaultLanguageCode } = getWhatsApp(input.projectId)
  const languageCode = input.languageCode || defaultLanguageCode

  const templatePayload: Record<string, unknown> = {
    name: input.templateName,
    language: { code: languageCode },
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
      organizationId,
      campaignId: input.campaignId,
      contactId: input.contactId,
      phone: normalizedTo,
      templateName: input.templateName,
      status: 'sent',
      metaMessageId: messageId,
      sentAt: new Date(),
    })

    return {
      success: true,
      messageId,
      to: normalizedTo,
      ...(isProduction ? {} : {
        debug: {
          projectId: input.projectId,
          phoneNumberId,
          wabaId,
          languageCode,
          templateName: input.templateName,
          recipient,
          components: input.components,
        },
      }),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    await db.insert(whatsappMessages).values({
      organizationId,
      campaignId: input.campaignId,
      contactId: input.contactId,
      phone: normalizedTo,
      templateName: input.templateName,
      status: 'failed',
      error: message,
    })

    return {
      success: false,
      to: normalizedTo,
      error: message,
      ...(isProduction ? {} : {
        debug: {
          projectId: input.projectId,
          phoneNumberId,
          wabaId,
          languageCode,
          templateName: input.templateName,
          recipient,
          components: input.components,
        },
      }),
    }
  }
}
