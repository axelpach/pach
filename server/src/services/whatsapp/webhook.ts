import { eq } from 'drizzle-orm'
import { getDb } from '../../db.js'
import { whatsappMessages, whatsappTemplates } from '../../../../db/schema.js'

interface StatusEntry {
  id: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp?: string
  errors?: Array<{ title?: string; message?: string }>
}

interface TemplateStatusUpdate {
  event: string
  message_template_id?: string
  message_template_name?: string
  reason?: string
}

interface WebhookEntry {
  id?: string
  changes?: Array<{
    field?: string
    value?: {
      statuses?: StatusEntry[]
      messages?: unknown[]
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

export async function handleWebhook(payload: WebhookPayload): Promise<void> {
  const db = getDb()

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      if (!value) continue

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
