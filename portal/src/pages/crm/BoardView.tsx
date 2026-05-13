import { useZero } from '@rocicorp/zero/react'
import { useQuery } from '@rocicorp/zero/react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus } from 'lucide-react'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'

const TEMPERATURES = [
  { value: 'hot', label: 'Hot', color: '#EF4444' },
  { value: 'warm', label: 'Warm', color: '#F59E0B' },
  { value: 'cold', label: 'Cold', color: '#3B82F6' },
  { value: 'ghosted', label: 'Ghosted', color: '#6B7280' },
]

const tempColors: Record<string, string> = Object.fromEntries(TEMPERATURES.map((t) => [t.value, t.color]))

interface BoardViewProps {
  boardId: string
  search: string
  onDealClick: (dealId: string) => void
}

export default function BoardView({ boardId, search, onDealClick }: BoardViewProps) {
  const z = useZero<Schema, Mutators>()
  const [boards] = useQuery(z.query.crm_boards.where('id', boardId))
  const [columns] = useQuery(z.query.crm_board_columns.where('boardId', boardId).orderBy('position', 'asc'))
  const [allDeals] = useQuery(z.query.crm_deals)
  const [companies] = useQuery(z.query.crm_companies)
  const [hoveredDealId, setHoveredDealId] = useState<string | null>(null)
  const [tempPickerDealId, setTempPickerDealId] = useState<string | null>(null)
  const [tempPickerPos, setTempPickerPos] = useState<{ x: number; y: number } | null>(null)
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null)
  const [dropTargetColumnId, setDropTargetColumnId] = useState<string | null>(null)

  // Shift+T shortcut to open temperature picker on hovered card
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'T' && hoveredDealId) {
        e.preventDefault()
        const el = document.querySelector(`[data-deal-id="${hoveredDealId}"]`)
        if (el) {
          const rect = el.getBoundingClientRect()
          const pickerHeight = 200
          const spaceBelow = window.innerHeight - rect.bottom
          const y = spaceBelow < pickerHeight ? rect.top - pickerHeight - 4 : rect.bottom + 4
          setTempPickerPos({ x: rect.left, y })
          setTempPickerDealId(hoveredDealId)
        }
      }
      if (e.key === 'Escape') {
        setTempPickerDealId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hoveredDealId])

  const handleSetTemperature = useCallback((dealId: string, temp: string) => {
    const deal = allDeals.find((d) => d.id === dealId)
    const newTemp = deal?.temperature === temp ? undefined : temp
    z.mutate.crm_deals.update({ id: dealId, temperature: newTemp } as { id: string; temperature?: string })
    setTempPickerDealId(null)
  }, [allDeals, z])

  const board = boards[0]
  if (!board) return null

  const baseFilter: Record<string, string[]> = (board.baseFilter as Record<string, string[]>) || {}
  const companyMap = new Map(companies.map((c) => [c.id, c]))
  const searchLower = search.toLowerCase()

  // Filter deals by baseFilter + search
  const filteredDeals = allDeals.filter((deal) => {
    // Base filter
    for (const [field, allowedValues] of Object.entries(baseFilter)) {
      const dealValue = (deal as Record<string, unknown>)[field]
      if (!allowedValues.includes(dealValue as string)) return false
    }
    // Search filter
    if (searchLower) {
      const company = deal.companyId ? companyMap.get(deal.companyId) : null
      const searchable = [deal.title, company?.name, deal.description].filter(Boolean).join(' ').toLowerCase()
      if (!searchable.includes(searchLower)) return false
    }
    return true
  })

  // Group by column
  const groupBy = board.groupBy as string
  const dealsByColumn = new Map<string, typeof filteredDeals>()
  for (const col of columns) {
    dealsByColumn.set(col.value, [])
  }
  for (const deal of filteredDeals) {
    const value = (deal as Record<string, unknown>)[groupBy] as string
    if (dealsByColumn.has(value)) {
      dealsByColumn.get(value)!.push(deal)
    }
  }

  const handleDrop = (dealId: string, newValue: string) => {
    z.mutate.crm_deals.update({ id: dealId, [groupBy]: newValue } as { id: string; stage?: string; temperature?: string })
  }

  const handleAddDeal = (columnValue: string) => {
    const id = crypto.randomUUID()
    z.mutate.crm_deals.create({
      id,
      title: 'New deal',
      [groupBy]: columnValue,
    } as { id: string; title: string; stage?: string; temperature?: string })
    onDealClick(id)
  }

  const handleColumnDragStart = (columnId: string) => {
    setDraggedColumnId(columnId)
  }

  const handleColumnDragOver = (columnId: string) => {
    if (draggedColumnId && draggedColumnId !== columnId) {
      setDropTargetColumnId(columnId)
    }
  }

  const handleColumnDragEnd = () => {
    setDraggedColumnId(null)
    setDropTargetColumnId(null)
  }

  const handleColumnDrop = (targetColumnId: string) => {
    if (!draggedColumnId || draggedColumnId === targetColumnId) return

    const oldIndex = columns.findIndex((c) => c.id === draggedColumnId)
    const newIndex = columns.findIndex((c) => c.id === targetColumnId)
    if (oldIndex === -1 || newIndex === -1) return

    // Build reordered list and assign new positions
    const reordered = [...columns]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)

    for (let i = 0; i < reordered.length; i++) {
      if (reordered[i].position !== i) {
        z.mutate.crm_board_columns.update({ id: reordered[i].id, position: i })
      }
    }

    setDraggedColumnId(null)
    setDropTargetColumnId(null)
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 h-full min-h-0">
      {columns.map((col) => {
        const deals = dealsByColumn.get(col.value) || []
        return (
          <KanbanColumn
            key={col.id}
            columnId={col.id}
            label={col.label}
            color={col.color || '#6B7280'}
            value={col.value}
            deals={deals}
            companyMap={companyMap}
            onDrop={handleDrop}
            onAddDeal={handleAddDeal}
            onDealClick={onDealClick}
            onDealHover={setHoveredDealId}
            isDragging={draggedColumnId === col.id}
            isDropTarget={dropTargetColumnId === col.id}
            onColumnDragStart={handleColumnDragStart}
            onColumnDragOver={handleColumnDragOver}
            onColumnDrop={handleColumnDrop}
            onColumnDragEnd={handleColumnDragEnd}
          />
        )
      })}

      {tempPickerDealId && tempPickerPos && (
        <TemperaturePicker
          dealId={tempPickerDealId}
          currentTemp={allDeals.find((d) => d.id === tempPickerDealId)?.temperature || null}
          position={tempPickerPos}
          onSelect={handleSetTemperature}
          onClose={() => setTempPickerDealId(null)}
        />
      )}
    </div>
  )
}

