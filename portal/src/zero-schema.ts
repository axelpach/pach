// Zero schema for the portal (client-side).
// Keep in sync with server/schema.ts

import { createSchema, json, number, string, table } from '@rocicorp/zero'

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
    legalName: string().optional().from('legal_name'),
    taxId: string().optional().from('tax_id'),
    taxRegime: string().optional().from('tax_regime'),
    project: string().optional(),
    description: string().optional(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const crmCompanies = table('crm_companies')
  .columns({
    id: string(),
    name: string(),
    website: string().optional(),
    instagram: string().optional(),
    phone: string().optional(),
    city: string().optional(),
    industry: string().optional(),
    size: string().optional(),
    description: string().optional(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const crmContacts = table('crm_contacts')
  .columns({
    id: string(),
    companyId: string().optional().from('company_id'),
    name: string(),
    email: string().optional(),
    phone: string().optional(),
    instagram: string().optional(),
    linkedin: string().optional(),
    role: string().optional(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const crmDealContacts = table('crm_deal_contacts')
  .columns({
    id: string(),
    dealId: string().from('deal_id'),
    contactId: string().from('contact_id'),
    createdAt: number().from('created_at'),
  })
  .primaryKey('id')

const crmDeals = table('crm_deals')
  .columns({
    id: string(),
    companyId: string().optional().from('company_id'),
    title: string(),
    stage: string(),
    value: number().optional(),
    temperature: string().optional(),
    project: string().optional(),
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

const crmBoards = table('crm_boards')
  .columns({
    id: string(),
    name: string(),
    slug: string(),
    entityType: string().from('entity_type'),
    groupBy: string().from('group_by'),
    baseFilter: json<Record<string, string[]>>().from('base_filter'),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const crmBoardColumns = table('crm_board_columns')
  .columns({
    id: string(),
    boardId: string().from('board_id'),
    label: string(),
    position: number(),
    value: string(),
    color: string().optional(),
  })
  .primaryKey('id')

export const schema = createSchema({
  tables: [decks, companies, crmCompanies, crmContacts, crmDealContacts, crmDeals, crmNotes, crmBoards, crmBoardColumns],
})

export type Schema = typeof schema
