import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { Check, Search, X } from 'lucide-react'
import { closePopupFromOutsideClick } from './popupEvents'

export type ActiveFilters = Record<string, string[]>

export type FilterOption = {
  value: string
  label: string
  icon?: ReactNode
}

export type FilterFieldConfig = {
  field: string
  label: string
  icon: ComponentType<{ className?: string }>
  options: FilterOption[]
  allowSelectAll?: boolean
}

export function FilterButton({
  activeFilters,
  filterConfigs,
  onFilterChange,
  onClearAll,
  chipsPlacement = 'inline',
  afterButton,
  buttonClassName = '',
}: {
  activeFilters: ActiveFilters
  filterConfigs: FilterFieldConfig[]
  onFilterChange: (field: string, values: string[]) => void
  onClearAll: () => void
  chipsPlacement?: 'inline' | 'below'
  afterButton?: ReactNode
  buttonClassName?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [initialField, setInitialField] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const totalActive = Object.values(activeFilters).reduce((sum, v) => sum + v.length, 0)
  const hasActive = totalActive > 0

  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(event: MouseEvent) {
      closePopupFromOutsideClick(event, [containerRef], () => {
        setIsOpen(false)
        setInitialField(null)
      })
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
        setInitialField(null)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKey)
    }
  }, [isOpen])

  function openOnField(field: string) {
    setInitialField(field)
    setIsOpen(true)
  }

  const chips = (
    <>
      {hasActive && Object.entries(activeFilters).map(([field, values]) => {
        if (!values.length) return null
        const config = filterConfigs.find((c) => c.field === field)
        if (!config) return null
        const labels = values.map((v) => config.options.find((o) => o.value === v)?.label ?? v)
        const maxDisplay = 2
        const shown = labels.slice(0, maxDisplay)
        const overflow = labels.length - maxDisplay

        return (
          <span
            key={field}
            className="group inline-flex items-center gap-1.5 border border-edge/20 bg-pit-3 pl-2.5 pr-1 py-0.5 font-mono text-[10px] uppercase tracking-label text-fg-2"
          >
            <button
              onClick={() => openOnField(field)}
              className="inline-flex items-center gap-1.5 transition hover:text-fg-1"
            >
              <span className="text-fg-4">{config.label}</span>
              <span className="text-fg-1 normal-case tracking-normal">
                {shown.join(', ').toLowerCase()}
                {overflow > 0 && <span className="text-fg-4"> +{overflow}</span>}
              </span>
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation()
                onFilterChange(field, [])
              }}
              className="ml-0.5 p-0.5 text-fg-4 transition hover:text-fail"
              title="clear"
            >
              <X className="h-3 w-3" strokeWidth={1.5} />
            </button>
          </span>
        )
      })}

      {hasActive && (
        <button
          onClick={onClearAll}
          className="font-mono text-[10px] uppercase tracking-label text-fg-4 transition hover:text-fail"
        >
          [clear all]
        </button>
      )}
    </>
  )

  return (
    <div
      className={chipsPlacement === 'below' ? 'flex flex-col items-start gap-2' : 'flex flex-wrap items-center gap-2'}
      ref={containerRef}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <button
            onClick={() => {
              setInitialField(null)
              setIsOpen((v) => !v)
            }}
            className={`inline-flex items-center gap-1.5 border px-2.5 py-1 font-mono text-[10px] uppercase tracking-label transition ${
              isOpen
                ? 'border-edge/35 bg-accent-fill/6 text-accent shadow-glow-xs'
                : hasActive
                  ? 'border-edge/25 bg-pit-3 text-accent'
                  : 'border-edge/15 bg-pit-3 text-fg-3 hover:text-fg-1 hover:border-edge/25'
            } ${buttonClassName}`}
          >
            filter
            {hasActive && <span className="text-accent">· {totalActive}</span>}
          </button>

          {isOpen && (
            <div className="absolute left-0 top-full z-[1000] mt-1.5">
              <FilterDropdown
                filterConfigs={filterConfigs}
                activeFilters={activeFilters}
                onFilterChange={onFilterChange}
                initialField={initialField}
              />
            </div>
          )}
        </div>
        {afterButton}
      </div>

      {chipsPlacement === 'below' ? (
        hasActive ? <div className="flex flex-wrap items-center gap-2">{chips}</div> : null
      ) : (
        chips
      )}
    </div>
  )
}

