import { bigint, boolean, date, index, pgEnum, pgTable, uniqueIndex, uuid, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core'

/* ─────────────────────────── USERS ─────────────────────────── */

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  canAccessUnscoped: boolean('can_access_unscoped').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/* ─────────────────────── ORGANIZATIONS ─────────────────────── */

export const organizations = pgTable('organizations', {
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
  editorialProfile: jsonb('editorial_profile').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const organizationMemberships = pgTable('organization_memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  /** owner for now; future roles can expand from here. */
  role: text('role').notNull().default('owner'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userOrganizationIdx: uniqueIndex('organization_memberships_user_organization_idx').on(table.userId, table.organizationId),
  organizationIdIdx: index('organization_memberships_organization_idx').on(table.organizationId),
  userIdIdx: index('organization_memberships_user_idx').on(table.userId),
}))

export const organizationApiKeys = pgTable('organization_api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  tokenPrefix: text('token_prefix').notNull().unique(),
  tokenHash: text('token_hash').notNull().unique(),
  scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
  status: text('status').notNull().default('active'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdIdx: index('organization_api_keys_organization_idx').on(table.organizationId),
  tokenHashIdx: index('organization_api_keys_token_hash_idx').on(table.tokenHash),
  tokenPrefixIdx: index('organization_api_keys_token_prefix_idx').on(table.tokenPrefix),
  revokedAtIdx: index('organization_api_keys_revoked_at_idx').on(table.revokedAt),
}))

export const activityOriginEnum = pgEnum('activity_origin', ['pach_work', 'organization_work', 'organization_user_work'])

export const activityEvents = pgTable('activity_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  eventType: text('event_type').notNull(),
  activityKind: text('activity_kind').notNull().default('operational'),
  origin: activityOriginEnum('origin').notNull().default('pach_work'),
  subjectType: text('subject_type').notNull(),
  subjectId: text('subject_id'),
  subjectLabel: text('subject_label'),
  actorType: text('actor_type').notNull().default('system'),
  actorId: text('actor_id'),
  actorName: text('actor_name'),
  source: text('source').notNull().default('pach_app'),
  severity: text('severity').notNull().default('info'),
  summary: text('summary').notNull(),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
}, (table) => ({
  organizationOccurredAtIdx: index('activity_events_organization_occurred_at_idx').on(table.organizationId, table.occurredAt),
  organizationActivityKindIdx: index('activity_events_organization_activity_kind_idx').on(table.organizationId, table.activityKind),
  organizationOriginIdx: index('activity_events_organization_origin_idx').on(table.organizationId, table.origin),
  organizationEventTypeIdx: index('activity_events_organization_event_type_idx').on(table.organizationId, table.eventType),
  organizationSubjectTypeIdx: index('activity_events_organization_subject_type_idx').on(table.organizationId, table.subjectType),
  organizationActorNameIdx: index('activity_events_organization_actor_name_idx').on(table.organizationId, table.actorName),
  organizationSourceIdx: index('activity_events_organization_source_idx').on(table.organizationId, table.source),
  organizationSeverityIdx: index('activity_events_organization_severity_idx').on(table.organizationId, table.severity),
}))

export const activityEventSavedViews = pgTable('activity_event_saved_views', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id),
  ownerId: uuid('owner_id').references(() => users.id),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  icon: text('icon'),
  color: text('color'),
  scope: text('scope').notNull().default('personal'),
  filters: jsonb('filters').$type<Record<string, unknown>>().notNull().default({}),
  display: jsonb('display').$type<Record<string, unknown>>().notNull().default({}),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdIdx: index('activity_event_saved_views_organization_idx').on(table.organizationId),
  ownerIdIdx: index('activity_event_saved_views_owner_idx').on(table.ownerId),
  ownerPositionIdx: index('activity_event_saved_views_owner_position_idx').on(table.ownerId, table.position),
}))

export const mcpTokens = pgTable('mcp_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  tokenPrefix: text('token_prefix').notNull().unique(),
  tokenHash: text('token_hash').notNull().unique(),
  ownerUserId: uuid('owner_user_id').references(() => users.id),
  allOrganizations: boolean('all_organizations').notNull().default(false),
  canAccessUnscoped: boolean('can_access_unscoped').notNull().default(false),
  organizationIds: jsonb('organization_ids').$type<string[]>().notNull().default([]),
  capabilities: jsonb('capabilities').$type<string[]>().notNull().default([]),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tokenHashIdx: index('mcp_tokens_token_hash_idx').on(table.tokenHash),
  ownerUserIdIdx: index('mcp_tokens_owner_user_id_idx').on(table.ownerUserId),
  revokedAtIdx: index('mcp_tokens_revoked_at_idx').on(table.revokedAt),
  expiresAtIdx: index('mcp_tokens_expires_at_idx').on(table.expiresAt),
}))

export const githubConnections = pgTable('github_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  /** github for now; leaves room for other git providers later. */
  provider: text('provider').notNull().default('github'),
  providerAccountLogin: text('provider_account_login'),
  ownerUserId: uuid('owner_user_id').references(() => users.id),
  /** fine_grained_pat | classic_pat | github_app */
  credentialKind: text('credential_kind').notNull().default('fine_grained_pat'),
  credentialLabel: text('credential_label'),
  credentialLast4: text('credential_last4'),
  encryptedCredential: text('encrypted_credential').notNull(),
  scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
  /** active | revoked | error */
  status: text('status').notNull().default('active'),
  statusMessage: text('status_message'),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  providerAccountIdx: index('github_connections_provider_account_idx').on(table.provider, table.providerAccountLogin),
  ownerUserIdIdx: index('github_connections_owner_user_idx').on(table.ownerUserId),
  statusIdx: index('github_connections_status_idx').on(table.status),
}))

/* ─────────────────────────── DECKS ─────────────────────────── */

export const decks = pgTable('decks', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id),
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

/* ────────────────────────── DESIGN ────────────────────────── */

export const designSystems = pgTable('design_systems', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  markdown: text('markdown').notNull().default(''),
  tokens: jsonb('tokens').$type<Record<string, unknown>>().notNull().default({}),
  assets: jsonb('assets').$type<Record<string, unknown>>().notNull().default({}),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdIdx: index('design_systems_organization_idx').on(table.organizationId),
  organizationSlugIdx: uniqueIndex('design_systems_organization_slug_idx').on(table.organizationId, table.slug),
}))

export const designTemplates = pgTable('design_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  type: text('type').notNull().default('deck'),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  status: text('status').notNull().default('active'),
  sourceKind: text('source_kind').notNull().default('react'),
  currentVersionId: uuid('current_version_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdIdx: index('design_templates_organization_idx').on(table.organizationId),
  organizationSlugIdx: uniqueIndex('design_templates_organization_slug_idx').on(table.organizationId, table.slug),
}))

export const designTemplateVersions = pgTable('design_template_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  templateId: uuid('template_id').notNull().references(() => designTemplates.id),
  versionNumber: integer('version_number').notNull().default(1),
  schemaVersion: integer('schema_version').notNull().default(1),
  sourceKind: text('source_kind').notNull().default('react'),
  files: jsonb('files').$type<Record<string, string>>().notNull().default({}),
  manifest: jsonb('manifest').$type<Record<string, unknown>>().notNull().default({}),
  dependencies: jsonb('dependencies').$type<Record<string, string>>().notNull().default({}),
  compiledArtifactUrl: text('compiled_artifact_url'),
  previewImageUrl: text('preview_image_url'),
  validationStatus: text('validation_status').notNull().default('draft'),
  validationErrors: jsonb('validation_errors').$type<Array<Record<string, unknown>>>().notNull().default([]),
  createdByRunId: uuid('created_by_run_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdIdx: index('design_template_versions_organization_idx').on(table.organizationId),
  templateIdIdx: index('design_template_versions_template_idx').on(table.templateId),
  templateVersionIdx: uniqueIndex('design_template_versions_template_version_idx').on(table.templateId, table.versionNumber),
}))

