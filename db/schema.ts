import { pgTable, uuid, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core'

/* ─────────────────────────── DECKS ─────────────────────────── */

export const decks = pgTable('decks', {
  id: uuid('id').primaryKey().defaultRandom(),
  project: text('project').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  slug: text('slug').notNull().unique(),
  slideCount: integer('slide_count').notNull().default(0),
  theme: text('theme').notNull().default('dark'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/* ─────────────────────── PACHI COMPANIES ─────────────────────── */

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  /** Razón social */
  legalName: text('legal_name'),
  /** RFC */
  taxId: text('tax_id'),
  /** Régimen fiscal */
  taxRegime: text('tax_regime'),
  /** Link to project key in pach.config.ts */
  project: text('project'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/* ─────────────────────────── CRM ─────────────────────────── */

export const crmCompanies = pgTable('crm_companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  website: text('website'),
  instagram: text('instagram'),
  phone: text('phone'),
  city: text('city'),
  industry: text('industry'),
  /** '1-10' | '11-50' | '51-200' | '200+' */
  size: text('size'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const crmContacts = pgTable('crm_contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => crmCompanies.id),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  instagram: text('instagram'),
  linkedin: text('linkedin'),
  role: text('role'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const crmDealContacts = pgTable('crm_deal_contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  dealId: uuid('deal_id').notNull(),
  contactId: uuid('contact_id').notNull().references(() => crmContacts.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const crmDeals = pgTable('crm_deals', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => crmCompanies.id),
  title: text('title').notNull(),
  /**
   * prospecto | contactado | propuesta | negociacion |
   * cerrado_ganado | cerrado_perdido
   */
  stage: text('stage').notNull().default('prospecto'),
  /** Value in MXN */
  value: integer('value'),
  /** hot | warm | cold | ghosted */
  temperature: text('temperature'),
  /** Project this deal is associated with */
  project: text('project'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/* ─────────────────────────── BOARDS ─────────────────────────── */

export const crmBoards = pgTable('crm_boards', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  /** 'deals' | 'contacts' */
  entityType: text('entity_type').notNull().default('deals'),
  /** Which field on the entity drives the column grouping */
  groupBy: text('group_by').notNull(),
  /** JSONB filter: { field: [allowed_values] } or {} for all */
  baseFilter: jsonb('base_filter').$type<Record<string, string[]>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const crmBoardColumns = pgTable('crm_board_columns', {
  id: uuid('id').primaryKey().defaultRandom(),
  boardId: uuid('board_id').notNull().references(() => crmBoards.id),
  label: text('label').notNull(),
  /** Display order */
  position: integer('position').notNull().default(0),
  /** Value of the groupBy field this column represents */
  value: text('value').notNull(),
  /** Optional color for the column header */
  color: text('color'),
})

/* ─────────────────────── WHATSAPP ─────────────────────── */

export const whatsappTemplates = pgTable('whatsapp_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  /** Meta's template id */
  metaId: text('meta_id').notNull(),
  name: text('name').notNull(),
  language: text('language').notNull(),
  /** APPROVED | PENDING | REJECTED | PAUSED | DISABLED */
  status: text('status').notNull(),
  /** MARKETING | UTILITY | AUTHENTICATION */
  category: text('category').notNull(),
  /** TEXT | IMAGE | VIDEO | DOCUMENT | LOCATION | NONE */
  headerFormat: text('header_format'),
  headerText: text('header_text'),
  /** URL of sample media submitted at template creation (for preview) */
  headerSampleUrl: text('header_sample_url'),
  bodyText: text('body_text'),
  footerText: text('footer_text'),
  /** Full template components payload from Meta (header/body/footer/buttons) */
  components: jsonb('components').$type<unknown[]>(),
  /** Extracted variables, e.g. ['{{1}}','{{2}}'] */
  variables: jsonb('variables').$type<string[]>().notNull().default([]),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const whatsappCampaigns = pgTable('whatsapp_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  templateId: uuid('template_id').notNull().references(() => whatsappTemplates.id),
  name: text('name').notNull(),
  /** draft | sending | sent | failed */
  status: text('status').notNull().default('draft'),
  /** Recipient selection: { contactIds: [...] } or { filter: {...} } */
  recipientFilter: jsonb('recipient_filter').$type<Record<string, unknown>>().notNull().default({}),
  /** Per-variable values used to render the template at send time */
  variableValues: jsonb('variable_values').$type<Record<string, string>>().notNull().default({}),
  /** Meta media id for the header video/image, set after upload */
  mediaId: text('media_id'),
  firedAt: timestamp('fired_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const whatsappMessages = pgTable('whatsapp_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  /** Null for manual one-off sends */
  campaignId: uuid('campaign_id').references(() => whatsappCampaigns.id),
  contactId: uuid('contact_id').references(() => crmContacts.id),
  phone: text('phone').notNull(),
  templateName: text('template_name').notNull(),
  /** queued | sent | delivered | read | failed */
  status: text('status').notNull().default('queued'),
  /** Meta's message id, returned after a successful send */
  metaMessageId: text('meta_message_id'),
  error: text('error'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/* ─────────────────────────── NOTES ─────────────────────────── */

export const crmNotes = pgTable('crm_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  dealId: uuid('deal_id').references(() => crmDeals.id),
  contactId: uuid('contact_id').references(() => crmContacts.id),
  body: text('body').notNull(),
  /** 'manual' | 'call' | 'email' | 'whatsapp' */
  type: text('type').notNull().default('manual'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
