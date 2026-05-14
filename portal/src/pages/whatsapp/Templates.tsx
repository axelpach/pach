import { useState } from 'react'
import { useZero, useQuery } from '@rocicorp/zero/react'
import { RefreshCw, CheckCircle2, Clock, XCircle, Pause, Image, Video, FileText, Type, X } from 'lucide-react'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'
import { config } from '../../config'
import { StatusPill, Button } from '../../components/pach'

const PROJECT_ID = 'ardia'

const STATUS_STYLES: Record<string, { icon: typeof CheckCircle2; kind: 'ok' | 'warn' | 'fail' | 'idle'; label: string }> = {
  APPROVED: { icon: CheckCircle2, kind: 'ok', label: 'aprobada' },
  PENDING: { icon: Clock, kind: 'warn', label: 'pendiente' },
  REJECTED: { icon: XCircle, kind: 'fail', label: 'rechazada' },
  PAUSED: { icon: Pause, kind: 'idle', label: 'pausada' },
  DISABLED: { icon: XCircle, kind: 'idle', label: 'deshabilitada' },
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
      setSyncMessage(`› sincronizado · ${data.created} nuevas · ${data.updated} actualizadas · ${data.unchanged} sin cambios`)
    } catch (e) {
      setSyncMessage(`✕ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-8 py-3 border-b border-[rgba(0,255,140,0.15)] flex items-center justify-between">
        <p className="text-xs text-fg-3 uppercase tracking-label">
          › {templates.length} {templates.length === 1 ? 'plantilla' : 'plantillas'} · synced desde meta
        </p>
        <Button kind="primary" icon={<RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />} onClick={handleSync} disabled={syncing}>
          {syncing ? 'sync…' : 'sync con meta'}
        </Button>
      </div>

      {syncMessage && (
        <div className="px-8 py-2 text-xs text-fg-2 border-b border-[rgba(0,255,140,0.10)] bg-[rgba(0,255,136,0.03)] font-mono">
          {syncMessage}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {templates.length === 0 ? (
          <div className="text-center text-fg-3 py-12 font-mono text-sm">
            <span className="text-fg-4">// </span>no hay plantillas · click <span className="text-accent">sync con meta</span> para traerlas
          </div>
        ) : (
          <div>
            {templates.map(t => {
              const statusInfo = STATUS_STYLES[t.status] || STATUS_STYLES.PENDING
              const HeaderIcon = t.headerFormat ? HEADER_ICON[t.headerFormat] || null : null
              const isActive = t.id === selectedId
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full text-left px-8 py-3 flex items-center gap-4 border-b border-[rgba(0,255,140,0.08)] hover:bg-[rgba(0,255,136,0.03)] transition-colors ${
                    isActive ? 'bg-[rgba(0,255,136,0.05)] border-l-2 border-l-accent' : ''
                  }`}
                >
                  <StatusPill kind={statusInfo.kind}>{statusInfo.label}</StatusPill>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm text-fg-1 truncate">{t.name}</div>
                    <div className="text-[11px] text-fg-3 mt-0.5 flex items-center gap-2 uppercase tracking-label">
                      <span>{t.language}</span>
                      <span className="text-fg-4">·</span>
                      <span>{t.category}</span>
                      {HeaderIcon && (
                        <>
                          <span className="text-fg-4">·</span>
                          <span className="inline-flex items-center gap-1">
                            <HeaderIcon className="w-3 h-3" /> {t.headerFormat}
                          </span>
                        </>
                      )}
                      {t.variables && t.variables.length > 0 && (
                        <>
                          <span className="text-fg-4">·</span>
                          <span>{t.variables.length} {t.variables.length === 1 ? 'var' : 'vars'}</span>
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

  return (
    <>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-bg-2 border-l border-[rgba(0,255,140,0.35)] z-50 flex flex-col font-mono">
        <div className="px-6 py-4 border-b border-[rgba(0,255,140,0.15)] flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-base text-fg-1 truncate">▸ {t.name}</div>
            <div className="text-[10px] uppercase tracking-label text-fg-3 mt-1">
              {t.language} · {t.category} {t.headerFormat ? `· ${t.headerFormat}` : ''}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill kind={statusInfo.kind}>{statusInfo.label}</StatusPill>
            <button onClick={onClose} className="p-1 text-fg-4 hover:text-accent">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-5">
          {/* WhatsApp-style preview — kept native to read like WhatsApp */}
          <div>
            <div className="text-[10px] uppercase tracking-label text-fg-3 mb-2">◊ vista previa</div>
            <div className="bg-[#0B141A] p-3 max-w-sm border border-[rgba(0,255,140,0.10)]">
              <div className="bg-[#1F2C33] overflow-hidden">
                {t.headerSampleUrl && t.headerFormat === 'IMAGE' && (
                  <img src={t.headerSampleUrl} alt="" className="w-full h-48 object-cover" />
                )}
                {t.headerSampleUrl && t.headerFormat === 'VIDEO' && (
                  <video src={t.headerSampleUrl} className="w-full h-48 object-cover" controls />
                )}
                {t.headerText && t.headerFormat === 'TEXT' && (
                  <div className="px-3 pt-3 text-sm font-semibold text-white">{t.headerText}</div>
                )}
                <div className="px-3 py-2 text-sm text-white/90 whitespace-pre-wrap leading-relaxed font-sans">
                  {t.bodyText || '—'}
                </div>
                {t.footerText && <div className="px-3 pb-2 text-xs text-white/40 font-sans">{t.footerText}</div>}
                <div className="px-3 pb-2 text-[10px] text-white/30 text-right">12:34 PM</div>
              </div>
            </div>
          </div>

          {t.variables && t.variables.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-label text-fg-3 mb-2">◊ variables</div>
              <div className="flex flex-wrap gap-1.5">
                {t.variables.map((v: string) => (
                  <span key={v} className="text-xs px-2 py-1 border border-[rgba(0,255,140,0.15)] text-accent">{v}</span>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-[10px] uppercase tracking-label text-fg-3 mb-2">◊ metadata</div>
            <dl className="text-sm space-y-1">
              <Row label="categoría" value={t.category} />
              <Row label="idioma" value={t.language} />
              <Row label="header" value={t.headerFormat || '—'} />
              <Row label="last sync" value={new Date(t.lastSyncedAt).toLocaleString()} />
            </dl>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-label text-fg-3 mb-2">◊ components (raw)</div>
            <pre className="text-[11px] text-fg-3 bg-void border border-[rgba(0,255,140,0.10)] p-3 overflow-auto max-h-64">
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
    <div className="flex justify-between gap-4 text-[11px] uppercase tracking-label">
      <dt className="text-fg-3">{label}</dt>
      <dd className="text-fg-1 text-right normal-case tracking-normal">{value}</dd>
    </div>
  )
}
