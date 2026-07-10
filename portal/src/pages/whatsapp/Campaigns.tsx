import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useZero, useQuery } from '@rocicorp/zero/react'
import { Plus, Send, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'
import NewCampaignModal from './NewCampaignModal'
import { StatusPill, Button } from '../../components/pach'

const STATUS_BADGES: Record<string, { icon: typeof FileText; label: string; kind: 'ok' | 'warn' | 'fail' | 'idle' }> = {
  draft: { icon: FileText, label: 'borrador', kind: 'idle' },
  sending: { icon: Loader2, label: 'enviando', kind: 'warn' },
  sent: { icon: CheckCircle2, label: 'enviada', kind: 'ok' },
  failed: { icon: AlertCircle, label: 'falló', kind: 'fail' },
}

export default function Campaigns({ basePath = '/marketing/whatsapp/campaigns' }: { basePath?: string }) {
  const z = useZero<Schema, Mutators>()
  const [campaigns] = useQuery(z.query.whatsapp_campaigns.orderBy('createdAt', 'desc'))
  const [templates] = useQuery(z.query.whatsapp_templates)
  const [showNew, setShowNew] = useState(false)

  return (
    <div className="flex flex-col">
      <div className="px-8 py-3 border-b border-edge/15 flex items-center justify-between">
        <p className="text-xs text-fg-3 uppercase tracking-label">
          › {campaigns.length} {campaigns.length === 1 ? 'campaña' : 'campañas'}
        </p>
        <Button kind="primary" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setShowNew(true)}>
          nueva campaña
        </Button>
      </div>

      <div>
        {campaigns.length === 0 ? (
          <div className="text-center text-fg-3 py-12 font-mono text-sm">
            <span className="text-fg-4">// </span>no hay campañas · crea una para empezar
          </div>
        ) : (
          <div>
            {campaigns.map(c => {
              const template = templates.find(t => t.id === c.templateId)
              const badge = STATUS_BADGES[c.status] || STATUS_BADGES.draft
              const recipientCount = (c.recipientFilter as { contactIds?: string[] } | undefined)?.contactIds?.length ?? 0
              return (
                <Link
                  key={c.id}
                  to={`${basePath}/${c.id}`}
                  className="block px-8 py-3.5 border-b border-edge/8 hover:bg-accent-fill/3 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <StatusPill kind={badge.kind} pulse={c.status === 'sending'}>{badge.label}</StatusPill>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-mono text-fg-1 truncate">▸ {c.name}</div>
                      <div className="text-[11px] text-fg-3 mt-0.5 uppercase tracking-label">
                        <span>{template?.name || '✕ plantilla eliminada'}</span>
                        <span className="mx-2 text-fg-4">·</span>
                        <span className="inline-flex items-center gap-1">
                          <Send className="w-3 h-3" /> {recipientCount} {recipientCount === 1 ? 'destinatario' : 'destinatarios'}
                        </span>
                        {c.firedAt && (
                          <>
                            <span className="mx-2 text-fg-4">·</span>
                            <span>fired {new Date(c.firedAt).toLocaleString()}</span>
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

      {showNew && <NewCampaignModal basePath={basePath} onClose={() => setShowNew(false)} />}
    </div>
  )
}
