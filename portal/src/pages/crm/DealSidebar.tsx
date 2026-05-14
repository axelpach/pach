import { useZero, useQuery } from '@rocicorp/zero/react'
import { useState } from 'react'
import { X, Building2, User, DollarSign, Thermometer, StickyNote, Plus, Trash2, Instagram, Phone, ExternalLink, Mail } from 'lucide-react'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'

const STAGES = [
  { value: 'prospecto', label: 'Prospecto' },
  { value: 'contactado', label: 'Contactado' },
  { value: 'propuesta', label: 'Propuesta' },
  { value: 'negociacion', label: 'Negociacion' },
  { value: 'cerrado_ganado', label: 'Cerrado' },
  { value: 'cerrado_perdido', label: 'Perdido' },
]

const TEMPERATURES = [
  { value: '', label: 'None' },
  { value: 'hot', label: 'Hot', color: '#ff4d6d' },
  { value: 'warm', label: 'Warm', color: '#ffb547' },
  { value: 'cold', label: 'Cold', color: '#5ad6ff' },
  { value: 'ghosted', label: 'Ghosted', color: '#5a8a72' },
]

const INPUT_CLS =
  'w-full bg-rim border border-[rgba(0,255,140,0.15)] px-3 py-2 text-sm text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs placeholder:text-fg-4'

const LABEL_CLS = 'text-[10px] uppercase tracking-label text-fg-3 mb-1.5 flex items-center gap-1.5'

interface DealSidebarProps {
  dealId: string
  onClose: () => void
}

