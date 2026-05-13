export interface WhatsAppConfig {
  /** Env var name holding the Kapso API key for this project's WABA */
  kapsoApiKeyEnv: string
  /** Env var name holding the WhatsApp Phone Number ID for this project's WABA */
  phoneNumberIdEnv: string
  /** Env var name holding the WhatsApp Business Account ID (for template sync) */
  wabaIdEnv: string
  /** Default language code for templates (e.g. 'es_MX') */
  defaultLanguageCode: string
}

export interface ProjectConfig {
  /** Absolute local path to the project's source code */
  local: string
  /** GitHub repo (org/repo) for cloud mode */
  github?: string
  /** Branch to track */
  branch?: string
  /** Pach-specific context directory (relative to pach root) */
  contextDir: string
  /** Tools this project uses */
  tools: string[]
  /**
   * WhatsApp config. Template definitions + sync are owned by the project's
   * own repo (e.g. ardia). Pach only sends — it does not create or clean up
   * templates on the WABA.
   */
  whatsapp?: WhatsAppConfig
}

export const projects: Record<string, ProjectConfig> = {
  ardia: {
    local: '~/Desktop/Developer/ardia',
    github: 'axelpach/ardia', // update with your actual repo
    branch: 'main',
    contextDir: './projects/ardia',
    tools: ['decks', 'crm'],
    whatsapp: {
      kapsoApiKeyEnv: 'ARDIA_KAPSO_API_KEY',
      phoneNumberIdEnv: 'ARDIA_WHATSAPP_PHONE_NUMBER_ID',
      wabaIdEnv: 'ARDIA_WHATSAPP_BUSINESS_ACCOUNT_ID',
      defaultLanguageCode: 'es_MX',
    },
  },
}

export const config = {
  databaseUrl: process.env.DATABASE_URL || 'postgres://pach:pach@localhost:5435/pach',
  portal: {
    port: 5174,
  },
} as const
