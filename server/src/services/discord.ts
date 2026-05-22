const isProduction = process.env.NODE_ENV === 'production'
const MKT_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_WHATSAPP_MKT

interface DiscordField {
  name: string
  value: string
  inline?: boolean
}

function truncate(value: string, max = 1000): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

export function sendMarketingWhatsAppReplyAlert(input: {
  contactName: string
  phone: string
  message: string
  projectId: string
  receivedAt: Date
}): void {
  if (!isProduction) return
  if (!MKT_WEBHOOK_URL) return

  const fields: DiscordField[] = [
    { name: 'Proyecto', value: input.projectId, inline: true },
    { name: 'Contacto', value: truncate(input.contactName || 'Desconocido'), inline: true },
    { name: 'Teléfono', value: input.phone, inline: true },
    { name: 'Mensaje', value: truncate(input.message || '[sin texto]') },
    { name: 'Recibido', value: input.receivedAt.toISOString(), inline: true },
  ]

  const payload = {
    embeds: [
      {
        title: 'Nuevo reply en Ardia Marketing',
        color: 0x00ff88,
        fields,
        timestamp: new Date().toISOString(),
      },
    ],
  }

  fetch(MKT_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then(res => {
      if (!res.ok) {
        console.error(`[Discord] Webhook failed for marketing replies: ${res.status} ${res.statusText}`)
      }
    })
    .catch(err => {
      console.error('[Discord] Webhook error for marketing replies:', err)
    })
}
