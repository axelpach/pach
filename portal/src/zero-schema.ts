// Zero schema for the portal (client-side).
// Keep in sync with server/schema.ts

import { boolean, createSchema, json, number, string, table } from '@rocicorp/zero'

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
  .primaryKey('id')

const designSystems = table('design_systems')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    name: string(),
    slug: string(),
    markdown: string(),
    tokens: json(),
    assets: json(),
    metadata: json(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const designTemplates = table('design_templates')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    type: string(),
    name: string(),
    slug: string(),
    status: string(),
    sourceKind: string().from('source_kind'),
    currentVersionId: string().optional().from('current_version_id'),
    metadata: json(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const designTemplateVersions = table('design_template_versions')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    templateId: string().from('template_id'),
    versionNumber: number().from('version_number'),
    schemaVersion: number().from('schema_version'),
    sourceKind: string().from('source_kind'),
    files: json(),
    manifest: json(),
    dependencies: json(),
    compiledArtifactUrl: string().optional().from('compiled_artifact_url'),
    previewImageUrl: string().optional().from('preview_image_url'),
    validationStatus: string().from('validation_status'),
    validationErrors: json().from('validation_errors'),
    createdByRunId: string().optional().from('created_by_run_id'),
    createdAt: number().from('created_at'),
  })
  .primaryKey('id')

