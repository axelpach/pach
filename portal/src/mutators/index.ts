import type { Transaction } from '@rocicorp/zero'
import type { Schema } from '../zero-schema'

type Tx = Transaction<Schema>

export const mutators = {
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

export type Mutators = typeof mutators
