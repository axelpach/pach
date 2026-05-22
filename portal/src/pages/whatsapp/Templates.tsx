import { useMemo, useState } from 'react'
import { useZero, useQuery } from '@rocicorp/zero/react'
import { RefreshCw, CheckCircle2, Clock, XCircle, Pause, Image, Video, FileText, Type, X } from 'lucide-react'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'
import { config } from '../../config'
import { authFetch } from '../../lib/auth'
import { StatusPill, Button } from '../../components/pach'

const PROJECTS = ['ardia', 'ardia-mkt'] as const
type ProjectId = (typeof PROJECTS)[number]

const PROJECT_LABEL: Record<ProjectId, string> = {
  ardia: 'OPS',
  'ardia-mkt': 'MKT',
}

const PROJECT_NAME: Record<ProjectId, string> = {
  ardia: 'Ardia Operativa',
  'ardia-mkt': 'Ardia Marketing',
}

const PROJECT_BADGE: Record<ProjectId, string> = {
  ardia: 'text-fg-3 border-[rgba(255,255,255,0.15)]',
  'ardia-mkt': 'text-accent border-[rgba(0,255,136,0.35)]',
}

const STATUS_STYLES: Record<string, { kind: 'ok' | 'warn' | 'fail' | 'idle'; label: string }> = {
  APPROVED: { kind: 'ok', label: 'aprobada' },
  PENDING: { kind: 'warn', label: 'pendiente' },
  REJECTED: { kind: 'fail', label: 'rechazada' },
  PAUSED: { kind: 'idle', label: 'pausada' },
  DISABLED: { kind: 'idle', label: 'deshabilitada' },
  IN_APPEAL: { kind: 'warn', label: 'en apelación' },
  SUBMITTED: { kind: 'warn', label: 'enviada' },
}

const HEADER_ICON: Record<string, typeof Image> = {
  IMAGE: Image,
  VIDEO: Video,
  DOCUMENT: FileText,
  TEXT: Type,
}