const designAssets = table('design_assets')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    templateId: string().optional().from('template_id'),
    kind: string(),
    name: string(),
    storageKey: string().optional().from('storage_key'),
    url: string().optional(),
    metadata: json(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const designTemplateRuns = table('design_template_runs')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    templateId: string().optional().from('template_id'),
    designSystemId: string().optional().from('design_system_id'),
    agentRunId: string().optional().from('agent_run_id'),
    templateSlug: string().optional().from('template_slug'),
    prompt: string(),
    status: string(),
    statusMessage: string().optional().from('status_message'),
    sourceVersionId: string().optional().from('source_version_id'),
    targetVersionId: string().optional().from('target_version_id'),
    outputSpec: json().from('output_spec'),
    metadata: json(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const users = table('users')
  .columns({
    id: string(),
    email: string(),
    name: string().optional(),
    canAccessUnscoped: boolean().from('can_access_unscoped'),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const organizations = table('organizations')
  .columns({
    id: string(),
    name: string(),
    legalName: string().optional().from('legal_name'),
    taxId: string().optional().from('tax_id'),
    taxRegime: string().optional().from('tax_regime'),
    project: string().optional(),
    description: string().optional(),
    editorialProfile: json<Record<string, unknown>>().from('editorial_profile'),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const organizationMemberships = table('organization_memberships')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    userId: string().from('user_id'),
    role: string(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const activityEvents = table('activity_events')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    occurredAt: number().from('occurred_at'),
    createdAt: number().from('created_at'),
    eventType: string().from('event_type'),
    activityKind: string().from('activity_kind'),
    origin: string(),
    subjectType: string().from('subject_type'),
    subjectId: string().optional().from('subject_id'),
    subjectLabel: string().optional().from('subject_label'),
    actorType: string().from('actor_type'),
    actorId: string().optional().from('actor_id'),
    actorName: string().optional().from('actor_name'),
    source: string(),
    severity: string(),
    summary: string(),
    details: json(),
    metadata: json(),
  })
  .primaryKey('id')

const activityEventSavedViews = table('activity_event_saved_views')
  .columns({
    id: string(),
    organizationId: string().optional().from('organization_id'),
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
  .primaryKey('id')

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
  .primaryKey('id')

const crmDealContacts = table('crm_deal_contacts')
  .columns({
    id: string(),
    organizationId: string().optional().from('organization_id'),
    dealId: string().from('deal_id'),
    contactId: string().from('contact_id'),
    createdAt: number().from('created_at'),
  })
  .primaryKey('id')

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
  .primaryKey('id')

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
  .primaryKey('id')

const crmBoards = table('crm_boards')
  .columns({
    id: string(),
    organizationId: string().optional().from('organization_id'),
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
    organizationId: string().optional().from('organization_id'),
    boardId: string().from('board_id'),
    label: string(),
    position: number(),
    value: string(),
    color: string().optional(),
  })
  .primaryKey('id')

const calCalendarConnections = table('cal_calendar_connections')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    userId: string().from('user_id'),
    provider: string(),
    accountEmail: string().optional().from('account_email'),
    status: string(),
    accessTokenRef: string().optional().from('access_token_ref'),
    refreshTokenRef: string().optional().from('refresh_token_ref'),
    scopes: json<string[]>(),
    metadata: json<Record<string, unknown>>(),
    lastSyncedAt: number().optional().from('last_synced_at'),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const calExternalCalendars = table('cal_external_calendars')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    connectionId: string().from('connection_id'),
    providerCalendarId: string().from('provider_calendar_id'),
    name: string(),
    timezone: string().optional(),
    primary: boolean(),
    includeForAvailability: boolean().from('include_for_availability'),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const calEventTypes = table('cal_event_types')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    ownerUserId: string().from('owner_user_id'),
    title: string(),
    slug: string(),
    description: string().optional(),
    durationMinutes: number().from('duration_minutes'),
    timezone: string(),
    locationMode: string().from('location_mode'),
    locationDetails: string().optional().from('location_details'),
    meetingProvider: string().from('meeting_provider'),
    bufferBeforeMinutes: number().from('buffer_before_minutes'),
    bufferAfterMinutes: number().from('buffer_after_minutes'),
    minimumNoticeMinutes: number().from('minimum_notice_minutes'),
    bookingWindowDays: number().from('booking_window_days'),
    status: string(),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const calAvailabilityRules = table('cal_availability_rules')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    eventTypeId: string().from('event_type_id'),
    weekday: number(),
    startMinute: number().from('start_minute'),
    endMinute: number().from('end_minute'),
    timezone: string(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const calAvailabilityOverrides = table('cal_availability_overrides')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    eventTypeId: string().from('event_type_id'),
    date: number(),
    startMinute: number().optional().from('start_minute'),
    endMinute: number().optional().from('end_minute'),
    isAvailable: boolean().from('is_available'),
    reason: string().optional(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const calBookings = table('cal_bookings')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    eventTypeId: string().from('event_type_id'),
    hostUserId: string().from('host_user_id'),
    guestName: string().from('guest_name'),
    guestEmail: string().from('guest_email'),
    guestNotes: string().optional().from('guest_notes'),
    startAt: number().from('start_at'),
    endAt: number().from('end_at'),
    status: string(),
    meetingUrl: string().optional().from('meeting_url'),
    providerEventId: string().optional().from('provider_event_id'),
    cancelToken: string().from('cancel_token'),
    metadata: json<Record<string, unknown>>(),
    canceledAt: number().optional().from('canceled_at'),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const finAccounts = table('fin_accounts')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    name: string(),
    institutionName: string().optional().from('institution_name'),
    holderUserId: string().optional().from('holder_user_id'),
    type: string(),
    currencyCode: string().from('currency_code'),
    status: string(),
    lastBalanceMinor: number().optional().from('last_balance_minor'),
    lastBalanceAt: number().optional().from('last_balance_at'),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const finCategories = table('fin_categories')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    parentId: string().optional().from('parent_id'),
    name: string(),
    type: string(),
    color: string().optional(),
    icon: string().optional(),
    position: number(),
    archived: boolean(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const finImports = table('fin_imports')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    accountId: string().from('account_id'),
    createdByUserId: string().optional().from('created_by_user_id'),
    batchId: string().optional().from('batch_id'),
    status: string(),
    sourceType: string().from('source_type'),
    fileName: string().from('file_name'),
    fileType: string().from('file_type'),
    fileSha256: string().from('file_sha256'),
    statementStartDate: number().optional().from('statement_start_date'),
    statementEndDate: number().optional().from('statement_end_date'),
    detectedCurrencyCode: string().optional().from('detected_currency_code'),
    detectedInstitution: string().optional().from('detected_institution'),
    detectedAccountHint: string().optional().from('detected_account_hint'),
    itemsParsed: number().from('items_parsed'),
    itemsReady: number().from('items_ready'),
    itemsDuplicate: number().from('items_duplicate'),
    itemsNeedingReview: number().from('items_needing_review'),
    errorMessage: string().optional().from('error_message'),
    rawSummary: json<Record<string, unknown>>().from('raw_summary'),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
    appliedAt: number().optional().from('applied_at'),
  })
  .primaryKey('id')

const finImportItems = table('fin_import_items')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    importId: string().from('import_id'),
    accountId: string().from('account_id'),
    status: string(),
    transactionDate: number().from('transaction_date'),
    transactionTime: string().from('transaction_time'),
    postedDate: number().optional().from('posted_date'),
    description: string(),
    merchantName: string().optional().from('merchant_name'),
    amountMinor: number().from('amount_minor'),
    currencyCode: string().from('currency_code'),
    suggestedType: string().optional().from('suggested_type'),
    suggestedCategoryId: string().optional().from('suggested_category_id'),
    suggestedConfidence: number().optional().from('suggested_confidence'),
    duplicateMovementId: string().optional().from('duplicate_movement_id'),
    fingerprint: string(),
    rawData: json<Record<string, unknown>>().from('raw_data'),
    errorMessage: string().optional().from('error_message'),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const finTransfers = table('fin_transfers')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    status: string(),
    fromAccountId: string().optional().from('from_account_id'),
    toAccountId: string().optional().from('to_account_id'),
    amountMinor: number().optional().from('amount_minor'),
    currencyCode: string().optional().from('currency_code'),
    matchedConfidence: number().optional().from('matched_confidence'),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const finMovements = table('fin_movements')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    accountId: string().from('account_id'),
    categoryId: string().optional().from('category_id'),
    transferId: string().optional().from('transfer_id'),
    importId: string().optional().from('import_id'),
    sourceItemId: string().optional().from('source_item_id'),
    transactionDate: number().from('transaction_date'),
    transactionTime: string().from('transaction_time'),
    postedDate: number().optional().from('posted_date'),
    description: string(),
    merchantName: string().optional().from('merchant_name'),
    counterparty: string().optional(),
    amountMinor: number().from('amount_minor'),
    currencyCode: string().from('currency_code'),
    reportingAmountMinor: number().optional().from('reporting_amount_minor'),
    reportingCurrencyCode: string().optional().from('reporting_currency_code'),
    fxRate: string().optional().from('fx_rate'),
    fxRateSource: string().optional().from('fx_rate_source'),
    type: string(),
    status: string(),
    reviewReason: string().optional().from('review_reason'),
    externalId: string().optional().from('external_id'),
    fingerprint: string(),
    rawData: json<Record<string, unknown>>().from('raw_data'),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const finCategorizationRules = table('fin_categorization_rules')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    accountId: string().optional().from('account_id'),
    categoryId: string().optional().from('category_id'),
    type: string(),
    matchKind: string().from('match_kind'),
    matchValue: string().from('match_value'),
    amountMinor: number().optional().from('amount_minor'),
    currencyCode: string().optional().from('currency_code'),
    confidence: number(),
    autoApply: boolean().from('auto_apply'),
    createdFromMovementId: string().optional().from('created_from_movement_id'),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const finBalanceSnapshots = table('fin_balance_snapshots')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    accountId: string().from('account_id'),
    asOfDate: number().from('as_of_date'),
    balanceMinor: number().from('balance_minor'),
    currencyCode: string().from('currency_code'),
    source: string(),
    importId: string().optional().from('import_id'),
    createdAt: number().from('created_at'),
  })
  .primaryKey('id')

const documents = table('documents')
  .columns({
    id: string(),
    organizationId: string().optional().from('organization_id'),
    parentId: string().optional().from('parent_id'),
    ownerId: string().optional().from('owner_id'),
    publicId: string().optional().from('public_id'),
    currentSnapshotId: string().optional().from('current_snapshot_id'),
    title: string(),
    slug: string(),
    body: string(),
    format: string(),
    status: string(),
    icon: string().optional(),
    sortOrder: number().from('sort_order'),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const documentSnapshots = table('document_snapshots')
  .columns({
    id: string(),
    documentId: string().from('document_id'),
    organizationId: string().optional().from('organization_id'),
    versionNumber: number().from('version_number'),
    title: string(),
    slug: string(),
    body: string(),
    format: string(),
    status: string(),
    createdByType: string().from('created_by_type'),
    createdById: string().optional().from('created_by_id'),
    agentRunId: string().optional().from('agent_run_id'),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
  })
  .primaryKey('id')

const mktSenderProfiles = table('mkt_sender_profiles')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    provider: string(),
    name: string(),
    fromName: string().from('from_name'),
    fromEmail: string().from('from_email'),
    replyToName: string().optional().from('reply_to_name'),
    replyToEmail: string().optional().from('reply_to_email'),
    sendingDomain: string().optional().from('sending_domain'),
    status: string(),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const mktPublications = table('mkt_publications')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    defaultSenderProfileId: string().optional().from('default_sender_profile_id'),
    name: string(),
    slug: string(),
    type: string(),
    audienceDescription: string().optional().from('audience_description'),
    editorialProfile: json<Record<string, unknown>>().from('editorial_profile'),
    status: string(),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const mktCtas = table('mkt_ctas')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    key: string(),
    label: string(),
    url: string(),
    description: string().optional(),
    status: string(),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const mktContentItems = table('mkt_content_items')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    sourceDocumentId: string().optional().from('source_document_id'),
    primaryCtaId: string().optional().from('primary_cta_id'),
    title: string(),
    slug: string(),
    excerpt: string().optional(),
    contentKind: string().from('content_kind'),
    supportedChannels: json<string[]>().from('supported_channels'),
    status: string(),
    body: string(),
    format: string(),
    tags: json<string[]>(),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const mktEditorialIdeas = table('mkt_editorial_ideas')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    publicationId: string().from('publication_id'),
    documentId: string().optional().from('document_id'),
    contentItemId: string().optional().from('content_item_id'),
    agentRunId: string().optional().from('agent_run_id'),
    title: string(),
    angle: string().optional(),
    sourceNotes: string().optional().from('source_notes'),
    dedupeKey: string().from('dedupe_key'),
    status: string(),
    priority: number(),
    reservedAt: number().optional().from('reserved_at'),
    usedAt: number().optional().from('used_at'),
    metadata: json(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const mktAudienceMembers = table('mkt_audience_members')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    crmContactId: string().optional().from('crm_contact_id'),
    name: string().optional(),
    email: string().optional(),
    phone: string().optional(),
    whatsappPhone: string().optional().from('whatsapp_phone'),
    company: string().optional(),
    role: string().optional(),
    source: string().optional(),
    status: string(),
    tags: json<string[]>(),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const mktAudienceSubscriptions = table('mkt_audience_subscriptions')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    audienceMemberId: string().from('audience_member_id'),
    publicationId: string().optional().from('publication_id'),
    channel: string(),
    status: string(),
    consentSource: string().optional().from('consent_source'),
    consentedAt: number().optional().from('consented_at'),
    unsubscribedAt: number().optional().from('unsubscribed_at'),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const mktSegments = table('mkt_segments')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    name: string(),
    slug: string(),
    description: string().optional(),
    kind: string(),
    rules: json<Record<string, unknown>>(),
    status: string(),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const mktSegmentMembers = table('mkt_segment_members')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    segmentId: string().from('segment_id'),
    audienceMemberId: string().from('audience_member_id'),
    createdAt: number().from('created_at'),
  })
  .primaryKey('id')

const mktDistributionRuns = table('mkt_distribution_runs')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    publicationId: string().optional().from('publication_id'),
    contentItemId: string().optional().from('content_item_id'),
    segmentId: string().optional().from('segment_id'),
    senderProfileId: string().optional().from('sender_profile_id'),
    designTemplateId: string().optional().from('design_template_id'),
    designTemplateVersionId: string().optional().from('design_template_version_id'),
    channel: string(),
    distributionType: string().from('distribution_type'),
    name: string(),
    subject: string().optional(),
    preheader: string().optional(),
    status: string(),
    scheduledAt: number().optional().from('scheduled_at'),
    scheduledTimezone: string().from('scheduled_timezone'),
    startedAt: number().optional().from('started_at'),
    completedAt: number().optional().from('completed_at'),
    provider: string().optional(),
    providerCampaignId: string().optional().from('provider_campaign_id'),
    recipientFilter: json<Record<string, unknown>>().from('recipient_filter'),
    metrics: json<Record<string, unknown>>(),
    error: string().optional(),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const mktPublicationSlots = table('mkt_publication_slots')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    publicationId: string().from('publication_id'),
    ideaId: string().optional().from('idea_id'),
    documentId: string().optional().from('document_id'),
    contentItemId: string().optional().from('content_item_id'),
    distributionRunId: string().optional().from('distribution_run_id'),
    agentRunId: string().optional().from('agent_run_id'),
    slotKey: string().from('slot_key'),
    status: string(),
    scheduledAt: number().from('scheduled_at'),
    scheduledTimezone: string().from('scheduled_timezone'),
    lockedAt: number().optional().from('locked_at'),
    error: string().optional(),
    metadata: json(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const mktContentEvents = table('mkt_content_events')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    contentItemId: string().optional().from('content_item_id'),
    distributionRunId: string().optional().from('distribution_run_id'),
    audienceMemberId: string().optional().from('audience_member_id'),
    ctaId: string().optional().from('cta_id'),
    eventType: string().from('event_type'),
    channel: string().optional(),
    source: string().optional(),
    url: string().optional(),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
  })
  .primaryKey('id')

const mktPublicationConsumers = table('mkt_publication_consumers')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    publicationId: string().optional().from('publication_id'),
    kind: string(),
    name: string(),
    slug: string(),
    baseUrl: string().optional().from('base_url'),
    status: string(),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const mktContentOutputs = table('mkt_content_outputs')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    contentItemId: string().from('content_item_id'),
    consumerId: string().optional().from('consumer_id'),
    distributionRunId: string().optional().from('distribution_run_id'),
    channel: string(),
    publicUrl: string().optional().from('public_url'),
    canonicalUrl: string().optional().from('canonical_url'),
    status: string(),
    scheduledAt: number().optional().from('scheduled_at'),
    publishedAt: number().optional().from('published_at'),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const mktPromotablePages = table('mkt_promotable_pages')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    contentItemId: string().optional().from('content_item_id'),
    contentOutputId: string().optional().from('content_output_id'),
    source: string(),
    title: string(),
    url: string(),
    canonicalUrl: string().optional().from('canonical_url'),
    sourceUrl: string().optional().from('source_url'),
    status: string(),
    sitemapUrl: string().optional().from('sitemap_url'),
    sitemapLastmod: number().optional().from('sitemap_lastmod'),
    lastSeenAt: number().optional().from('last_seen_at'),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const mktKeywordIdeas = table('mkt_keyword_ideas')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    promotablePageId: string().from('promotable_page_id'),
    agentRunId: string().optional().from('agent_run_id'),
    keyword: string(),
    matchType: string().from('match_type'),
    intent: string().optional(),
    priority: number(),
    negative: boolean(),
    rationale: string().optional(),
    status: string(),
    source: string(),
    metadata: json(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const socialConnections = table('social_connections')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    providerAppId: string().optional().from('provider_app_id'),
    connectedByUserId: string().optional().from('connected_by_user_id'),
    provider: string(),
    providerAccountId: string().optional().from('provider_account_id'),
    providerAccountName: string().optional().from('provider_account_name'),
    providerAccountUrl: string().optional().from('provider_account_url'),
    scopes: json<string[]>(),
    credentialKind: string().from('credential_kind'),
    tokenExpiresAt: number().optional().from('token_expires_at'),
    refreshTokenExpiresAt: number().optional().from('refresh_token_expires_at'),
    status: string(),
    statusMessage: string().optional().from('status_message'),
    lastUsedAt: number().optional().from('last_used_at'),
    lastRefreshedAt: number().optional().from('last_refreshed_at'),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const socialChannels = table('social_channels')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    provider: string(),
    kind: string(),
    externalId: string().from('external_id'),
    displayName: string().from('display_name'),
    handle: string().optional(),
    url: string().optional(),
    status: string(),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const socialChannelConnections = table('social_channel_connections')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    channelId: string().from('channel_id'),
    connectionId: string().from('connection_id'),
    capabilities: json<string[]>(),
    status: string(),
    statusMessage: string().optional().from('status_message'),
    lastCheckedAt: number().optional().from('last_checked_at'),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const socialPosts = table('social_posts')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    contentItemId: string().optional().from('content_item_id'),
    contentOutputId: string().optional().from('content_output_id'),
    title: string().optional(),
    caption: string(),
    linkUrl: string().optional().from('link_url'),
    thumbnailUrl: string().optional().from('thumbnail_url'),
    status: string(),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const socialPostTargets = table('social_post_targets')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    socialPostId: string().from('social_post_id'),
    channelId: string().from('channel_id'),
    connectionId: string().optional().from('connection_id'),
    status: string(),
    scheduledAt: number().optional().from('scheduled_at'),
    scheduledTimezone: string().from('scheduled_timezone'),
    publishedAt: number().optional().from('published_at'),
    providerPostId: string().optional().from('provider_post_id'),
    providerPostUrl: string().optional().from('provider_post_url'),
    error: string().optional(),
    attemptCount: number().from('attempt_count'),
    lastAttemptAt: number().optional().from('last_attempt_at'),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const mktAdPromotions = table('mkt_ad_promotions')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    promotablePageId: string().optional().from('promotable_page_id'),
    contentItemId: string().optional().from('content_item_id'),
    contentOutputId: string().optional().from('content_output_id'),
    socialPostId: string().optional().from('social_post_id'),
    socialPostTargetId: string().optional().from('social_post_target_id'),
    provider: string(),
    adAccountExternalId: string().optional().from('ad_account_external_id'),
    campaignGroupExternalId: string().optional().from('campaign_group_external_id'),
    campaignBudgetExternalId: string().optional().from('campaign_budget_external_id'),
    campaignExternalId: string().optional().from('campaign_external_id'),
    adGroupExternalId: string().optional().from('ad_group_external_id'),
    creativeExternalId: string().optional().from('creative_external_id'),
    landingUrl: string().optional().from('landing_url'),
    objective: string(),
    status: string(),
    budgetMinor: number().optional().from('budget_minor'),
    currencyCode: string().from('currency_code'),
    startsAt: number().optional().from('starts_at'),
    endsAt: number().optional().from('ends_at'),
    targeting: json<Record<string, unknown>>(),
    creative: json<Record<string, unknown>>(),
    publishOperationKey: string().optional().from('publish_operation_key'),
    publishError: string().optional().from('publish_error'),
    providerResponse: json<Record<string, unknown>>().optional().from('provider_response'),
    publishedAt: number().optional().from('published_at'),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const mktAdMetricSnapshots = table('mkt_ad_metric_snapshots')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    promotionId: string().optional().from('promotion_id'),
    provider: string(),
    entityKind: string().from('entity_kind'),
    entityExternalId: string().optional().from('entity_external_id'),
    adAccountExternalId: string().optional().from('ad_account_external_id'),
    campaignGroupExternalId: string().optional().from('campaign_group_external_id'),
    campaignExternalId: string().optional().from('campaign_external_id'),
    creativeExternalId: string().optional().from('creative_external_id'),
    granularity: string(),
    periodStart: number().from('period_start'),
    periodEnd: number().from('period_end'),
    impressions: number(),
    clicks: number(),
    reactions: number(),
    comments: number(),
    shares: number(),
    follows: number(),
    leads: number(),
    conversions: number(),
    spendMinor: number().from('spend_minor'),
    currencyCode: string().from('currency_code'),
    rawMetrics: json<Record<string, unknown>>().from('raw_metrics'),
    fetchedAt: number().from('fetched_at'),
    createdAt: number().from('created_at'),
  })
  .primaryKey('id')

const googleConnections = table('google_connections')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    connectedByUserId: string().optional().from('connected_by_user_id'),
    providerAccountId: string().optional().from('provider_account_id'),
    providerAccountEmail: string().optional().from('provider_account_email'),
    providerAccountName: string().optional().from('provider_account_name'),
    scopes: json<string[]>(),
    credentialKind: string().from('credential_kind'),
    tokenExpiresAt: number().optional().from('token_expires_at'),
    status: string(),
    statusMessage: string().optional().from('status_message'),
    lastUsedAt: number().optional().from('last_used_at'),
    lastRefreshedAt: number().optional().from('last_refreshed_at'),
    metadata: json(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const googleAdsAccounts = table('google_ads_accounts')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    connectionId: string().from('connection_id'),
    customerId: string().from('customer_id'),
    managerCustomerId: string().optional().from('manager_customer_id'),
    descriptiveName: string().from('descriptive_name'),
    currencyCode: string().from('currency_code'),
    timeZone: string().from('time_zone'),
    isManager: boolean().from('is_manager'),
    isTestAccount: boolean().from('is_test_account'),
    selected: boolean(),
    status: string(),
    statusMessage: string().optional().from('status_message'),
    lastSyncedAt: number().optional().from('last_synced_at'),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const searchConsoleProperties = table('search_console_properties')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    connectionId: string().optional().from('connection_id'),
    siteUrl: string().from('site_url'),
    displayName: string().from('display_name'),
    permissionLevel: string().optional().from('permission_level'),
    selected: boolean(),
    status: string(),
    lastSyncedAt: number().optional().from('last_synced_at'),
    metadata: json(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const searchConsoleSitemaps = table('search_console_sitemaps')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    propertyId: string().from('property_id'),
    siteUrl: string().from('site_url'),
    sitemapUrl: string().from('sitemap_url'),
    status: string(),
    lastSubmittedAt: number().optional().from('last_submitted_at'),
    lastSyncedAt: number().optional().from('last_synced_at'),
    error: string().optional(),
    metadata: json(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const searchConsoleDimensionSummaries = table('search_console_dimension_summaries')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    propertyId: string().from('property_id'),
    contentItemId: string().optional().from('content_item_id'),
    contentOutputId: string().optional().from('content_output_id'),
    summaryType: string().from('summary_type'),
    summaryKey: string().from('summary_key'),
    searchType: string().from('search_type'),
    page: string().optional(),
    query: string().optional(),
    clicks: number(),
    impressions: number(),
    ctr: string().optional(),
    position: string().optional(),
    metadata: json(),
    fetchedAt: number().from('fetched_at'),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const searchConsoleDailySnapshots = table('search_console_daily_snapshots')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    propertyId: string().from('property_id'),
    dataDate: number().from('data_date'),
    searchType: string().from('search_type'),
    clicks: number(),
    impressions: number(),
    ctr: string().optional(),
    position: string().optional(),
    metadata: json(),
    fetchedAt: number().from('fetched_at'),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const searchConsoleUrlInspections = table('search_console_url_inspections')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    propertyId: string().from('property_id'),
    contentItemId: string().optional().from('content_item_id'),
    contentOutputId: string().optional().from('content_output_id'),
    inspectionUrl: string().from('inspection_url'),
    verdict: string().optional(),
    coverageState: string().optional().from('coverage_state'),
    indexingState: string().optional().from('indexing_state'),
    robotsTxtState: string().optional().from('robots_txt_state'),
    lastCrawlTime: number().optional().from('last_crawl_time'),
    inspectedAt: number().from('inspected_at'),
    rawResult: json().from('raw_result'),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
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

const pmTaskTriggers = table('pm_task_triggers')
  .columns({
    id: string(),
    name: string(),
    kind: string(),
    frequency: string().optional(),
    timezone: string(),
    schedule: json<Record<string, unknown>>(),
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
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const pmTaskTriggerRuns = table('pm_task_trigger_runs')
  .columns({
    id: string(),
    triggerId: string().from('trigger_id'),
    issueId: string().optional().from('issue_id'),
    periodKey: string().from('period_key'),
    status: string(),
    message: string().optional(),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
  })
  .primaryKey('id')

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
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const githubRepositories = table('github_repositories')
  .columns({
    id: string(),
    connectionId: string().optional().from('connection_id'),
    githubId: string().optional().from('github_id'),
    nodeId: string().optional().from('node_id'),
    projectKey: string().from('project_key'),
    owner: string(),
    name: string(),
    fullName: string().from('full_name'),
    defaultBranch: string().from('default_branch'),
    htmlUrl: string().optional().from('html_url'),
    isPrivate: boolean().from('private'),
    permissions: json<Record<string, unknown>>(),
    localPathTemplate: string().optional().from('local_path_template'),
    active: boolean(),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const organizationRepositories = table('organization_repositories')
  .columns({
    id: string(),
    organizationId: string().from('organization_id'),
    repositoryId: string().from('repository_id'),
    role: string(),
    isDefault: boolean().from('is_default'),
    active: boolean(),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const agentRuns = table('agent_runs')
  .columns({
    id: string(),
    conversationId: string().optional().from('conversation_id'),
    parentRunId: string().optional().from('parent_run_id'),
    issueId: string().optional().from('issue_id'),
    subjectType: string().from('subject_type'),
    subjectId: string().optional().from('subject_id'),
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
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const agentConversations = table('agent_conversations')
  .columns({
    id: string(),
    issueId: string().optional().from('issue_id'),
    title: string(),
    status: string(),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const agentMessages = table('agent_messages')
  .columns({
    id: string(),
    conversationId: string().from('conversation_id'),
    runId: string().optional().from('run_id'),
    role: string(),
    body: string(),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
  })
  .primaryKey('id')

const agentRunInputMediaObjects = table('agent_run_input_media_objects')
  .columns({
    id: string(),
    organizationId: string().optional().from('organization_id'),
    kind: string(),
    name: string(),
    fileName: string().from('file_name'),
    mimeType: string().from('mime_type'),
    sizeBytes: number().optional().from('size_bytes'),
    width: number().optional(),
    height: number().optional(),
    storageKey: string().from('storage_key'),
    url: string().optional(),
    source: string(),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const agentRunInputMedia = table('agent_run_input_media')
  .columns({
    id: string(),
    runId: string().from('run_id'),
    mediaObjectId: string().from('media_object_id'),
    messageId: string().optional().from('message_id'),
    issueId: string().optional().from('issue_id'),
    subjectType: string().optional().from('subject_type'),
    subjectId: string().optional().from('subject_id'),
    role: string(),
    caption: string().optional(),
    sortOrder: number().from('sort_order'),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
  })
  .primaryKey('id')

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
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
    updatedAt: number().from('updated_at'),
  })
  .primaryKey('id')

const agentRunProgressReports = table('agent_run_progress_reports')
  .columns({
    id: string(),
    runId: string().from('run_id'),
    issueId: string().optional().from('issue_id'),
    workerId: string().optional().from('worker_id'),
    phase: string().optional(),
    level: string(),
    message: string(),
    percent: number().optional(),
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
  })
  .primaryKey('id')

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
    metadata: json<Record<string, unknown>>(),
    createdAt: number().from('created_at'),
  })
  .primaryKey('id')

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
  .primaryKey('id')

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
  .primaryKey('id')

const githubWebhookEvents = table('github_webhook_events')
  .columns({
    id: string(),
    deliveryId: string().from('delivery_id'),
    eventType: string().from('event_type'),
    action: string().optional(),
    repositoryFullName: string().optional().from('repository_full_name'),
    githubObjectId: string().optional().from('github_object_id'),
    payload: json<Record<string, unknown>>(),
    processedAt: number().optional().from('processed_at'),
    createdAt: number().from('created_at'),
  })
  .primaryKey('id')

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
    organizationId: string().from('company_id'),
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
  .primaryKey('id')

export const schema = createSchema({
  tables: [
    decks,
    designSystems,
    designTemplates,
    designTemplateVersions,
    designAssets,
    designTemplateRuns,
    users,
    organizations,
    organizationMemberships,
    activityEvents,
    activityEventSavedViews,
    crmCompanies,
    crmContacts,
    crmDealContacts,
    crmDeals,
    crmNotes,
    crmBoards,
    crmBoardColumns,
    calCalendarConnections,
    calExternalCalendars,
    calEventTypes,
    calAvailabilityRules,
    calAvailabilityOverrides,
    calBookings,
    finAccounts,
    finCategories,
    finImports,
    finImportItems,
    finTransfers,
    finMovements,
    finCategorizationRules,
    finBalanceSnapshots,
    documents,
    documentSnapshots,
    mktSenderProfiles,
    mktPublications,
    mktCtas,
    mktContentItems,
    mktEditorialIdeas,
    mktAudienceMembers,
    mktAudienceSubscriptions,
    mktSegments,
    mktSegmentMembers,
    mktDistributionRuns,
    mktPublicationSlots,
    mktContentEvents,
    mktPublicationConsumers,
    mktContentOutputs,
    mktPromotablePages,
    mktKeywordIdeas,
    socialConnections,
    socialChannels,
    socialChannelConnections,
    socialPosts,
    socialPostTargets,
    mktAdPromotions,
    mktAdMetricSnapshots,
    googleConnections,
    googleAdsAccounts,
    searchConsoleProperties,
    searchConsoleSitemaps,
    searchConsoleDimensionSummaries,
    searchConsoleDailySnapshots,
    searchConsoleUrlInspections,
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
    organizationRepositories,
    agentConversations,
    agentRuns,
    agentMessages,
    agentRunInputMediaObjects,
    agentRunInputMedia,
    agentTerminals,
    agentRunProgressReports,
    agentRunArtifacts,
    githubBranches,
    githubPullRequests,
    githubWebhookEvents,
    whatsappTemplates,
    whatsappCampaigns,
    whatsappMessages,
  ],
})

export type Schema = typeof schema
