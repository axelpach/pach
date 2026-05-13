import { useState } from 'react'
import { useZero, useQuery } from '@rocicorp/zero/react'
import { RefreshCw, CheckCircle2, Clock, XCircle, Pause, Image, Video, FileText, Type, X } from 'lucide-react'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'
import { config } from '../../config'

const PROJECT_ID = 'ardia'

const STATUS_STYLES: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  APPROVED: { icon: CheckCircle2, color: 'text-emerald-400 bg-emerald-400/10', label: 'Aprobada' },
  PENDING: { icon: Clock, color: 'text-amber-400 bg-amber-400/10', label: 'Pendiente' },
  REJECTED: { icon: XCircle, color: 'text-red-400 bg-red-400/10', label: 'Rechazada' },
  PAUSED: { icon: Pause, color: 'text-white/50 bg-white/10', label: 'Pausada' },
  DISABLED: { icon: XCircle, color: 'text-white/40 bg-white/5', label: 'Deshabilitada' },
}

const HEADER_ICON: Record<string, typeof Image> = {
  IMAGE: Image,
  VIDEO: Video,
  DOCUMENT: FileText,
  TEXT: Type,
}

export default function WhatsAppTemplates() {
  const z = useZero<Schema, Mutators>()
  const [templates] = useQuery(z.query.whatsapp_templates.orderBy('name', 'asc'))
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = templates.find(t => t.id === selectedId) || null

  async function handleSync() {
    setSyncing(true)
    setSyncMessage(null)
    try {
      const res = await fetch(`${config.apiUrl}/whatsapp/templates/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: PROJECT_ID }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'sync failed')
      setSyncMessage(`Sincronizado: ${data.created} nuevas, ${data.updated} actualizadas, ${data.unchanged} sin cambios`)
    } catch (e) {
      setSyncMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-8 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <p className="text-sm text-white/40">
          {templates.length} {templates.length === 1 ? 'plantilla' : 'plantillas'} sincronizadas desde Meta
        </p>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] text-white text-sm font-medium disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Sincronizando…' : 'Sincronizar con Meta'}
        </button>
      </div>

      {syncMessage && (
        <div className="px-8 py-3 text-sm text-white/70 border-b border-white/[0.06] bg-white/[0.02]">{syncMessage}</div>
      )}

      <div className="flex-1 overflow-auto">
        {templates.length === 0 ? (
          <div className="text-center text-white/40 py-12">
            No hay plantillas. Haz clic en <span className="text-white/70">Sincronizar con Meta</span> para traerlas.
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {templates.map(t => {
              const statusInfo = STATUS_STYLES[t.status] || STATUS_STYLES.PENDING
              const StatusIcon = statusInfo.icon
              const HeaderIcon = t.headerFormat ? HEADER_ICON[t.headerFormat] || null : null
              const isActive = t.id === selectedId
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full text-left px-8 py-3 flex items-center gap-4 hover:bg-white/[0.03] transition-colors ${
                    isActive ? 'bg-white/[0.05]' : ''
                  }`}
                >
                  <div className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${statusInfo.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {statusInfo.label}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm text-white truncate">{t.name}</div>
                    <div className="text-xs text-white/40 mt-0.5 flex items-center gap-2">
                      <span>{t.language}</span>
                      <span>·</span>
                      <span>{t.category}</span>
                      {HeaderIcon && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <HeaderIcon className="w-3 h-3" /> {t.headerFormat}
                          </span>
                        </>
                      )}
                      {t.variables && t.variables.length > 0 && (
                        <>
                          <span>·</span>
                          <span>{t.variables.length} {t.variables.length === 1 ? 'variable' : 'variables'}</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {selected && <TemplateDetail template={selected} onClose={() => setSelectedId(null)} />}
    </div>
  )
}

interface Template {
  id: string
  name: string
  language: string
  status: string
  category: string
  headerFormat?: string | null
  headerText?: string | null
  headerSampleUrl?: string | null
  bodyText?: string | null
  footerText?: string | null
  variables: readonly string[]
  components?: unknown[] | null
  lastSyncedAt: number
}

function TemplateDetail({ template: t, onClose }: { template: Template; onClose: () => void }) {
  const statusInfo = STATUS_STYLES[t.status] || STATUS_STYLES.PENDING
  const StatusIcon = statusInfo.icon

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-[#0A0A0D] border-l border-white/[0.06] z-50 flex flex-col">
        <div className="px-6 py-5 border-b border-white/[0.06] flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-mono text-base text-white truncate">{t.name}</div>
            <div className="text-xs text-white/40 mt-1">
              {t.language} · {t.category} {t.headerFormat ? `· ${t.headerFormat}` : ''}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${statusInfo.color}`}>
              <StatusIcon className="w-3 h-3" />
              {statusInfo.label}
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-white/[0.08] text-white/50">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-5">
          {/* WhatsApp-style preview */}
          <div>
            <div className="text-xs uppercase tracking-wider text-white/40 mb-2">Vista previa</div>
            <div className="bg-[#0B141A] rounded-xl p-3 max-w-sm border border-white/[0.04]">
              <div className="bg-[#1F2C33] rounded-lg overflow-hidden">
                {t.headerSampleUrl && t.headerFormat === 'IMAGE' && (
                  <img src={t.headerSampleUrl} alt="" className="w-full h-48 object-cover" />
                )}
                {t.headerSampleUrl && t.headerFormat === 'VIDEO' && (
                  <video src={t.headerSampleUrl} className="w-full h-48 object-cover" controls />
                )}
                {t.headerText && t.headerFormat === 'TEXT' && (
                  <div className="px-3 pt-3 text-sm font-semibold text-white">{t.headerText}</div>
                )}
                <div className="px-3 py-2 text-sm text-white/90 whitespace-pre-wrap leading-relaxed">
                  {t.bodyText || '—'}
                </div>
                {t.footerText && (
                  <div className="px-3 pb-2 text-xs text-white/40">{t.footerText}</div>
                )}
                <div className="px-3 pb-2 text-[10px] text-white/30 text-right">12:34 PM</div>
              </div>
            </div>
          </div>

          {t.variables && t.variables.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-white/40 mb-2">Variables</div>
              <div className="flex flex-wrap gap-1.5">
                {t.variables.map((v: string) => (
                  <span key={v} className="text-xs font-mono px-2 py-1 rounded bg-white/[0.06] text-white/70">{v}</span>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-xs uppercase tracking-wider text-white/40 mb-2">Metadata</div>
            <dl className="text-sm space-y-1">
              <Row label="Categoría" value={t.category} />
              <Row label="Idioma" value={t.language} />
              <Row label="Header" value={t.headerFormat || '—'} />
              <Row label="Última sincronización" value={new Date(t.lastSyncedAt).toLocaleString()} />
            </dl>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider text-white/40 mb-2">Componentes (raw)</div>
            <pre className="text-[11px] font-mono text-white/50 bg-black/30 rounded-lg p-3 overflow-auto max-h-64">
              {JSON.stringify(t.components ?? [], null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-white/40">{label}</dt>
      <dd className="text-white/80 text-right">{value}</dd>
    </div>
  )
}