export const designAssets = pgTable('design_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  templateId: uuid('template_id').references(() => designTemplates.id),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  storageKey: text('storage_key'),
  url: text('url'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdIdx: index('design_assets_organization_idx').on(table.organizationId),
  templateIdIdx: index('design_assets_template_idx').on(table.templateId),
}))

export const agentRunInputMediaObjects = pgTable('agent_run_input_media_objects', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id),
  kind: text('kind').notNull().default('file'),
  name: text('name').notNull(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull().default('application/octet-stream'),
  sizeBytes: integer('size_bytes'),
  width: integer('width'),
  height: integer('height'),
  storageKey: text('storage_key').notNull(),
  url: text('url'),
  source: text('source').notNull().default('upload'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdIdx: index('agent_run_input_media_objects_organization_idx').on(table.organizationId),
  storageKeyIdx: index('agent_run_input_media_objects_storage_key_idx').on(table.storageKey),
}))

export const designTemplateRuns = pgTable('design_template_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  templateId: uuid('template_id').references(() => designTemplates.id),
  designSystemId: uuid('design_system_id').references(() => designSystems.id),
  agentRunId: uuid('agent_run_id'),
  templateSlug: text('template_slug'),
  prompt: text('prompt').notNull(),
  status: text('status').notNull().default('queued'),
  statusMessage: text('status_message'),
  sourceVersionId: uuid('source_version_id'),
  targetVersionId: uuid('target_version_id'),
  outputSpec: jsonb('output_spec').$type<Record<string, unknown>>().notNull().default({}),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdIdx: index('design_template_runs_organization_idx').on(table.organizationId),
  templateIdIdx: index('design_template_runs_template_idx').on(table.templateId),
  designSystemIdIdx: index('design_template_runs_design_system_idx').on(table.designSystemId),
  agentRunIdIdx: index('design_template_runs_agent_run_idx').on(table.agentRunId),
  templateSlugIdx: index('design_template_runs_template_slug_idx').on(table.templateSlug),
}))

/* ─────────────────────────── CRM ─────────────────────────── */

export const crmCompanies = pgTable('crm_companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id),
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
  organizationId: uuid('organization_id').references(() => organizations.id),
  crmCompanyId: uuid('crm_company_id').references(() => crmCompanies.id),
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
  organizationId: uuid('organization_id').references(() => organizations.id),
  dealId: uuid('deal_id').notNull(),
  contactId: uuid('contact_id').notNull().references(() => crmContacts.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const crmDeals = pgTable('crm_deals', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id),
  crmCompanyId: uuid('crm_company_id').references(() => crmCompanies.id),
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
  organizationId: uuid('organization_id').references(() => organizations.id),
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
  organizationId: uuid('organization_id').references(() => organizations.id),
  boardId: uuid('board_id').notNull().references(() => crmBoards.id),
  label: text('label').notNull(),
  /** Display order */
  position: integer('position').notNull().default(0),
  /** Value of the groupBy field this column represents */
  value: text('value').notNull(),
  /** Optional color for the column header */
  color: text('color'),
})

/* ─────────────────────────── FINANCE ─────────────────────────── */

export const finAccounts = pgTable('fin_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  institutionName: text('institution_name'),
  holderUserId: uuid('holder_user_id').references(() => users.id),
  /** bank_account | credit_card | cash | investment | loan | manual_asset */
  type: text('type').notNull().default('bank_account'),
  currencyCode: text('currency_code').notNull().default('MXN'),
  /** active | archived */
  status: text('status').notNull().default('active'),
  lastBalanceMinor: bigint('last_balance_minor', { mode: 'number' }),
  lastBalanceAt: timestamp('last_balance_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdIdx: index('fin_accounts_organization_idx').on(table.organizationId),
  organizationStatusIdx: index('fin_accounts_organization_status_idx').on(table.organizationId, table.status),
  holderUserIdIdx: index('fin_accounts_holder_user_idx').on(table.holderUserId),
}))

export const finCategories = pgTable('fin_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  parentId: uuid('parent_id'),
  name: text('name').notNull(),
  /** income | expense | transfer | adjustment | mixed */
  type: text('type').notNull().default('expense'),
  color: text('color'),
  icon: text('icon'),
  position: integer('position').notNull().default(0),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdIdx: index('fin_categories_organization_idx').on(table.organizationId),
  organizationNameIdx: uniqueIndex('fin_categories_organization_name_idx').on(table.organizationId, table.name),
}))

export const finImports = pgTable('fin_imports', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  accountId: uuid('account_id').notNull().references(() => finAccounts.id),
  createdByUserId: uuid('created_by_user_id').references(() => users.id),
  batchId: uuid('batch_id'),
  /** uploading | parsing | ready | applied | partially_applied | failed | ignored */
  status: text('status').notNull().default('parsing'),
  /** statement_csv | statement_pdf | screenshot | manual_csv */
  sourceType: text('source_type').notNull().default('statement_csv'),
  fileName: text('file_name').notNull(),
  fileType: text('file_type').notNull(),
  fileSha256: text('file_sha256').notNull(),
  statementStartDate: date('statement_start_date'),
  statementEndDate: date('statement_end_date'),
  detectedCurrencyCode: text('detected_currency_code'),
  detectedInstitution: text('detected_institution'),
  detectedAccountHint: text('detected_account_hint'),
  itemsParsed: integer('items_parsed').notNull().default(0),
  itemsReady: integer('items_ready').notNull().default(0),
  itemsDuplicate: integer('items_duplicate').notNull().default(0),
  itemsNeedingReview: integer('items_needing_review').notNull().default(0),
  errorMessage: text('error_message'),
  rawSummary: jsonb('raw_summary').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  appliedAt: timestamp('applied_at', { withTimezone: true }),
}, (table) => ({
  organizationIdIdx: index('fin_imports_organization_idx').on(table.organizationId),
  accountIdIdx: index('fin_imports_account_idx').on(table.accountId),
  batchIdIdx: index('fin_imports_batch_idx').on(table.batchId),
  fileShaIdx: index('fin_imports_file_sha_idx').on(table.fileSha256),
}))

export const finImportItems = pgTable('fin_import_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  importId: uuid('import_id').notNull().references(() => finImports.id),
  accountId: uuid('account_id').notNull().references(() => finAccounts.id),
  /** parsed | duplicate | needs_review | applied | ignored | failed */
  status: text('status').notNull().default('parsed'),
  transactionDate: date('transaction_date').notNull(),
  transactionTime: text('transaction_time').notNull().default('00:00:00'),
  postedDate: date('posted_date'),
  description: text('description').notNull(),
  merchantName: text('merchant_name'),
  amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
  currencyCode: text('currency_code').notNull(),
  suggestedType: text('suggested_type'),
  suggestedCategoryId: uuid('suggested_category_id').references(() => finCategories.id),
  suggestedConfidence: integer('suggested_confidence'),
  duplicateMovementId: uuid('duplicate_movement_id'),
  fingerprint: text('fingerprint').notNull(),
  rawData: jsonb('raw_data').$type<Record<string, unknown>>().notNull().default({}),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  importIdIdx: index('fin_import_items_import_idx').on(table.importId),
  accountFingerprintIdx: index('fin_import_items_account_fingerprint_idx').on(table.accountId, table.fingerprint),
}))

export const finTransfers = pgTable('fin_transfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  /** suggested | confirmed | rejected */
  status: text('status').notNull().default('suggested'),
  fromAccountId: uuid('from_account_id').references(() => finAccounts.id),
  toAccountId: uuid('to_account_id').references(() => finAccounts.id),
  amountMinor: bigint('amount_minor', { mode: 'number' }),
  currencyCode: text('currency_code'),
  matchedConfidence: integer('matched_confidence'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdIdx: index('fin_transfers_organization_idx').on(table.organizationId),
}))

