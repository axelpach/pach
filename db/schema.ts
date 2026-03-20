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

/* ─────────────────────────── CRM ─────────────────────────── */

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  website: text('website'),
  industry: text('industry'),
  /** '1-10' | '11-50' | '51-200' | '200+' */
  size: text('size'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  linkedin: text('linkedin'),
  role: text('role'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const deals = pgTable('deals', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id),
  /** Primary contact for this deal */
  contactId: uuid('contact_id').references(() => contacts.id),
  title: text('title').notNull(),
  /**
   * prospecto | contactado | propuesta | negociacion |
   * cerrado_ganado | cerrado_perdido
   */
  stage: text('stage').notNull().default('prospecto'),
  /** Value in MXN */
  value: integer('value'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const crmNotes = pgTable('crm_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  dealId: uuid('deal_id').references(() => deals.id),
  contactId: uuid('contact_id').references(() => contacts.id),
  body: text('body').notNull(),
  /** 'manual' | 'call' | 'email' | 'whatsapp' */
  type: text('type').notNull().default('manual'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
