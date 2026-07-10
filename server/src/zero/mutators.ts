import type { ServerTransaction } from '@rocicorp/zero'
import type { PostgresJsTransaction } from '@rocicorp/zero/pg'
import type { Schema } from '../../schema.js'
import type { JWTPayload } from '../lib/auth.js'

type Tx = ServerTransaction<Schema, PostgresJsTransaction>
type ScopedTable =
  | 'decks'
  | 'design_systems'
  | 'design_templates'
  | 'design_template_versions'
  | 'design_assets'
  | 'design_template_runs'
  | 'organizations'
  | 'organization_memberships'
  | 'activity_events'
  | 'crm_companies'
  | 'crm_contacts'
  | 'crm_deal_contacts'
  | 'crm_deals'
  | 'crm_notes'
  | 'crm_boards'
  | 'crm_board_columns'
  | 'fin_accounts'
  | 'fin_categories'
  | 'fin_imports'
  | 'fin_import_items'
  | 'fin_transfers'
  | 'fin_movements'
  | 'fin_categorization_rules'
  | 'fin_balance_snapshots'
  | 'documents'
  | 'document_snapshots'
  | 'mkt_sender_profiles'
  | 'mkt_publications'
  | 'mkt_ctas'
  | 'mkt_content_items'
  | 'mkt_editorial_ideas'
  | 'mkt_audience_members'
  | 'mkt_audience_subscriptions'
  | 'mkt_segments'
  | 'mkt_segment_members'
  | 'mkt_distribution_runs'
  | 'mkt_publication_slots'
  | 'mkt_content_events'
  | 'mkt_publication_consumers'
  | 'mkt_content_outputs'
  | 'social_provider_apps'
  | 'social_connections'
  | 'social_channels'
  | 'social_channel_connections'
  | 'social_posts'
  | 'social_post_targets'
  | 'mkt_ad_promotions'
  | 'mkt_ad_metric_snapshots'
  | 'pm_teams'
  | 'pm_projects'
  | 'pm_statuses'
  | 'pm_labels'
  | 'pm_issues'
  | 'pm_saved_views'
  | 'pm_task_triggers'
  | 'whatsapp_campaigns'

const ORG_COLUMN_BY_TABLE: Record<ScopedTable, string> = {
  decks: 'organization_id',
  design_systems: 'organization_id',
  design_templates: 'organization_id',
  design_template_versions: 'organization_id',
  design_assets: 'organization_id',
  design_template_runs: 'organization_id',
  organizations: 'id',
  organization_memberships: 'organization_id',
  activity_events: 'organization_id',
  crm_companies: 'organization_id',
  crm_contacts: 'organization_id',
  crm_deal_contacts: 'organization_id',
  crm_deals: 'organization_id',
  crm_notes: 'organization_id',
  crm_boards: 'organization_id',
  crm_board_columns: 'organization_id',
  fin_accounts: 'organization_id',
  fin_categories: 'organization_id',
  fin_imports: 'organization_id',
  fin_import_items: 'organization_id',
  fin_transfers: 'organization_id',
  fin_movements: 'organization_id',
  fin_categorization_rules: 'organization_id',
  fin_balance_snapshots: 'organization_id',
  documents: 'organization_id',
  document_snapshots: 'organization_id',
  mkt_sender_profiles: 'organization_id',
  mkt_publications: 'organization_id',
  mkt_ctas: 'organization_id',
  mkt_content_items: 'organization_id',
  mkt_editorial_ideas: 'organization_id',
  mkt_audience_members: 'organization_id',
  mkt_audience_subscriptions: 'organization_id',
  mkt_segments: 'organization_id',
  mkt_segment_members: 'organization_id',
  mkt_distribution_runs: 'organization_id',
  mkt_publication_slots: 'organization_id',
  mkt_content_events: 'organization_id',
  mkt_publication_consumers: 'organization_id',
  mkt_content_outputs: 'organization_id',
  social_provider_apps: 'organization_id',
  social_connections: 'organization_id',
  social_channels: 'organization_id',
  social_channel_connections: 'organization_id',
  social_posts: 'organization_id',
  social_post_targets: 'organization_id',
  mkt_ad_promotions: 'organization_id',
  mkt_ad_metric_snapshots: 'organization_id',
  pm_teams: 'company_id',
  pm_projects: 'company_id',
  pm_statuses: 'company_id',
  pm_labels: 'company_id',
  pm_issues: 'context_company_id',
  pm_saved_views: 'company_id',
  pm_task_triggers: 'company_id',
  whatsapp_campaigns: 'company_id',
}

export class AuthorizationError extends Error {
  constructor(message = 'Not authorized for this organization') {
    super(message)
    this.name = 'AuthorizationError'
  }
}

function issueActivityKind(type: string, metadata?: Record<string, unknown>) {
  if (type === 'completed') return 'progress'
  if (type === 'agent_run_failed' || metadata?.level === 'error') return 'incident'
  return 'operational'
}

export function isAuthorizationError(error: unknown): error is AuthorizationError {
  return error instanceof AuthorizationError
}