export const finMovements = pgTable('fin_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  accountId: uuid('account_id').notNull().references(() => finAccounts.id),
  categoryId: uuid('category_id').references(() => finCategories.id),
  transferId: uuid('transfer_id').references(() => finTransfers.id),
  importId: uuid('import_id').references(() => finImports.id),
  sourceItemId: uuid('source_item_id').references(() => finImportItems.id),
  transactionDate: date('transaction_date').notNull(),
  transactionTime: text('transaction_time').notNull().default('00:00:00'),
  postedDate: date('posted_date'),
  description: text('description').notNull(),
  merchantName: text('merchant_name'),
  counterparty: text('counterparty'),
  amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
  currencyCode: text('currency_code').notNull(),
  reportingAmountMinor: bigint('reporting_amount_minor', { mode: 'number' }),
  reportingCurrencyCode: text('reporting_currency_code'),
  fxRate: text('fx_rate'),
  fxRateSource: text('fx_rate_source'),
  /** income | expense | transfer | adjustment */
  type: text('type').notNull().default('expense'),
  /** pending_review | reviewed | ignored */
  status: text('status').notNull().default('pending_review'),
  /** uncategorized | possible_transfer | duplicate | low_confidence | parse_issue */
  reviewReason: text('review_reason'),
  externalId: text('external_id'),
  fingerprint: text('fingerprint').notNull(),
  rawData: jsonb('raw_data').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationDateIdx: index('fin_movements_organization_date_idx').on(table.organizationId, table.transactionDate),
  accountDateIdx: index('fin_movements_account_date_idx').on(table.accountId, table.transactionDate),
  accountFingerprintIdx: uniqueIndex('fin_movements_account_fingerprint_idx').on(table.accountId, table.fingerprint),
  statusIdx: index('fin_movements_status_idx').on(table.status),
}))

export const finCategorizationRules = pgTable('fin_categorization_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  accountId: uuid('account_id').references(() => finAccounts.id),
  categoryId: uuid('category_id').references(() => finCategories.id),
  /** income | expense | transfer | adjustment */
  type: text('type').notNull().default('expense'),
  /** contains | exact | regex | merchant | amount_recurring */
  matchKind: text('match_kind').notNull().default('contains'),
  matchValue: text('match_value').notNull(),
  amountMinor: bigint('amount_minor', { mode: 'number' }),
  currencyCode: text('currency_code'),
  confidence: integer('confidence').notNull().default(90),
  autoApply: boolean('auto_apply').notNull().default(true),
  createdFromMovementId: uuid('created_from_movement_id').references(() => finMovements.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdIdx: index('fin_categorization_rules_organization_idx').on(table.organizationId),
  organizationMatchIdx: index('fin_categorization_rules_match_idx').on(table.organizationId, table.matchKind, table.matchValue),
}))

export const finBalanceSnapshots = pgTable('fin_balance_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  accountId: uuid('account_id').notNull().references(() => finAccounts.id),
  asOfDate: date('as_of_date').notNull(),
  balanceMinor: bigint('balance_minor', { mode: 'number' }).notNull(),
  currencyCode: text('currency_code').notNull(),
  /** manual | statement | calculated | import */
  source: text('source').notNull().default('manual'),
  importId: uuid('import_id').references(() => finImports.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  accountDateIdx: uniqueIndex('fin_balance_snapshots_account_date_idx').on(table.accountId, table.asOfDate, table.source),
  organizationIdIdx: index('fin_balance_snapshots_organization_idx').on(table.organizationId),
}))

/* ─────────────────────────── DOCUMENTS ─────────────────────────── */

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id),
  parentId: uuid('parent_id'),
  ownerId: uuid('owner_id').references(() => users.id),
  publicId: text('public_id'),
  currentSnapshotId: uuid('current_snapshot_id'),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  body: text('body').notNull().default(''),
  /** markdown for now; leaves room for future block/json formats. */
  format: text('format').notNull().default('markdown'),
  /** active | archived */
  status: text('status').notNull().default('active'),
  icon: text('icon'),
  sortOrder: integer('sort_order').notNull().default(0),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationStatusIdx: index('documents_organization_status_idx').on(table.organizationId, table.status),
  parentIdx: index('documents_parent_idx').on(table.parentId),
  ownerIdx: index('documents_owner_idx').on(table.ownerId),
  organizationSlugIdx: uniqueIndex('documents_organization_slug_idx').on(table.organizationId, table.slug),
  organizationPublicIdIdx: uniqueIndex('documents_organization_public_id_idx').on(table.organizationId, table.publicId),
}))

export const documentSnapshots = pgTable('document_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').notNull().references(() => documents.id),
  organizationId: uuid('organization_id').references(() => organizations.id),
  versionNumber: integer('version_number').notNull(),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  body: text('body').notNull().default(''),
  format: text('format').notNull().default('markdown'),
  /** legacy compatibility field; new rows use version */
  status: text('status').notNull().default('version'),
  createdByType: text('created_by_type').notNull().default('user'),
  createdById: uuid('created_by_id').references(() => users.id),
  agentRunId: uuid('agent_run_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  documentVersionIdx: uniqueIndex('document_snapshots_document_version_idx').on(table.documentId, table.versionNumber),
  documentStatusIdx: index('document_snapshots_document_status_idx').on(table.documentId, table.status),
  organizationIdx: index('document_snapshots_organization_idx').on(table.organizationId),
  agentRunIdx: index('document_snapshots_agent_run_idx').on(table.agentRunId),
}))

/* ─────────────────────────── MARKETING ─────────────────────────── */

export const mktSenderProfiles = pgTable('mkt_sender_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  provider: text('provider').notNull().default('resend'),
  name: text('name').notNull(),
  fromName: text('from_name').notNull(),
  fromEmail: text('from_email').notNull(),
  replyToName: text('reply_to_name'),
  replyToEmail: text('reply_to_email'),
  sendingDomain: text('sending_domain'),
  status: text('status').notNull().default('active'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('mkt_sender_profiles_organization_idx').on(table.organizationId),
}))

export const mktPublications = pgTable('mkt_publications', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  defaultSenderProfileId: uuid('default_sender_profile_id').references(() => mktSenderProfiles.id),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  type: text('type').notNull().default('newsletter'),
  audienceDescription: text('audience_description'),
  editorialProfile: jsonb('editorial_profile').$type<Record<string, unknown>>().notNull().default({}),
  status: text('status').notNull().default('active'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('mkt_publications_organization_idx').on(table.organizationId),
  organizationSlugIdx: uniqueIndex('mkt_publications_organization_slug_idx').on(table.organizationId, table.slug),
}))

export const mktCtas = pgTable('mkt_ctas', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  key: text('key').notNull(),
  label: text('label').notNull(),
  url: text('url').notNull(),
  description: text('description'),
  status: text('status').notNull().default('active'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('mkt_ctas_organization_idx').on(table.organizationId),
  organizationKeyIdx: uniqueIndex('mkt_ctas_organization_key_idx').on(table.organizationId, table.key),
}))

export const mktContentItems = pgTable('mkt_content_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  sourceDocumentId: uuid('source_document_id').references(() => documents.id),
  primaryCtaId: uuid('primary_cta_id').references(() => mktCtas.id),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  excerpt: text('excerpt'),
  contentKind: text('content_kind').notNull().default('article'),
  supportedChannels: jsonb('supported_channels').$type<string[]>().notNull().default([]),
  status: text('status').notNull().default('draft'),
  body: text('body').notNull().default(''),
  format: text('format').notNull().default('markdown'),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('mkt_content_items_organization_idx').on(table.organizationId),
  organizationSlugIdx: uniqueIndex('mkt_content_items_organization_slug_idx').on(table.organizationId, table.slug),
  sourceDocumentIdx: index('mkt_content_items_source_document_idx').on(table.sourceDocumentId),
}))

