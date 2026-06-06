// Zero schema for server-side push processing.
// Keep in sync with portal/src/zero-schema.ts
// Generated via: pnpm --filter server zero:generate
import { boolean, createSchema, definePermissions, json, number, string, table, NOBODY_CAN } from '@rocicorp/zero';
const decks = table('decks')
    .columns({
    id: string(),
    organizationId: string().optional().from('organization_id'),
    project: string(),
    title: string(),
    description: string().optional(),
    slug: string(),
    slideCount: number().from('slide_count'),
    theme: string(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
})
    .primaryKey('id');
const users = table('users')
    .columns({
    id: string(),
    email: string(),
    name: string().optional(),
    canAccessUnscoped: boolean().from('can_access_unscoped'),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
})
    .primaryKey('id');
const organizations = table('organizations')
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
    .primaryKey('id');
const organizationMemberships = table('organization_memberships')
    .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    userId: string().from('user_id'),
    role: string(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
})
    .primaryKey('id');
const crmCompanies = table('crm_companies')
    .columns({
    id: string(),
    organizationId: string().optional().from('organization_id'),
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
    .primaryKey('id');
const crmContacts = table('crm_contacts')
    .columns({
    id: string(),
    organizationId: string().optional().from('organization_id'),
    crmCompanyId: string().optional().from('crm_company_id'),
    name: string(),
    email: string().optional(),
    phone: string().optional(),
    instagram: string().optional(),
    linkedin: string().optional(),
    role: string().optional(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
})
    .primaryKey('id');
const crmDealContacts = table('crm_deal_contacts')
    .columns({
    id: string(),
    organizationId: string().optional().from('organization_id'),
    dealId: string().from('deal_id'),
    contactId: string().from('contact_id'),
    createdAt: number().from('created_at'),
})
    .primaryKey('id');
const crmDeals = table('crm_deals')
    .columns({
    id: string(),
    organizationId: string().optional().from('organization_id'),
    crmCompanyId: string().optional().from('crm_company_id'),
    title: string(),
    stage: string(),
    value: number().optional(),
    temperature: string().optional(),
    project: string().optional(),
    description: string().optional(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
})
    .primaryKey('id');
const crmNotes = table('crm_notes')
    .columns({
    id: string(),
    organizationId: string().optional().from('organization_id'),
    dealId: string().optional().from('deal_id'),
    contactId: string().optional().from('contact_id'),
    body: string(),
    type: string(),
    createdAt: number().from('created_at'),
})
    .primaryKey('id');
const crmBoards = table('crm_boards')
    .columns({
    id: string(),
    organizationId: string().optional().from('organization_id'),
    name: string(),
    slug: string(),
    entityType: string().from('entity_type'),
    groupBy: string().from('group_by'),
    baseFilter: json().from('base_filter'),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
})
    .primaryKey('id');
const crmBoardColumns = table('crm_board_columns')
    .columns({
    id: string(),
    organizationId: string().optional().from('organization_id'),
    boardId: string().from('board_id'),
    label: string(),
    position: number(),
    value: string(),
    color: string().optional(),
})
    .primaryKey('id');
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
    .primaryKey('id');
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
    .primaryKey('id');
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
    .primaryKey('id');
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
    .primaryKey('id');
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
    .primaryKey('id');
const pmIssueLabels = table('pm_issue_labels')
    .columns({
    id: string(),
    issueId: string().from('issue_id'),
    labelId: string().from('label_id'),
    createdAt: number().from('created_at'),
})
    .primaryKey('id');
const pmIssueActivity = table('pm_issue_activity')
    .columns({
    id: string(),
    issueId: string().from('issue_id'),
    actorId: string().optional().from('actor_id'),
    actorName: string().optional().from('actor_name'),
    type: string(),
    summary: string(),
    metadata: json().optional(),
    createdAt: number().from('created_at'),
})
    .primaryKey('id');
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
    filters: json(),
    display: json(),
    position: number(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
})
    .primaryKey('id');
const pmTaskTriggers = table('pm_task_triggers')
    .columns({
    id: string(),
    name: string(),
    kind: string(),
    frequency: string().optional(),
    timezone: string(),
    schedule: json(),
    enabled: boolean(),
    nextRunAt: number().from('next_run_at'),
    lastRunAt: number().optional().from('last_run_at'),
    companyId: string().optional().from('company_id'),
    teamId: string().from('team_id'),
    projectId: string().optional().from('project_id'),
    statusId: string().from('status_id'),
    assigneeId: string().optional().from('assignee_id'),
    creatorId: string().optional().from('creator_id'),
    title: string(),
    description: string().optional(),
    priority: number(),
    estimate: number().optional(),
    metadata: json(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
})
    .primaryKey('id');
const pmTaskTriggerRuns = table('pm_task_trigger_runs')
    .columns({
    id: string(),
    triggerId: string().from('trigger_id'),
    issueId: string().optional().from('issue_id'),
    periodKey: string().from('period_key'),
    status: string(),
    message: string().optional(),
    metadata: json(),
    createdAt: number().from('created_at'),
})
    .primaryKey('id');
const agentWorkers = table('agent_workers')
    .columns({
    id: string(),
    name: string(),
    provider: string(),
    providerServerId: string().optional().from('provider_server_id'),
    hostname: string().optional(),
    sshHost: string().from('ssh_host'),
    sshPort: number().from('ssh_port'),
    sshUser: string().from('ssh_user'),
    status: string(),
    statusMessage: string().optional().from('status_message'),
    lastSeenAt: number().optional().from('last_seen_at'),
    metadata: json(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
})
    .primaryKey('id');
const githubRepositories = table('github_repositories')
    .columns({
    id: string(),
    projectKey: string().from('project_key'),
    owner: string(),
    name: string(),
    fullName: string().from('full_name'),
    defaultBranch: string().from('default_branch'),
    localPathTemplate: string().optional().from('local_path_template'),
    active: boolean(),
    metadata: json(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
})
    .primaryKey('id');
const agentRuns = table('agent_runs')
    .columns({
    id: string(),
    issueId: string().from('issue_id'),
    workerId: string().optional().from('worker_id'),
    repositoryId: string().optional().from('repository_id'),
    projectKey: string().from('project_key'),
    repoFullName: string().from('repo_full_name'),
    baseBranch: string().from('base_branch'),
    branchName: string().from('branch_name'),
    workspacePath: string().optional().from('workspace_path'),
    tmuxSession: string().optional().from('tmux_session'),
    agentKind: string().from('agent_kind'),
    status: string(),
    statusMessage: string().optional().from('status_message'),
    startedAt: number().optional().from('started_at'),
    completedAt: number().optional().from('completed_at'),
    metadata: json(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
})
    .primaryKey('id');
const agentTerminals = table('agent_terminals')
    .columns({
    id: string(),
    runId: string().from('run_id'),
    name: string(),
    role: string(),
    tmuxWindow: string().from('tmux_window'),
    status: string(),
    sortOrder: number().from('sort_order'),
    lastTitle: string().optional().from('last_title'),
    metadata: json(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
})
    .primaryKey('id');
const agentRunArtifacts = table('agent_run_artifacts')
    .columns({
    id: string(),
    runId: string().from('run_id'),
    issueId: string().optional().from('issue_id'),
    kind: string(),
    name: string(),
    url: string().optional(),
    storageKey: string().optional().from('storage_key'),
    remotePath: string().optional().from('remote_path'),
    mimeType: string().optional().from('mime_type'),
    sizeBytes: number().optional().from('size_bytes'),
    metadata: json(),
    createdAt: number().from('created_at'),
})
    .primaryKey('id');
const githubBranches = table('github_branches')
    .columns({
    id: string(),
    repositoryId: string().from('repository_id'),
    agentRunId: string().optional().from('agent_run_id'),
    issueId: string().optional().from('issue_id'),
    name: string(),
    baseBranch: string().from('base_branch'),
    status: string(),
    lastCommitSha: string().optional().from('last_commit_sha'),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
})
    .primaryKey('id');
const githubPullRequests = table('github_pull_requests')
    .columns({
    id: string(),
    repositoryId: string().from('repository_id'),
    branchId: string().optional().from('branch_id'),
    agentRunId: string().optional().from('agent_run_id'),
    issueId: string().optional().from('issue_id'),
    githubId: string().optional().from('github_id'),
    number: number(),
    url: string(),
    title: string(),
    state: string(),
    isDraft: boolean().from('is_draft'),
    mergeable: boolean().optional(),
    headSha: string().optional().from('head_sha'),
    baseBranch: string().from('base_branch'),
    checksStatus: string().from('checks_status'),
    checksUrl: string().optional().from('checks_url'),
    githubCreatedAt: number().optional().from('github_created_at'),
    githubUpdatedAt: number().optional().from('github_updated_at'),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
})
    .primaryKey('id');
const githubWebhookEvents = table('github_webhook_events')
    .columns({
    id: string(),
    deliveryId: string().from('delivery_id'),
    eventType: string().from('event_type'),
    action: string().optional(),
    repositoryFullName: string().optional().from('repository_full_name'),
    githubObjectId: string().optional().from('github_object_id'),
    payload: json(),
    processedAt: number().optional().from('processed_at'),
    createdAt: number().from('created_at'),
})
    .primaryKey('id');
const whatsappTemplates = table('whatsapp_templates')
    .columns({
    id: string(),
    organizationId: string().from('company_id'),
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
    components: json().optional(),
    variables: json(),
    lastSyncedAt: number().from('last_synced_at'),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
})
    .primaryKey('id');
const whatsappCampaigns = table('whatsapp_campaigns')
    .columns({
    id: string(),
    organizationId: string().from('company_id'),
    templateId: string().from('template_id'),
    name: string(),
    status: string(),
    recipientFilter: json().from('recipient_filter'),
    variableValues: json().from('variable_values'),
    mediaId: string().optional().from('media_id'),
    firedAt: number().optional().from('fired_at'),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
})
    .primaryKey('id');
const whatsappMessages = table('whatsapp_messages')
    .columns({
    id: string(),
    organizationId: string().from('company_id'),
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
    .primaryKey('id');
export const schema = createSchema({
    tables: [
        decks,
        users,
        organizations,
        organizationMemberships,
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
        pmTaskTriggers,
        pmTaskTriggerRuns,
        agentWorkers,
        githubRepositories,
        agentRuns,
        agentTerminals,
        agentRunArtifacts,
        githubBranches,
        githubPullRequests,
        githubWebhookEvents,
        whatsappTemplates,
        whatsappCampaigns,
        whatsappMessages,
    ],
});
const allowIfUnscopedAccess = (authData, { cmpLit }) => cmpLit(authData.canAccessUnscoped, '=', true);
const allowAuthenticated = (_authData, { cmpLit }) => cmpLit(true, '=', true);
const allowOwnUser = (authData, { cmp }) => cmp('id', authData.sub);
const allowOrganization = (authData, { cmp }) => cmp('id', 'IN', authData.organizationIds);
const allowOrganizationMembership = (authData, { cmp }) => cmp('organizationId', 'IN', authData.organizationIds);
const allowOwnSavedView = (authData, { cmp }) => cmp('ownerId', authData.sub);
const allowScopedField = (field) => (authData, { and, cmp, cmpLit, or }) => or(cmp(field, 'IN', authData.organizationIds), and(cmp(field, 'IS', null), cmpLit(authData.canAccessUnscoped, '=', true)));
const readOnly = (select) => ({
    row: {
        select,
        insert: NOBODY_CAN,
        update: { preMutation: NOBODY_CAN, postMutation: NOBODY_CAN },
        delete: NOBODY_CAN,
    },
});
const organizationScoped = (field = 'organizationId') => readOnly([allowScopedField(field)]);
const unscopedOnly = readOnly([allowIfUnscopedAccess]);
const authenticatedReadOnly = readOnly([allowAuthenticated]);
export const permissions = definePermissions(schema, () => {
    return {
        decks: organizationScoped(),
        users: authenticatedReadOnly,
        organizations: readOnly([allowOrganization]),
        organization_memberships: readOnly([allowOrganizationMembership]),
        crm_companies: organizationScoped(),
        crm_contacts: organizationScoped(),
        crm_deal_contacts: organizationScoped(),
        crm_deals: organizationScoped(),
        crm_notes: organizationScoped(),
        crm_boards: organizationScoped(),
        crm_board_columns: organizationScoped(),
        pm_teams: authenticatedReadOnly,
        pm_projects: organizationScoped('companyId'),
        pm_statuses: authenticatedReadOnly,
        pm_labels: organizationScoped('companyId'),
        pm_issues: organizationScoped('contextCompanyId'),
        pm_issue_labels: unscopedOnly,
        pm_issue_activity: unscopedOnly,
        pm_saved_views: readOnly([allowScopedField('companyId'), allowOwnSavedView]),
        pm_task_triggers: organizationScoped('companyId'),
        pm_task_trigger_runs: unscopedOnly,
        agent_workers: unscopedOnly,
        github_repositories: unscopedOnly,
        agent_runs: unscopedOnly,
        agent_terminals: unscopedOnly,
        agent_run_artifacts: unscopedOnly,
        github_branches: unscopedOnly,
        github_pull_requests: unscopedOnly,
        github_webhook_events: unscopedOnly,
        whatsapp_templates: organizationScoped(),
        whatsapp_campaigns: organizationScoped(),
        whatsapp_messages: organizationScoped(),
    };
});
