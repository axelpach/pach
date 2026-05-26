import type { ServerTransaction } from '@rocicorp/zero'
import type { PostgresJsTransaction } from '@rocicorp/zero/pg'
import type { Schema } from '../../schema.js'

type Tx = ServerTransaction<Schema, PostgresJsTransaction>

// Pach is a single-user personal tool — no complex auth needed.
export function createServerMutators() {
  return {
    companies: {
      async create(tx: Tx, args: { id: string; name: string; legalName?: string; taxId?: string; taxRegime?: string; project?: string; description?: string }) {
        const now = Date.now()
        await tx.mutate.companies.insert({ ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: { id: string; name?: string; legalName?: string; taxId?: string; taxRegime?: string; project?: string; description?: string }) {
        const { id, ...updates } = args
        await tx.mutate.companies.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await tx.mutate.companies.delete({ id: args.id })
      },
    },

    crm_companies: {
      async create(tx: Tx, args: { id: string; name: string; website?: string; instagram?: string; phone?: string; city?: string; industry?: string; size?: string; description?: string }) {
        const now = Date.now()
        await tx.mutate.crm_companies.insert({ ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: { id: string; name?: string; website?: string; instagram?: string; phone?: string; city?: string; industry?: string; size?: string; description?: string }) {
        const { id, ...updates } = args
        await tx.mutate.crm_companies.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await tx.mutate.crm_companies.delete({ id: args.id })
      },
    },

    crm_contacts: {
      async create(tx: Tx, args: { id: string; companyId?: string; name: string; email?: string; phone?: string; instagram?: string; linkedin?: string; role?: string }) {
        const now = Date.now()
        await tx.mutate.crm_contacts.insert({ ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: { id: string; companyId?: string; name?: string; email?: string; phone?: string; instagram?: string; linkedin?: string; role?: string }) {
        const { id, ...updates } = args
        await tx.mutate.crm_contacts.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await tx.mutate.crm_contacts.delete({ id: args.id })
      },
    },

    crm_deal_contacts: {
      async create(tx: Tx, args: { id: string; dealId: string; contactId: string }) {
        await tx.mutate.crm_deal_contacts.insert({ ...args, createdAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await tx.mutate.crm_deal_contacts.delete({ id: args.id })
      },
    },

    crm_deals: {
      async create(tx: Tx, args: { id: string; companyId?: string; title: string; stage?: string; value?: number; temperature?: string; project?: string; description?: string }) {
        const now = Date.now()
        await tx.mutate.crm_deals.insert({ stage: 'prospecto', ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: { id: string; companyId?: string; title?: string; stage?: string; value?: number; temperature?: string; project?: string; description?: string }) {
        const { id, ...updates } = args
        await tx.mutate.crm_deals.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await tx.mutate.crm_deals.delete({ id: args.id })
      },
    },

    crm_notes: {
      async create(tx: Tx, args: { id: string; dealId?: string; contactId?: string; body: string; type?: string }) {
        await tx.mutate.crm_notes.insert({ type: 'manual', ...args, createdAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await tx.mutate.crm_notes.delete({ id: args.id })
      },
    },

    crm_boards: {
      async create(tx: Tx, args: { id: string; name: string; slug: string; entityType?: string; groupBy: string; baseFilter?: Record<string, string[]> }) {
        const now = Date.now()
        await tx.mutate.crm_boards.insert({ entityType: 'deals', baseFilter: {}, ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: { id: string; name?: string; groupBy?: string; baseFilter?: Record<string, string[]> }) {
        const { id, ...updates } = args
        await tx.mutate.crm_boards.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await tx.mutate.crm_boards.delete({ id: args.id })
      },
    },

    crm_board_columns: {
      async create(tx: Tx, args: { id: string; boardId: string; label: string; position: number; value: string; color?: string }) {
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

    pm_teams: {
      async create(tx: Tx, args: { id: string; companyId?: string; key: string; name: string; description?: string; color?: string; icon?: string; position?: number }) {
        const now = Date.now()
        await tx.mutate.pm_teams.insert({ position: 0, ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: { id: string; key?: string; name?: string; description?: string; color?: string; icon?: string; position?: number }) {
        const { id, ...updates } = args
        await tx.mutate.pm_teams.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await tx.mutate.pm_teams.delete({ id: args.id })
      },
    },

    pm_projects: {
      async create(tx: Tx, args: { id: string; companyId?: string; teamId?: string; name: string; slug: string; description?: string; color?: string; icon?: string; status?: string; targetDate?: number }) {
        const now = Date.now()
        await tx.mutate.pm_projects.insert({ status: 'active', ...args, createdAt: now, updatedAt: now })
      },
      async update(tx: Tx, args: { id: string; companyId?: string | null; teamId?: string; name?: string; slug?: string; description?: string; color?: string; icon?: string; status?: string; targetDate?: number | null }) {
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
      async update(tx: Tx, args: { id: string; name?: string; key?: string; type?: string; description?: string; color?: string; position?: number }) {
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
      async create(tx: Tx, args: { id: string; issueId: string; actorId?: string; actorName?: string; type: string; summary: string; metadata?: Record<string, unknown> }) {
        const now = Date.now()
        await tx.mutate.pm_issue_activity.insert({ ...args, createdAt: now })
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
      async create(tx: Tx, args: { id: string; projectKey: string; owner: string; name: string; fullName: string; defaultBranch?: string; localPathTemplate?: string; active?: boolean; metadata?: Record<string, unknown> }) {
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
        const { id, ...updates } = args
        await tx.mutate.github_repositories.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await tx.mutate.github_repositories.delete({ id: args.id })
      },
    },

    agent_runs: {
      async create(tx: Tx, args: { id: string; issueId: string; workerId?: string; repositoryId?: string; projectKey: string; repoFullName: string; baseBranch?: string; branchName: string; workspacePath?: string; tmuxSession?: string; agentKind?: string; status?: string; statusMessage?: string; startedAt?: number; completedAt?: number; metadata?: Record<string, unknown> }) {
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
        const { id, ...updates } = args
        await tx.mutate.agent_runs.update({ id, ...updates, updatedAt: Date.now() })
      },
      async delete(tx: Tx, args: { id: string }) {
        await tx.mutate.agent_runs.delete({ id: args.id })
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
      async create(tx: Tx, args: { id: string; companyId: string; templateId: string; name: string; recipientFilter?: Record<string, unknown>; variableValues?: Record<string, string>; mediaId?: string }) {
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
}