export const mktEditorialIdeas = pgTable('mkt_editorial_ideas', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  publicationId: uuid('publication_id').notNull().references(() => mktPublications.id),
  documentId: uuid('document_id').references(() => documents.id),
  contentItemId: uuid('content_item_id').references(() => mktContentItems.id),
  agentRunId: uuid('agent_run_id'),
  title: text('title').notNull(),
  angle: text('angle'),
  sourceNotes: text('source_notes'),
  dedupeKey: text('dedupe_key').notNull(),
  status: text('status').notNull().default('available'),
  priority: integer('priority').notNull().default(0),
  reservedAt: timestamp('reserved_at', { withTimezone: true }),
  usedAt: timestamp('used_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('mkt_editorial_ideas_organization_idx').on(table.organizationId),
  publicationStatusIdx: index('mkt_editorial_ideas_publication_status_idx').on(table.publicationId, table.status),
  documentIdx: index('mkt_editorial_ideas_document_idx').on(table.documentId),
  contentItemIdx: index('mkt_editorial_ideas_content_item_idx').on(table.contentItemId),
  publicationDedupeIdx: uniqueIndex('mkt_editorial_ideas_publication_dedupe_idx').on(table.publicationId, table.dedupeKey),
}))

export const mktAudienceMembers = pgTable('mkt_audience_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  crmContactId: uuid('crm_contact_id').references(() => crmContacts.id),
  name: text('name'),
  email: text('email'),
  phone: text('phone'),
  whatsappPhone: text('whatsapp_phone'),
  company: text('company'),
  role: text('role'),
  source: text('source'),
  status: text('status').notNull().default('active'),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('mkt_audience_members_organization_idx').on(table.organizationId),
  emailIdx: index('mkt_audience_members_email_idx').on(table.email),
  crmContactIdx: index('mkt_audience_members_crm_contact_idx').on(table.crmContactId),
}))

export const mktAudienceSubscriptions = pgTable('mkt_audience_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  audienceMemberId: uuid('audience_member_id').notNull().references(() => mktAudienceMembers.id),
  publicationId: uuid('publication_id').references(() => mktPublications.id),
  channel: text('channel').notNull().default('newsletter'),
  status: text('status').notNull().default('subscribed'),
  consentSource: text('consent_source'),
  consentedAt: timestamp('consented_at', { withTimezone: true }),
  unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('mkt_audience_subscriptions_organization_idx').on(table.organizationId),
  memberIdx: index('mkt_audience_subscriptions_member_idx').on(table.audienceMemberId),
  publicationIdx: index('mkt_audience_subscriptions_publication_idx').on(table.publicationId),
}))

export const mktSegments = pgTable('mkt_segments', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  kind: text('kind').notNull().default('manual'),
  rules: jsonb('rules').$type<Record<string, unknown>>().notNull().default({}),
  status: text('status').notNull().default('active'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('mkt_segments_organization_idx').on(table.organizationId),
  organizationSlugIdx: uniqueIndex('mkt_segments_organization_slug_idx').on(table.organizationId, table.slug),
}))

export const mktSegmentMembers = pgTable('mkt_segment_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  segmentId: uuid('segment_id').notNull().references(() => mktSegments.id),
  audienceMemberId: uuid('audience_member_id').notNull().references(() => mktAudienceMembers.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  segmentMemberIdx: uniqueIndex('mkt_segment_members_segment_member_idx').on(table.segmentId, table.audienceMemberId),
  organizationIdx: index('mkt_segment_members_organization_idx').on(table.organizationId),
}))

export const mktDistributionRuns = pgTable('mkt_distribution_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  publicationId: uuid('publication_id').references(() => mktPublications.id),
  contentItemId: uuid('content_item_id').references(() => mktContentItems.id),
  segmentId: uuid('segment_id').references(() => mktSegments.id),
  senderProfileId: uuid('sender_profile_id').references(() => mktSenderProfiles.id),
  designTemplateId: uuid('design_template_id').references(() => designTemplates.id),
  designTemplateVersionId: uuid('design_template_version_id').references(() => designTemplateVersions.id),
  channel: text('channel').notNull(),
  distributionType: text('distribution_type').notNull().default('broadcast'),
  name: text('name').notNull(),
  subject: text('subject'),
  preheader: text('preheader'),
  status: text('status').notNull().default('draft'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  scheduledTimezone: text('scheduled_timezone').notNull().default('America/Mexico_City'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  provider: text('provider'),
  providerCampaignId: text('provider_campaign_id'),
  recipientFilter: jsonb('recipient_filter').$type<Record<string, unknown>>().notNull().default({}),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  error: text('error'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('mkt_distribution_runs_organization_idx').on(table.organizationId),
  publicationIdx: index('mkt_distribution_runs_publication_idx').on(table.publicationId),
  contentItemIdx: index('mkt_distribution_runs_content_item_idx').on(table.contentItemId),
  channelStatusIdx: index('mkt_distribution_runs_channel_status_idx').on(table.channel, table.status),
}))

export const mktPublicationSlots = pgTable('mkt_publication_slots', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  publicationId: uuid('publication_id').notNull().references(() => mktPublications.id),
  ideaId: uuid('idea_id').references(() => mktEditorialIdeas.id),
  documentId: uuid('document_id').references(() => documents.id),
  contentItemId: uuid('content_item_id').references(() => mktContentItems.id),
  distributionRunId: uuid('distribution_run_id').references(() => mktDistributionRuns.id),
  agentRunId: uuid('agent_run_id'),
  slotKey: text('slot_key').notNull(),
  status: text('status').notNull().default('planned'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  scheduledTimezone: text('scheduled_timezone').notNull().default('America/Mexico_City'),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  error: text('error'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('mkt_publication_slots_organization_idx').on(table.organizationId),
  publicationScheduledIdx: index('mkt_publication_slots_publication_scheduled_idx').on(table.publicationId, table.scheduledAt),
  publicationStatusIdx: index('mkt_publication_slots_publication_status_idx').on(table.publicationId, table.status),
  ideaIdx: index('mkt_publication_slots_idea_idx').on(table.ideaId),
  documentIdx: index('mkt_publication_slots_document_idx').on(table.documentId),
  contentItemIdx: index('mkt_publication_slots_content_item_idx').on(table.contentItemId),
  distributionRunIdx: index('mkt_publication_slots_distribution_run_idx').on(table.distributionRunId),
  publicationSlotKeyIdx: uniqueIndex('mkt_publication_slots_publication_slot_key_idx').on(table.publicationId, table.slotKey),
}))

export const mktContentEvents = pgTable('mkt_content_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  contentItemId: uuid('content_item_id').references(() => mktContentItems.id),
  distributionRunId: uuid('distribution_run_id').references(() => mktDistributionRuns.id, { onDelete: 'cascade' }),
  audienceMemberId: uuid('audience_member_id').references(() => mktAudienceMembers.id),
  ctaId: uuid('cta_id').references(() => mktCtas.id),
  eventType: text('event_type').notNull(),
  channel: text('channel'),
  source: text('source'),
  url: text('url'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('mkt_content_events_organization_idx').on(table.organizationId),
  contentItemIdx: index('mkt_content_events_content_item_idx').on(table.contentItemId),
  distributionRunIdx: index('mkt_content_events_distribution_run_idx').on(table.distributionRunId),
  eventTypeIdx: index('mkt_content_events_type_idx').on(table.eventType),
}))

export const mktPublicationConsumers = pgTable('mkt_publication_consumers', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  publicationId: uuid('publication_id').references(() => mktPublications.id),
  /** blog | email | rss | public_api | podcast */
  kind: text('kind').notNull().default('blog'),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  baseUrl: text('base_url'),
  status: text('status').notNull().default('active'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('mkt_publication_consumers_organization_idx').on(table.organizationId),
  publicationIdx: index('mkt_publication_consumers_publication_idx').on(table.publicationId),
  publicationSlugIdx: uniqueIndex('mkt_publication_consumers_publication_slug_idx').on(table.publicationId, table.slug),
}))

