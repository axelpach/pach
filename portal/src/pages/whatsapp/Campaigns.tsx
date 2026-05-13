import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useZero, useQuery } from '@rocicorp/zero/react'
import { Plus, Send, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'
import NewCampaignModal from './NewCampaignModal'

const STATUS_BADGES: Record<string, { icon: typeof FileText; label: string; color: string }> = {
  draft: { icon: FileText, label: 'Borrador', color: 'text-white/60 bg-white/[0.06]' },
  sending: { icon: Loader2, label: 'Enviando', color: 'text-amber-400 bg-amber-400/10' },
  sent: { icon: CheckCircle2, label: 'Enviada', color: 'text-emerald-400 bg-emerald-400/10' },
  failed: { icon: AlertCircle, label: 'Falló', color: 'text-red-400 bg-red-400/10' },
}

export default function Campaigns() {
  const z = useZero<Schema, Mutators>()
  const [campaigns] = useQuery(z.query.whatsapp_campaigns.orderBy('createdAt', 'desc'))
  const [templates] = useQuery(z.query.whatsapp_templates)
  const [showNew, setShowNew] = useState(false)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-8 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <p className="text-sm text-white/40">
          {campaigns.length} {campaigns.length === 1 ? 'campaña' : 'campañas'}
        </p>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90"
        >
          <Plus className="w-4 h-4" />
          Nueva campaña
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {campaigns.length === 0 ? (
          <div className="text-center text-white/40 py-12">
            No hay campañas. Crea una para empezar.
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {campaigns.map(c => {
              const template = templates.find(t => t.id === c.templateId)
              const badge = STATUS_BADGES[c.status] || STATUS_BADGES.draft
              const StatusIcon = badge.icon
              const recipientCount = (c.recipientFilter as { contactIds?: string[] } | undefined)?.contactIds?.length ?? 0
              return (
                <Link
                  key={c.id}
                  to={`/whatsapp/campaigns/${c.id}`}
                  className="block px-8 py-4 hover:bg-white/[0.03] transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${badge.color}`}>
                      <StatusIcon className={`w-3 h-3 ${c.status === 'sending' ? 'animate-spin' : ''}`} />
                      {badge.label}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">{c.name}</div>
                      <div className="text-xs text-white/40 mt-0.5">
                        <span className="font-mono">{template?.name || 'plantilla eliminada'}</span>
                        <span className="mx-2">·</span>
                        <span className="inline-flex items-center gap-1">
                          <Send className="w-3 h-3" /> {recipientCount} {recipientCount === 1 ? 'destinatario' : 'destinatarios'}
                        </span>
                        {c.firedAt && (
                          <>
                            <span className="mx-2">·</span>
                            <span>Enviada {new Date(c.firedAt).toLocaleString()}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {showNew && <NewCampaignModal onClose={() => setShowNew(false)} />}
    </div>
  )
}
