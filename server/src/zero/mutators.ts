import type { ServerTransaction } from '@rocicorp/zero'
import type { PostgresJsTransaction } from '@rocicorp/zero/pg'
import type { Schema } from '../../schema.js'
import type { JWTPayload } from '../lib/auth.js'

type Tx = ServerTransaction<Schema, PostgresJsTransaction>
type ScopedTable =
  | 'decks'
  | 'organizations'
  | 'organization_memberships'
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
  organizations: 'id',
  organization_memberships: 'organization_id',
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

  function canAccessSavedView(companyId: string | null | undefined, ownerId: string | null | undefined) {
    return ownerId === authData?.sub || canAccessOrganization(companyId)
  }

  function requireSavedViewAccess(companyId: string | null | undefined, ownerId: string | null | undefined) {
    if (!canAccessSavedView(companyId, ownerId)) throw new AuthorizationError()
  }

  function requireSavedViewMutationAccess(args: { companyId?: string | null; ownerId?: string | null }) {
    if (args.ownerId && args.ownerId !== authData?.sub) requireUnscopedAccess()
    if (args.companyId) requireOrganizationAccess(args.companyId)
    requireSavedViewAccess(args.companyId, args.ownerId)
  }

  async function requireExistingSavedViewMutationAccess(tx: Tx, id: string) {
    const current = await readSavedViewAccess(tx, id)
    requireSavedViewAccess(current.companyId, current.ownerId)
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
      async create(tx: Tx, args: { id: string; organizationId: string; accountId: string; categoryId?: string | null; transferId?: string | null; transactionDate: number; postedDate?: number | null; description: string; merchantName?: string | null; counterparty?: string | null; amountMinor: number; currencyCode: string; reportingAmountMinor?: number | null; reportingCurrencyCode?: string | null; fxRate?: string | null; fxRateSource?: string | null; type?: string; status?: string; reviewReason?: string | null; fingerprint?: string; rawData?: Record<string, unknown> }) {
        requireOrganizationAccess(args.organizationId)
        const now = Date.now()
        await tx.mutate.fin_movements.insert({
          transferId: null,
          categoryId: null,
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
      async update(tx: Tx, args: { id: string; accountId?: string; categoryId?: string | null; transferId?: string | null; transactionDate?: number; postedDate?: number | null; description?: string; merchantName?: string | null; counterparty?: string | null; amountMinor?: number; currencyCode?: string; reportingAmountMinor?: number | null; reportingCurrencyCode?: string | null; fxRate?: string | null; fxRateSource?: string | null; type?: string; status?: string; reviewReason?: string | null }) {
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
      async update(tx: Tx, args: { id: string; accountId?: string; status?: string; description?: string; merchantName?: string | null; amountMinor?: number; currencyCode?: string; suggestedType?: string | null; suggestedCategoryId?: string | null; suggestedConfidence?: number | null; errorMessage?: string | null }) {
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
      async delete(tx: Tx, args: { id: string }) {
        await requireExistingOrganizationAccess(tx, 'pm_teams', args.id)
        await tx.mutate.pm_teams.delete({ id: args.id })
      },
    },

    pm_projects: {
      async create(tx: Tx, args: { id: string; companyId?: string; teamId?: string; name: string; slug: string; description?: string; color?: string; icon?: string; status?: string; targetDate?: number }) {
        requireOrganizationAccess(args.companyId)
        const now = Date.now()
        await tx.mutate.pm_projects.insert({ status: 'active', ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: { id: string; companyId?: string | null; teamId?: string; name?: string; slug?: string; description?: string; color?: string; icon?: string; status?: string; targetDate?: number | null }) {
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
      async update(tx: Tx, args: { id: string; name?: string; key?: string; type?: string; description?: string; color?: string; position?: number }) {
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
        requireUnscopedAccess()
        const now = Date.now()
        await tx.mutate.pm_issue_activity.insert({ ...args, createdAt: now })
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
      async create(tx: Tx, args: { id: string; projectKey: string; owner: string; name: string; fullName: string; defaultBranch?: string; localPathTemplate?: string; active?: boolean; metadata?: Record<string, unknown> }) {
        requireUnscopedAccess()
        const now = Date.now()
        await tx.mutate.github_repositories.insert({
          defaultBranch: 'main',
          active: true,
          metadata: {},
          ...args,
          createdAt: now,
          updatedAt: now,
        })
      },
      async update(tx: Tx, args: { id: string; projectKey?: string; owner?: string; name?: string; fullName?: string; defaultBranch?: string; localPathTemplate?: string | null; active?: boolean; metadata?: Record<string, unknown> }) {
        requireUnscopedAccess()
        const { id, ...updates } = args
        await tx.mutate.github_repositories.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        requireUnscopedAccess()
        await tx.mutate.github_repositories.delete({ id: args.id })
      },
    },

    agent_runs: {
      async create(tx: Tx, args: { id: string; issueId: string; workerId?: string; repositoryId?: string; projectKey: string; repoFullName: string; baseBranch?: string; branchName: string; workspacePath?: string; tmuxSession?: string; agentKind?: string; status?: string; statusMessage?: string; startedAt?: number; completedAt?: number; metadata?: Record<string, unknown> }) {
        requireUnscopedAccess()
        const now = Date.now()
        await tx.mutate.agent_runs.insert({
          baseBranch: 'main',
          agentKind: 'codex',
          status: 'queued',
          metadata: {},
          ...args,
          createdAt: now,
          updatedAt: now,
        })
        await tx.mutate.pm_issues.update({ id: args.issueId, lastActivityAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: { id: string; workerId?: string | null; repositoryId?: string | null; projectKey?: string; repoFullName?: string; baseBranch?: string; branchName?: string; workspacePath?: string | null; tmuxSession?: string | null; agentKind?: string; status?: string; statusMessage?: string | null; startedAt?: number | null; completedAt?: number | null; metadata?: Record<string, unknown> }) {
        requireUnscopedAccess()
        const { id, ...updates } = args
        await tx.mutate.agent_runs.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        requireUnscopedAccess()
        await tx.mutate.agent_runs.delete({ id: args.id })
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