function FilterDropdown({
  filterConfigs,
  activeFilters,
  onFilterChange,
  initialField,
}: {
  filterConfigs: FilterFieldConfig[]
  activeFilters: ActiveFilters
  onFilterChange: (field: string, values: string[]) => void
  initialField?: string | null
}) {
  const [selectedField, setSelectedField] = useState<string>(
    initialField || filterConfigs[0]?.field || '',
  )
  const [searchQuery, setSearchQuery] = useState('')

  const selectedConfig = filterConfigs.find((c) => c.field === selectedField)
  const selectedValues = activeFilters[selectedField] || []
  const selectedOptionValues = selectedConfig?.options.map((option) => option.value) ?? []
  const selectedOptionValueSet = new Set(selectedValues)
  const allOptionsSelected = selectedOptionValues.length > 0 && selectedOptionValues.every((value) => selectedOptionValueSet.has(value))

  const filteredOptions = useMemo(() => {
    if (!selectedConfig) return []
    if (!searchQuery) return selectedConfig.options
    const q = searchQuery.toLowerCase()
    return selectedConfig.options.filter((o) => o.label.toLowerCase().includes(q))
  }, [selectedConfig, searchQuery])

  const showSearch = (selectedConfig?.options.length ?? 0) > 6

  function toggleValue(value: string) {
    const current = activeFilters[selectedField] || []
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value]
    onFilterChange(selectedField, next)
  }

  function clearField() {
    onFilterChange(selectedField, [])
  }

  function selectAllField() {
    onFilterChange(selectedField, selectedOptionValues)
  }

  return (
    <div className="flex max-h-[min(340px,calc(100dvh-8rem))] min-h-0 w-[calc(100vw-2rem)] max-w-[480px] flex-col overflow-hidden overscroll-contain border border-edge/25 bg-pit shadow-terminal-popover sm:flex-row">
      {/* left: field list */}
      <div className="flex max-h-[112px] w-full shrink-0 overflow-auto overscroll-contain border-b border-edge/12 py-1 sm:block sm:max-h-none sm:w-[160px] sm:border-b-0 sm:border-r">
        {filterConfigs.map((config) => {
          const isSelected = config.field === selectedField
          const isActive = (activeFilters[config.field]?.length ?? 0) > 0
          const Icon = config.icon
          return (
            <button
              key={config.field}
              onClick={() => {
                setSelectedField(config.field)
                setSearchQuery('')
              }}
              className={`flex min-w-max items-center gap-2 px-3 py-1.5 text-left font-mono text-xs lowercase transition sm:w-full ${
                isSelected
                  ? 'bg-accent-fill/8 text-accent'
                  : 'text-fg-2 hover:bg-accent-fill/4 hover:text-fg-1'
              }`}
            >
              <span
                aria-hidden
                className="block h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: isActive ? 'var(--accent)' : 'transparent' }}
              />
              <Icon className="h-3.5 w-3.5 shrink-0 text-fg-4" />
              <span className="truncate">{config.label}</span>
            </button>
          )
        })}
      </div>

      {/* right: options */}
      <div className="flex min-h-0 flex-1 min-w-0 flex-col">
        <div className="flex items-center justify-between border-b border-edge/12 px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-label text-fg-3">
            {selectedConfig?.label}
          </span>
          <div className="flex items-center gap-2">
            {selectedConfig?.allowSelectAll ? (
              <button
                onClick={selectAllField}
                disabled={selectedOptionValues.length === 0 || allOptionsSelected}
                className={`font-mono text-[10px] uppercase tracking-label transition ${
                  selectedOptionValues.length > 0 && !allOptionsSelected
                    ? 'text-fg-3 hover:text-accent'
                    : 'cursor-not-allowed text-fg-4 opacity-50'
                }`}
              >
                select all
              </button>
            ) : null}
            <button
              onClick={clearField}
              disabled={selectedValues.length === 0}
              className={`font-mono text-[10px] uppercase tracking-label transition ${
                selectedValues.length > 0
                  ? 'text-fg-3 hover:text-fail'
                  : 'text-fg-4 cursor-not-allowed opacity-50'
              }`}
            >
              clear
            </button>
          </div>
        </div>

        {showSearch && (
          <div className="border-b border-edge/8 px-3 py-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-4" strokeWidth={1.5} />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="$ search…"
                className="w-full bg-rim border border-edge/15 pl-7 pr-2 py-1.5 font-mono text-xs text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs placeholder:text-fg-4"
              />
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-4 text-center font-mono text-xs text-fg-4">// no results</div>
          ) : (
            filteredOptions.map((option) => {
              const isChecked = selectedValues.includes(option.value)
              return (
                <button
                  key={option.value}
                  onClick={() => toggleValue(option.value)}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left font-mono text-xs lowercase text-fg-2 hover:bg-accent-fill/4 hover:text-fg-1 transition"
                >
                  <span
                    aria-hidden
                    className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center border transition ${
                      isChecked
                        ? 'border-accent bg-accent'
                        : 'border-edge/20 bg-transparent'
                    }`}
                  >
                    {isChecked && <Check className="h-2.5 w-2.5 text-pit" strokeWidth={3} />}
                  </span>
                  {option.icon ? (
                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">{option.icon}</span>
                  ) : null}
                  <span className="truncate">{option.label}</span>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
