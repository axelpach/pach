import { eq } from 'drizzle-orm'
import { getDb } from '../../db.js'
import { companies, crmContacts, whatsappMessages, whatsappTemplates } from '../../../../db/schema.js'
import { projects } from '../../../../pach.config.js'
import { normalizeWhatsAppPhone } from './phone.js'

interface StatusEntry {
  id: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp?: string
  errors?: Array<{ title?: string; message?: string }>
}

interface InboundContact {
  profile?: { name?: string }
  wa_id?: string
}

interface InboundMessage {
  from?: string
  id?: string
  timestamp?: string
  type?: string
  text?: { body?: string }
}

interface WebhookEntry {
  id?: string
  changes?: Array<{
    field?: string
    value?: {
      metadata?: { phone_number_id?: string; display_phone_number?: string }
      contacts?: InboundContact[]
      messages?: InboundMessage[]
      statuses?: StatusEntry[]
      message_template_id?: number | string
      message_template_name?: string
      event?: string
      reason?: string
    }
  }>
}

export interface WebhookPayload {
  object?: string
  entry?: WebhookEntry[]
}

/**
 * Map a Meta phone_number_id back to a pach.config.ts project key by reading
 * the env vars referenced in each project's whatsapp config. Cached on first
 * call since project config is static at runtime.
 */
let projectByPhoneNumberIdCache: Map<string, string> | null = null
function projectIdForPhoneNumberId(phoneNumberId: string | undefined): string | null {
  if (!phoneNumberId) return null
  if (!projectByPhoneNumberIdCache) {
    projectByPhoneNumberIdCache = new Map()
    for (const [projectId, project] of Object.entries(projects)) {
      const wa = project.whatsapp
      if (!wa) continue
      const value = process.env[wa.phoneNumberIdEnv]
      if (value) projectByPhoneNumberIdCache.set(value, projectId)
    }
  }
  return projectByPhoneNumberIdCache.get(phoneNumberId) ?? null
}

export async function handleWebhook(payload: WebhookPayload): Promise<void> {
  const db = getDb()

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      if (!value) continue

      // ── 1. Delivery status updates for outbound messages ─────────────
      if (Array.isArray(value.statuses)) {
        for (const s of value.statuses) {
          const ts = s.timestamp ? new Date(Number(s.timestamp) * 1000) : new Date()
          const update: Record<string, unknown> = { status: s.status }
          if (s.status === 'delivered') update.deliveredAt = ts
          if (s.status === 'read') update.readAt = ts
          if (s.status === 'failed' && s.errors?.[0]) {
            update.error = s.errors[0].message || s.errors[0].title || 'unknown error'
          }
          await db
            .update(whatsappMessages)
            .set(update)
            .where(eq(whatsappMessages.metaMessageId, s.id))
        }
      }

      // ── 2. Inbound messages (replies) ────────────────────────────────
      if (Array.isArray(value.messages) && value.messages.length > 0) {
        const projectId = projectIdForPhoneNumberId(value.metadata?.phone_number_id)
        if (!projectId) {
          console.warn('[whatsapp webhook] unknown phone_number_id, skipping inbound:', value.metadata?.phone_number_id)
          continue
        }
        const [company] = await db
          .select({ id: companies.id })
          .from(companies)
          .where(eq(companies.project, projectId))
          .limit(1)
        if (!company) {
          console.warn(`[whatsapp webhook] no company row for project ${projectId}, skipping inbound`)
          continue
        }

        const contactsByWaId = new Map<string, InboundContact>()
        for (const c of value.contacts ?? []) {
          if (c.wa_id) contactsByWaId.set(c.wa_id, c)
        }

        for (const msg of value.messages) {
          if (!msg.from) continue
          const phone = normalizeWhatsAppPhone(msg.from)
          const profileName = contactsByWaId.get(msg.from)?.profile?.name ?? null

          // Find or create the CRM contact for this phone
          const [existing] = await db
            .select({ id: crmContacts.id })
            .from(crmContacts)
            .where(eq(crmContacts.phone, phone))
            .limit(1)
          let contactId = existing?.id
          if (!contactId) {
            const [created] = await db
              .insert(crmContacts)
              .values({ name: profileName || phone, phone })
              .returning({ id: crmContacts.id })
            contactId = created.id
          }

          const ts = msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date()
          const body = msg.type === 'text' ? (msg.text?.body ?? '') : `[${msg.type ?? 'unknown'}]`

          await db.insert(whatsappMessages).values({
            companyId: company.id,
            contactId,
            phone,
            direction: 'inbound',
            body,
            inboundProfileName: profileName,
            templateName: null,
            status: 'received',
            metaMessageId: msg.id,
            createdAt: ts,
          })
        }
      }

      // ── 3. Template approval status updates ─────────────────────────
      if (change.field === 'message_template_status_update' && value.message_template_id) {
        const statusMap: Record<string, string> = {
          APPROVED: 'APPROVED',
          REJECTED: 'REJECTED',
          PENDING: 'PENDING',
          PAUSED: 'PAUSED',
          DISABLED: 'DISABLED',
        }
        const newStatus = statusMap[(value.event || '').toUpperCase()]
        if (newStatus) {
          await db
            .update(whatsappTemplates)
            .set({ status: newStatus, updatedAt: new Date() })
            .where(eq(whatsappTemplates.metaId, String(value.message_template_id)))
        }
      }
    }
  }
}