export default function DealSidebar({ dealId, onClose }: DealSidebarProps) {
  const z = useZero<Schema, Mutators>()
  const [deals] = useQuery(z.query.crm_deals.where('id', dealId))
  const [notes] = useQuery(z.query.crm_notes.where('dealId', dealId).orderBy('createdAt', 'desc'))
  const [allCompanies] = useQuery(z.query.crm_companies)
  const [allContacts] = useQuery(z.query.crm_contacts)
  const [dealContactLinks] = useQuery(z.query.crm_deal_contacts.where('dealId', dealId))
  const [newNote, setNewNote] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [showCompanyPicker, setShowCompanyPicker] = useState(false)
  const [showContactPicker, setShowContactPicker] = useState(false)
  const [companySearch, setCompanySearch] = useState('')
  const [contactSearch, setContactSearch] = useState('')

  const deal = deals[0]
  if (!deal) return null

  const company = deal.companyId ? allCompanies.find((c) => c.id === deal.companyId) : null
  const linkedContactIds = new Set(dealContactLinks.map((dc) => dc.contactId))
  const linkedContacts = allContacts.filter((c) => linkedContactIds.has(c.id))
  const companyContacts = deal.companyId ? allContacts.filter((c) => c.companyId === deal.companyId) : []

  const handleUpdateField = (field: string, value: string | number | undefined) => {
    z.mutate.crm_deals.update({ id: dealId, [field]: value } as any)
  }

  const handleAddNote = () => {
    if (!newNote.trim()) return
    z.mutate.crm_notes.create({ id: crypto.randomUUID(), dealId, body: newNote.trim(), type: 'manual' })
    setNewNote('')
  }

  const handleDeleteNote = (noteId: string) => z.mutate.crm_notes.delete({ id: noteId })

  const handleTitleSave = () => {
    if (titleDraft.trim() && titleDraft !== deal.title) handleUpdateField('title', titleDraft.trim())
    setEditingTitle(false)
  }

  const handleDeleteDeal = () => {
    for (const note of notes) z.mutate.crm_notes.delete({ id: note.id })
    z.mutate.crm_deals.delete({ id: dealId })
    onClose()
  }

  const handleLinkCompany = (companyId: string) => {
    z.mutate.crm_deals.update({ id: dealId, companyId } as any)
    setShowCompanyPicker(false)
    setCompanySearch('')
  }
  const handleCreateCompany = (name: string) => {
    const id = crypto.randomUUID()
    z.mutate.crm_companies.create({ id, name })
    z.mutate.crm_deals.update({ id: dealId, companyId: id } as any)
    setShowCompanyPicker(false)
    setCompanySearch('')
  }
  const handleUnlinkCompany = () => z.mutate.crm_deals.update({ id: dealId, companyId: undefined } as any)

  const handleLinkContact = (contactId: string) => {
    if (linkedContactIds.has(contactId)) return
    z.mutate.crm_deal_contacts.create({ id: crypto.randomUUID(), dealId, contactId })
    setShowContactPicker(false)
    setContactSearch('')
  }
  const handleCreateContact = (name: string) => {
    const contactId = crypto.randomUUID()
    z.mutate.crm_contacts.create({ id: contactId, name, companyId: deal.companyId || undefined })
    z.mutate.crm_deal_contacts.create({ id: crypto.randomUUID(), dealId, contactId })
    setShowContactPicker(false)
    setContactSearch('')
  }
  const handleUnlinkContact = (contactId: string) => {
    const link = dealContactLinks.find((dc) => dc.contactId === contactId)
    if (link) z.mutate.crm_deal_contacts.delete({ id: link.id })
  }

  const filteredCompanies = allCompanies.filter((c) =>
    c.name.toLowerCase().includes(companySearch.toLowerCase()),
  )
  const filteredContacts = (deal.companyId ? companyContacts : allContacts).filter(
    (c) => !linkedContactIds.has(c.id) && c.name.toLowerCase().includes(contactSearch.toLowerCase()),
  )

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-[480px] h-full bg-bg-2 border-l border-[rgba(0,255,140,0.35)] overflow-y-auto font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-bg-2 border-b border-[rgba(0,255,140,0.15)] px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {editingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => e.key === 'Enter' && handleTitleSave()}
                className="text-base font-bold text-accent bg-transparent border-b border-accent outline-none w-full"
              />
            ) : (
              <h2
                className="text-base font-bold text-fg-1 lowercase truncate cursor-pointer hover:text-accent"
                onClick={() => { setTitleDraft(deal.title); setEditingTitle(true) }}
              >
                {deal.title}
              </h2>
            )}
          </div>
          <div className="flex items-center gap-2 ml-3">
            <button onClick={handleDeleteDeal} className="text-fg-4 hover:text-fail transition-colors p-1">
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="text-fg-4 hover:text-accent transition-colors p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Stage */}
          <div>
            <label className={LABEL_CLS}>◊ stage</label>
            <select
              value={deal.stage}
              onChange={(e) => handleUpdateField('stage', e.target.value)}
              className={INPUT_CLS}
            >
              {STAGES.map((s) => (
                <option key={s.value} value={s.value} className="bg-bg-2">
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Temperature */}
          <div>
            <label className={LABEL_CLS}>
              <Thermometer className="w-3 h-3" /> temperature
            </label>
            <div className="flex flex-wrap gap-1.5">
              {TEMPERATURES.map((t) => {
                const active = deal.temperature === t.value || (!deal.temperature && !t.value)
                return (
                  <button
                    key={t.value}
                    onClick={() => handleUpdateField('temperature', t.value || undefined)}
                    className={`px-2.5 py-1 text-[10px] uppercase tracking-label transition-colors border ${
                      active
                        ? 'border-accent text-accent bg-[rgba(0,255,136,0.06)]'
                        : 'border-[rgba(0,255,140,0.15)] text-fg-3 hover:text-fg-1'
                    }`}
                  >
                    {t.color && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ backgroundColor: t.color }} />}
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Value */}
          <div>
            <label className={LABEL_CLS}>
              <DollarSign className="w-3 h-3" /> value (MXN)
            </label>
            <input
              type="number"
              value={deal.value || ''}
              onChange={(e) => handleUpdateField('value', e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="0"
              className={INPUT_CLS}
            />
          </div>

          {/* Company */}
          <div>
            <label className={LABEL_CLS}>
              <Building2 className="w-3 h-3" /> company
            </label>
            {company ? (
              <div className="border border-[rgba(0,255,140,0.15)] bg-[rgba(5,6,5,0.6)] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-fg-1">▸ {company.name}</div>
                  <button onClick={handleUnlinkCompany} className="text-fg-4 hover:text-fail transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <InlineField
                  icon={<Instagram className="w-3 h-3" />}
                  value={company.instagram || ''}
                  placeholder="@instagram"
                  onSave={(v) => z.mutate.crm_companies.update({ id: company.id, instagram: v || undefined } as any)}
                  linkUrl={company.instagram?.startsWith('http') ? company.instagram : company.instagram ? `https://www.instagram.com/${company.instagram.replace('@', '')}` : undefined}
                />
                <InlineField
                  icon={<Phone className="w-3 h-3" />}
                  value={company.phone || ''}
                  placeholder="+52…"
                  onSave={(v) => z.mutate.crm_companies.update({ id: company.id, phone: v || undefined } as any)}
                />
                <InlineField
                  icon={<Building2 className="w-3 h-3" />}
                  value={company.city || ''}
                  placeholder="city"
                  onSave={(v) => z.mutate.crm_companies.update({ id: company.id, city: v || undefined } as any)}
                />
              </div>
            ) : showCompanyPicker ? (
              <div className="border border-[rgba(0,255,140,0.15)] bg-[rgba(5,6,5,0.6)]">
                <input
                  autoFocus
                  value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                  placeholder="$ search or create company…"
                  className="w-full bg-transparent px-3 py-2 text-sm text-fg-1 outline-none placeholder:text-fg-4 border-b border-[rgba(0,255,140,0.15)]"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { setShowCompanyPicker(false); setCompanySearch('') }
                    if (e.key === 'Enter' && companySearch.trim() && filteredCompanies.length === 0) {
                      handleCreateCompany(companySearch.trim())
                    }
                  }}
                />
                <div className="max-h-[200px] overflow-y-auto">
                  {filteredCompanies.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleLinkCompany(c.id)}
                      className="w-full text-left px-3 py-2 text-sm text-fg-2 hover:bg-[rgba(0,255,136,0.06)] hover:text-fg-1 transition-colors flex items-center gap-2"
                    >
                      <span className="text-fg-4">▸</span>
                      {c.name}
                    </button>
                  ))}
                  {companySearch.trim() && (
                    <button
                      onClick={() => handleCreateCompany(companySearch.trim())}
                      className="w-full text-left px-3 py-2 text-sm text-accent hover:bg-[rgba(0,255,136,0.06)] transition-colors flex items-center gap-2"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      create "{companySearch.trim()}"
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowCompanyPicker(true)}
                className="text-xs text-fg-3 hover:text-accent transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-3 h-3" /> link company
              </button>
            )}
          </div>

          {/* Contacts */}
          <div>
            <label className={LABEL_CLS}>
              <User className="w-3 h-3" /> contacts ({linkedContacts.length})
            </label>
            <div className="space-y-2">
              {linkedContacts.map((ct) => (
                <div key={ct.id} className="border border-[rgba(0,255,140,0.15)] bg-[rgba(5,6,5,0.6)] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-fg-1">▸ {ct.name}</div>
                    <button onClick={() => handleUnlinkContact(ct.id)} className="text-fg-4 hover:text-fail transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <InlineField
                    icon={<User className="w-3 h-3" />}
                    value={ct.role || ''}
                    placeholder="role"
                    onSave={(v) => z.mutate.crm_contacts.update({ id: ct.id, role: v || undefined } as any)}
                  />
                  <InlineField
                    icon={<Mail className="w-3 h-3" />}
                    value={ct.email || ''}
                    placeholder="email"
                    onSave={(v) => z.mutate.crm_contacts.update({ id: ct.id, email: v || undefined } as any)}
                  />
                  <InlineField
                    icon={<Phone className="w-3 h-3" />}
                    value={ct.phone || ''}
                    placeholder="+52…"
                    onSave={(v) => z.mutate.crm_contacts.update({ id: ct.id, phone: v || undefined } as any)}
                  />
                  <InlineField
                    icon={<Instagram className="w-3 h-3" />}
                    value={ct.instagram || ''}
                    placeholder="@instagram"
                    onSave={(v) => z.mutate.crm_contacts.update({ id: ct.id, instagram: v || undefined } as any)}
                    linkUrl={ct.instagram?.startsWith('http') ? ct.instagram : ct.instagram ? `https://www.instagram.com/${ct.instagram.replace('@', '')}` : undefined}
                  />
                </div>
              ))}

              {showContactPicker ? (
                <div className="border border-[rgba(0,255,140,0.15)] bg-[rgba(5,6,5,0.6)]">
                  <input
                    autoFocus
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    placeholder="$ search or create contact…"
                    className="w-full bg-transparent px-3 py-2 text-sm text-fg-1 outline-none placeholder:text-fg-4 border-b border-[rgba(0,255,140,0.15)]"
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') { setShowContactPicker(false); setContactSearch('') }
                      if (e.key === 'Enter' && contactSearch.trim() && filteredContacts.length === 0) {
                        handleCreateContact(contactSearch.trim())
                      }
                    }}
                  />
                  <div className="max-h-[200px] overflow-y-auto">
                    {filteredContacts.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => handleLinkContact(c.id)}
                        className="w-full text-left px-3 py-2 text-sm text-fg-2 hover:bg-[rgba(0,255,136,0.06)] hover:text-fg-1 transition-colors flex items-center gap-2"
                      >
                        <span className="text-fg-4">▸</span>
                        <span>{c.name}</span>
                        {c.role && <span className="text-fg-4 text-xs ml-auto">{c.role}</span>}
                      </button>
                    ))}
                    {contactSearch.trim() && (
                      <button
                        onClick={() => handleCreateContact(contactSearch.trim())}
                        className="w-full text-left px-3 py-2 text-sm text-accent hover:bg-[rgba(0,255,136,0.06)] transition-colors flex items-center gap-2"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        create "{contactSearch.trim()}"
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowContactPicker(true)}
                  className="text-xs text-fg-3 hover:text-accent transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3 h-3" /> add contact
                </button>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={LABEL_CLS}>◊ description</label>
            <textarea
              value={deal.description || ''}
              onChange={(e) => handleUpdateField('description', e.target.value)}
              placeholder="// add a description…"
              rows={3}
              className={`${INPUT_CLS} resize-none`}
            />
          </div>

          {/* Notes */}
          <div>
            <label className={LABEL_CLS}>
              <StickyNote className="w-3 h-3" /> notes ({notes.length})
            </label>

            <div className="flex gap-2 mb-3">
              <input
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                placeholder="$ add a note…"
                className={INPUT_CLS}
              />
              <button
                onClick={handleAddNote}
                disabled={!newNote.trim()}
                className="px-3 py-2 border border-[rgba(0,255,140,0.35)] text-accent hover:bg-[rgba(0,255,136,0.06)] hover:shadow-glow-xs transition-all disabled:opacity-30"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2">
              {notes.map((note) => (
                <div key={note.id} className="group border border-[rgba(0,255,140,0.15)] bg-[rgba(5,6,5,0.6)] px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-fg-2 leading-relaxed">
                      <span className="text-fg-4">› </span>{note.body}
                    </p>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      className="opacity-0 group-hover:opacity-100 text-fg-4 hover:text-fail transition-all shrink-0 mt-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="mt-1.5 text-[10px] uppercase tracking-label text-fg-4">
                    {note.type !== 'manual' && <span>{note.type} · </span>}
                    {new Date(note.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-[10px] uppercase tracking-label text-fg-4 pt-3 border-t border-[rgba(0,255,140,0.10)]">
            // created {new Date(deal.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        </div>
      </div>
    </div>
  )
}

function InlineField({
  icon,
  value,
  placeholder,
  onSave,
  linkUrl,
}: {
  icon: React.ReactNode
  value: string
  placeholder: string
  onSave: (value: string) => void
  linkUrl?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  const handleSave = () => {
    if (draft !== value) onSave(draft)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-fg-4 shrink-0">{icon}</span>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false) }}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-xs text-fg-1 outline-none border-b border-accent py-0.5 placeholder:text-fg-4"
        />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 w-full">
      <button
        onClick={() => { setDraft(value); setEditing(true) }}
        className="flex items-center gap-2 text-xs text-fg-3 hover:text-fg-1 transition-colors flex-1 min-w-0"
      >
        <span className="text-fg-4 shrink-0">{icon}</span>
        <span className="truncate">{value || <span className="text-fg-4">{placeholder}</span>}</span>
      </button>
      {linkUrl && value && (
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-fg-4 hover:text-accent transition-colors shrink-0 p-0.5"
        >
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  )
}
