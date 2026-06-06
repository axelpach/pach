import { boolean, index, pgTable, uniqueIndex, uuid, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
/* ─────────────────────────── USERS ─────────────────────────── */
export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    name: text('name'),
    canAccessUnscoped: boolean('can_access_unscoped').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
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
}));
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
    metadata: jsonb('metadata').$type(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
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
});
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
});
export const crmDealContacts = pgTable('crm_deal_contacts', {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id),
    dealId: uuid('deal_id').notNull(),
    contactId: uuid('contact_id').notNull().references(() => crmContacts.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
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
});
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
    baseFilter: jsonb('base_filter').$type().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
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
});
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
});
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
});
export const pmStatuses = pgTable('pm_statuses', {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Optional legacy link if a status workflow is explicitly tied to one company context. */
    companyId: uuid('company_id').references(() => organizations.id),
    /** Null means a workspace-global status shared across all teams/projects. */
    teamId: uuid('team_id').references(() => pmTeams.id),
    name: text('name').notNull(),
    /** Stable programmatic key, e.g. todo, in_progress, blocked */
    key: text('key').notNull(),
    /** backlog | unstarted | started | blocked | completed | canceled */
    type: text('type').notNull().default('unstarted'),
    description: text('description'),
    color: text('color'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
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
});
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
});
export const pmIssueLabels = pgTable('pm_issue_labels', {
    id: uuid('id').primaryKey().defaultRandom(),
    issueId: uuid('issue_id').notNull().references(() => pmIssues.id),
    labelId: uuid('label_id').notNull().references(() => pmLabels.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const pmIssueActivity = pgTable('pm_issue_activity', {
    id: uuid('id').primaryKey().defaultRandom(),
    issueId: uuid('issue_id').notNull().references(() => pmIssues.id),
    actorId: uuid('actor_id').references(() => users.id),
    actorName: text('actor_name'),
    /** created | updated | status_changed | assigned | commented | imported */
    type: text('type').notNull(),
    summary: text('summary').notNull(),
    metadata: jsonb('metadata').$type(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
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
    filters: jsonb('filters').$type().notNull().default({}),
    display: jsonb('display').$type().notNull().default({}),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const pmTaskTriggers = pgTable('pm_task_triggers', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** once | recurring */
    kind: text('kind').notNull().default('recurring'),
    /** weekly | monthly | quarterly; null for one-off dated triggers. */
    frequency: text('frequency'),
    timezone: text('timezone').notNull().default('America/Mexico_City'),
    schedule: jsonb('schedule').$type().notNull().default({ kind: 'recurring', frequency: 'monthly', dayOfMonth: 1, time: '09:00' }),
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
    metadata: jsonb('metadata').$type().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    nextRunAtIdx: index('pm_task_triggers_next_run_at_idx').on(table.nextRunAt),
    enabledNextRunAtIdx: index('pm_task_triggers_enabled_next_run_at_idx').on(table.enabled, table.nextRunAt),
}));
export const pmTaskTriggerRuns = pgTable('pm_task_trigger_runs', {
    id: uuid('id').primaryKey().defaultRandom(),
    triggerId: uuid('trigger_id').notNull().references(() => pmTaskTriggers.id),
    issueId: uuid('issue_id').references(() => pmIssues.id),
    periodKey: text('period_key').notNull(),
    /** created | skipped | failed */
    status: text('status').notNull().default('created'),
    message: text('message'),
    metadata: jsonb('metadata').$type().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    triggerPeriodIdx: uniqueIndex('pm_task_trigger_runs_trigger_period_idx').on(table.triggerId, table.periodKey),
    triggerIdIdx: index('pm_task_trigger_runs_trigger_id_idx').on(table.triggerId),
}));
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
    metadata: jsonb('metadata').$type().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const githubRepositories = pgTable('github_repositories', {
    id: uuid('id').primaryKey().defaultRandom(),
    projectKey: text('project_key').notNull(),
    owner: text('owner').notNull(),
    name: text('name').notNull(),
    fullName: text('full_name').notNull().unique(),
    defaultBranch: text('default_branch').notNull().default('main'),
    localPathTemplate: text('local_path_template'),
    active: boolean('active').notNull().default(true),
    metadata: jsonb('metadata').$type().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const agentRuns = pgTable('agent_runs', {
    id: uuid('id').primaryKey().defaultRandom(),
    issueId: uuid('issue_id').notNull().references(() => pmIssues.id),
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
    metadata: jsonb('metadata').$type().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
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
    metadata: jsonb('metadata').$type().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
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
    metadata: jsonb('metadata').$type().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
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
});
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
});
export const githubWebhookEvents = pgTable('github_webhook_events', {
    id: uuid('id').primaryKey().defaultRandom(),
    deliveryId: text('delivery_id').notNull().unique(),
    eventType: text('event_type').notNull(),
    action: text('action'),
    repositoryFullName: text('repository_full_name'),
    githubObjectId: text('github_object_id'),
    payload: jsonb('payload').$type().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
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
    components: jsonb('components').$type(),
    /** Extracted variables, e.g. ['{{1}}','{{2}}'] */
    variables: jsonb('variables').$type().notNull().default([]),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const whatsappCampaigns = pgTable('whatsapp_campaigns', {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('company_id').notNull().references(() => organizations.id),
    templateId: uuid('template_id').notNull().references(() => whatsappTemplates.id),
    name: text('name').notNull(),
    /** draft | sending | sent | failed */
    status: text('status').notNull().default('draft'),
    /** Recipient selection: { contactIds: [...] } or { filter: {...} } */
    recipientFilter: jsonb('recipient_filter').$type().notNull().default({}),
    /** Per-variable values used to render the template at send time */
    variableValues: jsonb('variable_values').$type().notNull().default({}),
    /** Meta media id for the header video/image, set after upload */
    mediaId: text('media_id'),
    firedAt: timestamp('fired_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
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
});
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
});
