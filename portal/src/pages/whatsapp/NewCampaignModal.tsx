import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useZero, useQuery } from '@rocicorp/zero/react'
import { X, Check } from 'lucide-react'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'

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
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-[#0A0A0D] border border-white/[0.06] rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col pointer-events-auto">
          <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <div className="text-lg font-semibold text-white">Nueva campaña</div>
            <button onClick={onClose} className="p-1 rounded hover:bg-white/[0.08] text-white/50">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-auto p-6 space-y-5">
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Nombre</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="p.ej. Lanzamiento mayo 2026"
                className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30"
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">
                Plantilla ({templates.length} aprobadas)
              </label>
              <div className="space-y-1 max-h-80 overflow-auto border border-white/[0.06] rounded-lg">
                {templates.length === 0 && (
                  <div className="text-sm text-white/40 px-3 py-4 text-center">
                    No hay plantillas aprobadas. Sincroniza desde Meta.
                  </div>
                )}
                {templates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTemplateId(t.id)}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-white/[0.04] ${
                      templateId === t.id ? 'bg-white/[0.06]' : ''
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border ${templateId === t.id ? 'bg-white border-white' : 'border-white/30'} flex items-center justify-center shrink-0`}>
                      {templateId === t.id && <Check className="w-3 h-3 text-black" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-sm text-white truncate">{t.name}</div>
                      <div className="text-xs text-white/40 truncate">
                        {t.language} · {t.category} {t.headerFormat ? `· ${t.headerFormat}` : ''}
                        {t.variables && t.variables.length > 0 ? ` · ${t.variables.length} vars` : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-white/[0.06] flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-white/60 hover:text-white text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={!templateId || !name.trim()}
              className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90 disabled:opacity-40"
            >
              Crear borrador
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