interface RemoteTemplate {
  id: string
  companyId: string
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

export default function WhatsAppTemplates() {
  const z = useZero<Schema, Mutators>()
  const [templates] = useQuery(z.query.whatsapp_templates.orderBy('name', 'asc'))
  const [companies] = useQuery(z.query.companies.orderBy('name', 'asc'))
  const [syncing, setSyncing] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const projectByCompanyId = useMemo(
    () => new Map(companies.map(c => [c.id, (c.project ?? null) as ProjectId | null])),
    [companies],
  )

  const remoteTemplates = templates as RemoteTemplate[]
  const selected = remoteTemplates.find(t => t.id === selectedId) || null

  async function handleSync() {
    setSyncing(true)
    setStatusMessage(null)
    const results: string[] = []
    let totalCreated = 0
    let totalUpdated = 0
    let totalUnchanged = 0
    let totalFailed = 0
    for (const projectId of PROJECTS) {
      try {
        const res = await authFetch(`${config.apiUrl}/whatsapp/templates/sync`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectId }),
        })
        const data = await res.json()
        if (!res.ok) {
          results.push(`${projectId}: ✕ ${data.error || 'sync failed'}`)
          totalFailed++
          continue
        }
        results.push(`${projectId}: ${data.created} nuevas · ${data.updated} actualizadas · ${data.unchanged} sin cambios`)
        totalCreated += data.created ?? 0
        totalUpdated += data.updated ?? 0
        totalUnchanged += data.unchanged ?? 0
      } catch (e) {
        results.push(`${projectId}: ✕ ${e instanceof Error ? e.message : String(e)}`)
        totalFailed++
      }
    }
    setStatusMessage(`› sync · ${totalCreated} nuevas · ${totalUpdated} actualizadas · ${totalUnchanged} sin cambios${totalFailed ? ` · ${totalFailed} fallos` : ''}\n${results.join('\n')}`)
    setSyncing(false)
  }

  const projectStats = useMemo(() => {
    return PROJECTS.map(projectId => {
      const items = remoteTemplates.filter(t => projectByCompanyId.get(t.companyId) === projectId)
      return {
        projectId,
        total: items.length,
        approved: items.filter(t => String(t.status).toUpperCase() === 'APPROVED').length,
        pending: items.filter(t => ['PENDING', 'SUBMITTED', 'IN_APPEAL'].includes(String(t.status).toUpperCase())).length,
        rejected: items.filter(t => String(t.status).toUpperCase() === 'REJECTED').length,
      }
    })
  }, [projectByCompanyId, remoteTemplates])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-8 py-3 border-b border-[rgba(0,255,140,0.15)] flex items-center justify-between">
        <p className="text-xs text-fg-3 uppercase tracking-label">
          › whatsapp templates · sync-only view · {remoteTemplates.length} remotas
        </p>
        <Button kind="primary" icon={<RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />} onClick={handleSync} disabled={syncing}>
          {syncing ? 'sync…' : 'sync con meta'}
        </Button>
      </div>

      {statusMessage && (
        <div className="px-8 py-2 text-xs text-fg-2 border-b border-[rgba(0,255,140,0.10)] bg-[rgba(0,255,136,0.03)] font-mono whitespace-pre-wrap">
          {statusMessage}
        </div>
      )}

      <div className="flex-1 overflow-auto px-8 py-6 space-y-6">
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projectStats.map(stat => (
            <div key={stat.projectId} className="border border-[rgba(0,255,140,0.15)] bg-bg-2 p-4 font-mono">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-label text-fg-3">waba</div>
                  <div className="text-sm text-fg-1 mt-1">{PROJECT_NAME[stat.projectId]}</div>
                </div>
                <ProjectBadge projectId={stat.projectId} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-[11px] uppercase tracking-label">
                <Metric label="total" value={String(stat.total)} />
                <Metric label="aprobadas" value={String(stat.approved)} />
                <Metric label="pendientes" value={String(stat.pending)} />
                <Metric label="rechazadas" value={String(stat.rejected)} />
              </div>
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <SectionHeader
            title="Templates"
            subtitle="Vista operativa: lo que existe hoy en Meta, sincronizado por WABA. La creación y edición viven en Kapso; Pach solo sincroniza y luego enviará."
          />
          <div className="border border-[rgba(0,255,140,0.15)] bg-bg-2">
            {remoteTemplates.length === 0 ? (
              <EmptyState text="no hay plantillas remotas todavía · usa sync con meta" />
            ) : (
              remoteTemplates.map(template => {
                const HeaderIcon = template.headerFormat ? HEADER_ICON[template.headerFormat] || null : null
                const reviewInfo = STATUS_STYLES[String(template.status).toUpperCase()] || STATUS_STYLES.PENDING
                const isActive = template.id === selectedId
                const projectId = projectByCompanyId.get(template.companyId) as ProjectId | null
                return (
                  <button
                    key={template.id}
                    onClick={() => setSelectedId(template.id)}
                    className={`w-full text-left px-5 py-3 flex items-center gap-4 border-b border-[rgba(0,255,140,0.08)] last:border-b-0 hover:bg-[rgba(0,255,136,0.03)] transition-colors ${
                      isActive ? 'bg-[rgba(0,255,136,0.05)] border-l-2 border-l-accent' : ''
                    }`}
                  >
                    {projectId ? <ProjectBadge projectId={projectId} /> : <span className="text-fg-4 text-[10px] uppercase tracking-label">—</span>}
                    <StatusPill kind={reviewInfo.kind}>{reviewInfo.label}</StatusPill>
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-sm text-fg-1 truncate">{template.name}</div>
                      <div className="text-[11px] text-fg-3 mt-0.5 flex items-center gap-2 uppercase tracking-label flex-wrap">
                        <span>{template.language}</span>
                        <span className="text-fg-4">·</span>
                        <span>{template.category}</span>
                        {HeaderIcon && (
                          <>
                            <span className="text-fg-4">·</span>
                            <span className="inline-flex items-center gap-1">
                              <HeaderIcon className="w-3 h-3" /> {template.headerFormat}
                            </span>
                          </>
                        )}
                        {template.variables.length > 0 && (
                          <>
                            <span className="text-fg-4">·</span>
                            <span>{template.variables.length} {template.variables.length === 1 ? 'var' : 'vars'}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </section>
      </div>

      {selected && <TemplateDetail template={selected} projectId={projectByCompanyId.get(selected.companyId) as ProjectId | null} onClose={() => setSelectedId(null)} />}
    </div>
  )
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <div className="text-sm text-fg-1 font-mono uppercase tracking-label">{title}</div>
      <div className="text-xs text-fg-3 mt-1 max-w-3xl">{subtitle}</div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center text-fg-3 py-10 font-mono text-sm">
      <span className="text-fg-4">// </span>{text}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-fg-4">{label}</div>
      <div className="text-fg-1 mt-1 text-sm">{value}</div>
    </div>
  )
}

function ProjectBadge({ projectId }: { projectId: ProjectId }) {
  return (
    <span className={`text-[9px] uppercase tracking-label border px-1.5 py-0.5 font-mono shrink-0 ${PROJECT_BADGE[projectId]}`}>
      {PROJECT_LABEL[projectId]}
    </span>
  )
}

function TemplateDetail({ template: t, projectId, onClose }: { template: RemoteTemplate; projectId: ProjectId | null; onClose: () => void }) {
  const reviewInfo = STATUS_STYLES[String(t.status).toUpperCase()] || STATUS_STYLES.PENDING

  return (
    <>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-bg-2 border-l border-[rgba(0,255,140,0.35)] z-50 flex flex-col font-mono">
        <div className="px-6 py-4 border-b border-[rgba(0,255,140,0.15)] flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-base text-fg-1 truncate">▸ {t.name}</div>
            <div className="text-[10px] uppercase tracking-label text-fg-3 mt-1 flex items-center gap-2 flex-wrap">
              {projectId && <ProjectBadge projectId={projectId} />}
              <span>{t.language} · {t.category} {t.headerFormat ? `· ${t.headerFormat}` : ''}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill kind={reviewInfo.kind}>{reviewInfo.label}</StatusPill>
            <button onClick={onClose} className="p-1 text-fg-4 hover:text-accent">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-5">
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

          {t.variables.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-label text-fg-3 mb-2">◊ variables</div>
              <div className="flex flex-wrap gap-1.5">
                {t.variables.map(v => (
                  <span key={v} className="text-xs px-2 py-1 border border-[rgba(0,255,140,0.15)] text-accent">{v}</span>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-[10px] uppercase tracking-label text-fg-3 mb-2">◊ metadata</div>
            <dl className="text-sm space-y-1">
              <Row label="waba" value={projectId ? PROJECT_NAME[projectId] : '—'} />
              <Row label="categoría" value={t.category} />
              <Row label="idioma" value={t.language} />
              <Row label="header" value={t.headerFormat || '—'} />
              <Row label="meta status" value={t.status || '—'} />
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