function TemperaturePicker({
  dealId,
  currentTemp,
  position,
  onSelect,
  onClose,
}: {
  dealId: string
  currentTemp: string | null
  position: { x: number; y: number }
  onSelect: (dealId: string, temp: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed z-[100] bg-[#1A1A1F] border border-white/[0.1] rounded-lg shadow-2xl py-1 min-w-[180px]"
      style={{ left: position.x, top: position.y }}
    >
      <div className="px-3 py-1.5 text-[11px] text-white/30 uppercase tracking-wide">Temperature</div>
      {TEMPERATURES.map((t) => (
        <button
          key={t.value}
          onClick={() => onSelect(dealId, t.value)}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/80 hover:bg-white/[0.06] transition-colors"
        >
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
          <span className="flex-1 text-left">{t.label}</span>
          {currentTemp === t.value && <span className="text-white/40 text-xs">&#10003;</span>}
        </button>
      ))}
    </div>
  )
}

function KanbanColumn({
  columnId,
  label,
  color,
  value,
  deals,
  companyMap,
  onDrop,
  onAddDeal,
  onDealClick,
  onDealHover,
  isDragging,
  isDropTarget,
  onColumnDragStart,
  onColumnDragOver,
  onColumnDrop,
  onColumnDragEnd,
}: {
  columnId: string
  label: string
  color: string
  value: string
  deals: Array<{ id: string; title: string; companyId?: string | null; value?: number | null; temperature?: string | null }>
  companyMap: Map<string, { id: string; name: string }>
  onDrop: (dealId: string, newValue: string) => void
  onAddDeal: (value: string) => void
  onDealClick: (dealId: string) => void
  onDealHover: (dealId: string | null) => void
  isDragging: boolean
  isDropTarget: boolean
  onColumnDragStart: (columnId: string) => void
  onColumnDragOver: (columnId: string) => void
  onColumnDrop: (columnId: string) => void
  onColumnDragEnd: () => void
}) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    // Only highlight for deal drops (not column drops)
    if (e.dataTransfer.types.includes('application/deal-id')) {
      e.currentTarget.classList.add('bg-white/[0.04]')
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('bg-white/[0.04]')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.remove('bg-white/[0.04]')
    const dealId = e.dataTransfer.getData('application/deal-id')
    if (dealId) onDrop(dealId, value)
  }

  const handleHeaderDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/column-id', columnId)
    e.dataTransfer.effectAllowed = 'move'
    onColumnDragStart(columnId)
  }

  const handleHeaderDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/column-id')) {
      e.preventDefault()
      onColumnDragOver(columnId)
    }
  }

  const handleHeaderDrop = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/column-id')) {
      e.preventDefault()
      onColumnDrop(columnId)
    }
  }

  return (
    <div
      className={`flex flex-col min-w-[280px] w-[280px] max-h-full rounded-xl border transition-all ${
        isDragging ? 'opacity-40 border-white/[0.15]' : isDropTarget ? 'border-white/[0.25] bg-white/[0.03]' : 'border-white/[0.06] bg-white/[0.01]'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        draggable
        onDragStart={handleHeaderDragStart}
        onDragOver={handleHeaderDragOver}
        onDrop={handleHeaderDrop}
        onDragEnd={onColumnDragEnd}
        className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-sm font-medium text-white">{label}</span>
          <span className="text-xs text-white/30 bg-white/[0.06] px-1.5 py-0.5 rounded">
            {deals.length}
          </span>
        </div>
        <button
          onClick={() => onAddDeal(value)}
          className="text-white/30 hover:text-white/60 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {deals.map((deal) => (
          <DealCard
            key={deal.id}
            deal={deal}
            companyMap={companyMap}
            onClick={() => onDealClick(deal.id)}
            onHover={onDealHover}
          />
        ))}
      </div>
    </div>
  )
}

function DealCard({
  deal,
  companyMap,
  onClick,
  onHover,
}: {
  deal: { id: string; title: string; companyId?: string | null; value?: number | null; temperature?: string | null }
  companyMap: Map<string, { id: string; name: string }>
  onClick: () => void
  onHover: (dealId: string | null) => void
}) {
  const company = deal.companyId ? companyMap.get(deal.companyId) : null

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/deal-id', deal.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      data-deal-id={deal.id}
      draggable
      onDragStart={handleDragStart}
      onClick={onClick}
      onMouseEnter={() => onHover(deal.id)}
      onMouseLeave={() => onHover(null)}
      className="p-3 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] cursor-grab active:cursor-grabbing transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium text-white">{deal.title}</div>
        {deal.temperature && (
          <div
            className="w-2 h-2 rounded-full shrink-0 mt-1.5"
            style={{ backgroundColor: tempColors[deal.temperature] || '#6B7280' }}
          />
        )}
      </div>
      {company && (
        <div className="text-xs text-white/40 mt-1">{company.name}</div>
      )}
      {deal.value != null && deal.value > 0 && (
        <div className="text-xs text-white/50 mt-1.5 font-medium">
          ${deal.value.toLocaleString()} MXN
        </div>
      )}
    </div>
  )
}
