import { pgTable, uuid, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core'

export const decks = pgTable('decks', {
  id: uuid('id').primaryKey().defaultRandom(),
  project: text('project').notNull(), // e.g. 'ardia'
  title: text('title').notNull(),
  description: text('description'),
  /** Folder name in tools/decks/library/ */
  slug: text('slug').notNull().unique(),
  slideCount: integer('slide_count').notNull().default(0),
  /** Theme key from tools/decks/engine/themes */
  theme: text('theme').notNull().default('dark'),
  /** Arbitrary metadata */
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