export function createServerMutators(authData?: JWTPayload) {
  function canAccessOrganization(organizationId: string | null | undefined) {
    if (!authData) return false
    if (!organizationId) return authData.canAccessUnscoped
    return authData.organizationIds.includes(organizationId)
  }

  function requireOrganizationAccess(organizationId: string | null | undefined) {
    if (!canAccessOrganization(organizationId)) throw new AuthorizationError()
  }

  function requireUnscopedAccess() {
    if (!authData?.canAccessUnscoped) throw new AuthorizationError('Not authorized for workspace-level content')
  }

  async function readOrganizationId(tx: Tx, tableName: ScopedTable, id: string): Promise<string | null | undefined> {
    const columnName = ORG_COLUMN_BY_TABLE[tableName]
    const rows = await tx.dbTransaction.query(
      `select "${columnName}" as organization_id from "${tableName}" where "id" = $1 limit 1`,
      [id],
    )
    return Array.from(rows)[0]?.organization_id as string | null | undefined
  }

  async function requireExistingOrganizationAccess(tx: Tx, tableName: ScopedTable, id: string) {
    requireOrganizationAccess(await readOrganizationId(tx, tableName, id))
  }

  async function readSavedViewAccess(tx: Tx, id: string): Promise<{ companyId: string | null | undefined; ownerId: string | null | undefined }> {
    const rows = await tx.dbTransaction.query(
      'select "company_id" as company_id, "owner_id" as owner_id from "pm_saved_views" where "id" = $1 limit 1',
      [id],
    )
    const row = Array.from(rows)[0]
    return {
      companyId: row?.company_id as string | null | undefined,
      ownerId: row?.owner_id as string | null | undefined,
    }
  }

  async function readActivityEventSavedViewAccess(tx: Tx, id: string): Promise<{ organizationId: string | null | undefined; ownerId: string | null | undefined }> {
    const rows = await tx.dbTransaction.query(
      'select "organization_id" as organization_id, "owner_id" as owner_id from "activity_event_saved_views" where "id" = $1 limit 1',
      [id],
    )
    const row = Array.from(rows)[0]
    return {
      organizationId: row?.organization_id as string | null | undefined,
      ownerId: row?.owner_id as string | null | undefined,
    }
  }

  async function readIssueActivityContext(tx: Tx, issueId: string): Promise<{ issueOrganizationId: string | null | undefined; activityOrganizationId: string | null | undefined; identifier: string | null | undefined }> {
    const rows = await tx.dbTransaction.query(
      `select
        issue."context_company_id" as issue_organization_id,
        coalesce(
          issue."context_company_id",
          (select "id" from "organizations" where "project" = 'pach' order by "created_at" asc limit 1),
          (select "id" from "organizations" order by "created_at" asc limit 1)
        ) as activity_organization_id,
        issue."identifier" as identifier
      from "pm_issues" issue
      where issue."id" = $1
      limit 1`,
      [issueId],
    )
    const row = Array.from(rows)[0]
    return {
      issueOrganizationId: row?.issue_organization_id as string | null | undefined,
      activityOrganizationId: row?.activity_organization_id as string | null | undefined,
      identifier: row?.identifier as string | null | undefined,
    }
  }

  function canAccessSavedView(companyId: string | null | undefined, ownerId: string | null | undefined) {
    return ownerId === authData?.sub || canAccessOrganization(companyId)
  }

  async function nextDocumentPublicId(tx: Tx, organizationId: string | null | undefined) {
    const prefix = await documentPublicIdPrefix(tx, organizationId)
    const rows = await tx.dbTransaction.query(
      'select "public_id" as public_id from "documents" where "organization_id" is not distinct from $1 and "public_id" like $2',
      [organizationId ?? null, `${prefix}-DOC-%`],
    )
    const max = Array.from(rows).reduce((current, row) => {
      const publicId = String(row.public_id ?? '')
      const match = publicId.match(/-DOC-(\d+)$/)
      const value = match ? Number(match[1]) : 0
      return Number.isFinite(value) ? Math.max(current, value) : current
    }, 0)
    return `${prefix}-DOC-${max + 1}`
  }

  async function documentPublicIdPrefix(tx: Tx, organizationId: string | null | undefined) {
    if (!organizationId) return 'DOC'
    const rows = await tx.dbTransaction.query(
      'select "project", "name" from "organizations" where "id" = $1 limit 1',
      [organizationId],
    )
    const organization = Array.from(rows)[0]
    const raw = String(organization?.project ?? organization?.name ?? 'doc')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 3)
      .toUpperCase()
    return raw || 'DOC'
  }

  function requireSavedViewAccess(companyId: string | null | undefined, ownerId: string | null | undefined) {
    if (!canAccessSavedView(companyId, ownerId)) throw new AuthorizationError()
  }

  function canAccessActivityEventSavedView(organizationId: string | null | undefined, ownerId: string | null | undefined) {
    return ownerId === authData?.sub || canAccessOrganization(organizationId)
  }

  function requireActivityEventSavedViewAccess(organizationId: string | null | undefined, ownerId: string | null | undefined) {
    if (!canAccessActivityEventSavedView(organizationId, ownerId)) throw new AuthorizationError()
  }

  function requireSavedViewMutationAccess(args: { companyId?: string | null; ownerId?: string | null }) {
    if (args.ownerId && args.ownerId !== authData?.sub) requireUnscopedAccess()
    if (args.companyId) requireOrganizationAccess(args.companyId)
    requireSavedViewAccess(args.companyId, args.ownerId)
  }

  function requireActivityEventSavedViewMutationAccess(args: { organizationId?: string | null; ownerId?: string | null }) {
    if (args.ownerId && args.ownerId !== authData?.sub) requireUnscopedAccess()
    if (args.organizationId) requireOrganizationAccess(args.organizationId)
    requireActivityEventSavedViewAccess(args.organizationId, args.ownerId ?? authData?.sub)
  }

  async function requireExistingSavedViewMutationAccess(tx: Tx, id: string) {
    const current = await readSavedViewAccess(tx, id)
    requireSavedViewAccess(current.companyId, current.ownerId)
  }

  async function requireExistingActivityEventSavedViewMutationAccess(tx: Tx, id: string) {
    const current = await readActivityEventSavedViewAccess(tx, id)
    requireActivityEventSavedViewAccess(current.organizationId, current.ownerId)
  }

  return {
    organizations: {
      async create(tx: Tx, args: { id: string; name: string; legalName?: string; taxId?: string; taxRegime?: string; project?: string; description?: string }) {
        requireUnscopedAccess()
        const now = Date.now()
        await tx.mutate.organizations.insert({ ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: { id: string; name?: string; legalName?: string; taxId?: string; taxRegime?: string; project?: string; description?: string }) {
        requireOrganizationAccess(args.id)
        const { id, ...updates } = args
        await tx.mutate.organizations.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        requireUnscopedAccess()
        await tx.mutate.organizations.delete({ id: args.id })
      },
    },

    organization_memberships: {
      async create(tx: Tx, args: { id: string; organizationId: string; userId: string; role?: string }) {
        requireOrganizationAccess(args.organizationId)
        const now = Date.now()
        await tx.mutate.organization_memberships.insert({ role: 'owner', ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: { id: string; role?: string }) {
        await requireExistingOrganizationAccess(tx, 'organization_memberships', args.id)
        const { id, ...updates } = args
        await tx.mutate.organization_memberships.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'organization_memberships', args.id)
        await tx.mutate.organization_memberships.delete({ id: args.id })
      },
    },

    activity_events: {
      async create(tx: Tx, args: { id: string; organizationId: string; occurredAt?: number; eventType: string; activityKind?: string; origin?: string; subjectType: string; subjectId?: string; subjectLabel?: string; actorType?: string; actorId?: string; actorName?: string; source?: string; severity?: string; summary: string; details?: Record<string, unknown>; metadata?: Record<string, unknown> }) {
        requireOrganizationAccess(args.organizationId)
        const now = Date.now()
        await tx.mutate.activity_events.insert({
          occurredAt: now,
          activityKind: 'operational',
          origin: 'pach_work',
          actorType: 'system',
          source: 'pach_app',
          severity: 'info',
          details: {},
          metadata: {},
          ...args,
          createdAt: now,
        } as any)
      },
    },

    activity_event_saved_views: {
      async create(tx: Tx, args: { id: string; organizationId?: string; ownerId?: string; name: string; slug: string; icon?: string; color?: string; scope?: string; filters?: Record<string, unknown>; display?: Record<string, unknown>; position?: number }) {
        const ownerId = args.ownerId ?? authData?.sub
        requireActivityEventSavedViewMutationAccess({ organizationId: args.organizationId, ownerId })
        const now = Date.now()
        await tx.mutate.activity_event_saved_views.insert({
          scope: 'personal',
          filters: {},
          display: {},
          position: 0,
          ...args,
          ownerId,
          createdAt: now,
          updatedAt: now,
        } as any)
      },
      async update(tx: Tx, args: { id: string; organizationId?: string | null; ownerId?: string | null; name?: string; slug?: string; icon?: string; color?: string; scope?: string; filters?: Record<string, unknown>; display?: Record<string, unknown>; position?: number }) {
        await requireExistingActivityEventSavedViewMutationAccess(tx, args.id)
        if ('ownerId' in args && args.ownerId && args.ownerId !== authData?.sub) requireUnscopedAccess()
        if ('organizationId' in args && args.organizationId) requireOrganizationAccess(args.organizationId)
        const { id, ...updates } = args
        await tx.mutate.activity_event_saved_views.update({ id, ...updates, updatedAt: Date.now() } as any)
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingActivityEventSavedViewMutationAccess(tx, args.id)
        await tx.mutate.activity_event_saved_views.delete({ id: args.id })
      },
    },

    design_systems: {
      async create(tx: Tx, args: { id: string; organizationId: string; name: string; slug: string; markdown?: string; tokens?: Record<string, unknown>; assets?: Record<string, unknown>; metadata?: Record<string, unknown> }) {
        requireOrganizationAccess(args.organizationId)
        const now = Date.now()
        await tx.mutate.design_systems.insert({
          markdown: '',
          tokens: {},
          assets: {},
          metadata: {},
          ...args,
          createdAt: now,
          updatedAt: now,
        } as any)
      },
      async update(tx: Tx, args: { id: string; name?: string; slug?: string; markdown?: string; tokens?: Record<string, unknown>; assets?: Record<string, unknown>; metadata?: Record<string, unknown> }) {
        await requireExistingOrganizationAccess(tx, 'design_systems', args.id)
        const { id, ...updates } = args
        await tx.mutate.design_systems.update({ id, ...updates, updatedAt: Date.now() } as any)
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'design_systems', args.id)
        await tx.mutate.design_systems.delete({ id: args.id })
      },
    },

    design_templates: {
      async create(tx: Tx, args: { id: string; organizationId: string; type?: string; name: string; slug: string; status?: string; sourceKind?: string; currentVersionId?: string; metadata?: Record<string, unknown> }) {
        requireOrganizationAccess(args.organizationId)
        const now = Date.now()
        await tx.mutate.design_templates.insert({
          type: 'deck',
          status: 'active',
          sourceKind: 'react',
          metadata: {},
          ...args,
          createdAt: now,
          updatedAt: now,
        } as any)
      },
      async update(tx: Tx, args: { id: string; type?: string; name?: string; slug?: string; status?: string; sourceKind?: string; currentVersionId?: string | null; metadata?: Record<string, unknown> }) {
        await requireExistingOrganizationAccess(tx, 'design_templates', args.id)
        const { id, ...updates } = args
        await tx.mutate.design_templates.update({ id, ...updates, updatedAt: Date.now() } as any)
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'design_templates', args.id)
        await tx.mutate.design_templates.delete({ id: args.id })
      },
    },

    design_template_versions: {
      async create(tx: Tx, args: { id: string; organizationId: string; templateId: string; versionNumber?: number; schemaVersion?: number; sourceKind?: string; files?: Record<string, string>; manifest?: Record<string, unknown>; dependencies?: Record<string, string>; compiledArtifactUrl?: string; previewImageUrl?: string; validationStatus?: string; validationErrors?: Array<Record<string, unknown>>; createdByRunId?: string }) {
        requireOrganizationAccess(args.organizationId)
        await requireExistingOrganizationAccess(tx, 'design_templates', args.templateId)
        await tx.mutate.design_template_versions.insert({
          versionNumber: 1,
          schemaVersion: 1,
          sourceKind: 'react',
          files: {},
          manifest: {},
          dependencies: {},
          validationStatus: 'draft',
          validationErrors: [],
          ...args,
          createdAt: Date.now(),
        } as any)
      },
      async update(tx: Tx, args: { id: string; versionNumber?: number; schemaVersion?: number; sourceKind?: string; files?: Record<string, string>; manifest?: Record<string, unknown>; dependencies?: Record<string, string>; compiledArtifactUrl?: string | null; previewImageUrl?: string | null; validationStatus?: string; validationErrors?: Array<Record<string, unknown>>; createdByRunId?: string | null }) {
        await requireExistingOrganizationAccess(tx, 'design_template_versions', args.id)
        const { id, ...updates } = args
        await tx.mutate.design_template_versions.update({ id, ...updates } as any)
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'design_template_versions', args.id)
        await tx.mutate.design_template_versions.delete({ id: args.id })
      },
    },

    design_assets: {
      async create(tx: Tx, args: { id: string; organizationId: string; templateId?: string; kind: string; name: string; storageKey?: string; url?: string; metadata?: Record<string, unknown> }) {
        requireOrganizationAccess(args.organizationId)
        if (args.templateId) await requireExistingOrganizationAccess(tx, 'design_templates', args.templateId)
        const now = Date.now()
        await tx.mutate.design_assets.insert({ metadata: {}, ...args, createdAt: now, updatedAt: now } as any)
      },
      async update(tx: Tx, args: { id: string; templateId?: string | null; kind?: string; name?: string; storageKey?: string | null; url?: string | null; metadata?: Record<string, unknown> }) {
        await requireExistingOrganizationAccess(tx, 'design_assets', args.id)
        if (args.templateId) await requireExistingOrganizationAccess(tx, 'design_templates', args.templateId)
        const { id, ...updates } = args
        await tx.mutate.design_assets.update({ id, ...updates, updatedAt: Date.now() } as any)
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'design_assets', args.id)
        await tx.mutate.design_assets.delete({ id: args.id })
      },
    },

    design_template_runs: {
      async create(tx: Tx, args: { id: string; organizationId: string; templateId?: string; designSystemId?: string; agentRunId?: string; templateSlug?: string; prompt: string; status?: string; statusMessage?: string; sourceVersionId?: string; targetVersionId?: string; outputSpec?: Record<string, unknown>; metadata?: Record<string, unknown> }) {
        requireOrganizationAccess(args.organizationId)
        if (args.templateId) await requireExistingOrganizationAccess(tx, 'design_templates', args.templateId)
        if (args.designSystemId) await requireExistingOrganizationAccess(tx, 'design_systems', args.designSystemId)
        const now = Date.now()
        await tx.mutate.design_template_runs.insert({
          status: 'queued',
          outputSpec: {},
          metadata: {},
          ...args,
          createdAt: now,
          updatedAt: now,
        } as any)
      },
      async update(tx: Tx, args: { id: string; templateId?: string | null; designSystemId?: string | null; agentRunId?: string | null; templateSlug?: string | null; prompt?: string; status?: string; statusMessage?: string | null; sourceVersionId?: string | null; targetVersionId?: string | null; outputSpec?: Record<string, unknown>; metadata?: Record<string, unknown> }) {
        await requireExistingOrganizationAccess(tx, 'design_template_runs', args.id)
        if (args.templateId) await requireExistingOrganizationAccess(tx, 'design_templates', args.templateId)
        if (args.designSystemId) await requireExistingOrganizationAccess(tx, 'design_systems', args.designSystemId)
        const { id, ...updates } = args
        await tx.mutate.design_template_runs.update({ id, ...updates, updatedAt: Date.now() } as any)
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'design_template_runs', args.id)
        await tx.mutate.design_template_runs.delete({ id: args.id })
      },
    },

    crm_companies: {
      async create(tx: Tx, args: { id: string; organizationId?: string; name: string; website?: string; instagram?: string; phone?: string; city?: string; industry?: string; size?: string; description?: string }) {
        requireOrganizationAccess(args.organizationId)
        const now = Date.now()
        await tx.mutate.crm_companies.insert({ ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: { id: string; organizationId?: string | null; name?: string; website?: string; instagram?: string; phone?: string; city?: string; industry?: string; size?: string; description?: string }) {
        await requireExistingOrganizationAccess(tx, 'crm_companies', args.id)
        if ('organizationId' in args) requireOrganizationAccess(args.organizationId)
        const { id, ...updates } = args
        await tx.mutate.crm_companies.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'crm_companies', args.id)
        await tx.mutate.crm_companies.delete({ id: args.id })
      },
    },

    crm_contacts: {
      async create(tx: Tx, args: { id: string; organizationId?: string; crmCompanyId?: string; name: string; email?: string; phone?: string; instagram?: string; linkedin?: string; role?: string }) {
        requireOrganizationAccess(args.organizationId)
        const now = Date.now()
        await tx.mutate.crm_contacts.insert({ ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: { id: string; organizationId?: string | null; crmCompanyId?: string | null; name?: string; email?: string; phone?: string; instagram?: string; linkedin?: string; role?: string }) {
        await requireExistingOrganizationAccess(tx, 'crm_contacts', args.id)
        if ('organizationId' in args) requireOrganizationAccess(args.organizationId)
        const { id, ...updates } = args
        await tx.mutate.crm_contacts.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'crm_contacts', args.id)
        await tx.mutate.crm_contacts.delete({ id: args.id })
      },
    },

    crm_deal_contacts: {
      async create(tx: Tx, args: { id: string; organizationId?: string; dealId: string; contactId: string }) {
        const organizationId = args.organizationId ?? await readOrganizationId(tx, 'crm_deals', args.dealId)
        requireOrganizationAccess(organizationId)
        await tx.mutate.crm_deal_contacts.insert({ ...args, organizationId, createdAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'crm_deal_contacts', args.id)
        await tx.mutate.crm_deal_contacts.delete({ id: args.id })
      },
    },

    crm_deals: {
      async create(tx: Tx, args: { id: string; organizationId?: string; crmCompanyId?: string; title: string; stage?: string; value?: number; temperature?: string; project?: string; description?: string }) {
        requireOrganizationAccess(args.organizationId)
        const now = Date.now()
        await tx.mutate.crm_deals.insert({ stage: 'prospecto', ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: { id: string; organizationId?: string | null; crmCompanyId?: string | null; title?: string; stage?: string; value?: number; temperature?: string; project?: string; description?: string }) {
        await requireExistingOrganizationAccess(tx, 'crm_deals', args.id)
        if ('organizationId' in args) requireOrganizationAccess(args.organizationId)
        const { id, ...updates } = args
        await tx.mutate.crm_deals.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'crm_deals', args.id)
        await tx.mutate.crm_deals.delete({ id: args.id })
      },
    },

    crm_notes: {
      async create(tx: Tx, args: { id: string; organizationId?: string; dealId?: string; contactId?: string; body: string; type?: string }) {
        const organizationId = args.organizationId ??
          (args.dealId ? await readOrganizationId(tx, 'crm_deals', args.dealId) : undefined) ??
          (args.contactId ? await readOrganizationId(tx, 'crm_contacts', args.contactId) : undefined)
        requireOrganizationAccess(organizationId)
        await tx.mutate.crm_notes.insert({ type: 'manual', ...args, organizationId, createdAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'crm_notes', args.id)
        await tx.mutate.crm_notes.delete({ id: args.id })
      },
    },

    crm_boards: {
      async create(tx: Tx, args: { id: string; organizationId?: string; name: string; slug: string; entityType?: string; groupBy: string; baseFilter?: Record<string, string[]> }) {
        requireOrganizationAccess(args.organizationId)
        const now = Date.now()
        await tx.mutate.crm_boards.insert({ entityType: 'deals', baseFilter: {}, ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: { id: string; organizationId?: string | null; name?: string; groupBy?: string; baseFilter?: Record<string, string[]> }) {
        await requireExistingOrganizationAccess(tx, 'crm_boards', args.id)
        if ('organizationId' in args) requireOrganizationAccess(args.organizationId)
        const { id, ...updates } = args
        await tx.mutate.crm_boards.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'crm_boards', args.id)
        await tx.mutate.crm_boards.delete({ id: args.id })
      },
    },

    crm_board_columns: {
      async create(tx: Tx, args: { id: string; organizationId?: string; boardId: string; label: string; position: number; value: string; color?: string }) {
        const organizationId = args.organizationId ?? await readOrganizationId(tx, 'crm_boards', args.boardId)
        requireOrganizationAccess(organizationId)
        await tx.mutate.crm_board_columns.insert({ ...args, organizationId })
      },
      async update(tx: Tx, args: { id: string; label?: string; position?: number; color?: string }) {
        await requireExistingOrganizationAccess(tx, 'crm_board_columns', args.id)
        const { id, ...updates } = args
        await tx.mutate.crm_board_columns.update({ id, ...updates })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'crm_board_columns', args.id)
        await tx.mutate.crm_board_columns.delete({ id: args.id })
      },
    },

    fin_accounts: {
      async create(tx: Tx, args: { id: string; organizationId: string; name: string; institutionName?: string; holderUserId?: string; type?: string; currencyCode?: string; status?: string; lastBalanceMinor?: number; lastBalanceAt?: number; metadata?: Record<string, unknown> }) {
        requireOrganizationAccess(args.organizationId)
        const now = Date.now()
        await tx.mutate.fin_accounts.insert({
          type: 'bank_account',
          currencyCode: 'MXN',
          status: 'active',
          metadata: {},
          ...args,
          createdAt: now,
          updatedAt: now,
        })
      },
      async update(tx: Tx, args: { id: string; name?: string; institutionName?: string | null; holderUserId?: string | null; type?: string; currencyCode?: string; status?: string; lastBalanceMinor?: number | null; lastBalanceAt?: number | null; metadata?: Record<string, unknown> }) {
        await requireExistingOrganizationAccess(tx, 'fin_accounts', args.id)
        const { id, ...updates } = args
        await tx.mutate.fin_accounts.update({ id, ...updates, updatedAt: Date.now() })
      },
    },

    fin_categories: {
      async create(tx: Tx, args: { id: string; organizationId: string; parentId?: string; name: string; type?: string; color?: string; icon?: string; position?: number; archived?: boolean }) {
        requireOrganizationAccess(args.organizationId)
        const now = Date.now()
        await tx.mutate.fin_categories.insert({
          type: 'expense',
          position: 0,
          archived: false,
          ...args,
          createdAt: now,
          updatedAt: now,
        })
      },
      async update(tx: Tx, args: { id: string; parentId?: string | null; name?: string; type?: string; color?: string | null; icon?: string | null; position?: number; archived?: boolean }) {
        await requireExistingOrganizationAccess(tx, 'fin_categories', args.id)
        const { id, ...updates } = args
        await tx.mutate.fin_categories.update({ id, ...updates, updatedAt: Date.now() })
      },
    },

    fin_movements: {
      async create(tx: Tx, args: { id: string; organizationId: string; accountId: string; categoryId?: string | null; transferId?: string | null; transactionDate: number; transactionTime?: string; postedDate?: number | null; description: string; merchantName?: string | null; counterparty?: string | null; amountMinor: number; currencyCode: string; reportingAmountMinor?: number | null; reportingCurrencyCode?: string | null; fxRate?: string | null; fxRateSource?: string | null; type?: string; status?: string; reviewReason?: string | null; fingerprint?: string; rawData?: Record<string, unknown> }) {
        requireOrganizationAccess(args.organizationId)
        const now = Date.now()
        await tx.mutate.fin_movements.insert({
          transferId: null,
          categoryId: null,
          transactionTime: '00:00:00',
          postedDate: null,
          merchantName: null,
          counterparty: null,
          reportingAmountMinor: args.amountMinor,
          reportingCurrencyCode: args.currencyCode,
          fxRate: null,
          fxRateSource: null,
          type: 'expense',
          status: 'reviewed',
          reviewReason: null,
          fingerprint: `manual:${args.id}`,
          rawData: { source: 'manual' },
          ...args,
          createdAt: now,
          updatedAt: now,
        })
      },
      async update(tx: Tx, args: { id: string; accountId?: string; categoryId?: string | null; transferId?: string | null; transactionDate?: number; transactionTime?: string; postedDate?: number | null; description?: string; merchantName?: string | null; counterparty?: string | null; amountMinor?: number; currencyCode?: string; reportingAmountMinor?: number | null; reportingCurrencyCode?: string | null; fxRate?: string | null; fxRateSource?: string | null; type?: string; status?: string; reviewReason?: string | null; fingerprint?: string }) {
        await requireExistingOrganizationAccess(tx, 'fin_movements', args.id)
        const { id, ...updates } = args
        await tx.mutate.fin_movements.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'fin_movements', args.id)
        const rows = await tx.dbTransaction.query('select "transfer_id" as transfer_id from "fin_movements" where "id" = $1 limit 1', [args.id])
        const transferId = Array.from(rows)[0]?.transfer_id as string | null | undefined
        await tx.dbTransaction.query('update "fin_categorization_rules" set "created_from_movement_id" = null, "updated_at" = now() where "created_from_movement_id" = $1', [args.id])
        if (transferId) {
          await tx.dbTransaction.query('update "fin_movements" set "transfer_id" = null, "updated_at" = now() where "transfer_id" = $1 and "id" <> $2', [transferId, args.id])
        }
        await tx.mutate.fin_movements.delete({ id: args.id })
      },
    },

    fin_import_items: {
      async update(tx: Tx, args: { id: string; accountId?: string; status?: string; transactionTime?: string; description?: string; merchantName?: string | null; amountMinor?: number; currencyCode?: string; suggestedType?: string | null; suggestedCategoryId?: string | null; suggestedConfidence?: number | null; duplicateMovementId?: string | null; fingerprint?: string; rawData?: Record<string, unknown>; errorMessage?: string | null }) {
        await requireExistingOrganizationAccess(tx, 'fin_import_items', args.id)
        const { id, ...updates } = args
        await tx.mutate.fin_import_items.update({ id, ...updates, updatedAt: Date.now() })
      },
    },

    fin_transfers: {
      async create(tx: Tx, args: { id: string; organizationId: string; status?: string; fromAccountId?: string | null; toAccountId?: string | null; amountMinor?: number | null; currencyCode?: string | null; matchedConfidence?: number | null }) {
        requireOrganizationAccess(args.organizationId)
        const now = Date.now()
        await tx.mutate.fin_transfers.insert({
          status: 'confirmed',
          fromAccountId: null,
          toAccountId: null,
          amountMinor: null,
          currencyCode: null,
          matchedConfidence: null,
          ...args,
          createdAt: now,
          updatedAt: now,
        })
      },
      async update(tx: Tx, args: { id: string; status?: string; fromAccountId?: string | null; toAccountId?: string | null; amountMinor?: number | null; currencyCode?: string | null; matchedConfidence?: number | null }) {
        await requireExistingOrganizationAccess(tx, 'fin_transfers', args.id)
        const { id, ...updates } = args
        await tx.mutate.fin_transfers.update({ id, ...updates, updatedAt: Date.now() })
      },
    },

    fin_categorization_rules: {
      async create(tx: Tx, args: { id: string; organizationId: string; accountId?: string; categoryId?: string; type?: string; matchKind?: string; matchValue: string; amountMinor?: number; currencyCode?: string; confidence?: number; autoApply?: boolean; createdFromMovementId?: string }) {
        requireOrganizationAccess(args.organizationId)
        const now = Date.now()
        await tx.mutate.fin_categorization_rules.insert({
          type: 'expense',
          matchKind: 'contains',
          confidence: 90,
          autoApply: true,
          ...args,
          createdAt: now,
          updatedAt: now,
        })
      },
      async update(tx: Tx, args: { id: string; accountId?: string | null; categoryId?: string | null; type?: string; matchKind?: string; matchValue?: string; amountMinor?: number | null; currencyCode?: string | null; confidence?: number; autoApply?: boolean }) {
        await requireExistingOrganizationAccess(tx, 'fin_categorization_rules', args.id)
        const { id, ...updates } = args
        await tx.mutate.fin_categorization_rules.update({ id, ...updates, updatedAt: Date.now() })
      },
    },

    fin_balance_snapshots: {
      async create(tx: Tx, args: { id: string; organizationId: string; accountId: string; asOfDate: number; balanceMinor: number; currencyCode: string; source?: string; importId?: string }) {
        requireOrganizationAccess(args.organizationId)
        await tx.mutate.fin_balance_snapshots.insert({ source: 'manual', ...args, createdAt: Date.now() })
      },
    },

    documents: {
      async create(tx: Tx, args: { id: string; organizationId?: string; parentId?: string; ownerId?: string; publicId?: string; currentSnapshotId?: string; title: string; slug: string; body?: string; format?: string; status?: string; icon?: string; sortOrder?: number; metadata?: any }) {
        requireOrganizationAccess(args.organizationId)
        if (args.parentId) await requireExistingOrganizationAccess(tx, 'documents', args.parentId)
        const now = Date.now()
        const publicId = args.publicId ?? await nextDocumentPublicId(tx, args.organizationId)
        await tx.mutate.documents.insert({
          body: '',
          format: 'markdown',
          status: 'active',
          sortOrder: 0,
          metadata: {},
          ...args,
          publicId,
          ownerId: args.ownerId ?? authData?.sub,
          createdAt: now,
          updatedAt: now,
        })
      },
      async update(tx: Tx, args: { id: string; organizationId?: string | null; parentId?: string | null; ownerId?: string | null; publicId?: string | null; currentSnapshotId?: string | null; title?: string; slug?: string; body?: string; format?: string; status?: string; icon?: string | null; sortOrder?: number; metadata?: any }) {
        await requireExistingOrganizationAccess(tx, 'documents', args.id)
        if ('organizationId' in args) requireOrganizationAccess(args.organizationId)
        if (args.parentId) await requireExistingOrganizationAccess(tx, 'documents', args.parentId)
        const { id, ...updates } = args
        await tx.mutate.documents.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'documents', args.id)
        await tx.mutate.documents.delete({ id: args.id })
      },
    },

    document_snapshots: {
      async create(tx: Tx, args: { id: string; documentId: string; organizationId?: string; versionNumber: number; title: string; slug: string; body?: string; format?: string; status?: string; createdByType?: string; createdById?: string; agentRunId?: string; metadata?: any; setCurrent?: boolean }) {
        const documentOrganizationId = await readOrganizationId(tx, 'documents', args.documentId)
        requireOrganizationAccess(documentOrganizationId)
        if (args.organizationId && args.organizationId !== documentOrganizationId) throw new AuthorizationError()
        const now = Date.now()
        const { setCurrent, organizationId: _organizationId, ...snapshot } = args
        await tx.mutate.document_snapshots.insert({
          body: '',
          format: 'markdown',
          status: 'version',
          createdByType: 'user',
          metadata: {},
          ...snapshot,
          organizationId: documentOrganizationId ?? undefined,
          createdById: args.createdById ?? authData?.sub,
          createdAt: now,
        })
        if (setCurrent) await tx.mutate.documents.update({ id: args.documentId, currentSnapshotId: args.id, updatedAt: now })
      },
      async update(tx: Tx, args: { id: string; documentId?: string; status?: string; metadata?: any; applyToDocument?: boolean; title?: string; slug?: string; body?: string; format?: string }) {
        await requireExistingOrganizationAccess(tx, 'document_snapshots', args.id)
        if (args.applyToDocument && args.documentId) await requireExistingOrganizationAccess(tx, 'documents', args.documentId)
        const { id, documentId, applyToDocument, title, slug, body, format, ...updates } = args
        await tx.mutate.document_snapshots.update({
          id,
          ...updates,
          ...(title != null ? { title } : {}),
          ...(slug != null ? { slug } : {}),
          ...(body != null ? { body } : {}),
          ...(format != null ? { format } : {}),
        })
        if (applyToDocument && documentId) {
          await tx.mutate.documents.update({
            id: documentId,
            ...(title != null ? { title } : {}),
            ...(slug != null ? { slug } : {}),
            ...(body != null ? { body } : {}),
            ...(format != null ? { format } : {}),
            currentSnapshotId: id,
            updatedAt: Date.now(),
          })
        }
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'document_snapshots', args.id)
        const currentRows = await tx.dbTransaction.query(
          'select "id" from "documents" where "current_snapshot_id" = $1 limit 1',
          [args.id],
        )
        if (Array.from(currentRows).length > 0) throw new Error('main version cannot be deleted')
        await tx.mutate.document_snapshots.delete({ id: args.id })
      },
    },

    mkt_sender_profiles: {
      async create(tx: Tx, args: any) {
        requireOrganizationAccess(args.organizationId)
        const now = Date.now()
        await tx.mutate.mkt_sender_profiles.insert({ provider: 'resend', status: 'active', metadata: {}, ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: any) {
        await requireExistingOrganizationAccess(tx, 'mkt_sender_profiles', args.id)
        if ('organizationId' in args) requireOrganizationAccess(args.organizationId)
        const { id, ...updates } = args
        await tx.mutate.mkt_sender_profiles.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'mkt_sender_profiles', args.id)
        await tx.mutate.mkt_sender_profiles.delete({ id: args.id })
      },
    },

    mkt_publications: {
      async create(tx: Tx, args: any) {
        requireOrganizationAccess(args.organizationId)
        const now = Date.now()
        await tx.mutate.mkt_publications.insert({ type: 'newsletter', status: 'active', editorialProfile: {}, metadata: {}, ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: any) {
        await requireExistingOrganizationAccess(tx, 'mkt_publications', args.id)
        if ('organizationId' in args) requireOrganizationAccess(args.organizationId)
        const { id, ...updates } = args
        await tx.mutate.mkt_publications.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'mkt_publications', args.id)
        await tx.mutate.mkt_publications.delete({ id: args.id })
      },
    },

    mkt_ctas: {
      async create(tx: Tx, args: any) {
        requireOrganizationAccess(args.organizationId)
        const now = Date.now()
        await tx.mutate.mkt_ctas.insert({ status: 'active', metadata: {}, ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: any) {
        await requireExistingOrganizationAccess(tx, 'mkt_ctas', args.id)
        if ('organizationId' in args) requireOrganizationAccess(args.organizationId)
        const { id, ...updates } = args
        await tx.mutate.mkt_ctas.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'mkt_ctas', args.id)
        await tx.mutate.mkt_ctas.delete({ id: args.id })
      },
    },

    mkt_content_items: {
      async create(tx: Tx, args: any) {
        requireOrganizationAccess(args.organizationId)
        const now = Date.now()
        await tx.mutate.mkt_content_items.insert({
          contentKind: 'article',
          supportedChannels: ['blog', 'newsletter'],
          status: 'draft',
          body: '',
          format: 'markdown',
          tags: [],
          metadata: {},
          ...args,
          createdAt: now,
          updatedAt: now,
        })
      },
      async update(tx: Tx, args: any) {
        await requireExistingOrganizationAccess(tx, 'mkt_content_items', args.id)
        if ('organizationId' in args) requireOrganizationAccess(args.organizationId)
        const { id, ...updates } = args
        await tx.mutate.mkt_content_items.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'mkt_content_items', args.id)
        await tx.mutate.mkt_content_items.delete({ id: args.id })
      },
    },

    mkt_editorial_ideas: {
      async create(tx: Tx, args: any) {
        requireOrganizationAccess(args.organizationId)
        await requireExistingOrganizationAccess(tx, 'mkt_publications', args.publicationId)
        if (args.documentId) await requireExistingOrganizationAccess(tx, 'documents', args.documentId)
        if (args.contentItemId) await requireExistingOrganizationAccess(tx, 'mkt_content_items', args.contentItemId)
        const now = Date.now()
        await tx.mutate.mkt_editorial_ideas.insert({
          status: 'available',
          priority: 0,
          metadata: {},
          ...args,
          createdAt: now,
          updatedAt: now,
        })
      },
      async update(tx: Tx, args: any) {
        await requireExistingOrganizationAccess(tx, 'mkt_editorial_ideas', args.id)
        if ('organizationId' in args) requireOrganizationAccess(args.organizationId)
        if (args.publicationId) await requireExistingOrganizationAccess(tx, 'mkt_publications', args.publicationId)
        if (args.documentId) await requireExistingOrganizationAccess(tx, 'documents', args.documentId)
        if (args.contentItemId) await requireExistingOrganizationAccess(tx, 'mkt_content_items', args.contentItemId)
        const { id, ...updates } = args
        await tx.mutate.mkt_editorial_ideas.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'mkt_editorial_ideas', args.id)
        await tx.mutate.mkt_editorial_ideas.delete({ id: args.id })
      },
    },

    mkt_audience_members: {
      async create(tx: Tx, args: any) {
        requireOrganizationAccess(args.organizationId)
        const now = Date.now()
        await tx.mutate.mkt_audience_members.insert({ status: 'active', tags: [], metadata: {}, ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: any) {
        await requireExistingOrganizationAccess(tx, 'mkt_audience_members', args.id)
        if ('organizationId' in args) requireOrganizationAccess(args.organizationId)
        const { id, ...updates } = args
        await tx.mutate.mkt_audience_members.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'mkt_audience_members', args.id)
        await tx.mutate.mkt_audience_members.delete({ id: args.id })
      },
    },

    mkt_audience_subscriptions: {
      async create(tx: Tx, args: any) {
        requireOrganizationAccess(args.organizationId)
        const now = Date.now()
        await tx.mutate.mkt_audience_subscriptions.insert({ channel: 'newsletter', status: 'subscribed', metadata: {}, ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: any) {
        await requireExistingOrganizationAccess(tx, 'mkt_audience_subscriptions', args.id)
        if ('organizationId' in args) requireOrganizationAccess(args.organizationId)
        const { id, ...updates } = args
        await tx.mutate.mkt_audience_subscriptions.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'mkt_audience_subscriptions', args.id)
        await tx.mutate.mkt_audience_subscriptions.delete({ id: args.id })
      },
    },

    mkt_segments: {
      async create(tx: Tx, args: any) {
        requireOrganizationAccess(args.organizationId)
        const now = Date.now()
        await tx.mutate.mkt_segments.insert({ kind: 'manual', rules: {}, status: 'active', metadata: {}, ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: any) {
        await requireExistingOrganizationAccess(tx, 'mkt_segments', args.id)
        if ('organizationId' in args) requireOrganizationAccess(args.organizationId)
        const { id, ...updates } = args
        await tx.mutate.mkt_segments.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'mkt_segments', args.id)
        await tx.mutate.mkt_segments.delete({ id: args.id })
      },
    },

    mkt_segment_members: {
      async create(tx: Tx, args: any) {
        requireOrganizationAccess(args.organizationId)
        await tx.mutate.mkt_segment_members.insert({ ...args, createdAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'mkt_segment_members', args.id)
        await tx.mutate.mkt_segment_members.delete({ id: args.id })
      },
    },

    mkt_distribution_runs: {
      async create(tx: Tx, args: any) {
        requireOrganizationAccess(args.organizationId)
        const now = Date.now()
        await tx.mutate.mkt_distribution_runs.insert({
          distributionType: 'broadcast',
          status: 'draft',
          scheduledTimezone: 'America/Mexico_City',
          recipientFilter: {},
          metrics: {},
          metadata: {},
          ...args,
          createdAt: now,
          updatedAt: now,
        })
      },
      async update(tx: Tx, args: any) {
        await requireExistingOrganizationAccess(tx, 'mkt_distribution_runs', args.id)
        if ('organizationId' in args) requireOrganizationAccess(args.organizationId)
        const { id, ...updates } = args
        await tx.mutate.mkt_distribution_runs.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'mkt_distribution_runs', args.id)
        const rows = await tx.dbTransaction.query(
          'select "status" as status from "mkt_distribution_runs" where "id" = $1 limit 1',
          [args.id],
        )
        const run = Array.from(rows)[0]
        if (run?.status !== 'draft') throw new Error('Only draft broadcasts can be deleted')

        const eventRows = await tx.dbTransaction.query(
          'select "id" as id from "mkt_content_events" where "distribution_run_id" = $1',
          [args.id],
        )
        for (const event of Array.from(eventRows)) {
          await tx.mutate.mkt_content_events.delete({ id: event.id as string })
        }
        await tx.mutate.mkt_distribution_runs.delete({ id: args.id })
      },
    },

    mkt_publication_slots: {
      async create(tx: Tx, args: any) {
        requireOrganizationAccess(args.organizationId)
        await requireExistingOrganizationAccess(tx, 'mkt_publications', args.publicationId)
        if (args.ideaId) await requireExistingOrganizationAccess(tx, 'mkt_editorial_ideas', args.ideaId)
        if (args.documentId) await requireExistingOrganizationAccess(tx, 'documents', args.documentId)
        if (args.contentItemId) await requireExistingOrganizationAccess(tx, 'mkt_content_items', args.contentItemId)
        if (args.distributionRunId) await requireExistingOrganizationAccess(tx, 'mkt_distribution_runs', args.distributionRunId)
        const now = Date.now()
        await tx.mutate.mkt_publication_slots.insert({
          status: 'planned',
          scheduledTimezone: 'America/Mexico_City',
          metadata: {},
          ...args,
          createdAt: now,
          updatedAt: now,
        })
      },
      async update(tx: Tx, args: any) {
        await requireExistingOrganizationAccess(tx, 'mkt_publication_slots', args.id)
        if ('organizationId' in args) requireOrganizationAccess(args.organizationId)
        if (args.publicationId) await requireExistingOrganizationAccess(tx, 'mkt_publications', args.publicationId)
        if (args.ideaId) await requireExistingOrganizationAccess(tx, 'mkt_editorial_ideas', args.ideaId)
        if (args.documentId) await requireExistingOrganizationAccess(tx, 'documents', args.documentId)
        if (args.contentItemId) await requireExistingOrganizationAccess(tx, 'mkt_content_items', args.contentItemId)
        if (args.distributionRunId) await requireExistingOrganizationAccess(tx, 'mkt_distribution_runs', args.distributionRunId)
        const { id, ...updates } = args
        await tx.mutate.mkt_publication_slots.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'mkt_publication_slots', args.id)
        await tx.mutate.mkt_publication_slots.delete({ id: args.id })
      },
    },

    mkt_content_events: {
      async create(tx: Tx, args: any) {
        requireOrganizationAccess(args.organizationId)
        await tx.mutate.mkt_content_events.insert({ metadata: {}, ...args, createdAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'mkt_content_events', args.id)
        await tx.mutate.mkt_content_events.delete({ id: args.id })
      },
    },

    mkt_publication_consumers: {
      async create(tx: Tx, args: any) {
        requireOrganizationAccess(args.organizationId)
        if (args.publicationId) await requireExistingOrganizationAccess(tx, 'mkt_publications', args.publicationId)
        const now = Date.now()
        await tx.mutate.mkt_publication_consumers.insert({ kind: 'blog', status: 'active', metadata: {}, ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: any) {
        await requireExistingOrganizationAccess(tx, 'mkt_publication_consumers', args.id)
        if ('organizationId' in args) requireOrganizationAccess(args.organizationId)
        if (args.publicationId) await requireExistingOrganizationAccess(tx, 'mkt_publications', args.publicationId)
        const { id, ...updates } = args
        await tx.mutate.mkt_publication_consumers.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'mkt_publication_consumers', args.id)
        await tx.mutate.mkt_publication_consumers.delete({ id: args.id })
      },
    },

    mkt_content_outputs: {
      async create(tx: Tx, args: any) {
        requireOrganizationAccess(args.organizationId)
        await requireExistingOrganizationAccess(tx, 'mkt_content_items', args.contentItemId)
        if (args.consumerId) await requireExistingOrganizationAccess(tx, 'mkt_publication_consumers', args.consumerId)
        if (args.distributionRunId) await requireExistingOrganizationAccess(tx, 'mkt_distribution_runs', args.distributionRunId)
        const now = Date.now()
        await tx.mutate.mkt_content_outputs.insert({ channel: 'blog', status: 'draft', metadata: {}, ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: any) {
        await requireExistingOrganizationAccess(tx, 'mkt_content_outputs', args.id)
        if ('organizationId' in args) requireOrganizationAccess(args.organizationId)
        if (args.contentItemId) await requireExistingOrganizationAccess(tx, 'mkt_content_items', args.contentItemId)
        if (args.consumerId) await requireExistingOrganizationAccess(tx, 'mkt_publication_consumers', args.consumerId)
        if (args.distributionRunId) await requireExistingOrganizationAccess(tx, 'mkt_distribution_runs', args.distributionRunId)
        const { id, ...updates } = args
        await tx.mutate.mkt_content_outputs.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'mkt_content_outputs', args.id)
        await tx.mutate.mkt_content_outputs.delete({ id: args.id })
      },
    },

    social_connections: {
      async update(tx: Tx, args: any) {
        await requireExistingOrganizationAccess(tx, 'social_connections', args.id)
        if ('organizationId' in args) requireOrganizationAccess(args.organizationId)
        if (args.providerAppId) await requireExistingOrganizationAccess(tx, 'social_provider_apps', args.providerAppId)
        const { id, ...updates } = args
        await tx.mutate.social_connections.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'social_connections', args.id)
        await tx.mutate.social_connections.delete({ id: args.id })
      },
    },

    social_channels: {
      async create(tx: Tx, args: any) {
        requireOrganizationAccess(args.organizationId)
        const now = Date.now()
        await tx.mutate.social_channels.insert({ provider: 'linkedin', kind: 'organization', status: 'active', metadata: {}, ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: any) {
        await requireExistingOrganizationAccess(tx, 'social_channels', args.id)
        if ('organizationId' in args) requireOrganizationAccess(args.organizationId)
        const { id, ...updates } = args
        await tx.mutate.social_channels.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'social_channels', args.id)
        await tx.mutate.social_channels.delete({ id: args.id })
      },
    },

    social_channel_connections: {
      async create(tx: Tx, args: any) {
        requireOrganizationAccess(args.organizationId)
        await requireExistingOrganizationAccess(tx, 'social_channels', args.channelId)
        await requireExistingOrganizationAccess(tx, 'social_connections', args.connectionId)
        const now = Date.now()
        await tx.mutate.social_channel_connections.insert({ capabilities: [], status: 'active', metadata: {}, ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: any) {
        await requireExistingOrganizationAccess(tx, 'social_channel_connections', args.id)
        if ('organizationId' in args) requireOrganizationAccess(args.organizationId)
        if (args.channelId) await requireExistingOrganizationAccess(tx, 'social_channels', args.channelId)
        if (args.connectionId) await requireExistingOrganizationAccess(tx, 'social_connections', args.connectionId)
        const { id, ...updates } = args
        await tx.mutate.social_channel_connections.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'social_channel_connections', args.id)
        await tx.mutate.social_channel_connections.delete({ id: args.id })
      },
    },

    social_posts: {
      async create(tx: Tx, args: any) {
        requireOrganizationAccess(args.organizationId)
        if (args.contentItemId) await requireExistingOrganizationAccess(tx, 'mkt_content_items', args.contentItemId)
        if (args.contentOutputId) await requireExistingOrganizationAccess(tx, 'mkt_content_outputs', args.contentOutputId)
        const now = Date.now()
        await tx.mutate.social_posts.insert({ caption: '', status: 'draft', metadata: {}, ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: any) {
        await requireExistingOrganizationAccess(tx, 'social_posts', args.id)
        if ('organizationId' in args) requireOrganizationAccess(args.organizationId)
        if (args.contentItemId) await requireExistingOrganizationAccess(tx, 'mkt_content_items', args.contentItemId)
        if (args.contentOutputId) await requireExistingOrganizationAccess(tx, 'mkt_content_outputs', args.contentOutputId)
        const { id, ...updates } = args
        await tx.mutate.social_posts.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'social_posts', args.id)
        await tx.mutate.social_posts.delete({ id: args.id })
      },
    },

    social_post_targets: {
      async create(tx: Tx, args: any) {
        requireOrganizationAccess(args.organizationId)
        await requireExistingOrganizationAccess(tx, 'social_posts', args.socialPostId)
        await requireExistingOrganizationAccess(tx, 'social_channels', args.channelId)
        if (args.connectionId) await requireExistingOrganizationAccess(tx, 'social_connections', args.connectionId)
        const now = Date.now()
        await tx.mutate.social_post_targets.insert({
          status: 'draft',
          scheduledTimezone: 'America/Mexico_City',
          attemptCount: 0,
          metadata: {},
          ...args,
          createdAt: now,
          updatedAt: now,
        })
      },
      async update(tx: Tx, args: any) {
        await requireExistingOrganizationAccess(tx, 'social_post_targets', args.id)
        if ('organizationId' in args) requireOrganizationAccess(args.organizationId)
        if (args.socialPostId) await requireExistingOrganizationAccess(tx, 'social_posts', args.socialPostId)
        if (args.channelId) await requireExistingOrganizationAccess(tx, 'social_channels', args.channelId)
        if (args.connectionId) await requireExistingOrganizationAccess(tx, 'social_connections', args.connectionId)
        const { id, ...updates } = args
        await tx.mutate.social_post_targets.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'social_post_targets', args.id)
        await tx.mutate.social_post_targets.delete({ id: args.id })
      },
    },

    mkt_ad_promotions: {
      async create(tx: Tx, args: any) {
        requireOrganizationAccess(args.organizationId)
        await requireExistingOrganizationAccess(tx, 'mkt_content_items', args.contentItemId)
        if (args.contentOutputId) await requireExistingOrganizationAccess(tx, 'mkt_content_outputs', args.contentOutputId)
        if (args.socialPostId) await requireExistingOrganizationAccess(tx, 'social_posts', args.socialPostId)
        if (args.socialPostTargetId) await requireExistingOrganizationAccess(tx, 'social_post_targets', args.socialPostTargetId)
        const now = Date.now()
        await tx.mutate.mkt_ad_promotions.insert({
          provider: 'linkedin',
          objective: 'website_visits',
          status: 'draft',
          currencyCode: 'MXN',
          targeting: {},
          creative: {},
          metadata: {},
          ...args,
          createdAt: now,
          updatedAt: now,
        })
      },
      async update(tx: Tx, args: any) {
        await requireExistingOrganizationAccess(tx, 'mkt_ad_promotions', args.id)
        if ('organizationId' in args) requireOrganizationAccess(args.organizationId)
        if (args.contentItemId) await requireExistingOrganizationAccess(tx, 'mkt_content_items', args.contentItemId)
        if (args.contentOutputId) await requireExistingOrganizationAccess(tx, 'mkt_content_outputs', args.contentOutputId)
        if (args.socialPostId) await requireExistingOrganizationAccess(tx, 'social_posts', args.socialPostId)
        if (args.socialPostTargetId) await requireExistingOrganizationAccess(tx, 'social_post_targets', args.socialPostTargetId)
        const { id, ...updates } = args
        await tx.mutate.mkt_ad_promotions.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'mkt_ad_promotions', args.id)
        await tx.mutate.mkt_ad_promotions.delete({ id: args.id })
      },
    },

    mkt_ad_metric_snapshots: {
      async create(tx: Tx, args: any) {
        requireOrganizationAccess(args.organizationId)
        if (args.promotionId) await requireExistingOrganizationAccess(tx, 'mkt_ad_promotions', args.promotionId)
        const now = Date.now()
        await tx.mutate.mkt_ad_metric_snapshots.insert({
          provider: 'linkedin',
          entityKind: 'promotion',
          granularity: 'daily',
          impressions: 0,
          clicks: 0,
          reactions: 0,
          comments: 0,
          shares: 0,
          follows: 0,
          leads: 0,
          conversions: 0,
          spendMinor: 0,
          currencyCode: 'MXN',
          rawMetrics: {},
          fetchedAt: now,
          createdAt: now,
          ...args,
        })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'mkt_ad_metric_snapshots', args.id)
        await tx.mutate.mkt_ad_metric_snapshots.delete({ id: args.id })
      },
    },

    pm_teams: {
      async create(tx: Tx, args: { id: string; companyId?: string; key: string; name: string; description?: string; color?: string; icon?: string; position?: number }) {
        requireOrganizationAccess(args.companyId)
        const now = Date.now()
        await tx.mutate.pm_teams.insert({ position: 0, ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: { id: string; key?: string; name?: string; description?: string; color?: string; icon?: string; position?: number }) {
        await requireExistingOrganizationAccess(tx, 'pm_teams', args.id)
        const { id, ...updates } = args
        await tx.mutate.pm_teams.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: {
        id: string
        targetTeamId: string
        issueReassignments?: Array<{ id: string; number: number; identifier: string }>
        projectIds?: string[]
        statusIds?: string[]
        labelIds?: string[]
        savedViewIds?: string[]
        taskTriggerIds?: string[]
      }) {
        if (args.targetTeamId === args.id) throw new Error('Target team must be different')
        await requireExistingOrganizationAccess(tx, 'pm_teams', args.id)
        await requireExistingOrganizationAccess(tx, 'pm_teams', args.targetTeamId)
        await tx.dbTransaction.query(
          `with target as (
            select
              "key",
              coalesce((select max("number") from "pm_issues" where "team_id" = $2), 0) as base_number
            from "pm_teams"
            where "id" = $2
          ),
          moved as (
            select
              "id",
              row_number() over (order by "number", "created_at", "id") as move_index
            from "pm_issues"
            where "team_id" = $1
          )
          update "pm_issues"
          set
            "team_id" = $2,
            "project_id" = null,
            "number" = (target.base_number + moved.move_index)::integer,
            "identifier" = target."key" || '-' || (target.base_number + moved.move_index)::text,
            "last_activity_at" = now(),
            "updated_at" = now()
          from moved, target
          where "pm_issues"."id" = moved."id"`,
          [args.id, args.targetTeamId],
        )
        await tx.dbTransaction.query('update "pm_projects" set "team_id" = null, "updated_at" = now() where "team_id" = $1', [args.id])
        await tx.dbTransaction.query('update "pm_statuses" set "team_id" = null, "updated_at" = now() where "team_id" = $1', [args.id])
        await tx.dbTransaction.query('update "pm_labels" set "team_id" = null, "updated_at" = now() where "team_id" = $1', [args.id])
        await tx.dbTransaction.query('update "pm_saved_views" set "team_id" = null, "updated_at" = now() where "team_id" = $1', [args.id])
        await tx.dbTransaction.query(
          'update "pm_task_triggers" set "team_id" = $2, "project_id" = null, "updated_at" = now() where "team_id" = $1',
          [args.id, args.targetTeamId],
        )
        await tx.mutate.pm_teams.delete({ id: args.id })
      },
    },

    pm_projects: {
      async create(tx: Tx, args: { id: string; companyId?: string; teamId?: string; name: string; slug: string; description?: string; color?: string; icon?: string; status?: string; targetDate?: number }) {
        requireOrganizationAccess(args.companyId)
        const now = Date.now()
        await tx.mutate.pm_projects.insert({ status: 'active', ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: { id: string; companyId?: string | null; teamId?: string | null; name?: string; slug?: string; description?: string; color?: string; icon?: string; status?: string; targetDate?: number | null }) {
        await requireExistingOrganizationAccess(tx, 'pm_projects', args.id)
        if ('companyId' in args) requireOrganizationAccess(args.companyId)
        const { id, ...updates } = args
        await tx.mutate.pm_projects.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'pm_projects', args.id)
        await tx.mutate.pm_projects.delete({ id: args.id })
      },
    },

    pm_statuses: {
      async create(tx: Tx, args: { id: string; companyId?: string; teamId?: string; name: string; key: string; type?: string; description?: string; color?: string; position?: number }) {
        requireOrganizationAccess(args.companyId)
        const now = Date.now()
        await tx.mutate.pm_statuses.insert({ type: 'unstarted', position: 0, ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: { id: string; name?: string; key?: string; type?: string; description?: string; color?: string; position?: number; teamId?: string | null }) {
        await requireExistingOrganizationAccess(tx, 'pm_statuses', args.id)
        const { id, ...updates } = args
        await tx.mutate.pm_statuses.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'pm_statuses', args.id)
        await tx.mutate.pm_statuses.delete({ id: args.id })
      },
    },

    pm_labels: {
      async create(tx: Tx, args: { id: string; companyId?: string; teamId?: string; name: string; color?: string; description?: string }) {
        requireOrganizationAccess(args.companyId)
        const now = Date.now()
        await tx.mutate.pm_labels.insert({ ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: { id: string; companyId?: string | null; teamId?: string | null; name?: string; color?: string; description?: string }) {
        await requireExistingOrganizationAccess(tx, 'pm_labels', args.id)
        if ('companyId' in args) requireOrganizationAccess(args.companyId)
        const { id, ...updates } = args
        await tx.mutate.pm_labels.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'pm_labels', args.id)
        await tx.mutate.pm_labels.delete({ id: args.id })
      },
    },

    pm_issues: {
      async create(tx: Tx, args: { id: string; contextCompanyId?: string; teamId: string; projectId?: string; statusId: string; assigneeId?: string; creatorId?: string; identifier: string; number: number; title: string; description?: string; priority?: number; estimate?: number; sortOrder?: number; dueDate?: number; startedAt?: number; completedAt?: number; canceledAt?: number; blockedReason?: string }) {
        requireOrganizationAccess(args.contextCompanyId)
        const now = Date.now()
        await tx.mutate.pm_issues.insert({
          priority: 0,
          sortOrder: 0,
          ...args,
          lastActivityAt: now,
          createdAt: now,
          updatedAt: now,
        })
      },
      async update(tx: Tx, args: { id: string; contextCompanyId?: string | null; teamId?: string; projectId?: string | null; statusId?: string; assigneeId?: string | null; identifier?: string; number?: number; title?: string; description?: string; priority?: number; estimate?: number | null; sortOrder?: number; dueDate?: number | null; startedAt?: number | null; completedAt?: number | null; canceledAt?: number | null; blockedReason?: string | null }) {
        await requireExistingOrganizationAccess(tx, 'pm_issues', args.id)
        if ('contextCompanyId' in args) requireOrganizationAccess(args.contextCompanyId)
        const { id, ...updates } = args
        const now = Date.now()
        await tx.mutate.pm_issues.update({ id, ...updates, lastActivityAt: now, updatedAt: now })
      },
      async reorder(tx: Tx, args: { activeIssueId: string; updates: Array<{ id: string; sortOrder: number; priority?: number; statusId?: string; startedAt?: number; completedAt?: number; canceledAt?: number }> }) {
        for (const update of args.updates) {
          await requireExistingOrganizationAccess(tx, 'pm_issues', update.id)
        }

        const now = Date.now()
        for (const update of args.updates) {
          const { id, ...updates } = update
          if (id === args.activeIssueId) {
            await tx.mutate.pm_issues.update({ id, ...updates, lastActivityAt: now, updatedAt: now })
          } else {
            await tx.mutate.pm_issues.update({ id, sortOrder: update.sortOrder })
          }
        }
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'pm_issues', args.id)
        await tx.mutate.pm_issues.delete({ id: args.id })
      },
    },

    pm_issue_labels: {
      async create(tx: Tx, args: { id: string; issueId: string; labelId: string }) {
        requireUnscopedAccess()
        await tx.mutate.pm_issue_labels.insert({ ...args, createdAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        requireUnscopedAccess()
        await tx.mutate.pm_issue_labels.delete({ id: args.id })
      },
    },

    pm_issue_activity: {
      async create(tx: Tx, args: { id: string; issueId: string; actorId?: string; actorName?: string; type: string; summary: string; metadata?: Record<string, unknown> }) {
        const issueContext = await readIssueActivityContext(tx, args.issueId)
        if (issueContext.issueOrganizationId) requireOrganizationAccess(issueContext.issueOrganizationId)
        else requireUnscopedAccess()
        if (!issueContext.activityOrganizationId) throw new Error('No organization available for issue activity')
        const now = Date.now()
        await tx.mutate.activity_events.insert({
          id: args.id,
          organizationId: issueContext.activityOrganizationId,
          occurredAt: now,
          createdAt: now,
          eventType: args.type,
          activityKind: issueActivityKind(args.type, args.metadata),
          origin: 'pach_work',
          subjectType: 'pm_issue',
          subjectId: args.issueId,
          subjectLabel: issueContext.identifier ?? undefined,
          actorType: args.actorId ? 'user' : (args.actorName?.toLowerCase().includes('agent') ? 'agent' : 'system'),
          actorId: args.actorId,
          actorName: args.actorName,
          source: 'pach_app',
          severity: args.type === 'agent_run_failed' || args.metadata?.level === 'error'
            ? 'error'
            : args.metadata?.level === 'warn' || args.metadata?.level === 'warning'
              ? 'warning'
              : args.metadata?.level === 'debug'
                ? 'debug'
                : 'info',
          summary: args.summary,
          details: {},
          metadata: args.metadata ?? {},
        } as any)
        await tx.mutate.pm_issues.update({ id: args.issueId, lastActivityAt: now, updatedAt: now })
      },
    },

    pm_saved_views: {
      async create(tx: Tx, args: { id: string; companyId?: string; teamId?: string; ownerId?: string; name: string; slug: string; icon?: string; color?: string; scope?: string; filters?: Record<string, unknown>; display?: Record<string, unknown>; position?: number }) {
        requireSavedViewMutationAccess(args)
        const now = Date.now()
        await tx.mutate.pm_saved_views.insert({
          scope: 'personal',
          filters: {},
          display: {},
          position: 0,
          ...args,
          createdAt: now,
          updatedAt: now,
        })
      },
      async update(tx: Tx, args: { id: string; companyId?: string | null; teamId?: string | null; ownerId?: string | null; name?: string; slug?: string; icon?: string; color?: string; scope?: string; filters?: Record<string, unknown>; display?: Record<string, unknown>; position?: number }) {
        await requireExistingSavedViewMutationAccess(tx, args.id)
        if ('ownerId' in args && args.ownerId && args.ownerId !== authData?.sub) requireUnscopedAccess()
        if ('companyId' in args && args.companyId) requireOrganizationAccess(args.companyId)
        const { id, ...updates } = args
        await tx.mutate.pm_saved_views.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingSavedViewMutationAccess(tx, args.id)
        await tx.mutate.pm_saved_views.delete({ id: args.id })
      },
    },

    pm_task_triggers: {
      async create(tx: Tx, args: { id: string; name: string; kind?: string; frequency?: string; timezone?: string; schedule?: Record<string, unknown>; enabled?: boolean; nextRunAt: number; lastRunAt?: number; companyId?: string; teamId: string; projectId?: string; statusId: string; assigneeId?: string; creatorId?: string; title: string; description?: string; priority?: number; estimate?: number; metadata?: Record<string, unknown> }) {
        requireOrganizationAccess(args.companyId)
        const now = Date.now()
        await tx.mutate.pm_task_triggers.insert({
          kind: 'recurring',
          timezone: 'America/Mexico_City',
          schedule: {},
          enabled: true,
          priority: 2,
          metadata: {},
          ...args,
          createdAt: now,
          updatedAt: now,
        })
      },
      async update(tx: Tx, args: { id: string; name?: string; kind?: string; frequency?: string | null; timezone?: string; schedule?: Record<string, unknown>; enabled?: boolean; nextRunAt?: number; lastRunAt?: number | null; companyId?: string | null; teamId?: string; projectId?: string | null; statusId?: string; assigneeId?: string | null; creatorId?: string | null; title?: string; description?: string | null; priority?: number; estimate?: number | null; metadata?: Record<string, unknown> }) {
        await requireExistingOrganizationAccess(tx, 'pm_task_triggers', args.id)
        if ('companyId' in args) requireOrganizationAccess(args.companyId)
        const { id, ...updates } = args
        await tx.mutate.pm_task_triggers.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'pm_task_triggers', args.id)
        await tx.mutate.pm_task_triggers.delete({ id: args.id })
      },
    },

    pm_task_trigger_runs: {
      async create(tx: Tx, args: { id: string; triggerId: string; issueId?: string; periodKey: string; status?: string; message?: string; metadata?: Record<string, unknown> }) {
        requireUnscopedAccess()
        await tx.mutate.pm_task_trigger_runs.insert({
          status: 'created',
          metadata: {},
          ...args,
          createdAt: Date.now(),
        })
      },
      async delete(tx: Tx, args: { id: string }) {
        requireUnscopedAccess()
        await tx.mutate.pm_task_trigger_runs.delete({ id: args.id })
      },
    },

    agent_workers: {
      async create(tx: Tx, args: { id: string; name: string; provider?: string; providerServerId?: string; hostname?: string; sshHost: string; sshPort?: number; sshUser?: string; status?: string; statusMessage?: string; lastSeenAt?: number; metadata?: Record<string, unknown> }) {
        requireUnscopedAccess()
        const now = Date.now()
        await tx.mutate.agent_workers.insert({
          provider: 'hetzner',
          sshPort: 22,
          sshUser: 'pach',
          status: 'idle',
          metadata: {},
          ...args,
          createdAt: now,
          updatedAt: now,
        })
      },
      async update(tx: Tx, args: { id: string; name?: string; provider?: string; providerServerId?: string | null; hostname?: string | null; sshHost?: string; sshPort?: number; sshUser?: string; status?: string; statusMessage?: string | null; lastSeenAt?: number | null; metadata?: Record<string, unknown> }) {
        requireUnscopedAccess()
        const { id, ...updates } = args
        await tx.mutate.agent_workers.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        requireUnscopedAccess()
        await tx.mutate.agent_workers.delete({ id: args.id })
      },
    },

    github_repositories: {
      async create(tx: Tx, args: { id: string; connectionId?: string; githubId?: string; nodeId?: string; projectKey: string; owner: string; name: string; fullName: string; defaultBranch?: string; htmlUrl?: string; isPrivate?: boolean; permissions?: Record<string, unknown>; localPathTemplate?: string; active?: boolean; metadata?: Record<string, unknown> }) {
        requireUnscopedAccess()
        const now = Date.now()
        await tx.mutate.github_repositories.insert({
          defaultBranch: 'main',
          isPrivate: false,
          permissions: {},
          active: true,
          metadata: {},
          ...args,
          createdAt: now,
          updatedAt: now,
        })
      },
      async update(tx: Tx, args: { id: string; connectionId?: string | null; githubId?: string | null; nodeId?: string | null; projectKey?: string; owner?: string; name?: string; fullName?: string; defaultBranch?: string; htmlUrl?: string | null; isPrivate?: boolean; permissions?: Record<string, unknown>; localPathTemplate?: string | null; active?: boolean; metadata?: Record<string, unknown> }) {
        requireUnscopedAccess()
        const { id, ...updates } = args
        await tx.mutate.github_repositories.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        requireUnscopedAccess()
        await tx.mutate.github_repositories.delete({ id: args.id })
      },
    },

    agent_conversations: {
      async create(tx: Tx, args: { id: string; issueId?: string; title: string; status?: string; metadata?: Record<string, unknown> }) {
        requireUnscopedAccess()
        const now = Date.now()
        await tx.mutate.agent_conversations.insert({
          status: 'open',
          metadata: {},
          ...args,
          createdAt: now,
          updatedAt: now,
        })
      },
      async update(tx: Tx, args: { id: string; issueId?: string | null; title?: string; status?: string; metadata?: Record<string, unknown> }) {
        requireUnscopedAccess()
        const { id, ...updates } = args
        await tx.mutate.agent_conversations.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        requireUnscopedAccess()
        await tx.mutate.agent_conversations.delete({ id: args.id })
      },
    },

    agent_runs: {
      async create(tx: Tx, args: { id: string; conversationId?: string; parentRunId?: string; issueId?: string; subjectType?: string; subjectId?: string; workerId?: string; repositoryId?: string; projectKey: string; repoFullName: string; baseBranch?: string; branchName: string; workspacePath?: string; tmuxSession?: string; agentKind?: string; status?: string; statusMessage?: string; startedAt?: number; completedAt?: number; metadata?: Record<string, unknown> }) {
        requireUnscopedAccess()
        const now = Date.now()
        await tx.mutate.agent_runs.insert({
          baseBranch: 'main',
          agentKind: 'codex',
          status: 'queued',
          subjectType: args.issueId ? 'issue' : 'generic',
          subjectId: args.issueId,
          metadata: {},
          ...args,
          createdAt: now,
          updatedAt: now,
        })
        if (args.issueId) await tx.mutate.pm_issues.update({ id: args.issueId, lastActivityAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: { id: string; conversationId?: string | null; parentRunId?: string | null; issueId?: string | null; subjectType?: string; subjectId?: string | null; workerId?: string | null; repositoryId?: string | null; projectKey?: string; repoFullName?: string; baseBranch?: string; branchName?: string; workspacePath?: string | null; tmuxSession?: string | null; agentKind?: string; status?: string; statusMessage?: string | null; startedAt?: number | null; completedAt?: number | null; metadata?: Record<string, unknown> }) {
        requireUnscopedAccess()
        const { id, ...updates } = args
        await tx.mutate.agent_runs.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        requireUnscopedAccess()
        await tx.mutate.agent_runs.delete({ id: args.id })
      },
    },

    agent_messages: {
      async create(tx: Tx, args: { id: string; conversationId: string; runId?: string; role: string; body: string; metadata?: Record<string, unknown> }) {
        requireUnscopedAccess()
        await tx.mutate.agent_messages.insert({
          metadata: {},
          ...args,
          createdAt: Date.now(),
        })
      },
      async update(tx: Tx, args: { id: string; runId?: string | null; role?: string; body?: string; metadata?: Record<string, unknown> }) {
        requireUnscopedAccess()
        const { id, ...updates } = args
        await tx.mutate.agent_messages.update({ id, ...updates })
      },
      async delete(tx: Tx, args: { id: string }) {
        requireUnscopedAccess()
        await tx.mutate.agent_messages.delete({ id: args.id })
      },
    },

    agent_terminals: {
      async create(tx: Tx, args: { id: string; runId: string; name: string; role?: string; tmuxWindow: string; status?: string; sortOrder?: number; lastTitle?: string; metadata?: Record<string, unknown> }) {
        requireUnscopedAccess()
        const now = Date.now()
        await tx.mutate.agent_terminals.insert({
          role: 'custom',
          status: 'planned',
          sortOrder: 0,
          metadata: {},
          ...args,
          createdAt: now,
          updatedAt: now,
        })
      },
      async update(tx: Tx, args: { id: string; name?: string; role?: string; tmuxWindow?: string; status?: string; sortOrder?: number; lastTitle?: string | null; metadata?: Record<string, unknown> }) {
        requireUnscopedAccess()
        const { id, ...updates } = args
        await tx.mutate.agent_terminals.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        requireUnscopedAccess()
        await tx.mutate.agent_terminals.delete({ id: args.id })
      },
    },

    agent_run_artifacts: {
      async create(tx: Tx, args: { id: string; runId: string; issueId?: string; kind?: string; name: string; url?: string; storageKey?: string; remotePath?: string; mimeType?: string; sizeBytes?: number; metadata?: Record<string, unknown> }) {
        requireUnscopedAccess()
        await tx.mutate.agent_run_artifacts.insert({
          kind: 'file',
          metadata: {},
          ...args,
          createdAt: Date.now(),
        })
      },
      async update(tx: Tx, args: { id: string; issueId?: string | null; kind?: string; name?: string; url?: string | null; storageKey?: string | null; remotePath?: string | null; mimeType?: string | null; sizeBytes?: number | null; metadata?: Record<string, unknown> }) {
        requireUnscopedAccess()
        const { id, ...updates } = args
        await tx.mutate.agent_run_artifacts.update({ id, ...updates })
      },
      async delete(tx: Tx, args: { id: string }) {
        requireUnscopedAccess()
        await tx.mutate.agent_run_artifacts.delete({ id: args.id })
      },
    },

    github_branches: {
      async create(tx: Tx, args: { id: string; repositoryId: string; agentRunId?: string; issueId?: string; name: string; baseBranch?: string; status?: string; lastCommitSha?: string }) {
        requireUnscopedAccess()
        const now = Date.now()
        await tx.mutate.github_branches.insert({
          baseBranch: 'main',
          status: 'planned',
          ...args,
          createdAt: now,
          updatedAt: now,
        })
      },
      async update(tx: Tx, args: { id: string; agentRunId?: string | null; issueId?: string | null; name?: string; baseBranch?: string; status?: string; lastCommitSha?: string | null }) {
        requireUnscopedAccess()
        const { id, ...updates } = args
        await tx.mutate.github_branches.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        requireUnscopedAccess()
        await tx.mutate.github_branches.delete({ id: args.id })
      },
    },

    github_pull_requests: {
      async create(tx: Tx, args: { id: string; repositoryId: string; branchId?: string; agentRunId?: string; issueId?: string; githubId?: string; number: number; url: string; title: string; state?: string; isDraft?: boolean; mergeable?: boolean; headSha?: string; baseBranch?: string; checksStatus?: string; checksUrl?: string; githubCreatedAt?: number; githubUpdatedAt?: number }) {
        requireUnscopedAccess()
        const now = Date.now()
        await tx.mutate.github_pull_requests.insert({
          state: 'open',
          isDraft: true,
          baseBranch: 'main',
          checksStatus: 'unknown',
          ...args,
          createdAt: now,
          updatedAt: now,
        })
      },
      async update(tx: Tx, args: { id: string; branchId?: string | null; agentRunId?: string | null; issueId?: string | null; githubId?: string | null; number?: number; url?: string; title?: string; state?: string; isDraft?: boolean; mergeable?: boolean | null; headSha?: string | null; baseBranch?: string; checksStatus?: string; checksUrl?: string | null; githubCreatedAt?: number | null; githubUpdatedAt?: number | null }) {
        requireUnscopedAccess()
        const { id, ...updates } = args
        await tx.mutate.github_pull_requests.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        requireUnscopedAccess()
        await tx.mutate.github_pull_requests.delete({ id: args.id })
      },
    },

    github_webhook_events: {
      async create(tx: Tx, args: { id: string; deliveryId: string; eventType: string; action?: string; repositoryFullName?: string; githubObjectId?: string; payload: Record<string, unknown>; processedAt?: number }) {
        requireUnscopedAccess()
        await tx.mutate.github_webhook_events.insert({ ...args, createdAt: Date.now() })
      },
      async update(tx: Tx, args: { id: string; processedAt?: number | null }) {
        requireUnscopedAccess()
        const { id, ...updates } = args
        await tx.mutate.github_webhook_events.update({ id, ...updates })
      },
    },

    whatsapp_campaigns: {
      async create(tx: Tx, args: { id: string; organizationId: string; templateId: string; name: string; recipientFilter?: Record<string, unknown>; variableValues?: Record<string, string>; mediaId?: string }) {
        requireOrganizationAccess(args.organizationId)
        const now = Date.now()
        await tx.mutate.whatsapp_campaigns.insert({
          status: 'draft',
          recipientFilter: {},
          variableValues: {},
          ...args,
          createdAt: now,
          updatedAt: now,
        })
      },
      async update(tx: Tx, args: { id: string; name?: string; recipientFilter?: Record<string, unknown>; variableValues?: Record<string, string>; mediaId?: string; status?: string }) {
        await requireExistingOrganizationAccess(tx, 'whatsapp_campaigns', args.id)
        const { id, ...updates } = args
        await tx.mutate.whatsapp_campaigns.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'whatsapp_campaigns', args.id)
        await tx.mutate.whatsapp_campaigns.delete({ id: args.id })
      },
    },
  }
}
