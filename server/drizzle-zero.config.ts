export default {
  schemaPath: '../db/schema.ts',
  outputPath: './schema.ts',
  zeroImportPath: '@rocicorp/zero',
  permissions: {
    companies: { row: { select: ['true'], insert: ['true'], update: ['true'], delete: ['true'] } },
    crm_companies: { row: { select: ['true'], insert: ['true'], update: ['true'], delete: ['true'] } },
    crm_contacts: { row: { select: ['true'], insert: ['true'], update: ['true'], delete: ['true'] } },
    crm_deal_contacts: { row: { select: ['true'], insert: ['true'], update: ['true'], delete: ['true'] } },
    crm_deals: { row: { select: ['true'], insert: ['true'], update: ['true'], delete: ['true'] } },
    crm_notes: { row: { select: ['true'], insert: ['true'], update: ['true'], delete: ['true'] } },
    decks: { row: { select: ['true'], insert: ['true'], update: ['true'], delete: ['true'] } },
  },
}
