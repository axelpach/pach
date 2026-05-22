// Zero schema for server-side push processing.
// Keep in sync with portal/src/zero-schema.ts
// Generated via: pnpm --filter server zero:generate

import { createSchema, definePermissions, json, number, string, table, ANYONE_CAN, NOBODY_CAN, type ExpressionBuilder, type PermissionsConfig } from '@rocicorp/zero'

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

const users = table('users')
  .columns({
    id: string(),
    email: string(),
    name: string().optional(),
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

const pmTeams = table('pm_teams')
  .columns({
    id: string(),
    companyId: string().optional().from('company_id'),
    key: string(),
    name: string(),
    description: string().optional(),
    color: string().optional(),
    icon: string().optional(),
    position: number(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const pmProjects = table('pm_projects')
  .columns({
    id: string(),
    companyId: string().optional().from('company_id'),
    teamId: string().optional().from('team_id'),
    name: string(),
    slug: string(),
    description: string().optional(),
    color: string().optional(),
    icon: string().optional(),
    status: string(),
    targetDate: number().optional().from('target_date'),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const pmStatuses = table('pm_statuses')
  .columns({
    id: string(),
    companyId: string().optional().from('company_id'),
    teamId: string().optional().from('team_id'),
    name: string(),
    key: string(),
    type: string(),
    description: string().optional(),
    color: string().optional(),
    position: number(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const pmLabels = table('pm_labels')
  .columns({
    id: string(),
    companyId: string().optional().from('company_id'),
    teamId: string().optional().from('team_id'),
    name: string(),
    color: string().optional(),
    description: string().optional(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const pmIssues = table('pm_issues')
  .columns({
    id: string(),
    contextCompanyId: string().optional().from('context_company_id'),
    teamId: string().from('team_id'),
    projectId: string().optional().from('project_id'),
    statusId: string().from('status_id'),
    assigneeId: string().optional().from('assignee_id'),
    creatorId: string().optional().from('creator_id'),
    identifier: string(),
    number: number(),
    title: string(),
    description: string().optional(),
    priority: number(),
    estimate: number().optional(),
    sortOrder: number().from('sort_order'),
    dueDate: number().optional().from('due_date'),
    startedAt: number().optional().from('started_at'),
    completedAt: number().optional().from('completed_at'),
    canceledAt: number().optional().from('canceled_at'),
    blockedReason: string().optional().from('blocked_reason'),
    lastActivityAt: number().from('last_activity_at'),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const pmIssueLabels = table('pm_issue_labels')
  .columns({
    id: string(),
    issueId: string().from('issue_id'),
    labelId: string().from('label_id'),
    createdAt: number().from('created_at'),
  })
  .primaryKey('id')

const pmIssueActivity = table('pm_issue_activity')
  .columns({
    id: string(),
    issueId: string().from('issue_id'),
    actorId: string().optional().from('actor_id'),
    actorName: string().optional().from('actor_name'),
    type: string(),
    summary: string(),
    metadata: json<Record<string, unknown>>().optional(),
    createdAt: number().from('created_at'),
  })
  .primaryKey('id')

const pmSavedViews = table('pm_saved_views')
  .columns({
    id: string(),
    companyId: string().optional().from('company_id'),
    teamId: string().optional().from('team_id'),
    ownerId: string().optional().from('owner_id'),
    name: string(),
    slug: string(),
    icon: string().optional(),
    color: string().optional(),
    scope: string(),
    filters: json<Record<string, unknown>>(),
    display: json<Record<string, unknown>>(),
    position: number(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const whatsappTemplates = table('whatsapp_templates')
  .columns({
    id: string(),
    companyId: string().from('company_id'),
    metaId: string().from('meta_id'),
    name: string(),
    language: string(),
    status: string(),
    category: string(),
    headerFormat: string().optional().from('header_format'),
    headerText: string().optional().from('header_text'),
    headerSampleUrl: string().optional().from('header_sample_url'),
    bodyText: string().optional().from('body_text'),
    footerText: string().optional().from('footer_text'),
    components: json<unknown[]>().optional(),
    variables: json<string[]>(),
    lastSyncedAt: number().from('last_synced_at'),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const whatsappCampaigns = table('whatsapp_campaigns')
  .columns({
    id: string(),
    companyId: string().from('company_id'),
    templateId: string().from('template_id'),
    name: string(),
    status: string(),
    recipientFilter: json<Record<string, unknown>>().from('recipient_filter'),
    variableValues: json<Record<string, string>>().from('variable_values'),
    mediaId: string().optional().from('media_id'),
    firedAt: number().optional().from('fired_at'),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const whatsappMessages = table('whatsapp_messages')
  .columns({
    id: string(),
    companyId: string().from('company_id'),
    campaignId: string().optional().from('campaign_id'),
    contactId: string().optional().from('contact_id'),
    phone: string(),
    direction: string(),
    body: string().optional(),
    inboundProfileName: string().optional().from('inbound_profile_name'),
    templateName: string().optional().from('template_name'),
    status: string(),
    metaMessageId: string().optional().from('meta_message_id'),
    error: string().optional(),
    sentAt: number().optional().from('sent_at'),
    deliveredAt: number().optional().from('delivered_at'),
    readAt: number().optional().from('read_at'),
    createdAt: number().from('created_at'),
  })
  .primaryKey('id')

export const schema = createSchema({
  tables: [
    decks,
    users,
    companies,
    crmCompanies,
    crmContacts,
    crmDealContacts,
    crmDeals,
    crmNotes,
    crmBoards,
    crmBoardColumns,
    pmTeams,
    pmProjects,
    pmStatuses,
    pmLabels,
    pmIssues,
    pmIssueLabels,
    pmIssueActivity,
    pmSavedViews,
    whatsappTemplates,
    whatsappCampaigns,
    whatsappMessages,
  ],
})

export type Schema = typeof schema

/**
 * JWT payload shape (issued by server/src/lib/auth.ts).
 * Zero verifies the JWT signature against ZERO_AUTH_SECRET and exposes
 * the payload as AuthData in permission rules.
 */
type AuthData = {
  sub: string
  email: string
  name: string | null
}

const allowIfAuthenticated = (
  authData: AuthData,
  { cmpLit }: ExpressionBuilder<Schema, keyof Schema['tables']>,
) => cmpLit(authData.sub, 'IS NOT', null)

const AUTHENTICATED_CAN_DO_ANYTHING = {
  row: {
    select: [allowIfAuthenticated],
    insert: [allowIfAuthenticated],
    update: { preMutation: [allowIfAuthenticated], postMutation: [allowIfAuthenticated] },
    delete: [allowIfAuthenticated],
  },
} as const

export const permissions = definePermissions<AuthData, Schema>(schema, () => {
  return {
    decks: AUTHENTICATED_CAN_DO_ANYTHING,
    users: AUTHENTICATED_CAN_DO_ANYTHING,
    companies: AUTHENTICATED_CAN_DO_ANYTHING,
    crm_companies: AUTHENTICATED_CAN_DO_ANYTHING,
    crm_contacts: AUTHENTICATED_CAN_DO_ANYTHING,
    crm_deal_contacts: AUTHENTICATED_CAN_DO_ANYTHING,
    crm_deals: AUTHENTICATED_CAN_DO_ANYTHING,
    crm_notes: AUTHENTICATED_CAN_DO_ANYTHING,
    crm_boards: AUTHENTICATED_CAN_DO_ANYTHING,
    crm_board_columns: AUTHENTICATED_CAN_DO_ANYTHING,
    pm_teams: AUTHENTICATED_CAN_DO_ANYTHING,
    pm_projects: AUTHENTICATED_CAN_DO_ANYTHING,
    pm_statuses: AUTHENTICATED_CAN_DO_ANYTHING,
    pm_labels: AUTHENTICATED_CAN_DO_ANYTHING,
    pm_issues: AUTHENTICATED_CAN_DO_ANYTHING,
    pm_issue_labels: AUTHENTICATED_CAN_DO_ANYTHING,
    pm_issue_activity: AUTHENTICATED_CAN_DO_ANYTHING,
    pm_saved_views: AUTHENTICATED_CAN_DO_ANYTHING,
    whatsapp_templates: AUTHENTICATED_CAN_DO_ANYTHING,
    whatsapp_campaigns: AUTHENTICATED_CAN_DO_ANYTHING,
    whatsapp_messages: AUTHENTICATED_CAN_DO_ANYTHING,
  } satisfies PermissionsConfig<AuthData, Schema>
})
