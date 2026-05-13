import { WhatsAppClient } from '@kapso/whatsapp-cloud-api'
import { projects, type WhatsAppConfig } from '../../../../pach.config.js'

export interface ResolvedWhatsApp {
  client: WhatsAppClient
  phoneNumberId: string
  wabaId: string
  defaultLanguageCode: string
}

const cache = new Map<string, ResolvedWhatsApp>()

export function getWhatsApp(projectId: string): ResolvedWhatsApp {
  const cached = cache.get(projectId)
  if (cached) return cached

  const project = projects[projectId]
  if (!project) throw new Error(`Unknown project: ${projectId}`)

  const wa: WhatsAppConfig | undefined = project.whatsapp
  if (!wa) throw new Error(`Project ${projectId} has no whatsapp config`)

  const apiKey = process.env[wa.kapsoApiKeyEnv]
  const phoneNumberId = process.env[wa.phoneNumberIdEnv]
  const wabaId = process.env[wa.wabaIdEnv]

  if (!apiKey) throw new Error(`${wa.kapsoApiKeyEnv} is not set`)
  if (!phoneNumberId) throw new Error(`${wa.phoneNumberIdEnv} is not set`)
  if (!wabaId) throw new Error(`${wa.wabaIdEnv} is not set`)

  const resolved: ResolvedWhatsApp = {
    client: new WhatsAppClient({
      baseUrl: 'https://api.kapso.ai/meta/whatsapp',
      kapsoApiKey: apiKey,
    }),
    phoneNumberId,
    wabaId,
    defaultLanguageCode: wa.defaultLanguageCode,
  }
  cache.set(projectId, resolved)
  return resolved
}
