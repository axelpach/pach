import { useState, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useZero, useQuery } from '@rocicorp/zero/react'
import { ArrowLeft, Send, Trash2, Search, Check, CheckCircle2, AlertCircle, Clock, Eye } from 'lucide-react'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'
import { config } from '../../config'

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
      <div className="flex-1 flex items-center justify-center text-white/40">
        Campaña no encontrada.
      </div>
    )
  }
  if (!template) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/40">
        Plantilla eliminada.
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
      const res = await fetch(`${config.apiUrl}/whatsapp/campaigns/${campaign!.id}/fire`, {
        method: 'POST',
      })
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
      {/* Main column */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-8 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/whatsapp/campaigns" className="text-white/40 hover:text-white">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="text-base font-semibold text-white">{campaign.name}</div>
              <div className="text-xs text-white/40 font-mono mt-0.5">{template.name}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              className="p-2 rounded-lg text-white/50 hover:text-red-400 hover:bg-white/[0.04]"
              title="Eliminar"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleFire}
              disabled={firing || !isDraft || selectedIds.size === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90 disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
              {firing ? 'Enviando…' : isDraft ? `Enviar a ${selectedIds.size}` : 'Ya enviada'}
            </button>
          </div>
        </div>

        {fireError && (
          <div className="px-8 py-2 text-sm text-red-400 bg-red-500/[0.05] border-b border-white/[0.06]">{fireError}</div>
        )}

        <div className="flex-1 overflow-auto p-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Preview */}
          <section>
            <div className="text-xs uppercase tracking-wider text-white/40 mb-2 flex items-center gap-2">
              <Eye className="w-3 h-3" /> Vista previa
            </div>
            <div className="bg-[#0B141A] rounded-xl p-3 max-w-sm border border-white/[0.04]">
              <div className="bg-[#1F2C33] rounded-lg overflow-hidden">
                {template.headerSampleUrl && template.headerFormat === 'IMAGE' && (
                  <img src={template.headerSampleUrl} alt="" className="w-full h-48 object-cover" />
                )}
                {template.headerSampleUrl && template.headerFormat === 'VIDEO' && (
                  <video src={template.headerSampleUrl} className="w-full h-48 object-cover" controls />
                )}
                {template.headerText && template.headerFormat === 'TEXT' && (
                  <div className="px-3 pt-3 text-sm font-semibold text-white">{template.headerText}</div>
                )}
                <div className="px-3 py-2 text-sm text-white/90 whitespace-pre-wrap leading-relaxed">
                  {renderBody(template.bodyText)}
                </div>
                {template.footerText && (
                  <div className="px-3 pb-2 text-xs text-white/40">{template.footerText}</div>
                )}
                <div className="px-3 pb-2 text-[10px] text-white/30 text-right">12:34 PM</div>
              </div>
            </div>

            {template.variables && template.variables.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-xs uppercase tracking-wider text-white/40">Variables</div>
                {template.variables.map((v: string) => (
                  <div key={v} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-white/50 w-12">{v}</span>
                    <input
                      type="text"
                      value={variableValues[v] || ''}
                      onChange={e => updateVariable(v, e.target.value)}
                      disabled={!isDraft}
                      placeholder="valor…"
                      className="flex-1 px-2 py-1 bg-white/[0.04] border border-white/[0.08] rounded text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30 disabled:opacity-50"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recipients */}
          <section className="flex flex-col min-h-0">
            <div className="text-xs uppercase tracking-wider text-white/40 mb-2 flex items-center justify-between">
              <span>Destinatarios ({selectedIds.size} seleccionados)</span>
              {!isDraft && <span className="text-white/30">(bloqueado)</span>}
            </div>
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-white/40" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre o teléfono"
                className="w-full pl-8 pr-3 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30"
              />
            </div>
            <div className="flex-1 overflow-auto border border-white/[0.06] rounded-lg divide-y divide-white/[0.04] min-h-0">
              {filteredContacts.length === 0 && (
                <div className="text-sm text-white/40 px-3 py-6 text-center">Sin contactos con teléfono.</div>
              )}
              {filteredContacts.map(c => (
                <button
                  key={c.id}
                  onClick={() => toggleContact(c.id)}
                  disabled={!isDraft}
                  className={`w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-white/[0.04] disabled:opacity-60 ${
                    selectedIds.has(c.id) ? 'bg-white/[0.04]' : ''
                  }`}
                >
                  <div className={`w-4 h-4 rounded border ${selectedIds.has(c.id) ? 'bg-white border-white' : 'border-white/30'} flex items-center justify-center shrink-0`}>
                    {selectedIds.has(c.id) && <Check className="w-3 h-3 text-black" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{c.name}</div>
                    <div className="text-xs text-white/40 font-mono">{c.phone}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Logs */}
          {messages.length > 0 && (
            <section className="xl:col-span-2">
              <div className="text-xs uppercase tracking-wider text-white/40 mb-2">
                Logs ({messages.length})
              </div>
              <div className="border border-white/[0.06] rounded-lg divide-y divide-white/[0.04]">
                {messages.map(m => {
                  const status = m.status
                  const Icon =
                    status === 'failed' ? AlertCircle :
                    status === 'delivered' || status === 'read' ? CheckCircle2 :
                    status === 'sent' ? CheckCircle2 :
                    Clock
                  const color =
                    status === 'failed' ? 'text-red-400' :
                    status === 'read' ? 'text-blue-400' :
                    status === 'delivered' ? 'text-emerald-400' :
                    status === 'sent' ? 'text-white/70' :
                    'text-white/40'
                  return (
                    <div key={m.id} className="px-3 py-2 flex items-center gap-3 text-sm">
                      <Icon className={`w-4 h-4 shrink-0 ${color}`} />
                      <div className="font-mono text-white/70 w-36 truncate">{m.phone}</div>
                      <div className={`text-xs ${color} w-20`}>{status}</div>
                      <div className="flex-1 text-xs text-white/40 truncate">{m.error || m.metaMessageId || ''}</div>
                      <div className="text-[11px] text-white/30">
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
