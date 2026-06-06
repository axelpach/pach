import { eq, and, desc } from 'drizzle-orm'
import { getDb } from '../../db.js'
import { organizations, whatsappMessages } from '../../../../db/schema.js'
import { getWhatsApp } from './client.js'
import { normalizeWhatsAppPhone } from './phone.js'

export interface SendTextInput {
  projectId: string
  to: string
  body: string
  contactId?: string
}

export interface SendTextResult {
  success: boolean
  messageId?: string
  to: string
  error?: string
}

const WINDOW_MS = 24 * 60 * 60 * 1000 // WhatsApp's 24h free-form reply window

/**
 * Send a free-form text message. Only valid within 24h of the contact's
 * last inbound message — outside that window, must use a template instead.
 */
export async function sendText(input: SendTextInput): Promise<SendTextResult> {
  const db = getDb()
  const phone = normalizeWhatsAppPhone(input.to)

  // Resolve company for this project
  const [company] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.project, input.projectId))
    .limit(1)
  if (!company) {
    return { success: false, to: phone, error: `No organization found for project=${input.projectId}` }
  }

  // Enforce 24h reply window: find most recent inbound from this phone for this organization
  const [lastInbound] = await db
    .select({ createdAt: whatsappMessages.createdAt })
    .from(whatsappMessages)
    .where(and(
      eq(whatsappMessages.organizationId, company.id),
      eq(whatsappMessages.phone, phone),
      eq(whatsappMessages.direction, 'inbound'),
    ))
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(1)

  if (!lastInbound) {
    return { success: false, to: phone, error: 'No inbound message from this contact — free-form text not allowed; use a template' }
  }
  const ageMs = Date.now() - new Date(lastInbound.createdAt).getTime()
  if (ageMs > WINDOW_MS) {
    return { success: false, to: phone, error: '24h reply window has closed — use a template' }
  }

  const { client, phoneNumberId } = getWhatsApp(input.projectId)

  try {
    const result = await client.messages.sendText({
      phoneNumberId,
      to: phone,
      text: { body: input.body },
    } as never)
    const messageId = (result as { messages?: Array<{ id?: string }> })?.messages?.[0]?.id

    await db.insert(whatsappMessages).values({
      organizationId: company.id,
      contactId: input.contactId,
      phone,
      direction: 'outbound',
      body: input.body,
      templateName: null,
      status: 'sent',
      metaMessageId: messageId,
      sentAt: new Date(),
    })

    return { success: true, messageId, to: phone }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    await db.insert(whatsappMessages).values({
      organizationId: company.id,
      contactId: input.contactId,
      phone,
      direction: 'outbound',
      body: input.body,
      templateName: null,
      status: 'failed',
      error: message,
    })

    return { success: false, to: phone, error: message }
  }
}
