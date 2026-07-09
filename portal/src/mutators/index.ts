import type { Transaction } from '@rocicorp/zero'
import type { Schema } from '../zero-schema'

type Tx = Transaction<Schema>

export const mutators = {
  organizations: {
    async create(tx: Tx, args: { id: string; name: string; legalName?: string; taxId?: string; taxRegime?: string; project?: string; description?: string }) {
      const now = Date.now()
      await tx.mutate.organizations.insert({ ...args, createdAt: now, updatedAt: now })
    },
    async update(tx: Tx, args: { id: string; name?: string; legalName?: string; taxId?: string; taxRegime?: string; project?: string; description?: string }) {
      const { id, ...updates } = args
      await tx.mutate.organizations.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.organizations.delete({ id: args.id })
    },
  },

  organization_memberships: {
    async create(tx: Tx, args: { id: string; organizationId: string; userId: string; role?: string }) {
      const now = Date.now()
      await tx.mutate.organization_memberships.insert({ role: 'owner', ...args, createdAt: now, updatedAt: now })
    },
    async update(tx: Tx, args: { id: string; role?: string }) {
      const { id, ...updates } = args
      await tx.mutate.organization_memberships.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.organization_memberships.delete({ id: args.id })
    },
  },

  activity_events: {
    async create(tx: Tx, args: { id: string; organizationId: string; occurredAt?: number; eventType: string; activityKind?: string; origin?: string; subjectType: string; subjectId?: string; subjectLabel?: string; actorType?: string; actorId?: string; actorName?: string; source?: string; severity?: string; summary: string; details?: Record<string, unknown>; metadata?: Record<string, unknown> }) {
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
      const now = Date.now()
      await tx.mutate.activity_event_saved_views.insert({
        scope: 'personal',
        filters: {},
        display: {},
        position: 0,
        ...args,
        createdAt: now,
        updatedAt: now,
      })
    },
    async update(tx: Tx, args: { id: string; organizationId?: string | null; ownerId?: string | null; name?: string; slug?: string; icon?: string; color?: string; scope?: string; filters?: Record<string, unknown>; display?: Record<string, unknown>; position?: number }) {
      const { id, ...updates } = args
      await tx.mutate.activity_event_saved_views.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.activity_event_saved_views.delete({ id: args.id })
    },
  },

  design_systems: {
    async create(tx: Tx, args: { id: string; organizationId: string; name: string; slug: string; tokens?: Record<string, unknown>; assets?: Record<string, unknown>; metadata?: Record<string, unknown> }) {
      const now = Date.now()
      await tx.mutate.design_systems.insert({
        tokens: {},
        assets: {},
        metadata: {},
        ...args,
        createdAt: now,
        updatedAt: now,
      } as any)
    },
    async update(tx: Tx, args: { id: string; name?: string; slug?: string; tokens?: Record<string, unknown>; assets?: Record<string, unknown>; metadata?: Record<string, unknown> }) {
      const { id, ...updates } = args
      await tx.mutate.design_systems.update({ id, ...updates, updatedAt: Date.now() } as any)
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.design_systems.delete({ id: args.id })
    },
  },

  design_templates: {
    async create(tx: Tx, args: { id: string; organizationId: string; type?: string; name: string; slug: string; status?: string; sourceKind?: string; currentVersionId?: string; metadata?: Record<string, unknown> }) {
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
      const { id, ...updates } = args
      await tx.mutate.design_templates.update({ id, ...updates, updatedAt: Date.now() } as any)
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.design_templates.delete({ id: args.id })
    },
  },

  design_template_versions: {
    async create(tx: Tx, args: { id: string; organizationId: string; templateId: string; versionNumber?: number; schemaVersion?: number; sourceKind?: string; files?: Record<string, string>; manifest?: Record<string, unknown>; dependencies?: Record<string, string>; compiledArtifactUrl?: string; previewImageUrl?: string; validationStatus?: string; validationErrors?: Array<Record<string, unknown>>; createdByRunId?: string }) {
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
      const { id, ...updates } = args
      await tx.mutate.design_template_versions.update({ id, ...updates } as any)
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.design_template_versions.delete({ id: args.id })
    },
  },

  design_assets: {
    async create(tx: Tx, args: { id: string; organizationId: string; templateId?: string; kind: string; name: string; storageKey?: string; url?: string; metadata?: Record<string, unknown> }) {
      const now = Date.now()
      await tx.mutate.design_assets.insert({ metadata: {}, ...args, createdAt: now, updatedAt: now } as any)
    },
    async update(tx: Tx, args: { id: string; templateId?: string | null; kind?: string; name?: string; storageKey?: string | null; url?: string | null; metadata?: Record<string, unknown> }) {
      const { id, ...updates } = args
      await tx.mutate.design_assets.update({ id, ...updates, updatedAt: Date.now() } as any)
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.design_assets.delete({ id: args.id })
    },
  },

  design_template_runs: {
    async create(tx: Tx, args: { id: string; organizationId: string; templateId?: string; agentRunId?: string; templateSlug?: string; prompt: string; status?: string; statusMessage?: string; sourceVersionId?: string; targetVersionId?: string; metadata?: Record<string, unknown> }) {
      const now = Date.now()
      await tx.mutate.design_template_runs.insert({
        status: 'queued',
        metadata: {},
        ...args,
        createdAt: now,
        updatedAt: now,
      } as any)
    },
    async update(tx: Tx, args: { id: string; templateId?: string | null; agentRunId?: string | null; templateSlug?: string | null; prompt?: string; status?: string; statusMessage?: string | null; sourceVersionId?: string | null; targetVersionId?: string | null; metadata?: Record<string, unknown> }) {
      const { id, ...updates } = args
      await tx.mutate.design_template_runs.update({ id, ...updates, updatedAt: Date.now() } as any)
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.design_template_runs.delete({ id: args.id })
    },
  },

  crm_companies: {
    async create(tx: Tx, args: { id: string; organizationId?: string; name: string; website?: string; instagram?: string; phone?: string; city?: string; industry?: string; size?: string; description?: string }) {
      const now = Date.now()
      await tx.mutate.crm_companies.insert({ ...args, createdAt: now, updatedAt: now })
    },
    async update(tx: Tx, args: { id: string; organizationId?: string | null; name?: string; website?: string; instagram?: string; phone?: string; city?: string; industry?: string; size?: string; description?: string }) {
      const { id, ...updates } = args
      await tx.mutate.crm_companies.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.crm_companies.delete({ id: args.id })
    },
  },

  crm_contacts: {
    async create(tx: Tx, args: { id: string; organizationId?: string; crmCompanyId?: string; name: string; email?: string; phone?: string; instagram?: string; linkedin?: string; role?: string }) {
      const now = Date.now()
      await tx.mutate.crm_contacts.insert({ ...args, createdAt: now, updatedAt: now })
    },
    async update(tx: Tx, args: { id: string; organizationId?: string | null; crmCompanyId?: string | null; name?: string; email?: string; phone?: string; instagram?: string; linkedin?: string; role?: string }) {
      const { id, ...updates } = args
      await tx.mutate.crm_contacts.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.crm_contacts.delete({ id: args.id })
    },
  },

  crm_deal_contacts: {
    async create(tx: Tx, args: { id: string; organizationId?: string; dealId: string; contactId: string }) {
      await tx.mutate.crm_deal_contacts.insert({ ...args, createdAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.crm_deal_contacts.delete({ id: args.id })
    },
  },

  crm_deals: {
    async create(tx: Tx, args: { id: string; organizationId?: string; crmCompanyId?: string; title: string; stage?: string; value?: number; temperature?: string; project?: string; description?: string }) {
      const now = Date.now()
      await tx.mutate.crm_deals.insert({ stage: 'prospecto', ...args, createdAt: now, updatedAt: now })
    },
    async update(tx: Tx, args: { id: string; organizationId?: string | null; crmCompanyId?: string | null; title?: string; stage?: string; value?: number; temperature?: string; project?: string; description?: string }) {
      const { id, ...updates } = args
      await tx.mutate.crm_deals.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.crm_deals.delete({ id: args.id })
    },
  },

  crm_notes: {
    async create(tx: Tx, args: { id: string; organizationId?: string; dealId?: string; contactId?: string; body: string; type?: string }) {
      await tx.mutate.crm_notes.insert({ type: 'manual', ...args, createdAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.crm_notes.delete({ id: args.id })
    },
  },

  crm_boards: {
    async create(tx: Tx, args: { id: string; organizationId?: string; name: string; slug: string; entityType?: string; groupBy: string; baseFilter?: Record<string, string[]> }) {
      const now = Date.now()
      await tx.mutate.crm_boards.insert({ entityType: 'deals', baseFilter: {}, ...args, createdAt: now, updatedAt: now })
    },
    async update(tx: Tx, args: { id: string; organizationId?: string | null; name?: string; groupBy?: string; baseFilter?: Record<string, string[]> }) {
      const { id, ...updates } = args
      await tx.mutate.crm_boards.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.crm_boards.delete({ id: args.id })
    },
  },

  crm_board_columns: {
    async create(tx: Tx, args: { id: string; organizationId?: string; boardId: string; label: string; position: number; value: string; color?: string }) {
      await tx.mutate.crm_board_columns.insert(args)
    },
    async update(tx: Tx, args: { id: string; label?: string; position?: number; color?: string }) {
      const { id, ...updates } = args
      await tx.mutate.crm_board_columns.update({ id, ...updates })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.crm_board_columns.delete({ id: args.id })
    },
  },

  fin_accounts: {
    async create(tx: Tx, args: { id: string; organizationId: string; name: string; institutionName?: string; holderUserId?: string; type?: string; currencyCode?: string; status?: string; lastBalanceMinor?: number; lastBalanceAt?: number; metadata?: Record<string, unknown> }) {
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
      const { id, ...updates } = args
      await tx.mutate.fin_accounts.update({ id, ...updates, updatedAt: Date.now() })
    },
  },

  fin_categories: {
    async create(tx: Tx, args: { id: string; organizationId: string; parentId?: string; name: string; type?: string; color?: string; icon?: string; position?: number; archived?: boolean }) {
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
      const { id, ...updates } = args
      await tx.mutate.fin_categories.update({ id, ...updates, updatedAt: Date.now() })
    },
  },

  fin_movements: {
    async create(tx: Tx, args: { id: string; organizationId: string; accountId: string; categoryId?: string | null; transferId?: string | null; transactionDate: number; transactionTime?: string; postedDate?: number | null; description: string; merchantName?: string | null; counterparty?: string | null; amountMinor: number; currencyCode: string; reportingAmountMinor?: number | null; reportingCurrencyCode?: string | null; fxRate?: string | null; fxRateSource?: string | null; type?: string; status?: string; reviewReason?: string | null; fingerprint?: string; rawData?: Record<string, unknown> }) {
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
      const { id, ...updates } = args
      await tx.mutate.fin_movements.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.fin_movements.delete({ id: args.id })
    },
  },

  fin_import_items: {
    async update(tx: Tx, args: { id: string; accountId?: string; status?: string; transactionTime?: string; description?: string; merchantName?: string | null; amountMinor?: number; currencyCode?: string; suggestedType?: string | null; suggestedCategoryId?: string | null; suggestedConfidence?: number | null; duplicateMovementId?: string | null; fingerprint?: string; rawData?: Record<string, unknown>; errorMessage?: string | null }) {
      const { id, ...updates } = args
      await tx.mutate.fin_import_items.update({ id, ...updates, updatedAt: Date.now() })
    },
  },

  fin_transfers: {
    async create(tx: Tx, args: { id: string; organizationId: string; status?: string; fromAccountId?: string | null; toAccountId?: string | null; amountMinor?: number | null; currencyCode?: string | null; matchedConfidence?: number | null }) {
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
      const { id, ...updates } = args
      await tx.mutate.fin_transfers.update({ id, ...updates, updatedAt: Date.now() })
    },
  },

  fin_categorization_rules: {
    async create(tx: Tx, args: { id: string; organizationId: string; accountId?: string; categoryId?: string; type?: string; matchKind?: string; matchValue: string; amountMinor?: number; currencyCode?: string; confidence?: number; autoApply?: boolean; createdFromMovementId?: string }) {
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
      const { id, ...updates } = args
      await tx.mutate.fin_categorization_rules.update({ id, ...updates, updatedAt: Date.now() })
    },
  },

  fin_balance_snapshots: {
    async create(tx: Tx, args: { id: string; organizationId: string; accountId: string; asOfDate: number; balanceMinor: number; currencyCode: string; source?: string; importId?: string }) {
      await tx.mutate.fin_balance_snapshots.insert({ source: 'manual', ...args, createdAt: Date.now() })
    },
  },

  documents: {
    async create(tx: Tx, args: { id: string; organizationId?: string; parentId?: string; ownerId?: string; publicId?: string; currentSnapshotId?: string; title: string; slug: string; body?: string; format?: string; status?: string; icon?: string; sortOrder?: number; metadata?: Record<string, unknown> }) {
      const now = Date.now()
      await tx.mutate.documents.insert({
        body: '',
        format: 'markdown',
        status: 'active',
        sortOrder: 0,
        metadata: {},
        ...args,
        createdAt: now,
        updatedAt: now,
      })
    },
    async update(tx: Tx, args: { id: string; organizationId?: string | null; parentId?: string | null; ownerId?: string | null; publicId?: string | null; currentSnapshotId?: string | null; title?: string; slug?: string; body?: string; format?: string; status?: string; icon?: string | null; sortOrder?: number; metadata?: Record<string, unknown> }) {
      const { id, ...updates } = args
      await tx.mutate.documents.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.documents.delete({ id: args.id })
    },
  },

  document_snapshots: {
    async create(tx: Tx, args: { id: string; documentId: string; organizationId?: string; versionNumber: number; title: string; slug: string; body?: string; format?: string; status?: string; createdByType?: string; createdById?: string; agentRunId?: string; metadata?: Record<string, unknown>; setCurrent?: boolean }) {
      const { setCurrent, ...snapshot } = args
      await tx.mutate.document_snapshots.insert({
        body: '',
        format: 'markdown',
        status: 'version',
        createdByType: 'user',
        metadata: {},
        ...snapshot,
        createdAt: Date.now(),
      })
      if (setCurrent) await tx.mutate.documents.update({ id: args.documentId, currentSnapshotId: args.id, updatedAt: Date.now() })
    },
    async update(tx: Tx, args: { id: string; documentId?: string; status?: string; metadata?: Record<string, unknown>; applyToDocument?: boolean; title?: string; slug?: string; body?: string; format?: string }) {
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
      await tx.mutate.document_snapshots.delete({ id: args.id })
    },
  },

  mkt_sender_profiles: {
    async create(tx: Tx, args: any) {
      const now = Date.now()
      await tx.mutate.mkt_sender_profiles.insert({ provider: 'resend', status: 'active', metadata: {}, ...args, createdAt: now, updatedAt: now })
    },
    async update(tx: Tx, args: any) {
      const { id, ...updates } = args
      await tx.mutate.mkt_sender_profiles.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.mkt_sender_profiles.delete({ id: args.id })
    },
  },

  mkt_publications: {
    async create(tx: Tx, args: any) {
      const now = Date.now()
      await tx.mutate.mkt_publications.insert({ type: 'newsletter', status: 'active', editorialProfile: {}, metadata: {}, ...args, createdAt: now, updatedAt: now })
    },
    async update(tx: Tx, args: any) {
      const { id, ...updates } = args
      await tx.mutate.mkt_publications.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.mkt_publications.delete({ id: args.id })
    },
  },

  mkt_ctas: {
    async create(tx: Tx, args: any) {
      const now = Date.now()
      await tx.mutate.mkt_ctas.insert({ status: 'active', metadata: {}, ...args, createdAt: now, updatedAt: now })
    },
    async update(tx: Tx, args: any) {
      const { id, ...updates } = args
      await tx.mutate.mkt_ctas.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.mkt_ctas.delete({ id: args.id })
    },
  },

  mkt_content_items: {
    async create(tx: Tx, args: any) {
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
      const { id, ...updates } = args
      await tx.mutate.mkt_content_items.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.mkt_content_items.delete({ id: args.id })
    },
  },

  mkt_audience_members: {
    async create(tx: Tx, args: any) {
      const now = Date.now()
      await tx.mutate.mkt_audience_members.insert({ status: 'active', tags: [], metadata: {}, ...args, createdAt: now, updatedAt: now })
    },
    async update(tx: Tx, args: any) {
      const { id, ...updates } = args
      await tx.mutate.mkt_audience_members.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.mkt_audience_members.delete({ id: args.id })
    },
  },

  mkt_audience_subscriptions: {
    async create(tx: Tx, args: any) {
      const now = Date.now()
      await tx.mutate.mkt_audience_subscriptions.insert({ channel: 'newsletter', status: 'subscribed', metadata: {}, ...args, createdAt: now, updatedAt: now })
    },
    async update(tx: Tx, args: any) {
      const { id, ...updates } = args
      await tx.mutate.mkt_audience_subscriptions.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.mkt_audience_subscriptions.delete({ id: args.id })
    },
  },

  mkt_segments: {
    async create(tx: Tx, args: any) {
      const now = Date.now()
      await tx.mutate.mkt_segments.insert({ kind: 'manual', rules: {}, status: 'active', metadata: {}, ...args, createdAt: now, updatedAt: now })
    },
    async update(tx: Tx, args: any) {
      const { id, ...updates } = args
      await tx.mutate.mkt_segments.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.mkt_segments.delete({ id: args.id })
    },
  },

  mkt_segment_members: {
    async create(tx: Tx, args: any) {
      await tx.mutate.mkt_segment_members.insert({ ...args, createdAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.mkt_segment_members.delete({ id: args.id })
    },
  },

  mkt_distribution_runs: {
    async create(tx: Tx, args: any) {
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
      const { id, ...updates } = args
      await tx.mutate.mkt_distribution_runs.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.mkt_distribution_runs.delete({ id: args.id })
    },
  },

  mkt_content_events: {
    async create(tx: Tx, args: any) {
      await tx.mutate.mkt_content_events.insert({ metadata: {}, ...args, createdAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.mkt_content_events.delete({ id: args.id })
    },
  },

  mkt_publication_consumers: {
    async create(tx: Tx, args: any) {
      const now = Date.now()
      await tx.mutate.mkt_publication_consumers.insert({ kind: 'blog', status: 'active', metadata: {}, ...args, createdAt: now, updatedAt: now })
    },
    async update(tx: Tx, args: any) {
      const { id, ...updates } = args
      await tx.mutate.mkt_publication_consumers.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.mkt_publication_consumers.delete({ id: args.id })
    },
  },

  mkt_content_outputs: {
    async create(tx: Tx, args: any) {
      const now = Date.now()
      await tx.mutate.mkt_content_outputs.insert({ channel: 'blog', status: 'draft', metadata: {}, ...args, createdAt: now, updatedAt: now })
    },
    async update(tx: Tx, args: any) {
      const { id, ...updates } = args
      await tx.mutate.mkt_content_outputs.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.mkt_content_outputs.delete({ id: args.id })
    },
  },

  social_connections: {
    async update(tx: Tx, args: any) {
      const { id, ...updates } = args
      await tx.mutate.social_connections.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.social_connections.delete({ id: args.id })
    },
  },

  social_channels: {
    async create(tx: Tx, args: any) {
      const now = Date.now()
      await tx.mutate.social_channels.insert({ provider: 'linkedin', kind: 'organization', status: 'active', metadata: {}, ...args, createdAt: now, updatedAt: now })
    },
    async update(tx: Tx, args: any) {
      const { id, ...updates } = args
      await tx.mutate.social_channels.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.social_channels.delete({ id: args.id })
    },
  },

  social_channel_connections: {
    async create(tx: Tx, args: any) {
      const now = Date.now()
      await tx.mutate.social_channel_connections.insert({ capabilities: [], status: 'active', metadata: {}, ...args, createdAt: now, updatedAt: now })
    },
    async update(tx: Tx, args: any) {
      const { id, ...updates } = args
      await tx.mutate.social_channel_connections.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.social_channel_connections.delete({ id: args.id })
    },
  },

  social_posts: {
    async create(tx: Tx, args: any) {
      const now = Date.now()
      await tx.mutate.social_posts.insert({ caption: '', status: 'draft', metadata: {}, ...args, createdAt: now, updatedAt: now })
    },
    async update(tx: Tx, args: any) {
      const { id, ...updates } = args
      await tx.mutate.social_posts.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.social_posts.delete({ id: args.id })
    },
  },

  social_post_targets: {
    async create(tx: Tx, args: any) {
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
      const { id, ...updates } = args
      await tx.mutate.social_post_targets.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.social_post_targets.delete({ id: args.id })
    },
  },

  mkt_ad_promotions: {
    async create(tx: Tx, args: any) {
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
      const { id, ...updates } = args
      await tx.mutate.mkt_ad_promotions.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.mkt_ad_promotions.delete({ id: args.id })
    },
  },

  mkt_ad_metric_snapshots: {
    async create(tx: Tx, args: any) {
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
        fetchedAt: Date.now(),
        createdAt: Date.now(),
        ...args,
      })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.mkt_ad_metric_snapshots.delete({ id: args.id })
    },
  },

  pm_teams: {
    async create(tx: Tx, args: { id: string; companyId?: string; key: string; name: string; description?: string; color?: string; icon?: string; position?: number }) {
      const now = Date.now()
      await tx.mutate.pm_teams.insert({ position: 0, ...args, createdAt: now, updatedAt: now })
    },
    async update(tx: Tx, args: { id: string; key?: string; name?: string; description?: string; color?: string; icon?: string; position?: number }) {
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
      const now = Date.now()
      for (const issue of args.issueReassignments ?? []) {
        await tx.mutate.pm_issues.update({
          id: issue.id,
          teamId: args.targetTeamId,
          projectId: null,
          number: issue.number,
          identifier: issue.identifier,
          lastActivityAt: now,
          updatedAt: now,
        })
      }
      for (const id of args.projectIds ?? []) {
        await tx.mutate.pm_projects.update({ id, teamId: null, updatedAt: now })
      }
      for (const id of args.statusIds ?? []) {
        await tx.mutate.pm_statuses.update({ id, teamId: null, updatedAt: now })
      }
      for (const id of args.labelIds ?? []) {
        await tx.mutate.pm_labels.update({ id, teamId: null, updatedAt: now })
      }
      for (const id of args.savedViewIds ?? []) {
        await tx.mutate.pm_saved_views.update({ id, teamId: null, updatedAt: now })
      }
      for (const id of args.taskTriggerIds ?? []) {
        await tx.mutate.pm_task_triggers.update({ id, teamId: args.targetTeamId, projectId: null, updatedAt: now })
      }
      await tx.mutate.pm_teams.delete({ id: args.id })
    },
  },

  pm_projects: {
    async create(tx: Tx, args: { id: string; companyId?: string; teamId?: string; name: string; slug: string; description?: string; color?: string; icon?: string; status?: string; targetDate?: number }) {
      const now = Date.now()
      await tx.mutate.pm_projects.insert({ status: 'active', ...args, createdAt: now, updatedAt: now })
    },
    async update(tx: Tx, args: { id: string; companyId?: string | null; teamId?: string | null; name?: string; slug?: string; description?: string; color?: string; icon?: string; status?: string; targetDate?: number | null }) {
      const { id, ...updates } = args
      await tx.mutate.pm_projects.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.pm_projects.delete({ id: args.id })
    },
  },

  pm_statuses: {
    async create(tx: Tx, args: { id: string; companyId?: string; teamId?: string; name: string; key: string; type?: string; description?: string; color?: string; position?: number }) {
      const now = Date.now()
      await tx.mutate.pm_statuses.insert({ type: 'unstarted', position: 0, ...args, createdAt: now, updatedAt: now })
    },
    async update(tx: Tx, args: { id: string; name?: string; key?: string; type?: string; description?: string; color?: string; position?: number; teamId?: string | null }) {
      const { id, ...updates } = args
      await tx.mutate.pm_statuses.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.pm_statuses.delete({ id: args.id })
    },
  },

  pm_labels: {
    async create(tx: Tx, args: { id: string; companyId?: string; teamId?: string; name: string; color?: string; description?: string }) {
      const now = Date.now()
      await tx.mutate.pm_labels.insert({ ...args, createdAt: now, updatedAt: now })
    },
    async update(tx: Tx, args: { id: string; companyId?: string | null; teamId?: string | null; name?: string; color?: string; description?: string }) {
      const { id, ...updates } = args
      await tx.mutate.pm_labels.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.pm_labels.delete({ id: args.id })
    },
  },

  pm_issues: {
    async create(tx: Tx, args: { id: string; contextCompanyId?: string; teamId: string; projectId?: string; statusId: string; assigneeId?: string; creatorId?: string; identifier: string; number: number; title: string; description?: string; priority?: number; estimate?: number; sortOrder?: number; dueDate?: number; startedAt?: number; completedAt?: number; canceledAt?: number; blockedReason?: string }) {
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
      const { id, ...updates } = args
      const now = Date.now()
      await tx.mutate.pm_issues.update({ id, ...updates, lastActivityAt: now, updatedAt: now })
    },
    async reorder(tx: Tx, args: { activeIssueId: string; updates: Array<{ id: string; sortOrder: number; priority?: number; statusId?: string; startedAt?: number; completedAt?: number; canceledAt?: number }> }) {
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
      await tx.mutate.pm_issues.delete({ id: args.id })
    },
  },

  pm_issue_labels: {
    async create(tx: Tx, args: { id: string; issueId: string; labelId: string }) {
      await tx.mutate.pm_issue_labels.insert({ ...args, createdAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.pm_issue_labels.delete({ id: args.id })
    },
  },

  pm_issue_activity: {
    async create(tx: Tx, args: { id: string; issueId: string; organizationId?: string; subjectLabel?: string; actorId?: string; actorName?: string; type: string; summary: string; metadata?: Record<string, unknown> }) {
      const now = Date.now()
      if (args.organizationId) {
        await tx.mutate.activity_events.insert({
          id: args.id,
          organizationId: args.organizationId,
          occurredAt: now,
          createdAt: now,
          eventType: args.type,
          activityKind: issueActivityKind(args.type, args.metadata),
          origin: 'pach_work',
          subjectType: 'pm_issue',
          subjectId: args.issueId,
          subjectLabel: args.subjectLabel,
          actorType: args.actorId ? 'user' : args.actorName?.toLowerCase().includes('agent') ? 'agent' : 'system',
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
      }
      await tx.mutate.pm_issues.update({ id: args.issueId, lastActivityAt: now, updatedAt: now })
    },
  },

  pm_saved_views: {
    async create(tx: Tx, args: { id: string; companyId?: string; teamId?: string; ownerId?: string; name: string; slug: string; icon?: string; color?: string; scope?: string; filters?: Record<string, unknown>; display?: Record<string, unknown>; position?: number }) {
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
      const { id, ...updates } = args
      await tx.mutate.pm_saved_views.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.pm_saved_views.delete({ id: args.id })
    },
  },

  pm_task_triggers: {
    async create(tx: Tx, args: { id: string; name: string; kind?: string; frequency?: string; timezone?: string; schedule?: Record<string, unknown>; enabled?: boolean; nextRunAt: number; lastRunAt?: number; companyId?: string; teamId: string; projectId?: string; statusId: string; assigneeId?: string; creatorId?: string; title: string; description?: string; priority?: number; estimate?: number; metadata?: Record<string, unknown> }) {
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
      const { id, ...updates } = args
      await tx.mutate.pm_task_triggers.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.pm_task_triggers.delete({ id: args.id })
    },
  },

  pm_task_trigger_runs: {
    async create(tx: Tx, args: { id: string; triggerId: string; issueId?: string; periodKey: string; status?: string; message?: string; metadata?: Record<string, unknown> }) {
      await tx.mutate.pm_task_trigger_runs.insert({
        status: 'created',
        metadata: {},
        ...args,
        createdAt: Date.now(),
      })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.pm_task_trigger_runs.delete({ id: args.id })
    },
  },

  agent_workers: {
    async create(tx: Tx, args: { id: string; name: string; provider?: string; providerServerId?: string; hostname?: string; sshHost: string; sshPort?: number; sshUser?: string; status?: string; statusMessage?: string; lastSeenAt?: number; metadata?: Record<string, unknown> }) {
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
      const { id, ...updates } = args
      await tx.mutate.agent_workers.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.agent_workers.delete({ id: args.id })
    },
  },

  github_repositories: {
    async create(tx: Tx, args: { id: string; connectionId?: string; githubId?: string; nodeId?: string; projectKey: string; owner: string; name: string; fullName: string; defaultBranch?: string; htmlUrl?: string; isPrivate?: boolean; permissions?: Record<string, unknown>; localPathTemplate?: string; active?: boolean; metadata?: Record<string, unknown> }) {
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
      const { id, ...updates } = args
      await tx.mutate.github_repositories.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.github_repositories.delete({ id: args.id })
    },
  },

  agent_conversations: {
    async create(tx: Tx, args: { id: string; issueId?: string; title: string; status?: string; metadata?: Record<string, unknown> }) {
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
      const { id, ...updates } = args
      await tx.mutate.agent_conversations.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.agent_conversations.delete({ id: args.id })
    },
  },

  agent_runs: {
    async create(tx: Tx, args: { id: string; conversationId?: string; parentRunId?: string; issueId?: string; subjectType?: string; subjectId?: string; workerId?: string; repositoryId?: string; projectKey: string; repoFullName: string; baseBranch?: string; branchName: string; workspacePath?: string; tmuxSession?: string; agentKind?: string; status?: string; statusMessage?: string; startedAt?: number; completedAt?: number; metadata?: Record<string, unknown> }) {
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
      const { id, ...updates } = args
      await tx.mutate.agent_runs.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.agent_runs.delete({ id: args.id })
    },
  },

  agent_messages: {
    async create(tx: Tx, args: { id: string; conversationId: string; runId?: string; role: string; body: string; metadata?: Record<string, unknown> }) {
      await tx.mutate.agent_messages.insert({
        metadata: {},
        ...args,
        createdAt: Date.now(),
      })
    },
    async update(tx: Tx, args: { id: string; runId?: string | null; role?: string; body?: string; metadata?: Record<string, unknown> }) {
      const { id, ...updates } = args
      await tx.mutate.agent_messages.update({ id, ...updates })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.agent_messages.delete({ id: args.id })
    },
  },

  agent_terminals: {
    async create(tx: Tx, args: { id: string; runId: string; name: string; role?: string; tmuxWindow: string; status?: string; sortOrder?: number; lastTitle?: string; metadata?: Record<string, unknown> }) {
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
      const { id, ...updates } = args
      await tx.mutate.agent_terminals.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.agent_terminals.delete({ id: args.id })
    },
  },

  agent_run_artifacts: {
    async create(tx: Tx, args: { id: string; runId: string; issueId?: string; kind?: string; name: string; url?: string; storageKey?: string; remotePath?: string; mimeType?: string; sizeBytes?: number; metadata?: Record<string, unknown> }) {
      await tx.mutate.agent_run_artifacts.insert({
        kind: 'file',
        metadata: {},
        ...args,
        createdAt: Date.now(),
      })
    },
    async update(tx: Tx, args: { id: string; issueId?: string | null; kind?: string; name?: string; url?: string | null; storageKey?: string | null; remotePath?: string | null; mimeType?: string | null; sizeBytes?: number | null; metadata?: Record<string, unknown> }) {
      const { id, ...updates } = args
      await tx.mutate.agent_run_artifacts.update({ id, ...updates })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.agent_run_artifacts.delete({ id: args.id })
    },
  },

  github_branches: {
    async create(tx: Tx, args: { id: string; repositoryId: string; agentRunId?: string; issueId?: string; name: string; baseBranch?: string; status?: string; lastCommitSha?: string }) {
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
      const { id, ...updates } = args
      await tx.mutate.github_branches.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.github_branches.delete({ id: args.id })
    },
  },

  github_pull_requests: {
    async create(tx: Tx, args: { id: string; repositoryId: string; branchId?: string; agentRunId?: string; issueId?: string; githubId?: string; number: number; url: string; title: string; state?: string; isDraft?: boolean; mergeable?: boolean; headSha?: string; baseBranch?: string; checksStatus?: string; checksUrl?: string; githubCreatedAt?: number; githubUpdatedAt?: number }) {
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
      const { id, ...updates } = args
      await tx.mutate.github_pull_requests.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.github_pull_requests.delete({ id: args.id })
    },
  },

  github_webhook_events: {
    async create(tx: Tx, args: { id: string; deliveryId: string; eventType: string; action?: string; repositoryFullName?: string; githubObjectId?: string; payload: Record<string, unknown>; processedAt?: number }) {
      await tx.mutate.github_webhook_events.insert({ ...args, createdAt: Date.now() })
    },
    async update(tx: Tx, args: { id: string; processedAt?: number | null }) {
      const { id, ...updates } = args
      await tx.mutate.github_webhook_events.update({ id, ...updates })
    },
  },

  whatsapp_campaigns: {
    async create(tx: Tx, args: { id: string; organizationId: string; templateId: string; name: string; recipientFilter?: Record<string, unknown>; variableValues?: Record<string, string>; mediaId?: string }) {
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
      const { id, ...updates } = args
      await tx.mutate.whatsapp_campaigns.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.whatsapp_campaigns.delete({ id: args.id })
    },
  },
}

function issueActivityKind(type: string, metadata?: Record<string, unknown>) {
  if (type === 'completed') return 'progress'
  if (type === 'agent_run_failed' || metadata?.level === 'error') return 'incident'
  return 'operational'
}

export type Mutators = typeof mutators
