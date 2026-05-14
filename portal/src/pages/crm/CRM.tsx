import { useZero, useQuery } from '@rocicorp/zero/react'
import { useState } from 'react'
import { Search } from 'lucide-react'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'
import BoardView from './BoardView'
import DealSidebar from './DealSidebar'

export default function CRM() {
  const z = useZero<Schema, Mutators>()
  const [allBoards] = useQuery(z.query.crm_boards)
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null)
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const currentBoardId = activeBoardId || allBoards[0]?.id || null

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden min-h-0">
      {/* Header */}
      <div className="px-8 py-5 border-b border-[rgba(0,255,140,0.15)] flex items-center justify-between shrink-0">
        <div>
          <div className="text-[10px] uppercase tracking-label text-fg-3 mb-1">◊ crm · pipeline</div>
          <h1 className="font-mono text-2xl font-bold text-fg-1 lowercase">crm</h1>
          <p className="text-sm text-fg-3 mt-0.5">
            <span className="text-fg-4">›</span> deals · contacts · pipeline
          </p>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-4" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="$ search deals…"
            className="w-full bg-rim border border-[rgba(0,255,140,0.15)] pl-9 pr-3 py-2 text-sm text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs placeholder:text-fg-4"
          />
        </div>
      </div>

      {/* Board tabs */}
      <div className="px-8 pt-3 pb-0 flex items-center gap-0 shrink-0">
        {allBoards.map((board) => {
          const isActive = currentBoardId === board.id
          return (
            <button
              key={board.id}
              onClick={() => setActiveBoardId(board.id)}
              className={`px-4 py-2 text-xs font-mono uppercase tracking-label border-b-2 -mb-px transition-colors ${
                isActive
                  ? 'border-accent text-accent [text-shadow:0_0_6px_rgba(0,255,136,0.4)]'
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
          <BoardView boardId={currentBoardId} search={search} onDealClick={setSelectedDealId} />
        ) : (
          <div className="flex items-center justify-center h-full text-fg-3 font-mono text-sm">
            <span className="text-fg-4">// </span>no boards yet
          </div>
        )}
      </div>

      {selectedDealId && (
        <DealSidebar dealId={selectedDealId} onClose={() => setSelectedDealId(null)} />
      )}
    </div>
  )
}