export const mktContentOutputs = pgTable('mkt_content_outputs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  contentItemId: uuid('content_item_id').notNull().references(() => mktContentItems.id),
  consumerId: uuid('consumer_id').references(() => mktPublicationConsumers.id),
  distributionRunId: uuid('distribution_run_id').references(() => mktDistributionRuns.id),
  /** blog | email | rss | public_api | podcast */
  channel: text('channel').notNull().default('blog'),
  publicUrl: text('public_url'),
  canonicalUrl: text('canonical_url'),
  /** draft | scheduled | publishing | published | failed | archived */
  status: text('status').notNull().default('draft'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('mkt_content_outputs_organization_idx').on(table.organizationId),
  contentItemIdx: index('mkt_content_outputs_content_item_idx').on(table.contentItemId),
  consumerIdx: index('mkt_content_outputs_consumer_idx').on(table.consumerId),
  distributionRunIdx: index('mkt_content_outputs_distribution_run_idx').on(table.distributionRunId),
  channelStatusIdx: index('mkt_content_outputs_channel_status_idx').on(table.channel, table.status),
}))

export const mktPromotablePages = pgTable('mkt_promotable_pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  contentItemId: uuid('content_item_id').references(() => mktContentItems.id),
  contentOutputId: uuid('content_output_id').references(() => mktContentOutputs.id),
  /** manual | sitemap | content_output */
  source: text('source').notNull().default('manual'),
  title: text('title').notNull().default(''),
  url: text('url').notNull(),
  canonicalUrl: text('canonical_url'),
  sourceUrl: text('source_url'),
  /** imported | enriched | ready | promoted | paused | archived */
  status: text('status').notNull().default('imported'),
  sitemapUrl: text('sitemap_url'),
  sitemapLastmod: timestamp('sitemap_lastmod', { withTimezone: true }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('mkt_promotable_pages_organization_idx').on(table.organizationId),
  contentItemIdx: index('mkt_promotable_pages_content_item_idx').on(table.contentItemId),
  contentOutputIdx: index('mkt_promotable_pages_content_output_idx').on(table.contentOutputId),
  sourceStatusIdx: index('mkt_promotable_pages_source_status_idx').on(table.source, table.status),
  organizationUrlIdx: uniqueIndex('mkt_promotable_pages_organization_url_idx').on(table.organizationId, table.url),
}))

/* ─────────────────────── SOCIAL PUBLISHING ─────────────────────── */

export const socialProviderApps = pgTable('social_provider_apps', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  createdByUserId: uuid('created_by_user_id').references(() => users.id),
  /** linkedin | instagram | x | facebook */
  provider: text('provider').notNull().default('linkedin'),
  /** organization_publishing | member_sharing */
  purpose: text('purpose').notNull().default('organization_publishing'),
  name: text('name').notNull(),
  clientId: text('client_id').notNull(),
  encryptedClientSecret: text('encrypted_client_secret'),
  clientSecretLast4: text('client_secret_last4'),
  redirectUri: text('redirect_uri').notNull(),
  scopesRequested: jsonb('scopes_requested').$type<string[]>().notNull().default([]),
  status: text('status').notNull().default('pending_approval'),
  statusMessage: text('status_message'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('social_provider_apps_organization_idx').on(table.organizationId),
  providerPurposeIdx: index('social_provider_apps_provider_purpose_idx').on(table.provider, table.purpose),
  statusIdx: index('social_provider_apps_status_idx').on(table.status),
}))

export const socialConnections = pgTable('social_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  providerAppId: uuid('provider_app_id').references(() => socialProviderApps.id),
  connectedByUserId: uuid('connected_by_user_id').references(() => users.id),
  /** linkedin | instagram | x | facebook */
  provider: text('provider').notNull().default('linkedin'),
  providerAccountId: text('provider_account_id'),
  providerAccountName: text('provider_account_name'),
  providerAccountUrl: text('provider_account_url'),
  scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
  credentialKind: text('credential_kind').notNull().default('oauth2'),
  encryptedAccessToken: text('encrypted_access_token'),
  encryptedRefreshToken: text('encrypted_refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  status: text('status').notNull().default('active'),
  statusMessage: text('status_message'),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('social_connections_organization_idx').on(table.organizationId),
  providerAppIdx: index('social_connections_provider_app_idx').on(table.providerAppId),
  providerAccountIdx: index('social_connections_provider_account_idx').on(table.provider, table.providerAccountId),
  statusIdx: index('social_connections_status_idx').on(table.status),
}))

export const socialChannels = pgTable('social_channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  /** linkedin | instagram | x | facebook */
  provider: text('provider').notNull().default('linkedin'),
  /** organization | member | page | account */
  kind: text('kind').notNull().default('organization'),
  externalId: text('external_id').notNull(),
  displayName: text('display_name').notNull(),
  handle: text('handle'),
  url: text('url'),
  status: text('status').notNull().default('active'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('social_channels_organization_idx').on(table.organizationId),
  providerExternalIdx: uniqueIndex('social_channels_provider_external_idx').on(table.provider, table.externalId),
  organizationProviderIdx: index('social_channels_organization_provider_idx').on(table.organizationId, table.provider),
}))

export const socialChannelConnections = pgTable('social_channel_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  channelId: uuid('channel_id').notNull().references(() => socialChannels.id),
  connectionId: uuid('connection_id').notNull().references(() => socialConnections.id),
  capabilities: jsonb('capabilities').$type<string[]>().notNull().default([]),
  status: text('status').notNull().default('active'),
  statusMessage: text('status_message'),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  channelConnectionIdx: uniqueIndex('social_channel_connections_channel_connection_idx').on(table.channelId, table.connectionId),
  organizationIdx: index('social_channel_connections_organization_idx').on(table.organizationId),
  channelIdx: index('social_channel_connections_channel_idx').on(table.channelId),
  connectionIdx: index('social_channel_connections_connection_idx').on(table.connectionId),
}))

export const socialPosts = pgTable('social_posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  contentItemId: uuid('content_item_id').references(() => mktContentItems.id),
  contentOutputId: uuid('content_output_id').references(() => mktContentOutputs.id),
  title: text('title'),
  caption: text('caption').notNull().default(''),
  linkUrl: text('link_url'),
  thumbnailUrl: text('thumbnail_url'),
  /** draft | approved | scheduled | published | archived */
  status: text('status').notNull().default('draft'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('social_posts_organization_idx').on(table.organizationId),
  contentItemIdx: index('social_posts_content_item_idx').on(table.contentItemId),
  contentOutputIdx: index('social_posts_content_output_idx').on(table.contentOutputId),
  statusIdx: index('social_posts_status_idx').on(table.status),
}))

export const socialPostTargets = pgTable('social_post_targets', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  socialPostId: uuid('social_post_id').notNull().references(() => socialPosts.id),
  channelId: uuid('channel_id').notNull().references(() => socialChannels.id),
  connectionId: uuid('connection_id').references(() => socialConnections.id),
  /** draft | scheduled | publishing | published | failed | blocked_waiting_for_output | canceled */
  status: text('status').notNull().default('draft'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  scheduledTimezone: text('scheduled_timezone').notNull().default('America/Mexico_City'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  providerPostId: text('provider_post_id'),
  providerPostUrl: text('provider_post_url'),
  error: text('error'),
  attemptCount: integer('attempt_count').notNull().default(0),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('social_post_targets_organization_idx').on(table.organizationId),
  postIdx: index('social_post_targets_post_idx').on(table.socialPostId),
  channelIdx: index('social_post_targets_channel_idx').on(table.channelId),
  connectionIdx: index('social_post_targets_connection_idx').on(table.connectionId),
  statusScheduledIdx: index('social_post_targets_status_scheduled_idx').on(table.status, table.scheduledAt),
}))

/* ─────────────────────── PAID MARKETING ─────────────────────── */

