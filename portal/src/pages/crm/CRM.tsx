import { useZero, useQuery } from '@rocicorp/zero/react'
import { useEffect, useMemo, useState } from 'react'
import { Building2, Search } from 'lucide-react'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'
import { useAuth } from '../../lib/auth'
import { PachSelect, type PachSelectOption } from '../../components/PachSelect'
import BoardView from './BoardView'
import DealSidebar from './DealSidebar'

export default function CRM() {
  const z = useZero<Schema, Mutators>()
  const { user } = useAuth()
  const [allBoards] = useQuery(z.query.crm_boards)
  const [organizations] = useQuery(z.query.organizations.orderBy('name', 'asc'))
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null)
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [organizationFilter, setOrganizationFilter] = useState<string | null>(null)

  const canAccessUnscoped = user?.canAccessUnscoped ?? false
  const accessibleOrganizations = useMemo(() => {
    const accessibleIds = new Set(user?.organizationIds ?? [])
    return organizations.filter((organization) => accessibleIds.has(organization.id))
  }, [organizations, user?.organizationIds])
  const organizationOptions = useMemo<PachSelectOption[]>(() => {
    const options = accessibleOrganizations.map((organization) => ({
      value: organization.id,
      label: organization.name,
      icon: <Building2 className="h-3.5 w-3.5" />,
    }))
    if (canAccessUnscoped) {
      options.push({
        value: '__none__',
        label: 'No organization',
        icon: <Building2 className="h-3.5 w-3.5" />,
      })
    }
    return options
  }, [accessibleOrganizations, canAccessUnscoped])

  useEffect(() => {
    if (organizationFilter !== null) return
    const ardia = accessibleOrganizations.find((organization) => organization.project === 'ardia')
    const first = ardia ?? accessibleOrganizations[0]
    if (first) setOrganizationFilter(first.id)
    else if (canAccessUnscoped) setOrganizationFilter('__none__')
  }, [accessibleOrganizations, canAccessUnscoped, organizationFilter])

  const selectedOrganizationId = organizationFilter === '__none__' ? null : organizationFilter
  const selectedOrganizationLabel =
    organizationOptions.find((option) => option.value === organizationFilter)?.label ?? 'select organization'
  const visibleBoards = allBoards.filter((board) =>
    selectedOrganizationId ? board.organizationId === selectedOrganizationId : !board.organizationId,
  )
  const currentBoardId =
    (activeBoardId && visibleBoards.some((board) => board.id === activeBoardId) ? activeBoardId : null) ||
    visibleBoards[0]?.id ||
    null

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden min-h-0">
      {/* Header */}
      <div className="px-8 py-5 border-b border-edge/15 flex items-center justify-between shrink-0">
        <div>
          <div className="text-[10px] uppercase tracking-label text-fg-3 mb-1">◊ crm · pipeline</div>
          <h1 className="font-mono text-2xl font-bold text-fg-1 lowercase">crm</h1>
          <p className="text-sm text-fg-3 mt-0.5">
            <span className="text-fg-4">›</span> deals · contacts · pipeline
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-56">
            <Building2 className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-fg-4" />
            <PachSelect
              value={organizationFilter ?? ''}
              onChange={(next) => {
                setOrganizationFilter(next || null)
                setActiveBoardId(null)
                setSelectedDealId(null)
              }}
              options={organizationOptions}
              display={selectedOrganizationLabel}
              align="right"
              popupWidth="224"
              triggerClassName="flex h-[38px] w-full items-center justify-between border border-edge/18 bg-rim pl-9 pr-2 text-left font-mono text-sm text-fg-1 outline-none transition hover:border-edge/32 hover:bg-accent-fill/4 focus-visible:border-accent focus-visible:shadow-glow-xs"
              popupClassName="py-1"
            />
          </div>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-4" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="$ search deals…"
              className="w-full bg-rim border border-edge/15 pl-9 pr-3 py-2 text-sm text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs placeholder:text-fg-4"
            />
          </div>
        </div>
      </div>

      {/* Board tabs */}
      <div className="px-8 pt-3 pb-0 flex items-center gap-0 shrink-0">
        {visibleBoards.map((board) => {
          const isActive = currentBoardId === board.id
          return (
            <button
              key={board.id}
              onClick={() => setActiveBoardId(board.id)}
              className={`px-4 py-2 text-xs font-mono uppercase tracking-label border-b-2 -mb-px transition-colors ${
                isActive
                  ? 'border-accent text-accent glow'
                  : 'border-transparent text-fg-3 hover:text-fg-1'
              }`}
            >
              {board.name}
            </button>
          )
        })}
      </div>

      {/* Board */}
      <div className="flex-1 overflow-hidden px-8 py-4">
        {currentBoardId ? (
          <BoardView
            boardId={currentBoardId}
            organizationId={selectedOrganizationId}
            search={search}
            onDealClick={setSelectedDealId}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-fg-3 font-mono text-sm">
            <span className="text-fg-4">// </span>no boards yet
          </div>
        )}
      </div>

      {selectedDealId && (
        <DealSidebar
          dealId={selectedDealId}
          organizationId={selectedOrganizationId}
          onClose={() => setSelectedDealId(null)}
        />
      )}
    </div>
  )
}
