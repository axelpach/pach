// Zero schema for server-side push processing.
// Keep in sync with portal/src/zero-schema.ts
// Generated via: pnpm --filter server zero:generate

import { createSchema, definePermissions, number, string, table } from '@rocicorp/zero'

const decks = table('decks')
  .columns({
    id: string(),
    project: string(),
    title: string(),
    description: string().optional(),
    slug: string(),
    slideCount: number().from('slide_count'),
    theme: string(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const companies = table('companies')
  .columns({
    id: string(),
    name: string(),
    website: string().optional(),
    industry: string().optional(),
    size: string().optional(),
    description: string().optional(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const contacts = table('contacts')
  .columns({
    id: string(),
    companyId: string().optional().from('company_id'),
    name: string(),
    email: string().optional(),
    phone: string().optional(),
    linkedin: string().optional(),
    role: string().optional(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const deals = table('deals')
  .columns({
    id: string(),
    companyId: string().optional().from('company_id'),
    contactId: string().optional().from('contact_id'),
    title: string(),
    stage: string(),
    value: number().optional(),
    description: string().optional(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const crmNotes = table('crm_notes')
  .columns({
    id: string(),
    dealId: string().optional().from('deal_id'),
    contactId: string().optional().from('contact_id'),
    body: string(),
    type: string(),
    createdAt: number().from('created_at'),
  })
  .primaryKey('id')

export const schema = createSchema({
  tables: [decks, companies, contacts, deals, crmNotes],
})

export type Schema = typeof schema

export const permissions = definePermissions<{}, Schema>(schema, () => {
  return {}
})