export const mktAdPromotions = pgTable('mkt_ad_promotions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  promotablePageId: uuid('promotable_page_id').references(() => mktPromotablePages.id),
  contentItemId: uuid('content_item_id').references(() => mktContentItems.id),
  contentOutputId: uuid('content_output_id').references(() => mktContentOutputs.id),
  socialPostId: uuid('social_post_id').references(() => socialPosts.id),
  socialPostTargetId: uuid('social_post_target_id').references(() => socialPostTargets.id),
  /** linkedin | meta | google */
  provider: text('provider').notNull().default('linkedin'),
  adAccountExternalId: text('ad_account_external_id'),
  campaignGroupExternalId: text('campaign_group_external_id'),
  campaignExternalId: text('campaign_external_id'),
  creativeExternalId: text('creative_external_id'),
  landingUrl: text('landing_url'),
  objective: text('objective').notNull().default('website_visits'),
  /** draft | ready | scheduled | active | paused | completed | failed | archived */
  status: text('status').notNull().default('draft'),
  budgetMinor: integer('budget_minor'),
  currencyCode: text('currency_code').notNull().default('MXN'),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  targeting: jsonb('targeting').$type<Record<string, unknown>>().notNull().default({}),
  creative: jsonb('creative').$type<Record<string, unknown>>().notNull().default({}),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('mkt_ad_promotions_organization_idx').on(table.organizationId),
  promotablePageIdx: index('mkt_ad_promotions_promotable_page_idx').on(table.promotablePageId),
  contentItemIdx: index('mkt_ad_promotions_content_item_idx').on(table.contentItemId),
  contentOutputIdx: index('mkt_ad_promotions_content_output_idx').on(table.contentOutputId),
  socialPostIdx: index('mkt_ad_promotions_social_post_idx').on(table.socialPostId),
  providerAccountIdx: index('mkt_ad_promotions_provider_account_idx').on(table.provider, table.adAccountExternalId),
  statusIdx: index('mkt_ad_promotions_status_idx').on(table.status),
}))

export const mktAdMetricSnapshots = pgTable('mkt_ad_metric_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  promotionId: uuid('promotion_id').references(() => mktAdPromotions.id),
  provider: text('provider').notNull().default('linkedin'),
  entityKind: text('entity_kind').notNull().default('promotion'),
  entityExternalId: text('entity_external_id'),
  adAccountExternalId: text('ad_account_external_id'),
  campaignGroupExternalId: text('campaign_group_external_id'),
  campaignExternalId: text('campaign_external_id'),
  creativeExternalId: text('creative_external_id'),
  granularity: text('granularity').notNull().default('daily'),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  impressions: integer('impressions').notNull().default(0),
  clicks: integer('clicks').notNull().default(0),
  reactions: integer('reactions').notNull().default(0),
  comments: integer('comments').notNull().default(0),
  shares: integer('shares').notNull().default(0),
  follows: integer('follows').notNull().default(0),
  leads: integer('leads').notNull().default(0),
  conversions: integer('conversions').notNull().default(0),
  spendMinor: integer('spend_minor').notNull().default(0),
  currencyCode: text('currency_code').notNull().default('MXN'),
  rawMetrics: jsonb('raw_metrics').$type<Record<string, unknown>>().notNull().default({}),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('mkt_ad_metric_snapshots_organization_idx').on(table.organizationId),
  promotionIdx: index('mkt_ad_metric_snapshots_promotion_idx').on(table.promotionId),
  entityIdx: index('mkt_ad_metric_snapshots_entity_idx').on(table.provider, table.entityKind, table.entityExternalId),
  periodIdx: index('mkt_ad_metric_snapshots_period_idx').on(table.periodStart, table.periodEnd),
}))

/* ─────────────────────── SEARCH CONSOLE ─────────────────────── */

export const googleConnections = pgTable('google_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  connectedByUserId: uuid('connected_by_user_id').references(() => users.id),
  providerAccountId: text('provider_account_id'),
  providerAccountEmail: text('provider_account_email'),
  providerAccountName: text('provider_account_name'),
  scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
  credentialKind: text('credential_kind').notNull().default('oauth2'),
  encryptedAccessToken: text('encrypted_access_token'),
  encryptedRefreshToken: text('encrypted_refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  status: text('status').notNull().default('active'),
  statusMessage: text('status_message'),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('google_connections_organization_idx').on(table.organizationId),
  providerAccountIdx: index('google_connections_provider_account_idx').on(table.providerAccountEmail),
  statusIdx: index('google_connections_status_idx').on(table.status),
}))

export const searchConsoleProperties = pgTable('search_console_properties', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  connectionId: uuid('connection_id').references(() => googleConnections.id),
  siteUrl: text('site_url').notNull(),
  displayName: text('display_name').notNull(),
  permissionLevel: text('permission_level'),
  selected: boolean('selected').notNull().default(false),
  status: text('status').notNull().default('active'),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('search_console_properties_organization_idx').on(table.organizationId),
  connectionIdx: index('search_console_properties_connection_idx').on(table.connectionId),
  organizationSiteIdx: uniqueIndex('search_console_properties_organization_site_idx').on(table.organizationId, table.siteUrl),
  selectedIdx: index('search_console_properties_selected_idx').on(table.organizationId, table.selected),
}))

export const searchConsoleSitemaps = pgTable('search_console_sitemaps', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  propertyId: uuid('property_id').notNull().references(() => searchConsoleProperties.id),
  siteUrl: text('site_url').notNull(),
  sitemapUrl: text('sitemap_url').notNull(),
  status: text('status').notNull().default('submitted'),
  lastSubmittedAt: timestamp('last_submitted_at', { withTimezone: true }),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  error: text('error'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('search_console_sitemaps_organization_idx').on(table.organizationId),
  propertyIdx: index('search_console_sitemaps_property_idx').on(table.propertyId),
  propertySitemapIdx: uniqueIndex('search_console_sitemaps_property_sitemap_idx').on(table.propertyId, table.sitemapUrl),
}))

export const searchConsoleMetricSnapshots = pgTable('search_console_metric_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  propertyId: uuid('property_id').notNull().references(() => searchConsoleProperties.id),
  contentItemId: uuid('content_item_id').references(() => mktContentItems.id),
  contentOutputId: uuid('content_output_id').references(() => mktContentOutputs.id),
  dataDate: date('data_date').notNull(),
  searchType: text('search_type').notNull().default('web'),
  page: text('page'),
  query: text('query'),
  country: text('country'),
  device: text('device'),
  clicks: integer('clicks').notNull().default(0),
  impressions: integer('impressions').notNull().default(0),
  ctr: text('ctr'),
  position: text('position'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('search_console_metric_snapshots_organization_idx').on(table.organizationId),
  propertyDateIdx: index('search_console_metric_snapshots_property_date_idx').on(table.propertyId, table.dataDate),
  pageIdx: index('search_console_metric_snapshots_page_idx').on(table.page),
  queryIdx: index('search_console_metric_snapshots_query_idx').on(table.query),
  contentItemIdx: index('search_console_metric_snapshots_content_item_idx').on(table.contentItemId),
  uniqueMetricIdx: uniqueIndex('search_console_metric_snapshots_unique_idx').on(
    table.propertyId,
    table.dataDate,
    table.searchType,
    table.page,
    table.query,
    table.country,
    table.device,
  ),
}))

export const searchConsoleDailySnapshots = pgTable('search_console_daily_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  propertyId: uuid('property_id').notNull().references(() => searchConsoleProperties.id),
  dataDate: date('data_date').notNull(),
  searchType: text('search_type').notNull().default('web'),
  clicks: integer('clicks').notNull().default(0),
  impressions: integer('impressions').notNull().default(0),
  ctr: text('ctr'),
  position: text('position'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('search_console_daily_snapshots_organization_idx').on(table.organizationId),
  propertyDateIdx: index('search_console_daily_snapshots_property_date_idx').on(table.propertyId, table.dataDate),
  uniqueDailySnapshotIdx: uniqueIndex('search_console_daily_snapshots_unique_idx').on(
    table.propertyId,
    table.dataDate,
    table.searchType,
  ),
}))

