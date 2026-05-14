import { useState, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useZero, useQuery } from '@rocicorp/zero/react'
import { ArrowLeft, Send, Trash2, Search, Check, CheckCircle2, AlertCircle, Clock, Eye } from 'lucide-react'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'
import { config } from '../../config'
import { Button } from '../../components/pach'

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>()
  const z = useZero<Schema, Mutators>()
  const navigate = useNavigate()
  const [campaigns] = useQuery(z.query.whatsapp_campaigns.where('id', id || ''))
  const [templates] = useQuery(z.query.whatsapp_templates)
  const [contacts] = useQuery(z.query.crm_contacts.orderBy('name', 'asc'))
  const [messages] = useQuery(
    z.query.whatsapp_messages.where('campaignId', id || '').orderBy('createdAt', 'desc'),
  )
  const [firing, setFiring] = useState(false)
  const [fireError, setFireError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const campaign = campaigns[0]
  const template = campaign ? templates.find(t => t.id === campaign.templateId) : null

  const selectedIds = useMemo<Set<string>>(() => {
    const filter = (campaign?.recipientFilter as { contactIds?: string[] } | undefined) ?? {}
    return new Set(filter.contactIds || [])
  }, [campaign?.recipientFilter])

  const variableValues = useMemo<Record<string, string>>(
    () => (campaign?.variableValues as Record<string, string> | undefined) || {},
    [campaign?.variableValues],
  )

  if (!campaign) {
    return (
      <div className="flex-1 flex items-center justify-center text-fg-3 font-mono text-sm">
        <span className="text-fg-4">// </span>campaña no encontrada
      </div>
    )
  }
  if (!template) {
    return (
      <div className="flex-1 flex items-center justify-center text-fg-3 font-mono text-sm">
        <span className="text-fg-4">// </span>plantilla eliminada
      </div>
    )
  }

  const isDraft = campaign.status === 'draft'
  const filteredContacts = contacts.filter(
    c => c.phone && (search === '' || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)),
  )

  async function toggleContact(contactId: string) {
    if (!isDraft) return
    const next = new Set(selectedIds)
    if (next.has(contactId)) next.delete(contactId)
    else next.add(contactId)
    await z.mutate.whatsapp_campaigns.update({
      id: campaign!.id,
      recipientFilter: { contactIds: Array.from(next) },
    })
  }

  async function updateVariable(variable: string, value: string) {
    if (!isDraft) return
    await z.mutate.whatsapp_campaigns.update({
      id: campaign!.id,
      variableValues: { ...variableValues, [variable]: value },
    })
  }

  async function handleFire() {
    if (selectedIds.size === 0) {
      setFireError('Selecciona al menos un destinatario')
      return
    }
    setFiring(true)
    setFireError(null)
    try {
      const res = await fetch(`${config.apiUrl}/whatsapp/campaigns/${campaign!.id}/fire`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'fire failed')
    } catch (e) {
      setFireError(e instanceof Error ? e.message : String(e))
    } finally {
      setFiring(false)
    }
  }

  async function handleDelete() {
    if (!confirm('¿Eliminar esta campaña?')) return
    await z.mutate.whatsapp_campaigns.delete({ id: campaign!.id })
    navigate('/whatsapp/campaigns')
  }

  function renderBody(text: string | null | undefined) {
    if (!text) return '—'
    return text.replace(/\{\{(\d+)\}\}/g, (m, n) => variableValues[`{{${n}}}`] || m)
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-8 py-3 border-b border-[rgba(0,255,140,0.15)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/whatsapp/campaigns" className="text-fg-3 hover:text-accent transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="text-sm font-mono text-fg-1">▸ {campaign.name}</div>
              <div className="text-[10px] uppercase tracking-label text-fg-3 mt-0.5">{template.name}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleDelete} className="p-2 text-fg-4 hover:text-fail transition-colors" title="Eliminar">
              <Trash2 className="w-4 h-4" />
            </button>
            <Button
              kind="primary"
              icon={<Send className="w-3.5 h-3.5" />}
              onClick={handleFire}
              disabled={firing || !isDraft || selectedIds.size === 0}
            >
              {firing ? 'enviando…' : isDraft ? `enviar a ${selectedIds.size}` : 'ya enviada'}
            </Button>
          </div>
        </div>

        {fireError && (
          <div className="px-8 py-2 text-xs font-mono text-fail bg-[rgba(255,77,109,0.05)] border-b border-[rgba(255,77,109,0.25)]">
            ✕ {fireError}
          </div>
        )}

        <div className="flex-1 overflow-auto p-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Preview */}
          <section>
            <div className="text-[10px] uppercase tracking-label text-fg-3 mb-2 flex items-center gap-2">
              <Eye className="w-3 h-3" /> ◊ vista previa
            </div>
            <div className="bg-[#0B141A] p-3 max-w-sm border border-[rgba(0,255,140,0.10)]">
              <div className="bg-[#1F2C33] overflow-hidden">
                {template.headerSampleUrl && template.headerFormat === 'IMAGE' && (
                  <img src={template.headerSampleUrl} alt="" className="w-full h-48 object-cover" />
                )}
                {template.headerSampleUrl && template.headerFormat === 'VIDEO' && (
                  <video src={template.headerSampleUrl} className="w-full h-48 object-cover" controls />
                )}
                {template.headerText && template.headerFormat === 'TEXT' && (
                  <div className="px-3 pt-3 text-sm font-semibold text-white font-sans">{template.headerText}</div>
                )}
                <div className="px-3 py-2 text-sm text-white/90 whitespace-pre-wrap leading-relaxed font-sans">
                  {renderBody(template.bodyText)}
                </div>
                {template.footerText && (
                  <div className="px-3 pb-2 text-xs text-white/40 font-sans">{template.footerText}</div>
                )}
                <div className="px-3 pb-2 text-[10px] text-white/30 text-right">12:34 PM</div>
              </div>
            </div>

            {template.variables && template.variables.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-[10px] uppercase tracking-label text-fg-3">◊ variables</div>
                {template.variables.map((v: string) => (
                  <div key={v} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-accent w-12">{v}</span>
                    <input
                      type="text"
                      value={variableValues[v] || ''}
                      onChange={e => updateVariable(v, e.target.value)}
                      disabled={!isDraft}
                      placeholder="valor…"
                      className="flex-1 px-2 py-1 bg-rim border border-[rgba(0,255,140,0.15)] text-fg-1 text-sm placeholder:text-fg-4 outline-none focus:border-accent focus:shadow-glow-xs disabled:opacity-50"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recipients */}
          <section className="flex flex-col min-h-0">
            <div className="text-[10px] uppercase tracking-label text-fg-3 mb-2 flex items-center justify-between">
              <span>◊ destinatarios ({selectedIds.size} sel)</span>
              {!isDraft && <span className="text-fg-4">(locked)</span>}
            </div>
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-fg-4" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="$ search…"
                className="w-full pl-8 pr-3 py-1.5 bg-rim border border-[rgba(0,255,140,0.15)] text-fg-1 text-sm placeholder:text-fg-4 outline-none focus:border-accent focus:shadow-glow-xs"
              />
            </div>
            <div className="flex-1 overflow-auto border border-[rgba(0,255,140,0.15)] min-h-0">
              {filteredContacts.length === 0 && (
                <div className="text-sm text-fg-3 px-3 py-6 text-center font-mono">
                  <span className="text-fg-4">// </span>sin contactos con teléfono
                </div>
              )}
              {filteredContacts.map(c => {
                const sel = selectedIds.has(c.id)
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleContact(c.id)}
                    disabled={!isDraft}
                    className={`w-full text-left px-3 py-2 flex items-center gap-3 border-b border-[rgba(0,255,140,0.08)] last:border-b-0 hover:bg-[rgba(0,255,136,0.04)] disabled:opacity-60 ${
                      sel ? 'bg-[rgba(0,255,136,0.05)]' : ''
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 border flex items-center justify-center shrink-0 ${sel ? 'bg-accent border-accent' : 'border-[rgba(0,255,140,0.35)]'}`}>
                      {sel && <Check className="w-2.5 h-2.5 text-bg-0" strokeWidth={3} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-mono text-fg-1 truncate">{c.name}</div>
                      <div className="text-[10px] text-fg-3 font-mono">{c.phone}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Logs */}
          {messages.length > 0 && (
            <section className="xl:col-span-2">
              <div className="text-[10px] uppercase tracking-label text-fg-3 mb-2">◊ logs · trace ({messages.length})</div>
              <div className="border border-[rgba(0,255,140,0.15)] bg-void font-mono">
                {messages.map(m => {
                  const status = m.status
                  const Icon =
                    status === 'failed' ? AlertCircle :
                    status === 'delivered' || status === 'read' ? CheckCircle2 :
                    status === 'sent' ? CheckCircle2 :
                    Clock
                  const color =
                    status === 'failed' ? 'text-fail' :
                    status === 'read' ? 'text-pach-info' :
                    status === 'delivered' ? 'text-ok' :
                    status === 'sent' ? 'text-fg-1' :
                    'text-fg-3'
                  return (
                    <div key={m.id} className="px-3 py-2 flex items-center gap-3 text-xs border-b border-[rgba(0,255,140,0.08)] last:border-b-0">
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
                      <div className="text-fg-2 w-36 truncate">{m.phone}</div>
                      <div className={`text-[10px] uppercase tracking-label ${color} w-24`}>{status}</div>
                      <div className="flex-1 text-[10px] text-fg-3 truncate">{m.error || m.metaMessageId || ''}</div>
                      <div className="text-[10px] text-fg-4">
                        {m.sentAt ? new Date(m.sentAt).toLocaleTimeString() : new Date(m.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
