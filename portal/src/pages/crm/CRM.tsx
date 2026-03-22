import { useZero } from '@rocicorp/zero/react'
import { useQuery } from '@rocicorp/zero/react'
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
    <div className="flex-1 flex flex-col h-screen overflow-hidden min-h-0">
      {/* Header */}
      <div className="px-8 py-5 border-b border-white/[0.06] flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white">CRM</h1>
          <p className="text-white/40 text-sm mt-0.5">Deals, contacts, and pipeline</p>
        </div>
        {/* Search */}
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search deals..."
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-white/20 placeholder:text-white/30"
          />
        </div>
      </div>

      {/* Board tabs */}
      <div className="px-8 pt-4 pb-0 flex items-center gap-1 shrink-0">
        {allBoards.map((board) => (
          <button
            key={board.id}
            onClick={() => setActiveBoardId(board.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentBoardId === board.id
                ? 'bg-white/[0.08] text-white'
                : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
            }`}
          >
            {board.name}
          </button>
        ))}
      </div>

      {/* Board */}
      <div className="flex-1 overflow-hidden px-8 py-4">
        {currentBoardId ? (
          <BoardView
            boardId={currentBoardId}
            search={search}
            onDealClick={setSelectedDealId}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-white/30">
            No boards yet
          </div>
        )}
      </div>

      {/* Deal sidebar */}
      {selectedDealId && (
        <DealSidebar
          dealId={selectedDealId}
          onClose={() => setSelectedDealId(null)}
        />
      )}
    </div>
  )
}