export const searchConsoleUrlInspections = pgTable('search_console_url_inspections', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  propertyId: uuid('property_id').notNull().references(() => searchConsoleProperties.id),
  contentItemId: uuid('content_item_id').references(() => mktContentItems.id),
  contentOutputId: uuid('content_output_id').references(() => mktContentOutputs.id),
  inspectionUrl: text('inspection_url').notNull(),
  verdict: text('verdict'),
  coverageState: text('coverage_state'),
  indexingState: text('indexing_state'),
  robotsTxtState: text('robots_txt_state'),
  lastCrawlTime: timestamp('last_crawl_time', { withTimezone: true }),
  inspectedAt: timestamp('inspected_at', { withTimezone: true }).notNull().defaultNow(),
  rawResult: jsonb('raw_result').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('search_console_url_inspections_organization_idx').on(table.organizationId),
  propertyIdx: index('search_console_url_inspections_property_idx').on(table.propertyId),
  inspectionUrlIdx: index('search_console_url_inspections_url_idx').on(table.inspectionUrl),
  propertyUrlIdx: uniqueIndex('search_console_url_inspections_property_url_idx').on(table.propertyId, table.inspectionUrl),
}))

/* ─────────────────────── PROJECT MANAGEMENT ─────────────────────── */

export const pmTeams = pgTable('pm_teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Optional legacy link if a team is explicitly tied to one company context. */
  companyId: uuid('company_id').references(() => organizations.id),
  /** Short issue prefix, e.g. PAC or PRD */
  key: text('key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color'),
  icon: text('icon'),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const pmProjects = pgTable('pm_projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Optional legacy link if a project is explicitly tied to one company context. */
  companyId: uuid('company_id').references(() => organizations.id),
  teamId: uuid('team_id').references(() => pmTeams.id),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  color: text('color'),
  icon: text('icon'),
  /** active | completed | archived */
  status: text('status').notNull().default('active'),
  targetDate: timestamp('target_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const pmStatuses = pgTable('pm_statuses', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Optional legacy link if a status workflow is explicitly tied to one company context. */
  companyId: uuid('company_id').references(() => organizations.id),
  /** Null means a workspace-global status shared across all teams/projects. */
  teamId: uuid('team_id').references(() => pmTeams.id),
  name: text('name').notNull(),
  /** Stable programmatic key, e.g. todo, in_progress, blocked */
  key: text('key').notNull(),
  /** backlog | unstarted | started | review | blocked | completed | canceled */
  type: text('type').notNull().default('unstarted'),
  description: text('description'),
  color: text('color'),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const pmLabels = pgTable('pm_labels', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Optional legacy link if a label is explicitly tied to one company context. */
  companyId: uuid('company_id').references(() => organizations.id),
  teamId: uuid('team_id').references(() => pmTeams.id),
  name: text('name').notNull(),
  color: text('color'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const pmIssues = pgTable('pm_issues', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Optional issue context, e.g. Ardia or another tracked company. */
  contextCompanyId: uuid('context_company_id').references(() => organizations.id),
  teamId: uuid('team_id').notNull().references(() => pmTeams.id),
  projectId: uuid('project_id').references(() => pmProjects.id),
  statusId: uuid('status_id').notNull().references(() => pmStatuses.id),
  assigneeId: uuid('assignee_id').references(() => users.id),
  creatorId: uuid('creator_id').references(() => users.id),
  /** Human-readable issue id, e.g. PAC-11 */
  identifier: text('identifier').notNull(),
  /** Sequential issue number within a team */
  number: integer('number').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  /** 0 none | 1 urgent | 2 high | 3 medium | 4 low */
  priority: integer('priority').notNull().default(0),
  /** Allowed values in the app: 2 | 4 | 8 | 16 */
  estimate: integer('estimate'),
  sortOrder: integer('sort_order').notNull().default(0),
  dueDate: timestamp('due_date', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  blockedReason: text('blocked_reason'),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const pmIssueLabels = pgTable('pm_issue_labels', {
  id: uuid('id').primaryKey().defaultRandom(),
  issueId: uuid('issue_id').notNull().references(() => pmIssues.id),
  labelId: uuid('label_id').notNull().references(() => pmLabels.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const pmIssueActivity = pgTable('pm_issue_activity', {
  id: uuid('id').primaryKey().defaultRandom(),
  issueId: uuid('issue_id').notNull().references(() => pmIssues.id),
  actorId: uuid('actor_id').references(() => users.id),
  actorName: text('actor_name'),
  /** created | updated | status_changed | assigned | commented | imported */
  type: text('type').notNull(),
  summary: text('summary').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const pmSavedViews = pgTable('pm_saved_views', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Optional legacy link if a saved view is explicitly tied to one company context. */
  companyId: uuid('company_id').references(() => organizations.id),
  teamId: uuid('team_id').references(() => pmTeams.id),
  ownerId: uuid('owner_id').references(() => users.id),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  icon: text('icon'),
  color: text('color'),
  /** personal | team | company */
  scope: text('scope').notNull().default('personal'),
  filters: jsonb('filters').$type<Record<string, unknown>>().notNull().default({}),
  display: jsonb('display').$type<Record<string, unknown>>().notNull().default({}),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type TaskTriggerSchedule = {
  kind: 'once' | 'recurring'
  frequency?: 'weekly' | 'monthly' | 'quarterly'
  /** 0 = Sunday, 1 = Monday, etc. */
  dayOfWeek?: number
  /** 1-31; values past the end of a month clamp to that month's final day. */
  dayOfMonth?: number
  /** HH:mm in the trigger timezone. */
  time?: string
}

export const pmTaskTriggers = pgTable('pm_task_triggers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  /** once | recurring */
  kind: text('kind').notNull().default('recurring'),
  /** weekly | monthly | quarterly; null for one-off dated triggers. */
  frequency: text('frequency'),
  timezone: text('timezone').notNull().default('America/Mexico_City'),
  schedule: jsonb('schedule').$type<TaskTriggerSchedule>().notNull().default({ kind: 'recurring', frequency: 'monthly', dayOfMonth: 1, time: '09:00' }),
  enabled: boolean('enabled').notNull().default(true),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull(),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  companyId: uuid('company_id').references(() => organizations.id),
  teamId: uuid('team_id').notNull().references(() => pmTeams.id),
  projectId: uuid('project_id').references(() => pmProjects.id),
  statusId: uuid('status_id').notNull().references(() => pmStatuses.id),
  assigneeId: uuid('assignee_id').references(() => users.id),
  creatorId: uuid('creator_id').references(() => users.id),
  title: text('title').notNull(),
  description: text('description'),
  priority: integer('priority').notNull().default(2),
  estimate: integer('estimate'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  nextRunAtIdx: index('pm_task_triggers_next_run_at_idx').on(table.nextRunAt),
  enabledNextRunAtIdx: index('pm_task_triggers_enabled_next_run_at_idx').on(table.enabled, table.nextRunAt),
}))

export const pmTaskTriggerRuns = pgTable('pm_task_trigger_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  triggerId: uuid('trigger_id').notNull().references(() => pmTaskTriggers.id),
  issueId: uuid('issue_id').references(() => pmIssues.id),
  periodKey: text('period_key').notNull(),
  /** created | skipped | failed */
  status: text('status').notNull().default('created'),
  message: text('message'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  triggerPeriodIdx: uniqueIndex('pm_task_trigger_runs_trigger_period_idx').on(table.triggerId, table.periodKey),
  triggerIdIdx: index('pm_task_trigger_runs_trigger_id_idx').on(table.triggerId),
}))

/* ─────────────────────── AGENT WORKERS ─────────────────────── */

export const agentWorkers = pgTable('agent_workers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  /** hetzner | local | manual */
  provider: text('provider').notNull().default('hetzner'),
  providerServerId: text('provider_server_id'),
  hostname: text('hostname'),
  sshHost: text('ssh_host').notNull(),
  sshPort: integer('ssh_port').notNull().default(22),
  sshUser: text('ssh_user').notNull().default('pach'),
  /** idle | reserved | bootstrapping | running | needs_human | pr_ready | cleanup | offline */
  status: text('status').notNull().default('idle'),
  statusMessage: text('status_message'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const githubRepositories = pgTable('github_repositories', {
  id: uuid('id').primaryKey().defaultRandom(),
  connectionId: uuid('connection_id').references(() => githubConnections.id),
  githubId: text('github_id'),
  nodeId: text('node_id'),
  projectKey: text('project_key').notNull(),
  owner: text('owner').notNull(),
  name: text('name').notNull(),
  fullName: text('full_name').notNull().unique(),
  defaultBranch: text('default_branch').notNull().default('main'),
  htmlUrl: text('html_url'),
  isPrivate: boolean('private').notNull().default(false),
  permissions: jsonb('permissions').$type<Record<string, unknown>>().notNull().default({}),
  localPathTemplate: text('local_path_template'),
  active: boolean('active').notNull().default(true),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  connectionIdIdx: index('github_repositories_connection_idx').on(table.connectionId),
  githubIdIdx: index('github_repositories_github_id_idx').on(table.githubId),
  activeIdx: index('github_repositories_active_idx').on(table.active),
}))

export const organizationRepositories = pgTable('organization_repositories', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  repositoryId: uuid('repository_id').notNull().references(() => githubRepositories.id),
  /** primary | engineering | marketing | docs | automation */
  role: text('role').notNull().default('primary'),
  isDefault: boolean('is_default').notNull().default(false),
  active: boolean('active').notNull().default(true),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationRepositoryIdx: uniqueIndex('organization_repositories_organization_repository_idx').on(table.organizationId, table.repositoryId),
  organizationIdIdx: index('organization_repositories_organization_idx').on(table.organizationId),
  repositoryIdIdx: index('organization_repositories_repository_idx').on(table.repositoryId),
}))

export const agentConversations = pgTable('agent_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  issueId: uuid('issue_id').references(() => pmIssues.id),
  title: text('title').notNull(),
  status: text('status').notNull().default('open'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => agentConversations.id),
  parentRunId: uuid('parent_run_id'),
  issueId: uuid('issue_id').references(() => pmIssues.id),
  subjectType: text('subject_type').notNull().default('issue'),
  subjectId: uuid('subject_id'),
  workerId: uuid('worker_id').references(() => agentWorkers.id),
  repositoryId: uuid('repository_id').references(() => githubRepositories.id),
  projectKey: text('project_key').notNull(),
  repoFullName: text('repo_full_name').notNull(),
  baseBranch: text('base_branch').notNull().default('main'),
  branchName: text('branch_name').notNull(),
  workspacePath: text('workspace_path'),
  tmuxSession: text('tmux_session'),
  /** codex | claude | manual */
  agentKind: text('agent_kind').notNull().default('codex'),
  /** queued | reserved | bootstrapping | running | needs_human | pr_ready | completed | failed | canceled */
  status: text('status').notNull().default('queued'),
  statusMessage: text('status_message'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const agentMessages = pgTable('agent_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => agentConversations.id),
  runId: uuid('run_id').references(() => agentRuns.id),
  role: text('role').notNull(),
  body: text('body').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const agentRunInputMedia = pgTable('agent_run_input_media', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => agentRuns.id),
  mediaObjectId: uuid('media_object_id').notNull().references(() => agentRunInputMediaObjects.id),
  messageId: uuid('message_id').references(() => agentMessages.id),
  issueId: uuid('issue_id').references(() => pmIssues.id),
  subjectType: text('subject_type'),
  subjectId: uuid('subject_id'),
  role: text('role').notNull().default('input'),
  caption: text('caption'),
  sortOrder: integer('sort_order').notNull().default(0),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  runIdIdx: index('agent_run_input_media_run_idx').on(table.runId),
  mediaObjectIdIdx: index('agent_run_input_media_media_object_idx').on(table.mediaObjectId),
  issueIdIdx: index('agent_run_input_media_issue_idx').on(table.issueId),
  subjectIdx: index('agent_run_input_media_subject_idx').on(table.subjectType, table.subjectId),
}))

export const agentTerminals = pgTable('agent_terminals', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => agentRuns.id),
  name: text('name').notNull(),
  /** agent | app | server | zero | shell | custom */
  role: text('role').notNull().default('custom'),
  tmuxWindow: text('tmux_window').notNull(),
  status: text('status').notNull().default('planned'),
  sortOrder: integer('sort_order').notNull().default(0),
  lastTitle: text('last_title'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const agentRunProgressReports = pgTable('agent_run_progress_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => agentRuns.id),
  issueId: uuid('issue_id').references(() => pmIssues.id),
  workerId: uuid('worker_id').references(() => agentWorkers.id),
  phase: text('phase'),
  level: text('level').notNull().default('info'),
  message: text('message').notNull(),
  percent: integer('percent'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const agentRunArtifacts = pgTable('agent_run_artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => agentRuns.id),
  issueId: uuid('issue_id').references(() => pmIssues.id),
  /** screenshot | video | trace | log | report | file */
  kind: text('kind').notNull().default('file'),
  name: text('name').notNull(),
  url: text('url'),
  storageKey: text('storage_key'),
  remotePath: text('remote_path'),
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const githubBranches = pgTable('github_branches', {
  id: uuid('id').primaryKey().defaultRandom(),
  repositoryId: uuid('repository_id').notNull().references(() => githubRepositories.id),
  agentRunId: uuid('agent_run_id').references(() => agentRuns.id),
  issueId: uuid('issue_id').references(() => pmIssues.id),
  name: text('name').notNull(),
  baseBranch: text('base_branch').notNull().default('main'),
  /** planned | created | pushed | pr_opened | merged | abandoned */
  status: text('status').notNull().default('planned'),
  lastCommitSha: text('last_commit_sha'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const githubPullRequests = pgTable('github_pull_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  repositoryId: uuid('repository_id').notNull().references(() => githubRepositories.id),
  branchId: uuid('branch_id').references(() => githubBranches.id),
  agentRunId: uuid('agent_run_id').references(() => agentRuns.id),
  issueId: uuid('issue_id').references(() => pmIssues.id),
  githubId: text('github_id'),
  number: integer('number').notNull(),
  url: text('url').notNull(),
  title: text('title').notNull(),
  /** open | closed | merged */
  state: text('state').notNull().default('open'),
  isDraft: boolean('is_draft').notNull().default(true),
  mergeable: boolean('mergeable'),
  headSha: text('head_sha'),
  baseBranch: text('base_branch').notNull().default('main'),
  checksStatus: text('checks_status').notNull().default('unknown'),
  checksUrl: text('checks_url'),
  githubCreatedAt: timestamp('github_created_at', { withTimezone: true }),
  githubUpdatedAt: timestamp('github_updated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const githubWebhookEvents = pgTable('github_webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  deliveryId: text('delivery_id').notNull().unique(),
  eventType: text('event_type').notNull(),
  action: text('action'),
  repositoryFullName: text('repository_full_name'),
  githubObjectId: text('github_object_id'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/* ─────────────────────── WHATSAPP ─────────────────────── */

export const whatsappTemplates = pgTable('whatsapp_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('company_id').notNull().references(() => organizations.id),
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
  organizationId: uuid('company_id').notNull().references(() => organizations.id),
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
  organizationId: uuid('company_id').notNull().references(() => organizations.id),
  /** Null for manual one-off sends */
  campaignId: uuid('campaign_id').references(() => whatsappCampaigns.id),
  contactId: uuid('contact_id').references(() => crmContacts.id),
  phone: text('phone').notNull(),
  /** 'outbound' (we sent it) or 'inbound' (contact sent it to us) */
  direction: text('direction').notNull().default('outbound'),
  /** For inbound text replies: the message body. For outbound: null (template was rendered). */
  body: text('body'),
  /** Display name pulled from the inbound message's "profile" field; null for outbound */
  inboundProfileName: text('inbound_profile_name'),
  /** Null for inbound messages (no template); set for outbound template sends */
  templateName: text('template_name'),
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
  organizationId: uuid('organization_id').references(() => organizations.id),
  dealId: uuid('deal_id').references(() => crmDeals.id),
  contactId: uuid('contact_id').references(() => crmContacts.id),
  body: text('body').notNull(),
  /** 'manual' | 'call' | 'email' | 'whatsapp' */
  type: text('type').notNull().default('manual'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
