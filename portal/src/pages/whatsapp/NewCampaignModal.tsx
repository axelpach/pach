import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useZero, useQuery } from '@rocicorp/zero/react'
import { X, Check } from 'lucide-react'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'
import { Button } from '../../components/pach'

export default function NewCampaignModal({ onClose }: { onClose: () => void }) {
  const z = useZero<Schema, Mutators>()
  const navigate = useNavigate()
  const [templates] = useQuery(z.query.whatsapp_templates.where('status', 'APPROVED').orderBy('name', 'asc'))
  const [companiesList] = useQuery(z.query.companies)
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState<string | null>(null)

  async function handleCreate() {
    if (!templateId || !name.trim()) return
    const template = templates.find(t => t.id === templateId)
    if (!template) return
    const company = companiesList.find(c => c.id === template.companyId)
    if (!company) return

    const id = crypto.randomUUID()
    await z.mutate.whatsapp_campaigns.create({
      id,
      companyId: company.id,
      templateId,
      name: name.trim(),
    })
    onClose()
    navigate(`/whatsapp/campaigns/${id}`)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-bg-2 border border-[rgba(0,255,140,0.35)] shadow-glow-sm w-full max-w-2xl max-h-[80vh] flex flex-col pointer-events-auto font-mono">
          <div className="px-6 py-4 border-b border-[rgba(0,255,140,0.15)] flex items-center justify-between">
            <div className="text-base text-accent uppercase tracking-label [text-shadow:0_0_6px_rgba(0,255,136,0.4)]">◊ nueva campaña</div>
            <button onClick={onClose} className="p-1 text-fg-4 hover:text-accent">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-auto p-6 space-y-5">
            <div>
              <label className="block text-[10px] uppercase tracking-label text-fg-3 mb-1.5">◊ nombre</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="p.ej. lanzamiento mayo 2026"
                className="w-full px-3 py-2 bg-rim border border-[rgba(0,255,140,0.15)] text-fg-1 text-sm placeholder:text-fg-4 outline-none focus:border-accent focus:shadow-glow-xs"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-label text-fg-3 mb-1.5">
                ◊ plantilla ({templates.length} aprobadas)
              </label>
              <div className="max-h-80 overflow-auto border border-[rgba(0,255,140,0.15)]">
                {templates.length === 0 && (
                  <div className="text-sm text-fg-3 px-3 py-4 text-center">
                    <span className="text-fg-4">// </span>no hay plantillas aprobadas · sincroniza desde meta
                  </div>
                )}
                {templates.map(t => {
                  const sel = templateId === t.id
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTemplateId(t.id)}
                      className={`w-full text-left px-3 py-2.5 flex items-center gap-3 border-b border-[rgba(0,255,140,0.08)] last:border-b-0 transition-colors ${
                        sel ? 'bg-[rgba(0,255,136,0.06)]' : 'hover:bg-[rgba(0,255,136,0.03)]'
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 border flex items-center justify-center shrink-0 ${sel ? 'bg-accent border-accent' : 'border-[rgba(0,255,140,0.35)]'}`}>
                        {sel && <Check className="w-2.5 h-2.5 text-bg-0" strokeWidth={3} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-sm text-fg-1 truncate">{t.name}</div>
                        <div className="text-[10px] uppercase tracking-label text-fg-3 truncate mt-0.5">
                          {t.language} · {t.category} {t.headerFormat ? `· ${t.headerFormat}` : ''}
                          {t.variables && t.variables.length > 0 ? ` · ${t.variables.length} vars` : ''}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-[rgba(0,255,140,0.15)] flex justify-end gap-2">
            <Button kind="ghost" onClick={onClose}>cancelar</Button>
            <Button kind="primary" onClick={handleCreate} disabled={!templateId || !name.trim()}>
              crear borrador
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
