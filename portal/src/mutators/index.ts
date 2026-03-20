import type { Transaction } from '@rocicorp/zero'
import type { Schema } from '../zero-schema'

type Tx = Transaction<Schema>

export const mutators = {
  companies: {
    async create(tx: Tx, args: { id: string; name: string; website?: string; industry?: string; size?: string; description?: string }) {
      const now = Date.now()
      await tx.mutate.companies.insert({ ...args, createdAt: now, updatedAt: now })
    },
    async update(tx: Tx, args: { id: string; name?: string; website?: string; industry?: string; size?: string; description?: string }) {
      const { id, ...updates } = args
      await tx.mutate.companies.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.companies.delete({ id: args.id })
    },
  },

  contacts: {
    async create(tx: Tx, args: { id: string; companyId?: string; name: string; email?: string; phone?: string; linkedin?: string; role?: string }) {
      const now = Date.now()
      await tx.mutate.contacts.insert({ ...args, createdAt: now, updatedAt: now })
    },
    async update(tx: Tx, args: { id: string; companyId?: string; name?: string; email?: string; phone?: string; linkedin?: string; role?: string }) {
      const { id, ...updates } = args
      await tx.mutate.contacts.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.contacts.delete({ id: args.id })
    },
  },

  deals: {
    async create(tx: Tx, args: { id: string; companyId?: string; contactId?: string; title: string; stage?: string; value?: number; description?: string }) {
      const now = Date.now()
      await tx.mutate.deals.insert({ stage: 'prospecto', ...args, createdAt: now, updatedAt: now })
    },
    async update(tx: Tx, args: { id: string; companyId?: string; contactId?: string; title?: string; stage?: string; value?: number; description?: string }) {
      const { id, ...updates } = args
      await tx.mutate.deals.update({ id, ...updates, updatedAt: Date.now() })
    },
    async delete(tx: Tx, args: { id: string }) {
      await tx.mutate.deals.delete({ id: args.id })
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
}

export type Mutators = typeof mutators
