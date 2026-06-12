import { useQuery, useZero } from '@rocicorp/zero/react'
import { AlertTriangle, ArrowDown, ArrowRightLeft, ArrowUp, Building2, CalendarDays, ChartPie, CheckCircle, ChevronDown, ChevronRight, CircleDollarSign, CreditCard, FileText, FileUp, Landmark, Layers2, Loader2, Plus, Search, Tag, Trash2, UploadCloud, UserRound, WalletCards, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { config } from '../../config'
import { PachSelect, type PachSelectOption } from '../../components/PachSelect'
import { useAuth } from '../../lib/auth'
import type { Mutators } from '../../mutators'
import type { Schema } from '../../zero-schema'
import { FilterButton, type ActiveFilters, type FilterFieldConfig } from '../issues/IssueFilters'

type Tab = 'dashboard' | 'movements' | 'accounts'
type ImportPhase = 'select' | 'ready' | 'processing' | 'success' | 'failed'
type FinanceMovement = Schema['tables']['fin_movements']['row']
type FinanceAccount = Schema['tables']['fin_accounts']['row']
type FinanceCategory = Schema['tables']['fin_categories']['row']
type FinanceImport = Schema['tables']['fin_imports']['row']
type FinanceImportItem = Schema['tables']['fin_import_items']['row']
type MovementSortDirection = 'asc' | 'desc'
type AccountDraft = {
  name: string
  institutionName: string
  holderUserId: string
  type: string
  currencyCode: string
}
type TransferCandidate = {
  movement: FinanceMovement
  score: number
  reasons: string[]
}
type MoneyAmount = {
  currencyCode: string
  amountMinor: number
}
type MovementSummary = {
  positiveAmounts: MoneyAmount[]
  negativeAmounts: MoneyAmount[]
  netAmounts: MoneyAmount[]
}
type AccountBalanceEntry = {
  accountId: string
  accountName: string
  currencyCode: string
  movementCount: number
  startingAmountMinor: number
  positiveMinor: number
  negativeMinor: number
  endingAmountMinor: number
}
type CategoryBreakdownEntry = {
  id: string
  name: string
  amountMinor: number
  percent: number
  currencyCode: string
  color: string
}
type CategoryBreakdownGroup = {
  currencyCode: string
  entries: CategoryBreakdownEntry[]
}
type MonthlyBalanceEntry = {
  id: string
  label: string
  startingAmounts: MoneyAmount[]
  positiveAmounts: MoneyAmount[]
  negativeAmounts: MoneyAmount[]
  endingAmounts: MoneyAmount[]
  accountBalances: AccountBalanceEntry[]
}
type ConvertedMoney = {
  currencyCode: string
  amountMinor: number
  missingCurrencies: string[]
}
type MonthlyBalanceChartPoint = {
  id: string
  label: string
  shortLabel: string
  amountMinor: number
  missingCurrencies: string[]
}
type FxRateState = {
  status: 'idle' | 'loading' | 'ready' | 'failed'
  baseCurrencyCode: string
  date: string | null
  rates: Record<string, number>
  error: string | null
}
type FrankfurterRatesPayload =
  | { date?: string; rates?: Record<string, number> }
  | { date?: string; base?: string; quote?: string; rate?: number }[]
type ImportReviewGroup = {
  id: string
  imports: FinanceImport[]
  items: FinanceImportItem[]
  counts: ReturnType<typeof summarizeImportReview>
  fileLabel: string
}

function tabFromPath(pathname: string): Tab {
  if (pathname === '/finance/dashboard') return 'dashboard'
  return pathname === '/finance/accounts' || pathname === '/finance/accounts-cards' ? 'accounts' : 'movements'
}

function pathForTab(tab: Tab) {
  if (tab === 'dashboard') return '/finance/dashboard'
  return tab === 'accounts' ? '/finance/accounts' : '/finance/movements'
}

function financeOrganizationStorageKey(userId: string) {
  return `pach:finance:organization:${userId}`
}

const ACCOUNT_TYPES = [
  { value: 'bank_account', label: 'bank account' },
  { value: 'credit_card', label: 'credit card' },
  { value: 'cash', label: 'cash' },
  { value: 'investment', label: 'investment' },
  { value: 'loan', label: 'loan' },
  { value: 'manual_asset', label: 'manual asset' },
]

const CURRENCIES = ['MXN', 'USD', 'EUR']
const MAX_IMPORT_TOTAL_BYTES = 10 * 1024 * 1024
const UNCATEGORIZED_VALUE = '__uncategorized__'
const EMPTY_ACCOUNT_DRAFT: AccountDraft = { name: '', institutionName: '', holderUserId: '', type: 'bank_account', currencyCode: 'MXN' }

const MOVEMENT_TYPES = [
  { value: 'expense', label: 'expense' },
  { value: 'income', label: 'income' },
  { value: 'transfer', label: 'transfer' },
  { value: 'adjustment', label: 'adjustment' },
]

const MOVEMENT_STATUSES = [
  { value: 'pending_review', label: 'pending' },
  { value: 'reviewed', label: 'reviewed' },
  { value: 'ignored', label: 'ignored' },
]

const CATEGORY_CHART_COLORS = [
  '#56f08b',
  '#ff5f87',
  '#ffb84d',
  '#5fc6ff',
  '#d48cff',
  '#7ee7d1',
  '#f7ef6a',
  '#ff8f70',
  '#9aa7ff',
]

export default function Finance() {
  const z = useZero<Schema, Mutators>()
  const location = useLocation()
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const [organizations] = useQuery(z.query.organizations.orderBy('name', 'asc'))
  const [organizationMemberships] = useQuery(z.query.organization_memberships)
  const [users] = useQuery(z.query.users.orderBy('email', 'asc'))
  const [accounts] = useQuery(z.query.fin_accounts.orderBy('name', 'asc'))
  const [movements] = useQuery(z.query.fin_movements.orderBy('transactionDate', 'desc'))
  const [categories] = useQuery(z.query.fin_categories.orderBy('position', 'asc'))
  const [imports] = useQuery(z.query.fin_imports.orderBy('updatedAt', 'desc'))
  const [importItems] = useQuery(z.query.fin_import_items.orderBy('transactionDate', 'desc'))
  const [transfers] = useQuery(z.query.fin_transfers)
  const [categorizationRules] = useQuery(z.query.fin_categorization_rules)

  const [organizationId, setOrganizationId] = useState(() => {
    if (!user || typeof window === 'undefined') return ''
    return localStorage.getItem(financeOrganizationStorageKey(user.id)) ?? ''
  })
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({})
  const [dashboardFilters, setDashboardFilters] = useState<ActiveFilters>({})
  const [search, setSearch] = useState('')
  const [movementSortDirection, setMovementSortDirection] = useState<MovementSortDirection>('desc')
  const [reviewSortDirection, setReviewSortDirection] = useState<MovementSortDirection>('desc')
  const [dashboardBalanceExpanded, setDashboardBalanceExpanded] = useState(false)
  const [dashboardReportingCurrencyCode, setDashboardReportingCurrencyCode] = useState('MXN')
  const [dashboardBalanceSnapshot, setDashboardBalanceSnapshot] = useState<ConvertedMoney | null>(null)
  const [dashboardChartSnapshot, setDashboardChartSnapshot] = useState<{
    currencyCode: string
    points: MonthlyBalanceChartPoint[]
  } | null>(null)
  const [dashboardFx, setDashboardFx] = useState<FxRateState>({
    status: 'idle',
    baseCurrencyCode: 'MXN',
    date: null,
    rates: {},
    error: null,
  })
  const [editingMovementLabel, setEditingMovementLabel] = useState<{ id: string; value: string } | null>(null)
  const [editingMovementDate, setEditingMovementDate] = useState<{ id: string; value: string } | null>(null)
  const [accountDraft, setAccountDraft] = useState<AccountDraft>(EMPTY_ACCOUNT_DRAFT)
  const [accountModalOpen, setAccountModalOpen] = useState(false)
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)
  const [categoryDraft, setCategoryDraft] = useState({ name: '', type: 'expense' })
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [categoryMergeDraft, setCategoryMergeDraft] = useState({ categoryId: '', targetCategoryId: '' })
  const [movementDraft, setMovementDraft] = useState({
    accountId: '',
    categoryId: UNCATEGORIZED_VALUE,
    transactionDate: todayInputDate(),
    description: '',
    amount: '',
    type: 'expense',
    status: 'reviewed',
  })
  const [movementModalOpen, setMovementModalOpen] = useState(false)
  const [transferModalMovementId, setTransferModalMovementId] = useState<string | null>(null)
  const [deleteMovementId, setDeleteMovementId] = useState<string | null>(null)
  const [institutionSuggestionsOpen, setInstitutionSuggestionsOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importDragActive, setImportDragActive] = useState(false)
  const [importPhase, setImportPhase] = useState<ImportPhase>('select')
  const [importFiles, setImportFiles] = useState<File[]>([])
  const [importAccountId, setImportAccountId] = useState('')
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [reviewBatchId, setReviewBatchId] = useState<string | null>(null)
  const [apiCategories, setApiCategories] = useState<FinanceCategory[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const tab = tabFromPath(location.pathname)
  const organizationStorageKey = user ? financeOrganizationStorageKey(user.id) : null

  const accessibleOrganizations = useMemo(() => {
    const ids = new Set(user?.organizationIds ?? [])
    return organizations.filter((organization) => ids.has(organization.id))
  }, [organizations, user?.organizationIds])

  const selectedOrganizationId = accessibleOrganizations.some((organization) => organization.id === organizationId)
    ? organizationId
    : accessibleOrganizations[0]?.id || ''
  const financeCategories = useMemo(
    () => uniqueBy([...categories, ...apiCategories], (category) => category.id)
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [apiCategories, categories],
  )
  const scopedAccounts = accounts.filter((account) => account.organizationId === selectedOrganizationId && account.status !== 'archived')
  const scopedCategories = financeCategories.filter((category) => category.organizationId === selectedOrganizationId && !category.archived)
  const scopedMovements = movements.filter((movement) => movement.organizationId === selectedOrganizationId)
  const scopedTransfers = transfers.filter((transfer) => transfer.organizationId === selectedOrganizationId)
  const selectedAccountFilterIds = activeFilters.accounts ?? []
  const selectedStatusFilterIds = activeFilters.statuses ?? []
  const selectedCategoryFilterIds = activeFilters.categories ?? []
  const selectedMonthFilterIds = activeFilters.months ?? []
  const selectedQuarterFilterIds = activeFilters.quarters ?? []
  const selectedCurrencyFilterIds = activeFilters.currencies ?? []
  const selectedDashboardMonthFilterIds = dashboardFilters.months ?? []
  const selectedDashboardQuarterFilterIds = dashboardFilters.quarters ?? []
  const selectedDashboardCurrencyFilterIds = dashboardFilters.currencies ?? []
  const institutionSuggestions = useMemo(
    () => Array.from(new Set(scopedAccounts.map((account) => account.institutionName?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b)),
    [scopedAccounts],
  )
  const filteredInstitutionSuggestions = useMemo(() => {
    const query = accountDraft.institutionName.trim().toLowerCase()
    if (!query) return institutionSuggestions
    return institutionSuggestions
      .filter((institution) => institution.toLowerCase().includes(query))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(query)
        const bStarts = b.toLowerCase().startsWith(query)
        if (aStarts !== bStarts) return aStarts ? -1 : 1
        return a.localeCompare(b)
      })
  }, [accountDraft.institutionName, institutionSuggestions])
  const holderUsers = useMemo(() => {
    const memberIds = new Set(
      organizationMemberships
        .filter((membership) => membership.organizationId === selectedOrganizationId)
        .map((membership) => membership.userId),
    )
    const authUserRow: Schema['tables']['users']['row'] | null =
      user && user.organizationIds.includes(selectedOrganizationId)
        ? {
            id: user.id,
            email: user.email,
            name: user.name ?? undefined,
            canAccessUnscoped: user.canAccessUnscoped,
            createdAt: 0,
            updatedAt: 0,
          }
        : null
    const candidates = users.filter((entry) => memberIds.has(entry.id))
    const withAuthUser = authUserRow && !candidates.some((entry) => entry.id === authUserRow.id)
      ? [...candidates, authUserRow]
      : candidates
    return withAuthUser.sort((a, b) => displayUser(a).localeCompare(displayUser(b)))
  }, [organizationMemberships, selectedOrganizationId, user, users])
  const holderUserMap = useMemo(() => new Map(holderUsers.map((entry) => [entry.id, entry])), [holderUsers])

  const organizationOptions = accessibleOrganizations.map((organization) => ({
    value: organization.id,
    label: organization.name,
    icon: <Building2 className="h-3.5 w-3.5" />,
  }))

  const importAccountOptions: PachSelectOption[] = scopedAccounts.map((account) => ({
    value: account.id,
    label: account.name,
    icon: account.type === 'credit_card' ? <CreditCard className="h-3.5 w-3.5" /> : <Landmark className="h-3.5 w-3.5" />,
  }))
  const holderOptions: PachSelectOption[] = [
    { value: '__unassigned__', label: 'unassigned', icon: <UserRound className="h-3.5 w-3.5" /> },
    ...holderUsers.map((entry) => ({
      value: entry.id,
      label: displayUser(entry),
      icon: <UserRound className="h-3.5 w-3.5" />,
    })),
  ]

  const filteredMovements = scopedMovements
    .filter((movement) => selectedAccountFilterIds.length === 0 || selectedAccountFilterIds.includes(movement.accountId))
    .filter((movement) => {
      if (selectedStatusFilterIds.length > 0) return selectedStatusFilterIds.includes(movement.status)
      return movement.status !== 'ignored'
    })
    .filter((movement) => selectedCategoryFilterIds.length === 0 || selectedCategoryFilterIds.includes(movement.categoryId ?? UNCATEGORIZED_VALUE))
    .filter((movement) => selectedMonthFilterIds.length === 0 || selectedMonthFilterIds.includes(monthKey(movement.transactionDate)))
    .filter((movement) => selectedQuarterFilterIds.length === 0 || selectedQuarterFilterIds.includes(quarterKey(movement.transactionDate)))
    .filter((movement) => selectedCurrencyFilterIds.length === 0 || selectedCurrencyFilterIds.includes(movement.currencyCode))
    .filter((movement) => {
      if (!search.trim()) return true
      const needle = search.trim().toLowerCase()
      return `${movement.description} ${movement.merchantName ?? ''}`.toLowerCase().includes(needle)
    })
  const visibleMovements = sortMovementsByDate(filteredMovements, movementSortDirection)
  const visibleTotals = summarizeMovements(filteredMovements)
  const dashboardPeriodMovements = scopedMovements
    .filter((movement) => selectedDashboardMonthFilterIds.length === 0 || selectedDashboardMonthFilterIds.includes(monthKey(movement.transactionDate)))
    .filter((movement) => selectedDashboardQuarterFilterIds.length === 0 || selectedDashboardQuarterFilterIds.includes(quarterKey(movement.transactionDate)))
    .filter((movement) => selectedDashboardCurrencyFilterIds.length === 0 || selectedDashboardCurrencyFilterIds.includes(movement.currencyCode))
  const dashboardAccountMovements = dashboardPeriodMovements.filter((movement) => movement.status !== 'ignored')
  const dashboardNonTransferMovements = dashboardAccountMovements.filter((movement) => !isTransferLikeMovement(movement, scopedCategories))
  const dashboardAccountBalances = buildAccountBalanceBreakdown(dashboardAccountMovements, scopedAccounts, selectedDashboardCurrencyFilterIds)
  const dashboardBalanceTotals = summarizeAccountBalances(dashboardAccountBalances)
  const monthlyBalance = buildMonthlyBalance(dashboardAccountMovements, scopedAccounts, selectedDashboardCurrencyFilterIds)
  const dashboardFxReady = dashboardFx.status === 'ready' && dashboardFx.baseCurrencyCode === dashboardReportingCurrencyCode
  const dashboardFxFailed = dashboardFx.status === 'failed' && dashboardFx.baseCurrencyCode === dashboardReportingCurrencyCode
  const dashboardConversionRates = dashboardFxReady ? dashboardFx.rates : dashboardFxFailed ? {} : null
  const convertedDashboardBalance = dashboardConversionRates
    ? convertMoneyAmounts(dashboardBalanceTotals.netAmounts, dashboardReportingCurrencyCode, dashboardConversionRates)
    : null
  const displayedDashboardBalance = convertedDashboardBalance ?? dashboardBalanceSnapshot
  const dashboardBalanceIsLoading = !convertedDashboardBalance && Boolean(dashboardBalanceSnapshot)
  const readyMonthlyBalanceChartPoints = dashboardConversionRates
    ? buildMonthlyBalanceChartPoints(monthlyBalance, dashboardReportingCurrencyCode, dashboardConversionRates)
    : null
  const monthlyBalanceChartPoints = readyMonthlyBalanceChartPoints ?? dashboardChartSnapshot?.points ?? []
  const monthlyBalanceChartCurrencyCode = readyMonthlyBalanceChartPoints
    ? dashboardReportingCurrencyCode
    : dashboardChartSnapshot?.currencyCode ?? dashboardReportingCurrencyCode
  const categoryBreakdown = buildCategoryBreakdown(dashboardNonTransferMovements, scopedCategories)
  const accountStats = useMemo(
    () => new Map(scopedAccounts.map((account) => [account.id, buildAccountStats(account, scopedMovements)])),
    [scopedAccounts, scopedMovements],
  )
  const scopedImports = imports.filter((entry) => entry.organizationId === selectedOrganizationId)
  const pendingImports = scopedImports.filter((entry) => ['ready', 'partially_applied'].includes(entry.status))
  const pendingImportGroups = buildImportReviewGroups(pendingImports, importItems)
  const selectedReviewImports = reviewBatchId
    ? scopedImports.filter((entry) => importBatchKey(entry) === reviewBatchId)
    : []
  const selectedReviewGroup = reviewBatchId
    ? buildImportReviewGroup(reviewBatchId, selectedReviewImports, importItems)
    : null
  const selectedReviewImportById = new Map(selectedReviewImports.map((entry) => [entry.id, entry]))
  const reviewItems = selectedReviewGroup?.items ?? []
  const reviewCounts = summarizeImportReview(reviewItems)
  const visibleReviewItems = sortImportItemsByDate(
    reviewItems.filter((item) => item.status !== 'ignored'),
    reviewSortDirection,
  )
  const pendingReviewActionCount = reviewCounts.ready + reviewCounts.needsReview
  const canApplyReview = reviewItems.length > 0 && (pendingReviewActionCount > 0 || reviewCounts.ignored + reviewCounts.duplicate + reviewCounts.applied === reviewItems.length)
  const importModalStep = selectedReviewGroup ? 'review' : 'upload'
  const pendingImportGroup = pendingImportGroups[0] ?? null
  const selectedTransferMovement = transferModalMovementId
    ? scopedMovements.find((movement) => movement.id === transferModalMovementId) ?? null
    : null
  const selectedTransfer = selectedTransferMovement?.transferId
    ? scopedTransfers.find((transfer) => transfer.id === selectedTransferMovement.transferId) ?? null
    : null
  const transferCandidates = selectedTransferMovement
    ? findTransferCandidates(selectedTransferMovement, scopedMovements, scopedAccounts)
    : []
  const selectedDeleteMovement = deleteMovementId
    ? scopedMovements.find((movement) => movement.id === deleteMovementId) ?? null
    : null

  const selectedOrganizationLabel =
    organizationOptions.find((option) => option.value === selectedOrganizationId)?.label ?? 'select organization'
  const importAccountLabel = importAccountOptions.find((option) => option.value === importAccountId)?.label ?? 'select account'
  const holderDisplay = holderOptions.find((option) => option.value === (accountDraft.holderUserId || '__unassigned__'))?.label ?? 'unassigned'
  const typeDisplay = ACCOUNT_TYPES.find((entry) => entry.value === accountDraft.type)?.label ?? 'type'
  const typeOptions: PachSelectOption[] = ACCOUNT_TYPES.map((entry) => ({
    value: entry.value,
    label: entry.label,
    icon: entry.value === 'credit_card' ? <CreditCard className="h-3.5 w-3.5" /> : <Landmark className="h-3.5 w-3.5" />,
  }))
  const currencyOptions: PachSelectOption[] = CURRENCIES.map((entry) => ({
    value: entry,
    label: entry,
  }))
  const categoryTypeOptions: PachSelectOption[] = MOVEMENT_TYPES
  const categoryOptions: PachSelectOption[] = [
    { value: UNCATEGORIZED_VALUE, label: 'uncategorized', icon: <Tag className="h-3.5 w-3.5" /> },
    ...scopedCategories.map((entry) => ({
      value: entry.id,
      label: entry.name,
      icon: <Tag className="h-3.5 w-3.5" />,
    })),
  ]
  const movementTypeOptions: PachSelectOption[] = MOVEMENT_TYPES.map((entry) => ({ value: entry.value, label: entry.label }))
  const movementStatusOptions: PachSelectOption[] = MOVEMENT_STATUSES.map((entry) => ({ value: entry.value, label: entry.label }))
  const importItemStatusOptions: PachSelectOption[] = [
    { value: 'parsed', label: 'ready' },
    { value: 'needs_review', label: 'needs review' },
    { value: 'ignored', label: 'ignored' },
    { value: 'duplicate', label: 'duplicate' },
  ]
  const monthFilterOptions = uniqueBy(
    scopedMovements.map((movement) => ({
      value: monthKey(movement.transactionDate),
      label: formatMonthLabel(movement.transactionDate),
    })),
    (entry) => entry.value,
  )
  const quarterFilterOptions = uniqueBy(
    scopedMovements.map((movement) => ({
      value: quarterKey(movement.transactionDate),
      label: quarterKey(movement.transactionDate),
    })),
    (entry) => entry.value,
  )
  const currencyFilterOptions = uniqueBy(
    [
      ...scopedMovements.map((movement) => movement.currencyCode),
      ...scopedAccounts.map((account) => account.currencyCode),
    ]
      .filter(Boolean)
      .sort((a, b) => currencySortValue(a).localeCompare(currencySortValue(b)))
      .map((currencyCode) => ({
        value: currencyCode,
        label: currencyCode,
        icon: <span className="font-mono text-[10px] text-fg-3">$</span>,
      })),
    (entry) => entry.value,
  )
  const filterConfigs: FilterFieldConfig[] = [
    {
      field: 'accounts',
      label: 'accounts',
      icon: WalletCards,
      options: scopedAccounts.map((account) => ({
        value: account.id,
        label: account.name,
        icon: account.type === 'credit_card' ? <CreditCard className="h-3.5 w-3.5" /> : <Landmark className="h-3.5 w-3.5" />,
      })),
    },
    {
      field: 'statuses',
      label: 'statuses',
      icon: Layers2,
      options: movementStatusOptions.map((entry) => ({
        value: entry.value,
        label: entry.value === 'pending_review' ? 'needs review' : entry.label,
      })),
    },
    {
      field: 'categories',
      label: 'categories',
      icon: Tag,
      options: [
        { value: UNCATEGORIZED_VALUE, label: 'uncategorized' },
        ...scopedCategories.map((category) => ({
          value: category.id,
          label: category.name,
          icon: <Tag className="h-3.5 w-3.5" />,
        })),
      ],
    },
    {
      field: 'currencies',
      label: 'currencies',
      icon: CircleDollarSign,
      options: currencyFilterOptions,
    },
    {
      field: 'months',
      label: 'months',
      icon: CalendarDays,
      options: monthFilterOptions,
    },
    {
      field: 'quarters',
      label: 'quarters',
      icon: CalendarDays,
      options: quarterFilterOptions,
    },
  ]
  const dashboardFilterConfigs: FilterFieldConfig[] = [
    {
      field: 'currencies',
      label: 'currencies',
      icon: CircleDollarSign,
      options: currencyFilterOptions,
    },
    {
      field: 'months',
      label: 'months',
      icon: CalendarDays,
      options: monthFilterOptions,
    },
    {
      field: 'quarters',
      label: 'quarters',
      icon: CalendarDays,
      options: quarterFilterOptions,
    },
  ]
  const selectedMovementAccount = scopedAccounts.find((account) => account.id === movementDraft.accountId)
  const editingAccount = editingAccountId ? scopedAccounts.find((account) => account.id === editingAccountId) : undefined
  const pendingCount = scopedMovements.filter((movement) => movement.status === 'pending_review').length
  const canCreateAccount = Boolean(selectedOrganizationId && accountDraft.name.trim())
  const canCreateCategory = Boolean(selectedOrganizationId && categoryDraft.name.trim())
  const canMergeCategory = Boolean(
    categoryMergeDraft.categoryId &&
    categoryMergeDraft.targetCategoryId &&
    categoryMergeDraft.categoryId !== categoryMergeDraft.targetCategoryId,
  )
  const canCreateMovement = Boolean(selectedOrganizationId && selectedMovementAccount && movementDraft.description.trim() && parseMoneyToMinor(movementDraft.amount) != null)

  useEffect(() => {
    const canonicalPath = pathForTab(tab)
    if (location.pathname === '/finance' || location.pathname === '/finance/') {
      navigate('/finance/dashboard', { replace: true })
    } else if (location.pathname === '/finance/accounts-cards') {
      navigate('/finance/accounts', { replace: true })
    } else if (location.pathname !== canonicalPath) {
      navigate('/finance/dashboard', { replace: true })
    }
  }, [location.pathname, navigate, tab])

  useEffect(() => {
    if (!organizationStorageKey) return
    const storedOrganizationId = localStorage.getItem(organizationStorageKey)
    if (storedOrganizationId && storedOrganizationId !== organizationId) {
      setOrganizationId(storedOrganizationId)
    }
    if (!storedOrganizationId && organizationId) setOrganizationId('')
    // Reload when the logged-in user changes; avoid fighting explicit org selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationStorageKey])

  useEffect(() => {
    if (!organizationId || accessibleOrganizations.length === 0) return
    if (!accessibleOrganizations.some((organization) => organization.id === organizationId)) {
      setOrganizationId('')
    }
  }, [accessibleOrganizations, organizationId])

  useEffect(() => {
    if (!organizationStorageKey || !selectedOrganizationId) return
    localStorage.setItem(organizationStorageKey, selectedOrganizationId)
  }, [organizationStorageKey, selectedOrganizationId])

  useEffect(() => {
    const targetCurrencies = CURRENCIES.filter((currencyCode) => currencyCode !== dashboardReportingCurrencyCode)
    if (targetCurrencies.length === 0) {
      setDashboardFx({
        status: 'ready',
        baseCurrencyCode: dashboardReportingCurrencyCode,
        date: null,
        rates: {},
        error: null,
      })
      return
    }

    const controller = new AbortController()
    setDashboardFx((current) => ({
      ...current,
      status: 'loading',
      baseCurrencyCode: dashboardReportingCurrencyCode,
      error: null,
    }))

    void fetch(`https://api.frankfurter.dev/v2/rates?base=${encodeURIComponent(dashboardReportingCurrencyCode)}&quotes=${targetCurrencies.join(',')}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`fx request failed (${response.status})`)
        return response.json() as Promise<FrankfurterRatesPayload>
      })
      .then((payload) => {
        if (controller.signal.aborted) return
        const parsed = parseFrankfurterRates(payload, dashboardReportingCurrencyCode)
        setDashboardFx({
          status: 'ready',
          baseCurrencyCode: dashboardReportingCurrencyCode,
          date: parsed.date,
          rates: parsed.rates,
          error: null,
        })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setDashboardFx({
          status: 'failed',
          baseCurrencyCode: dashboardReportingCurrencyCode,
          date: null,
          rates: {},
          error: error instanceof Error ? error.message : 'fx request failed',
        })
      })

    return () => controller.abort()
  }, [dashboardReportingCurrencyCode])

  useEffect(() => {
    if (!selectedOrganizationId || !token) {
      setApiCategories([])
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(`${config.apiUrl}/finance/categories?organizationId=${encodeURIComponent(selectedOrganizationId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const result = await readJsonResponse(response)
        if (!response.ok) throw new Error(result.message || result.error || 'Could not load finance categories.')
        if (!cancelled) setApiCategories(Array.isArray(result.categories) ? result.categories : [])
      } catch {
        if (!cancelled) setApiCategories([])
      }
    })()

    return () => {
      cancelled = true
    }
  }, [selectedOrganizationId, token])

  useEffect(() => {
    const preferredAccountId = selectedAccountFilterIds.length === 1 ? selectedAccountFilterIds[0] : ''
    if (preferredAccountId && scopedAccounts.some((account) => account.id === preferredAccountId)) {
      setImportAccountId(preferredAccountId)
      return
    }
    if (!importAccountId || !scopedAccounts.some((account) => account.id === importAccountId)) {
      setImportAccountId(scopedAccounts[0]?.id ?? '')
    }
  }, [importAccountId, scopedAccounts, selectedAccountFilterIds])

  useEffect(() => {
    if (!accountModalOpen && !importModalOpen && !categoryModalOpen && !movementModalOpen && !transferModalMovementId && !deleteMovementId) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeAccountModal()
        setImportModalOpen(false)
        setCategoryModalOpen(false)
        setMovementModalOpen(false)
        setTransferModalMovementId(null)
        setDeleteMovementId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [accountModalOpen, categoryModalOpen, deleteMovementId, importModalOpen, movementModalOpen, transferModalMovementId])

  function openAccountModal(account?: FinanceAccount) {
    if (account) {
      setEditingAccountId(account.id)
      setAccountDraft({
        name: account.name,
        institutionName: account.institutionName ?? '',
        holderUserId: account.holderUserId ?? '',
        type: account.type,
        currencyCode: account.currencyCode,
      })
    } else {
      setEditingAccountId(null)
      setAccountDraft(EMPTY_ACCOUNT_DRAFT)
    }
    setInstitutionSuggestionsOpen(false)
    setAccountModalOpen(true)
  }

  function closeAccountModal() {
    setAccountModalOpen(false)
    setEditingAccountId(null)
    setAccountDraft(EMPTY_ACCOUNT_DRAFT)
    setInstitutionSuggestionsOpen(false)
  }

  function saveAccount() {
    if (!selectedOrganizationId || !accountDraft.name.trim()) return
    const payload = {
      name: accountDraft.name.trim(),
      institutionName: accountDraft.institutionName.trim() || null,
      holderUserId: accountDraft.holderUserId || null,
      type: accountDraft.type,
      currencyCode: accountDraft.currencyCode,
    }
    if (editingAccountId) {
      z.mutate.fin_accounts.update({ id: editingAccountId, ...payload })
    } else {
      z.mutate.fin_accounts.create({
        id: crypto.randomUUID(),
        organizationId: selectedOrganizationId,
        ...payload,
        institutionName: payload.institutionName || undefined,
        holderUserId: payload.holderUserId || undefined,
      })
    }
    closeAccountModal()
  }

  function createCategory() {
    if (!canCreateCategory) return
    z.mutate.fin_categories.create({
      id: crypto.randomUUID(),
      organizationId: selectedOrganizationId,
      name: categoryDraft.name.trim(),
      type: categoryDraft.type,
      position: scopedCategories.length,
    })
    setCategoryDraft({ name: '', type: 'expense' })
    setCategoryModalOpen(false)
  }

  async function mergeAndArchiveCategory() {
    if (!selectedOrganizationId || !canMergeCategory) return
    const sourceCategory = scopedCategories.find((entry) => entry.id === categoryMergeDraft.categoryId)
    const targetCategory = scopedCategories.find((entry) => entry.id === categoryMergeDraft.targetCategoryId)
    if (!sourceCategory || !targetCategory) return

    const sourceMovements = scopedMovements.filter((movement) => movement.categoryId === sourceCategory.id)
    for (const movement of sourceMovements) {
      await z.mutate.fin_movements.update({
        id: movement.id,
        categoryId: targetCategory.id,
        type: targetCategory.type,
        status: 'reviewed',
        reviewReason: null,
      })
      await learnCategorizationRule(movement, targetCategory.id)
    }

    const sourceRules = categorizationRules.filter((rule) => rule.organizationId === selectedOrganizationId && rule.categoryId === sourceCategory.id)
    for (const rule of sourceRules) {
      await z.mutate.fin_categorization_rules.update({
        id: rule.id,
        categoryId: targetCategory.id,
        type: targetCategory.type,
        autoApply: true,
      })
    }

    await z.mutate.fin_categories.update({ id: sourceCategory.id, archived: true })
    setCategoryMergeDraft({ categoryId: '', targetCategoryId: '' })
  }

  function openMovementModal(accountId = selectedAccountFilterIds[0] || scopedAccounts[0]?.id || '') {
    setMovementDraft({
      accountId,
      categoryId: UNCATEGORIZED_VALUE,
      transactionDate: todayInputDate(),
      description: '',
      amount: '',
      type: 'expense',
      status: 'reviewed',
    })
    setMovementModalOpen(true)
  }

  async function createMovement() {
    const account = scopedAccounts.find((entry) => entry.id === movementDraft.accountId)
    const parsedAmountMinor = parseMoneyToMinor(movementDraft.amount)
    if (!selectedOrganizationId || !account || !movementDraft.description.trim() || parsedAmountMinor == null) return

    const id = crypto.randomUUID()
    const amountMinor = signedAmountForType(parsedAmountMinor, movementDraft.type)
    await z.mutate.fin_movements.create({
      id,
      organizationId: selectedOrganizationId,
      accountId: account.id,
      categoryId: movementDraft.categoryId === UNCATEGORIZED_VALUE ? undefined : movementDraft.categoryId,
      transactionDate: dateInputToMs(movementDraft.transactionDate),
      transactionTime: '00:00:00',
      postedDate: undefined,
      description: movementDraft.description.trim(),
      merchantName: undefined,
      counterparty: undefined,
      amountMinor,
      currencyCode: account.currencyCode,
      reportingAmountMinor: amountMinor,
      reportingCurrencyCode: account.currencyCode,
      type: movementDraft.type,
      status: movementDraft.status,
      reviewReason: reviewReasonForStatus(movementDraft.status),
      rawData: { source: 'manual' },
      fingerprint: `manual:${id}`,
    })
    setMovementModalOpen(false)
  }

  function setFilterField(field: string, values: string[]) {
    setActiveFilters((current) => {
      const next = { ...current }
      if (values.length === 0) delete next[field]
      else next[field] = values
      return next
    })
  }

  function toggleMovementDateSort() {
    setMovementSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
  }

  function toggleReviewDateSort() {
    setReviewSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
  }

  function clearAllFilters() {
    setActiveFilters({})
  }

  function setDashboardFilterField(field: string, values: string[]) {
    setDashboardFilters((current) => {
      const next = { ...current }
      if (values.length === 0) delete next[field]
      else next[field] = values
      return next
    })
  }

  function clearDashboardFilters() {
    setDashboardFilters({})
  }

  function stageImportFiles(files: File[]) {
    setImportModalOpen(true)
    const nextFiles = files.filter((file) => file.size > 0)
    const totalBytes = nextFiles.reduce((sum, file) => sum + file.size, 0)
    if (nextFiles.length === 0) {
      setImportPhase('failed')
      setImportFiles([])
      setImportMessage('Choose at least one file to import.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    if (totalBytes > MAX_IMPORT_TOTAL_BYTES) {
      setImportPhase('failed')
      setImportFiles(nextFiles)
      setImportMessage(`Files are too large (${formatBytes(totalBytes)}). Current import limit is ${formatBytes(MAX_IMPORT_TOTAL_BYTES)} total.`)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setImportFiles(nextFiles)
    setImportPhase('ready')
    setImportMessage(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function resetImportSelection() {
    setImportFiles([])
    setImportPhase('select')
    setImportMessage(null)
    setImportDragActive(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function openImportUpload() {
    setReviewBatchId(null)
    setImportModalOpen(true)
  }

  async function confirmImport() {
    if (importFiles.length === 0) return
    const targetAccountId = importAccountId || selectedAccountFilterIds[0] || scopedAccounts[0]?.id
    if (!targetAccountId || !selectedOrganizationId || !token) {
      setImportPhase('failed')
      setImportMessage('Create or select an account before importing.')
      return
    }

    setImportPhase('processing')
    setImportMessage(`Reading ${importFiles.length} file${importFiles.length === 1 ? '' : 's'}...`)
    try {
      const batchId = crypto.randomUUID()
      let parsed = 0
      let needsReview = 0
      let duplicates = 0
      let ready = 0
      let duplicateFiles = 0
      let latestReviewBatchId: string | null = null
      for (const [index, file] of importFiles.entries()) {
        const contentBase64 = await fileToBase64(file)
        setImportMessage(`Analyzing ${index + 1}/${importFiles.length}: ${file.name}...`)
        const response = await fetch(`${config.apiUrl}/finance/imports`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            organizationId: selectedOrganizationId,
            accountId: targetAccountId,
            batchId,
            fileName: file.name,
            fileType: file.type || guessFileType(file.name),
            sourceType: sourceTypeFor(file),
            contentBase64,
          }),
        })
        const result = await readJsonResponse(response)
        if (!response.ok) throw new Error(result.message || result.error || 'Import failed')
        if (result.batchId || result.importId) latestReviewBatchId = result.batchId || result.importId
        const summary = result.summary
        parsed += summary?.parsed ?? 0
        ready += summary?.ready ?? 0
        needsReview += summary?.needsReview ?? 0
        duplicates += summary?.duplicates ?? 0
        if (result.duplicateFile) duplicateFiles += 1
      }
      setImportPhase('success')
      setReviewBatchId(duplicateFiles === importFiles.length ? latestReviewBatchId : batchId)
      setImportMessage(
        duplicateFiles === importFiles.length
          ? `Draft already exists. ${parsed} movements matched across ${importFiles.length} file${importFiles.length === 1 ? '' : 's'}.`
          : `Draft ready. ${ready} ready, ${needsReview} need review, ${duplicates} duplicates skipped across ${importFiles.length} file${importFiles.length === 1 ? '' : 's'}.`,
      )
    } catch (error) {
      setImportPhase('failed')
      setImportMessage(error instanceof Error ? error.message : 'Import failed')
    }
  }

  async function updateCategory(movementId: string, categoryId: string) {
    const movement = scopedMovements.find((entry) => entry.id === movementId)
    const category = scopedCategories.find((entry) => entry.id === categoryId)
    await z.mutate.fin_movements.update({
      id: movementId,
      categoryId: categoryId || null,
      type: category?.type && ['income', 'expense', 'transfer', 'adjustment'].includes(category.type) ? category.type : movement?.type,
      status: categoryId ? 'reviewed' : 'pending_review',
      reviewReason: categoryId ? null : 'uncategorized',
    })
    if (movement && categoryId) await learnCategorizationRule(movement, categoryId)
  }

  function openImportReview(batchId: string) {
    setReviewBatchId(batchId)
    setImportModalOpen(true)
    setImportPhase('success')
    setImportFiles([])
    setImportMessage(null)
  }

  async function updateImportItemAccount(item: FinanceImportItem, accountId: string) {
    const account = scopedAccounts.find((entry) => entry.id === accountId)
    if (!account) return
    const duplicateOverride = item.status === 'duplicate'
    await z.mutate.fin_import_items.update({
      id: item.id,
      accountId,
      currencyCode: account.currencyCode,
      status: duplicateOverride ? (item.suggestedCategoryId ? 'parsed' : 'needs_review') : item.status,
      duplicateMovementId: duplicateOverride ? null : item.duplicateMovementId,
      rawData: duplicateOverride ? { ...item.rawData, duplicateOverride: true } : item.rawData,
    })
  }

  async function updateImportItemCategory(item: FinanceImportItem, categoryId: string) {
    const duplicateOverride = item.status === 'duplicate'
    if (categoryId === UNCATEGORIZED_VALUE) {
      await z.mutate.fin_import_items.update({
        id: item.id,
        suggestedCategoryId: null,
        suggestedType: null,
        status: 'needs_review',
        duplicateMovementId: duplicateOverride ? null : item.duplicateMovementId,
        rawData: duplicateOverride ? { ...item.rawData, duplicateOverride: true } : item.rawData,
      })
      return
    }
    const category = scopedCategories.find((entry) => entry.id === categoryId)
    await z.mutate.fin_import_items.update({
      id: item.id,
      suggestedCategoryId: categoryId,
      suggestedType: category?.type ?? item.suggestedType ?? inferType(item.amountMinor),
      status: 'parsed',
      duplicateMovementId: duplicateOverride ? null : item.duplicateMovementId,
      rawData: duplicateOverride ? { ...item.rawData, duplicateOverride: true } : item.rawData,
    })
  }

  async function updateImportItemStatus(item: FinanceImportItem, status: string) {
    if (item.status === 'applied') return
    const nextStatus = status === 'parsed' && !item.suggestedCategoryId ? 'needs_review' : status
    const duplicateOverride = item.status === 'duplicate' && nextStatus !== 'duplicate'
    await z.mutate.fin_import_items.update({
      id: item.id,
      status: nextStatus,
      duplicateMovementId: duplicateOverride ? null : item.duplicateMovementId,
      rawData: duplicateOverride ? { ...item.rawData, duplicateOverride: true } : item.rawData,
      errorMessage: null,
    })
  }

  async function removeImportItem(item: FinanceImportItem) {
    if (item.status === 'applied') return
    await z.mutate.fin_import_items.update({
      id: item.id,
      status: 'ignored',
      duplicateMovementId: item.status === 'duplicate' ? null : item.duplicateMovementId,
      rawData: item.status === 'duplicate' ? { ...item.rawData, duplicateOverride: true } : item.rawData,
      errorMessage: null,
    })
  }

  async function applyReviewedImport() {
    if (!selectedReviewGroup || !token) return
    setImportPhase('processing')
    setImportMessage('Applying reviewed movements...')
    try {
      const singleLegacyImport = selectedReviewImports.length === 1 && !selectedReviewImports[0]?.batchId
      const applyUrl = singleLegacyImport
        ? `${config.apiUrl}/finance/imports/${selectedReviewImports[0].id}/apply`
        : `${config.apiUrl}/finance/import-batches/${selectedReviewGroup.id}/apply`
      const response = await fetch(applyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
      const result = await readJsonResponse(response)
      if (!response.ok) throw new Error(result.message || result.error || 'Could not apply import')
      setImportPhase('success')
      setImportMessage(`Applied ${result.summary?.created ?? 0} movements. ${result.summary?.remainingReview ?? 0} still need review.`)
      if ((result.summary?.remainingReview ?? 0) === 0) {
        setReviewBatchId(null)
        setImportModalOpen(false)
      }
    } catch (error) {
      setImportPhase('failed')
      setImportMessage(error instanceof Error ? error.message : 'Could not apply import')
    }
  }

  async function discardReviewedImport() {
    if (!selectedReviewGroup || !token) return
    setImportPhase('processing')
    setImportMessage('Discarding import draft...')
    try {
      const singleLegacyImport = selectedReviewImports.length === 1 && !selectedReviewImports[0]?.batchId
      const discardUrl = singleLegacyImport
        ? `${config.apiUrl}/finance/imports/${selectedReviewImports[0].id}/ignore`
        : `${config.apiUrl}/finance/import-batches/${selectedReviewGroup.id}/ignore`
      const response = await fetch(discardUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
      const result = await readJsonResponse(response)
      if (!response.ok) throw new Error(result.message || result.error || 'Could not discard import')
      setImportPhase('success')
      setImportMessage('Import draft discarded.')
      setReviewBatchId(null)
      setImportModalOpen(false)
    } catch (error) {
      setImportPhase('failed')
      setImportMessage(error instanceof Error ? error.message : 'Could not discard import')
    }
  }

  async function updateMovementAccount(movementId: string, accountId: string) {
    const account = scopedAccounts.find((entry) => entry.id === accountId)
    if (!account) return
    await z.mutate.fin_movements.update({
      id: movementId,
      accountId,
      currencyCode: account.currencyCode,
      reportingCurrencyCode: account.currencyCode,
    })
  }

  async function updateMovementCurrency(movementId: string, currencyCode: string) {
    if (!CURRENCIES.includes(currencyCode)) return
    await z.mutate.fin_movements.update({
      id: movementId,
      currencyCode,
      reportingCurrencyCode: currencyCode,
    })
  }

  async function updateMovementStatus(movementId: string, status: string) {
    await z.mutate.fin_movements.update({ id: movementId, status, reviewReason: reviewReasonForStatus(status) })
    const movement = scopedMovements.find((entry) => entry.id === movementId)
    if (status === 'reviewed' && movement?.categoryId) await learnCategorizationRule(movement, movement.categoryId)
  }

  function startEditingMovementLabel(movement: FinanceMovement) {
    setEditingMovementLabel({
      id: movement.id,
      value: movement.merchantName || movement.description,
    })
  }

  function cancelEditingMovementLabel() {
    setEditingMovementLabel(null)
  }

  function startEditingMovementDate(movement: FinanceMovement) {
    setEditingMovementDate({
      id: movement.id,
      value: formatZeroDate(movement.transactionDate),
    })
  }

  function cancelEditingMovementDate() {
    setEditingMovementDate(null)
  }

  async function saveEditingMovementLabel(movement: FinanceMovement) {
    if (editingMovementLabel?.id !== movement.id) return
    const value = editingMovementLabel.value.trim()
    if (!value) {
      setEditingMovementLabel(null)
      return
    }
    if (movement.merchantName) {
      if (value !== movement.merchantName) await z.mutate.fin_movements.update({ id: movement.id, merchantName: value })
    } else if (value !== movement.description) {
      await z.mutate.fin_movements.update({ id: movement.id, description: value })
    }
    setEditingMovementLabel(null)
  }

  async function saveEditingMovementDate(movement: FinanceMovement) {
    if (editingMovementDate?.id !== movement.id) return
    const value = editingMovementDate.value
    if (!isValidDateInput(value)) {
      setEditingMovementDate(null)
      return
    }
    const nextDate = dateInputToMs(value)
    if (nextDate !== movement.transactionDate) {
      await z.mutate.fin_movements.update({
        id: movement.id,
        transactionDate: nextDate,
        fingerprint: await buildMovementFingerprintForUpdate({
          accountId: movement.accountId,
          transactionDate: value,
          transactionTime: movement.transactionTime,
          amountMinor: movement.amountMinor,
          description: movement.description,
        }),
      })
    }
    setEditingMovementDate(null)
  }

  async function confirmDeleteMovement() {
    const movementId = selectedDeleteMovement?.id
    if (!movementId) return
    await z.mutate.fin_movements.delete({ id: movementId })
    if (transferModalMovementId === movementId) setTransferModalMovementId(null)
    setDeleteMovementId(null)
  }

  async function linkTransferMovement(sourceId: string, targetId: string) {
    const source = scopedMovements.find((entry) => entry.id === sourceId)
    const target = scopedMovements.find((entry) => entry.id === targetId)
    if (!source || !target || !selectedOrganizationId) return

    const outgoing = source.amountMinor <= 0 ? source : target
    const incoming = outgoing.id === source.id ? target : source
    const transferId = source.transferId || target.transferId || crypto.randomUUID()
    const existingTransfer = scopedTransfers.find((entry) => entry.id === transferId)
    const amountMinor = Math.max(Math.abs(source.amountMinor), Math.abs(target.amountMinor))
    const score = scoreTransferCandidate(source, target)
    const transferPayload = {
      id: transferId,
      status: 'confirmed',
      fromAccountId: outgoing.amountMinor < 0 ? outgoing.accountId : null,
      toAccountId: incoming.amountMinor > 0 ? incoming.accountId : null,
      amountMinor,
      currencyCode: source.currencyCode === target.currencyCode ? source.currencyCode : source.currencyCode,
      matchedConfidence: score,
    }

    if (existingTransfer) {
      await z.mutate.fin_transfers.update(transferPayload)
    } else {
      await z.mutate.fin_transfers.create({ ...transferPayload, organizationId: selectedOrganizationId })
    }
    await z.mutate.fin_movements.update({ id: source.id, transferId, type: 'transfer', status: 'reviewed', reviewReason: null })
    await z.mutate.fin_movements.update({ id: target.id, transferId, type: 'transfer', status: 'reviewed', reviewReason: null })
    setTransferModalMovementId(null)
  }

  async function markMovementAsTransfer(movementId: string) {
    const movement = scopedMovements.find((entry) => entry.id === movementId)
    if (!movement || !selectedOrganizationId) return
    const transferId = movement.transferId || crypto.randomUUID()
    const existingTransfer = scopedTransfers.find((entry) => entry.id === transferId)
    const transferPayload = {
      id: transferId,
      status: 'confirmed',
      fromAccountId: movement.amountMinor < 0 ? movement.accountId : null,
      toAccountId: movement.amountMinor > 0 ? movement.accountId : null,
      amountMinor: Math.abs(movement.amountMinor),
      currencyCode: movement.currencyCode,
      matchedConfidence: null,
    }

    if (existingTransfer) {
      await z.mutate.fin_transfers.update(transferPayload)
    } else {
      await z.mutate.fin_transfers.create({ ...transferPayload, organizationId: selectedOrganizationId })
    }
    await z.mutate.fin_movements.update({ id: movement.id, transferId, type: 'transfer', status: 'reviewed', reviewReason: null })
    setTransferModalMovementId(null)
  }

  async function unmarkTransferMovement(movementId: string) {
    const movement = scopedMovements.find((entry) => entry.id === movementId)
    if (!movement) return
    const linkedMovements = movement.transferId
      ? scopedMovements.filter((entry) => entry.transferId === movement.transferId)
      : [movement]

    for (const entry of linkedMovements) {
      const category = entry.categoryId ? scopedCategories.find((candidate) => candidate.id === entry.categoryId) : null
      await z.mutate.fin_movements.update({
        id: entry.id,
        transferId: null,
        type: inferType(entry.amountMinor),
        categoryId: category?.type === 'transfer' ? null : entry.categoryId,
        status: category?.type === 'transfer' || !entry.categoryId ? 'pending_review' : 'reviewed',
        reviewReason: category?.type === 'transfer' || !entry.categoryId ? 'uncategorized' : null,
      })
    }
    if (movement.transferId) {
      const transfer = scopedTransfers.find((entry) => entry.id === movement.transferId)
      if (transfer) await z.mutate.fin_transfers.update({ id: transfer.id, status: 'rejected' })
    }
    setTransferModalMovementId(null)
  }

  async function learnCategorizationRule(movement: Schema['tables']['fin_movements']['row'], categoryId: string) {
    const match = buildRuleMatch(movement)
    if (!selectedOrganizationId || !match) return
    const category = scopedCategories.find((entry) => entry.id === categoryId)
    const existingRule = categorizationRules.find((rule) =>
      rule.organizationId === selectedOrganizationId &&
      (rule.accountId ?? '') === movement.accountId &&
      rule.matchKind === match.kind &&
      rule.matchValue.toLowerCase() === match.value.toLowerCase()
    )

    if (existingRule) {
      await z.mutate.fin_categorization_rules.update({
        id: existingRule.id,
        categoryId,
        type: category?.type ?? movement.type,
        confidence: 95,
        autoApply: true,
      })
      return
    }

    await z.mutate.fin_categorization_rules.create({
      id: crypto.randomUUID(),
      organizationId: selectedOrganizationId,
      accountId: movement.accountId,
      categoryId,
      type: category?.type ?? movement.type,
      matchKind: match.kind,
      matchValue: match.value,
      confidence: 95,
      autoApply: true,
      createdFromMovementId: movement.id,
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden">
      <aside className="hidden shrink-0 flex-col border-r border-[rgba(0,255,140,0.12)] bg-[rgba(5,6,5,0.6)] px-2 py-4 backdrop-blur-sm md:relative md:z-auto md:flex md:w-[200px]">
        <div className="mb-2 flex items-start justify-between gap-2 px-4 pb-3">
          <div>
            <div className="font-bold text-base tracking-wide text-accent [text-shadow:0_0_6px_rgba(0,255,136,0.5)]">
              p@ch_
            </div>
            <div className="mt-1 text-[9px] uppercase tracking-label text-fg-4">
              // finance · ledger
            </div>
          </div>
        </div>

        <div className="mb-4 px-2">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-label text-fg-4">organization</div>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-fg-4" />
            <PachSelect
              value={selectedOrganizationId}
              onChange={(next) => {
                setOrganizationId(next)
                setActiveFilters({})
                setDashboardFilters({})
                if (organizationStorageKey) localStorage.setItem(organizationStorageKey, next)
              }}
              options={organizationOptions}
              display={selectedOrganizationLabel}
              popupWidth="200"
              triggerClassName="flex h-8 w-full items-center justify-between border border-[rgba(0,255,140,0.18)] bg-rim pl-9 pr-2 text-left font-mono text-xs text-fg-1 outline-none transition hover:border-[rgba(0,255,140,0.32)] hover:bg-[rgba(0,255,136,0.04)] focus-visible:border-accent focus-visible:shadow-glow-xs"
            />
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt,.pdf,image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? [])
            if (files.length > 0) stageImportFiles(files)
          }}
        />

        <div className="mt-4 space-y-1">
          <div className="px-3 pb-1 font-mono text-[10px] uppercase tracking-label text-fg-4">sections</div>
          <FinanceSidebarButton
            active={tab === 'dashboard'}
            label="dashboard"
            onClick={() => navigate(pathForTab('dashboard'))}
          />
          <FinanceSidebarButton
            active={tab === 'movements'}
            label="movements"
            meta={pendingCount ? String(pendingCount) : undefined}
            onClick={() => navigate(pathForTab('movements'))}
          />
          <FinanceSidebarButton
            active={tab === 'accounts'}
            label="accounts/cards"
            meta={String(scopedAccounts.length)}
            onClick={() => navigate(pathForTab('accounts'))}
          />
        </div>

        <div className="mt-6 space-y-1">
          <div className="px-3 pb-1 font-mono text-[10px] uppercase tracking-label text-fg-4">quick read</div>
          <div className="space-y-2 border border-[rgba(0,255,140,0.12)] bg-pit-2 px-3 py-2 font-mono text-xs">
            <FinanceMetric label="pending" value={`${pendingCount}`} tone={pendingCount ? 'fail' : 'default'} />
            <FinanceMetric label="accounts" value={`${scopedAccounts.length}`} />
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-[rgba(0,255,140,0.12)] bg-[rgba(5,6,5,0.72)] px-3 py-3 md:hidden">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-xl font-bold lowercase text-fg-1">finance</div>
              <div className="mt-0.5 font-mono text-[10px] uppercase tracking-label text-fg-4">ledger</div>
            </div>
            <div className="relative min-w-0 flex-1">
              <Building2 className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-fg-4" />
              <PachSelect
                value={selectedOrganizationId}
                onChange={(next) => {
                  setOrganizationId(next)
                  setActiveFilters({})
                  setDashboardFilters({})
                  if (organizationStorageKey) localStorage.setItem(organizationStorageKey, next)
                }}
                options={organizationOptions}
                display={selectedOrganizationLabel}
                popupWidth="240"
                triggerClassName="flex h-9 w-full items-center justify-between border border-[rgba(0,255,140,0.18)] bg-rim pl-9 pr-2 text-left font-mono text-xs text-fg-1 outline-none transition hover:border-[rgba(0,255,140,0.32)] hover:bg-[rgba(0,255,136,0.04)] focus-visible:border-accent focus-visible:shadow-glow-xs"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1 font-mono text-[10px] uppercase tracking-label">
            <button
              type="button"
              onClick={() => navigate(pathForTab('dashboard'))}
              className={`border px-2 py-2 text-center transition ${tab === 'dashboard' ? 'border-[rgba(0,255,140,0.45)] bg-[rgba(0,255,136,0.08)] text-accent' : 'border-[rgba(0,255,140,0.12)] text-fg-3'}`}
            >
              dashboard
            </button>
            <button
              type="button"
              onClick={() => navigate(pathForTab('movements'))}
              className={`border px-2 py-2 text-center transition ${tab === 'movements' ? 'border-[rgba(0,255,140,0.45)] bg-[rgba(0,255,136,0.08)] text-accent' : 'border-[rgba(0,255,140,0.12)] text-fg-3'}`}
            >
              movements
            </button>
            <button
              type="button"
              onClick={() => navigate(pathForTab('accounts'))}
              className={`border px-2 py-2 text-center transition ${tab === 'accounts' ? 'border-[rgba(0,255,140,0.45)] bg-[rgba(0,255,136,0.08)] text-accent' : 'border-[rgba(0,255,140,0.12)] text-fg-3'}`}
            >
              accounts
            </button>
          </div>
        </div>

        <div className="sr-only">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-label text-fg-3">◊ finance · ledger</div>
            <h1 className="font-mono text-2xl font-bold lowercase text-fg-1">finance</h1>
            <p className="mt-0.5 text-sm text-fg-3">
              <span className="text-fg-4">›</span> accounts · cards · movements
            </p>
          </div>
        </div>

      {tab === 'dashboard' ? (
        <div className="min-h-0 flex-1 overflow-auto px-3 py-3 md:px-8 md:py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="[&>div>div>button]:h-8 [&>div>div>button]:px-3">
              <FilterButton
                activeFilters={dashboardFilters}
                filterConfigs={dashboardFilterConfigs}
                onFilterChange={setDashboardFilterField}
                onClearAll={clearDashboardFilters}
              />
            </div>
            <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">
              {dashboardPeriodMovements.length} period movements
            </div>
          </div>

          <section className="border border-[rgba(0,255,140,0.14)] bg-pit-2 font-mono">
            <div className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <button
                type="button"
                onClick={() => setDashboardBalanceExpanded((current) => !current)}
                className="min-w-0 text-left transition hover:text-accent"
              >
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-label text-fg-4">
                  {dashboardBalanceExpanded ? <ChevronDown className="h-3 w-3 text-accent" /> : <ChevronRight className="h-3 w-3 text-accent" />}
                  <span>total balance · reported in {dashboardReportingCurrencyCode}</span>
                </div>
                {displayedDashboardBalance ? (
                  <div className={dashboardBalanceIsLoading ? 'finance-balance-shimmer inline-block' : undefined}>
                    <MoneyStack
                      amounts={[{ currencyCode: displayedDashboardBalance.currencyCode, amountMinor: displayedDashboardBalance.amountMinor }]}
                      size="hero"
                      aligned
                    />
                  </div>
                ) : (
                  <div className="mt-2 h-9 w-72 max-w-full animate-pulse bg-[linear-gradient(90deg,rgba(0,255,140,0.06),rgba(0,255,140,0.16),rgba(0,255,140,0.06))]" />
                )}
                <div className="mt-2 text-xs text-fg-4">
                  {dashboardFx.status === 'ready' && dashboardFx.date ? `fx ${dashboardFx.date}` : null}
                  {dashboardFx.status === 'loading' ? 'loading fx rates...' : null}
                  {dashboardFx.status === 'failed' ? 'fx unavailable · showing convertible currencies only' : null}
                  {convertedDashboardBalance?.missingCurrencies.length ? ` · missing ${convertedDashboardBalance.missingCurrencies.join(', ')}` : null}
                </div>
              </button>
              <div className="grid gap-3 lg:min-w-80 lg:text-right">
                <div className="flex flex-wrap gap-1 lg:justify-end">
                  {CURRENCIES.map((currencyCode) => (
                    <button
                      key={currencyCode}
                      type="button"
                      onClick={() => {
                        if (displayedDashboardBalance) setDashboardBalanceSnapshot(displayedDashboardBalance)
                        if (monthlyBalanceChartPoints.length > 0) {
                          setDashboardChartSnapshot({
                            currencyCode: monthlyBalanceChartCurrencyCode,
                            points: monthlyBalanceChartPoints,
                          })
                        }
                        setDashboardReportingCurrencyCode(currencyCode)
                      }}
                      className={`border px-2.5 py-1.5 text-[10px] uppercase tracking-label transition ${
                        dashboardReportingCurrencyCode === currencyCode
                          ? 'border-[rgba(0,255,140,0.45)] bg-[rgba(0,255,136,0.08)] text-accent'
                          : 'border-[rgba(0,255,140,0.14)] text-fg-4 hover:border-[rgba(0,255,140,0.28)] hover:text-fg-2'
                      }`}
                    >
                      {currencyCode}
                    </button>
                  ))}
                </div>
                <div className="grid gap-1 text-xs">
                  <span className="text-fg-3">{dashboardAccountMovements.length} counted movements</span>
                  <span className="text-fg-4">native balances</span>
                </div>
                <MoneyStack amounts={dashboardBalanceTotals.netAmounts} tone="byAmount" align="right" />
              </div>
            </div>
            {dashboardBalanceExpanded ? (
              <div className="border-t border-[rgba(0,255,140,0.1)] px-5 py-3">
                <AccountBalanceBreakdown entries={dashboardAccountBalances} />
              </div>
            ) : null}
          </section>

          <div className="mt-4 grid gap-4">
            <section className="border border-[rgba(0,255,140,0.12)] bg-pit-2">
              <div className="flex items-center justify-between border-b border-[rgba(0,255,140,0.12)] px-4 py-3 font-mono">
                <div>
                  <div className="text-[10px] uppercase tracking-label text-fg-4">balance by month</div>
                  <div className="mt-1 text-sm lowercase text-fg-1">ending balance · reported in {dashboardReportingCurrencyCode}</div>
                </div>
                <CalendarDays className="h-4 w-4 text-accent" />
              </div>
              <div className="p-4">
                {monthlyBalanceChartPoints.length === 0 ? (
                  <div className="flex min-h-56 items-center justify-center border border-dashed border-[rgba(0,255,140,0.12)] font-mono text-sm text-fg-4">
                    // no movements in this period
                  </div>
                ) : (
                  <>
                    <div className="h-64">
                      <MonthlyBalanceAreaChart points={monthlyBalanceChartPoints} currencyCode={monthlyBalanceChartCurrencyCode} />
                    </div>
                    <div className="mt-3 flex justify-between gap-3 overflow-hidden font-mono text-[10px] uppercase tracking-label text-fg-4">
                      {monthlyBalanceChartPoints.map((point) => (
                        <span key={point.id} className="truncate">{point.shortLabel}</span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </section>

            <section className="border border-[rgba(0,255,140,0.12)] bg-pit-2">
              <div className="flex items-center justify-between border-b border-[rgba(0,255,140,0.12)] px-4 py-3 font-mono">
                <div>
                  <div className="text-[10px] uppercase tracking-label text-fg-4">where money goes</div>
                  <div className="mt-1 text-sm lowercase text-fg-1">spend by category</div>
                </div>
                <ChartPie className="h-4 w-4 text-accent" />
              </div>
              <div className="grid gap-6 p-4 lg:grid-cols-[320px_1fr]">
                {categoryBreakdown.length === 0 ? (
                  <div className="flex min-h-52 items-center justify-center border border-dashed border-[rgba(0,255,140,0.12)] font-mono text-sm text-fg-4 lg:col-span-2">
                    // no spend to chart
                  </div>
                ) : (
                  categoryBreakdown.map((group) => (
                    <div key={group.currencyCode} className="grid gap-6 border-b border-[rgba(0,255,140,0.08)] pb-4 last:border-b-0 last:pb-0 lg:col-span-2 lg:grid-cols-[320px_1fr]">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <CategoryPieChart slices={group.entries} />
                        <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">{group.currencyCode}</div>
                      </div>
                      <div className="grid content-center gap-2">
                        {group.entries.map((entry) => (
                          <div key={entry.id} className="grid grid-cols-[12px_1fr_auto_auto] items-center gap-2 font-mono text-xs">
                            <span className="h-3 w-3" style={{ backgroundColor: entry.color }} />
                            <span className="truncate text-fg-2">{entry.name}</span>
                            <span className="text-fg-4">{entry.percent.toFixed(1)}%</span>
                            <span className="text-fail">{formatMoney(-entry.amountMinor, entry.currencyCode)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      ) : tab === 'movements' ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3 md:px-8 md:py-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="[&>div>div>button]:h-8 [&>div>div>button]:px-3">
              <FilterButton
                activeFilters={activeFilters}
                filterConfigs={filterConfigs}
                onFilterChange={setFilterField}
                onClearAll={clearAllFilters}
              />
            </div>
            <div className="ml-auto flex w-full min-w-[260px] flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:gap-3">
              <IconTooltip label="+ Add movement">
                <button
                  type="button"
                  disabled={scopedAccounts.length === 0}
                  onClick={() => openMovementModal()}
                  className="flex h-8 w-8 items-center justify-center border border-[rgba(0,255,140,0.15)] bg-pit-3 text-fg-3 transition hover:border-[rgba(0,255,140,0.3)] hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
                  aria-label="Add movement"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </IconTooltip>
              <div className="group relative">
                <button
                  type="button"
                  onClick={() => setCategoryModalOpen(true)}
                  className="flex h-8 w-8 items-center justify-center border border-[rgba(0,255,140,0.15)] bg-pit-3 text-fg-3 transition hover:border-[rgba(0,255,140,0.3)] hover:text-accent"
                  aria-label="Create category"
                >
                  <Tag className="h-3.5 w-3.5" />
                </button>
                <div className="pointer-events-none absolute left-0 top-[calc(100%+6px)] z-30 whitespace-nowrap border border-[rgba(0,255,140,0.2)] bg-pit px-2 py-1 font-mono text-[10px] uppercase tracking-label text-fg-2 opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition group-hover:opacity-100">
                  + Create category
                </div>
              </div>
              <div className="relative min-w-[180px] flex-1 sm:w-[360px] sm:flex-none lg:w-[520px]">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-4" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="$ search movements..."
                  className="h-8 w-full border border-[rgba(0,255,140,0.15)] bg-bg-2 pl-9 pr-3 font-mono text-xs text-fg-1 outline-none placeholder:text-fg-4 focus:border-accent focus:shadow-glow-xs"
                />
              </div>
              <button
                type="button"
                disabled={importPhase === 'processing' || scopedAccounts.length === 0}
                onClick={openImportUpload}
                className="flex h-8 items-center gap-2 border border-[rgba(0,255,140,0.24)] bg-[rgba(0,255,136,0.06)] px-3 font-mono text-[10px] uppercase tracking-label text-accent transition hover:border-[rgba(0,255,140,0.45)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <FileUp className="h-3.5 w-3.5" />
                import
              </button>
            </div>
          </div>

          {pendingImportGroup ? (
            <button
              type="button"
              onClick={() => openImportReview(pendingImportGroup.id)}
              className="mb-3 flex w-full items-center justify-between gap-3 border border-[rgba(0,255,140,0.16)] bg-pit-2 px-3 py-2 text-left font-mono text-xs transition hover:border-[rgba(0,255,140,0.28)] hover:bg-[rgba(0,255,136,0.04)]"
            >
              <span className="min-w-0 truncate text-fg-3">
                // import draft · {pendingImportGroups.length > 1 ? `${pendingImportGroups.length} batches · ` : ''}{pendingImportGroup.fileLabel} · {pendingImportGroup.counts.ready} ready · {pendingImportGroup.counts.needsReview} need review
              </span>
              <span className="shrink-0 text-accent">review import</span>
            </button>
          ) : null}

          <div className="mb-3 grid gap-2 border border-[rgba(0,255,140,0.12)] bg-pit-2 px-3 py-2 font-mono text-xs sm:grid-cols-4">
            <FinanceMetric label="income" value={<MoneyStack amounts={visibleTotals.positiveAmounts} tone="ok" />} tone="ok" />
            <FinanceMetric label="outflow" value={<MoneyStack amounts={visibleTotals.negativeAmounts} tone="fail" />} tone="fail" />
            <FinanceMetric label="net" value={<MoneyStack amounts={visibleTotals.netAmounts} tone="byAmount" />} />
            <FinanceMetric label="visible" value={`${visibleMovements.length} movements`} />
          </div>

          <div className="grid min-h-0 flex-1 gap-2 overflow-auto md:hidden">
            {visibleMovements.map((movement) => {
              const account = accounts.find((entry) => entry.id === movement.accountId)
              const category = financeCategories.find((entry) => entry.id === movement.categoryId)
              return (
                <article key={movement.id} className="border border-[rgba(0,255,140,0.12)] bg-pit-2 px-3 py-3 font-mono text-xs">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <IconTooltip label={movement.transferId || movement.type === 'transfer' ? 'transfer linked' : 'link transfer'}>
                          <button
                            type="button"
                            onClick={() => setTransferModalMovementId(movement.id)}
                            className={`flex h-7 w-7 shrink-0 items-center justify-center border transition ${movement.transferId || movement.type === 'transfer' ? 'border-[rgba(0,255,140,0.28)] bg-[rgba(0,255,136,0.08)] text-accent' : 'border-[rgba(0,255,140,0.1)] bg-transparent text-fg-4 hover:border-[rgba(0,255,140,0.18)] hover:bg-[rgba(0,255,136,0.04)] hover:text-fg-1'}`}
                            aria-label="Link transfer"
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                          </button>
                        </IconTooltip>
                        <EditableMovementLabel
                          movement={movement}
                          editingValue={editingMovementLabel?.id === movement.id ? editingMovementLabel.value : null}
                          className="text-sm text-fg-1"
                          onStart={() => startEditingMovementLabel(movement)}
                          onChange={(value) => setEditingMovementLabel({ id: movement.id, value })}
                          onSave={() => void saveEditingMovementLabel(movement)}
                          onCancel={cancelEditingMovementLabel}
                        />
                      </div>
                      {movement.merchantName ? (
                        <div className="mt-1 truncate pl-9 text-[10px] text-fg-4" title={movement.description}>
                          {movement.description}
                        </div>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`whitespace-nowrap text-sm ${movement.amountMinor < 0 ? 'text-fail' : 'text-ok'}`}>
                        {formatMoney(movement.amountMinor, movement.currencyCode)}
                      </div>
                      <PachSelect
                        value={movement.currencyCode}
                        onChange={(next) => void updateMovementCurrency(movement.id, next)}
                        options={currencyOptions}
                        display={movement.currencyCode}
                        align="right"
                        popupWidth="120px"
                        triggerClassName="ml-auto mt-1 flex h-6 w-16 items-center justify-end border border-transparent bg-transparent px-1 text-right font-mono text-[10px] uppercase tracking-label text-fg-4 outline-none transition hover:border-[rgba(0,255,140,0.18)] hover:bg-[rgba(0,255,136,0.04)] hover:text-fg-1 focus-visible:border-accent"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-[1fr_auto] gap-2 border-t border-[rgba(0,255,140,0.08)] pt-2">
                    <div className="min-w-0">
                      <EditableMovementDate
                        movement={movement}
                        editingValue={editingMovementDate?.id === movement.id ? editingMovementDate.value : null}
                        compact
                        onStart={() => startEditingMovementDate(movement)}
                        onChange={(value) => setEditingMovementDate({ id: movement.id, value })}
                        onSave={() => void saveEditingMovementDate(movement)}
                        onCancel={cancelEditingMovementDate}
                      />
                      <div className="mt-1">
                        <PachSelect
                          value={movement.accountId}
                          onChange={(next) => void updateMovementAccount(movement.id, next)}
                          options={importAccountOptions}
                          display={account?.name ?? 'unknown'}
                          popupWidth="260px"
                          triggerClassName="flex h-8 w-full min-w-0 items-center justify-between border border-[rgba(0,255,140,0.12)] bg-pit px-2 text-left font-mono text-xs text-fg-2 outline-none transition hover:border-[rgba(0,255,140,0.22)] hover:bg-[rgba(0,255,136,0.04)] hover:text-fg-1 focus-visible:border-accent"
                        />
                      </div>
                    </div>
                    <div className="flex items-start gap-1">
                      <PachSelect
                        variant="button"
                        value={movement.status}
                        onChange={(next) => void updateMovementStatus(movement.id, next)}
                        options={movementStatusOptions}
                        trigger={
                          <span className={`inline-flex h-8 w-8 items-center justify-center border transition ${movement.status === 'pending_review' ? 'border-[rgba(255,184,77,0.28)] bg-[rgba(255,184,77,0.06)] text-amber' : movement.status === 'ignored' ? 'border-[rgba(133,167,145,0.16)] bg-transparent text-fg-4' : 'border-[rgba(0,255,140,0.22)] bg-[rgba(0,255,136,0.06)] text-accent'}`}>
                            <StatusIcon status={movement.status} />
                          </span>
                        }
                        triggerTitle={statusLabel(movement.status)}
                        align="right"
                        popupWidth="170px"
                        triggerClassName="flex h-8 w-8 items-center justify-center"
                      />
                      <IconTooltip label="Delete movement" align="right">
                        <button
                          type="button"
                          onClick={() => setDeleteMovementId(movement.id)}
                          className="flex h-8 w-8 items-center justify-center border border-[rgba(0,255,140,0.1)] bg-transparent text-fg-4 transition hover:border-[rgba(255,83,124,0.28)] hover:bg-[rgba(255,83,124,0.06)] hover:text-fail"
                          aria-label="Delete movement"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </IconTooltip>
                    </div>
                  </div>

                  <div className="mt-2">
                    <PachSelect
                      value={movement.categoryId ?? UNCATEGORIZED_VALUE}
                      onChange={(next) => void updateCategory(movement.id, next === UNCATEGORIZED_VALUE ? '' : next)}
                      options={categoryOptions}
                      display={category?.name ?? 'uncategorized'}
                      popupWidth="260px"
                      triggerClassName="flex h-8 w-full min-w-0 items-center justify-between border border-[rgba(0,255,140,0.12)] bg-pit px-2 text-left font-mono text-xs text-fg-2 outline-none transition hover:border-[rgba(0,255,140,0.22)] hover:bg-[rgba(0,255,136,0.04)] hover:text-fg-1 focus-visible:border-accent"
                    />
                  </div>
                </article>
              )
            })}
            {visibleMovements.length === 0 ? (
              <div className="border border-[rgba(0,255,140,0.12)] bg-pit-2 px-3 py-12 text-center font-mono text-sm text-fg-4">
                // no movements yet
              </div>
            ) : null}
          </div>

          <div className="hidden min-h-0 flex-1 overflow-auto border border-[rgba(0,255,140,0.12)] md:block">
            <table className="w-full table-fixed border-collapse font-mono text-xs">
              <colgroup>
                <col className="w-[11%]" />
                <col className="w-[31%]" />
                <col className="w-[18%]" />
                <col className="w-[18%]" />
                <col className="w-[15%]" />
                <col className="w-[7%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-[#020604] text-[10px] uppercase tracking-label text-fg-4 shadow-[0_1px_0_rgba(0,255,140,0.12)]">
                <tr>
                  <MovementDateSortHeader direction={movementSortDirection} onSort={toggleMovementDateSort} />
                  <MovementHeader label="movement" />
                  <MovementHeader label="account" />
                  <MovementHeader label="category" />
                  <MovementHeader label="amount" align="right" />
                  <MovementHeader label="state" align="right" />
                </tr>
              </thead>
              <tbody>
                {visibleMovements.map((movement) => {
                  const account = accounts.find((entry) => entry.id === movement.accountId)
                  const category = financeCategories.find((entry) => entry.id === movement.categoryId)
                  return (
                    <tr key={movement.id} className="border-b border-[rgba(0,255,140,0.08)] text-fg-2 hover:bg-[rgba(0,255,136,0.04)]">
                      <td className="whitespace-nowrap px-3 py-2 text-fg-3">
                        <EditableMovementDate
                          movement={movement}
                          editingValue={editingMovementDate?.id === movement.id ? editingMovementDate.value : null}
                          onStart={() => startEditingMovementDate(movement)}
                          onChange={(value) => setEditingMovementDate({ id: movement.id, value })}
                          onSave={() => void saveEditingMovementDate(movement)}
                          onCancel={cancelEditingMovementDate}
                        />
                      </td>
                      <td className="min-w-0 px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <IconTooltip label={movement.transferId || movement.type === 'transfer' ? 'transfer linked' : 'link transfer'}>
                            <button
                              type="button"
                              onClick={() => setTransferModalMovementId(movement.id)}
                              className={`flex h-6 w-6 shrink-0 items-center justify-center border transition ${movement.transferId || movement.type === 'transfer' ? 'border-[rgba(0,255,140,0.28)] bg-[rgba(0,255,136,0.08)] text-accent' : 'border-transparent bg-transparent text-fg-4 hover:border-[rgba(0,255,140,0.18)] hover:bg-[rgba(0,255,136,0.04)] hover:text-fg-1'}`}
                              aria-label="Link transfer"
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </button>
                          </IconTooltip>
                          <EditableMovementLabel
                            movement={movement}
                            editingValue={editingMovementLabel?.id === movement.id ? editingMovementLabel.value : null}
                            className="text-fg-1"
                            onStart={() => startEditingMovementLabel(movement)}
                            onChange={(value) => setEditingMovementLabel({ id: movement.id, value })}
                            onSave={() => void saveEditingMovementLabel(movement)}
                            onCancel={cancelEditingMovementLabel}
                          />
                        </div>
                        {movement.merchantName ? (
                          <div className="mt-0.5 truncate pl-8 text-[10px] text-fg-4" title={movement.description}>
                            {movement.description}
                          </div>
                        ) : null}
                      </td>
                      <td className="min-w-0 px-3 py-2 text-fg-3">
                        <PachSelect
                          value={movement.accountId}
                          onChange={(next) => void updateMovementAccount(movement.id, next)}
                          options={importAccountOptions}
                          display={account?.name ?? 'unknown'}
                          popupWidth="260px"
                          triggerClassName="flex h-7 w-full min-w-0 items-center justify-between border border-transparent bg-transparent px-2 text-left font-mono text-xs text-fg-2 outline-none transition hover:border-[rgba(0,255,140,0.18)] hover:bg-[rgba(0,255,136,0.04)] hover:text-fg-1 focus-visible:border-accent"
                        />
                      </td>
                      <td className="min-w-0 px-3 py-2">
                        <PachSelect
                          value={movement.categoryId ?? UNCATEGORIZED_VALUE}
                          onChange={(next) => void updateCategory(movement.id, next === UNCATEGORIZED_VALUE ? '' : next)}
                          options={categoryOptions}
                          display={category?.name ?? 'uncategorized'}
                          popupWidth="260px"
                          triggerClassName="flex h-7 w-full min-w-0 items-center justify-between border border-transparent bg-transparent px-2 text-left font-mono text-xs text-fg-2 outline-none transition hover:border-[rgba(0,255,140,0.18)] hover:bg-[rgba(0,255,136,0.04)] hover:text-fg-1 focus-visible:border-accent"
                        />
                        {category ? null : <span className="text-[10px] text-amber">needs category</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <div className={movement.amountMinor < 0 ? 'text-fail' : 'text-ok'}>
                          {formatMoney(movement.amountMinor, movement.currencyCode)}
                        </div>
                        <PachSelect
                          value={movement.currencyCode}
                          onChange={(next) => void updateMovementCurrency(movement.id, next)}
                          options={currencyOptions}
                          display={movement.currencyCode}
                          align="right"
                          popupWidth="120px"
                          triggerClassName="ml-auto mt-0.5 flex h-5 w-14 items-center justify-end border border-transparent bg-transparent px-1 text-right font-mono text-[9px] uppercase tracking-label text-fg-4 outline-none transition hover:border-[rgba(0,255,140,0.18)] hover:bg-[rgba(0,255,136,0.04)] hover:text-fg-1 focus-visible:border-accent"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <PachSelect
                            variant="button"
                            value={movement.status}
                            onChange={(next) => void updateMovementStatus(movement.id, next)}
                            options={movementStatusOptions}
                            trigger={
                              <span className={`inline-flex h-7 w-7 items-center justify-center border transition ${movement.status === 'pending_review' ? 'border-[rgba(255,184,77,0.28)] bg-[rgba(255,184,77,0.06)] text-amber' : movement.status === 'ignored' ? 'border-[rgba(133,167,145,0.16)] bg-transparent text-fg-4' : 'border-[rgba(0,255,140,0.22)] bg-[rgba(0,255,136,0.06)] text-accent'}`}>
                                <StatusIcon status={movement.status} />
                              </span>
                            }
                            triggerTitle={statusLabel(movement.status)}
                            align="right"
                            popupWidth="170px"
                            triggerClassName="flex h-7 w-7 items-center justify-center"
                          />
                          <IconTooltip label="Delete movement" align="right">
                            <button
                              type="button"
                              onClick={() => setDeleteMovementId(movement.id)}
                              className="flex h-7 w-7 items-center justify-center border border-transparent bg-transparent text-fg-4 transition hover:border-[rgba(255,83,124,0.28)] hover:bg-[rgba(255,83,124,0.06)] hover:text-fail"
                              aria-label="Delete movement"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </IconTooltip>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {visibleMovements.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-12 text-center font-mono text-sm text-fg-4">
                      // no movements yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-3 py-3 md:px-8 md:py-4">
          <div className="mb-3 flex items-center justify-end">
            <button
              type="button"
              onClick={() => openAccountModal()}
              className="flex h-8 items-center gap-2 border border-[rgba(0,255,140,0.24)] bg-[rgba(0,255,136,0.06)] px-3 font-mono text-[10px] uppercase tracking-label text-accent transition hover:border-[rgba(0,255,140,0.45)]"
            >
              <Plus className="h-3.5 w-3.5" />
              add account
            </button>
          </div>
          {scopedAccounts.length === 0 ? (
            <FinanceEmptyState
              title="start with an account or card"
              body="add the bank account, credit card, cash box, or loan where movements will land. imports become much easier once each source has a home."
              actionLabel="add account"
              onAction={() => openAccountModal()}
            />
          ) : (
            <>
            <div className="grid gap-2 md:hidden">
              {scopedAccounts.map((account) => {
                const holder = account.holderUserId ? holderUserMap.get(account.holderUserId) : undefined
                const stats = accountStats.get(account.id)
                return (
                  <article key={account.id} className="border border-[rgba(0,255,140,0.12)] bg-pit-2 px-3 py-3 font-mono text-xs">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-fg-1" title={account.name}>{account.name}</div>
                        <div className="mt-1 truncate text-[10px] uppercase tracking-label text-fg-4">
                          {account.institutionName || 'no institution'} · {typeLabel(account.type)}
                        </div>
                      </div>
                      <div className="shrink-0 text-accent">{account.currencyCode}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <FinanceMetric
                        label="balance"
                        value={formatMoney(stats?.calculatedBalanceMinor ?? 0, account.currencyCode)}
                      />
                      <FinanceMetric label="movements" value={`${stats?.movementCount ?? 0}`} />
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-[rgba(0,255,140,0.08)] pt-2">
                      <span className="truncate text-fg-4">{holder ? displayUser(holder) : 'unassigned'}</span>
                      <button
                        type="button"
                        onClick={() => openAccountModal(account)}
                        className="shrink-0 text-fg-3 transition hover:text-fg-1"
                      >
                        edit
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>

            <div className="hidden min-h-0 overflow-auto border border-[rgba(0,255,140,0.12)] md:block">
              <table className="w-full border-collapse font-mono text-xs">
                <thead className="sticky top-0 bg-pit text-[10px] uppercase tracking-label text-fg-4">
                  <tr>
                    <th className="border-b border-[rgba(0,255,140,0.12)] px-3 py-2 text-left">account/card</th>
                    <th className="border-b border-[rgba(0,255,140,0.12)] px-3 py-2 text-left">institution</th>
                    <th className="border-b border-[rgba(0,255,140,0.12)] px-3 py-2 text-left">type</th>
                    <th className="border-b border-[rgba(0,255,140,0.12)] px-3 py-2 text-left">holder</th>
                    <th className="border-b border-[rgba(0,255,140,0.12)] px-3 py-2 text-right">currency</th>
                    <th className="border-b border-[rgba(0,255,140,0.12)] px-3 py-2 text-right">movements</th>
                    <th className="border-b border-[rgba(0,255,140,0.12)] px-3 py-2 text-right">balance</th>
                    <th className="border-b border-[rgba(0,255,140,0.12)] px-3 py-2 text-right">actions</th>
                  </tr>
                </thead>
                <tbody>
                  {scopedAccounts.map((account) => {
                    const holder = account.holderUserId ? holderUserMap.get(account.holderUserId) : undefined
                    const stats = accountStats.get(account.id)
                    return (
                      <tr key={account.id} className="border-b border-[rgba(0,255,140,0.08)] text-fg-2 hover:bg-[rgba(0,255,136,0.04)]">
                        <td className="px-3 py-2">
                          <div className="text-fg-1">{account.name}</div>
                          <div className="mt-0.5 text-[10px] uppercase tracking-label text-fg-4">{account.status}</div>
                        </td>
                        <td className="px-3 py-2 text-fg-3">{account.institutionName || 'no institution'}</td>
                        <td className="px-3 py-2 text-fg-3">{typeLabel(account.type)}</td>
                        <td className="px-3 py-2 text-fg-3">{holder ? displayUser(holder) : 'unassigned'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-accent">{account.currencyCode}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-fg-2">{stats?.movementCount ?? 0}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-fg-1">
                          {formatMoney(stats?.calculatedBalanceMinor ?? 0, account.currencyCode)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => openAccountModal(account)}
                              className="text-fg-3 transition hover:text-fg-1"
                            >
                              edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      )}
      </main>

      {importModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.7)] px-4 py-4 backdrop-blur-sm sm:py-6"
          onClick={() => setImportModalOpen(false)}
        >
          <div
            className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden border border-[rgba(0,255,140,0.2)] bg-pit-2 shadow-[0_30px_80px_rgba(0,0,0,0.5)] sm:max-h-[calc(100vh-3rem)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[rgba(0,255,140,0.12)] px-5 py-3">
              <div className="flex min-w-0 items-center gap-2 font-mono text-xs">
                <span className="inline-flex items-center gap-1.5 border border-[rgba(0,255,140,0.25)] bg-[rgba(0,255,136,0.05)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-accent">
                  import
                </span>
                <span className="text-fg-4">›</span>
                {importModalStep === 'review' ? (
                  <>
                    <span className="text-accent">review</span>
                    <span className="min-w-0 truncate text-fg-3">{selectedReviewGroup?.fileLabel}</span>
                  </>
                ) : (
                  <div className="w-48">
                    <PachSelect
                      value={importAccountId}
                      onChange={setImportAccountId}
                      options={importPhase === 'processing' ? [] : importAccountOptions}
                      display={importAccountLabel}
                      triggerClassName={`flex h-7 w-full items-center justify-between border border-transparent bg-transparent px-1 text-left font-mono text-xs lowercase text-fg-2 outline-none transition hover:border-[rgba(0,255,140,0.18)] hover:text-fg-1 ${importPhase === 'processing' ? 'cursor-not-allowed opacity-50' : ''}`}
                      popupWidth="240px"
                    />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="font-mono text-xs uppercase tracking-label text-fg-4 transition hover:text-fg-1"
                title="close"
              >
                [esc]
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-4 overflow-auto p-5">
              {importModalStep === 'upload' ? (
                <>
                  <button
                    type="button"
                    disabled={importPhase === 'processing' || scopedAccounts.length === 0}
                    onClick={() => fileInputRef.current?.click()}
                    onDragEnter={(event) => {
                      event.preventDefault()
                      setImportDragActive(true)
                    }}
                    onDragOver={(event) => {
                      event.preventDefault()
                      setImportDragActive(true)
                    }}
                    onDragLeave={() => setImportDragActive(false)}
                    onDrop={(event) => {
                      event.preventDefault()
                      setImportDragActive(false)
                      const files = Array.from(event.dataTransfer.files ?? [])
                      if (files.length > 0) stageImportFiles(files)
                    }}
                    className={`flex min-h-56 flex-col items-center justify-center border border-dashed px-6 py-10 text-center transition ${
                      importDragActive
                        ? 'border-accent bg-[rgba(0,255,136,0.08)] shadow-glow-xs'
                        : 'border-[rgba(0,255,140,0.22)] bg-pit hover:border-[rgba(0,255,140,0.4)] hover:bg-[rgba(0,255,136,0.04)]'
                    } disabled:cursor-not-allowed disabled:opacity-45`}
                  >
                    <UploadCloud className={`h-7 w-7 ${importDragActive ? 'text-accent' : 'text-fg-3'}`} />
                    <div className="mt-3 font-mono text-sm lowercase text-fg-1">
                      {importDragActive ? 'drop to stage import' : 'drop statement, screenshot, or csv'}
                    </div>
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-label text-fg-4">
                      pdf · csv · txt · image · max {formatBytes(MAX_IMPORT_TOTAL_BYTES)} total
                    </div>
                  </button>

                  {(importFiles.length > 0 || importMessage) && (
                    <div>
                      <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-label text-fg-4">
                        <span>{importPhase === 'processing' ? 'processing import' : importFiles.length > 0 ? 'staged files' : 'latest import'}</span>
                        {importFiles.length > 0 && importPhase !== 'processing' ? (
                          <button
                            type="button"
                            onClick={resetImportSelection}
                            className="inline-flex items-center gap-1 text-fg-3 transition hover:text-fg-1"
                          >
                            <X className="h-3 w-3" />
                            clear
                          </button>
                        ) : null}
                      </div>

                      <div className="max-h-[34vh] overflow-auto border-y border-[rgba(0,255,140,0.12)] font-mono text-xs">
                        {importFiles.length > 0 ? importFiles.map((file) => (
                          <div key={`${file.name}:${file.size}:${file.lastModified}`} className="grid grid-cols-[20px_1fr_150px_32px] items-center gap-3 border-b border-[rgba(0,255,140,0.08)] py-2.5 last:border-b-0">
                            <FileText className="h-3.5 w-3.5 text-fg-4" />
                            <div className="min-w-0">
                              <div className="truncate text-fg-1" title={file.name}>
                                {file.name}
                              </div>
                              <div className="mt-0.5 text-[10px] uppercase tracking-label text-fg-4">
                                {formatBytes(file.size)}
                              </div>
                            </div>
                            <ImportStatus phase={importPhase} />
                            <span aria-hidden />
                          </div>
                        )) : (
                          <div className="grid grid-cols-[20px_1fr_150px_32px] items-center gap-3 py-2.5">
                            <FileText className="h-3.5 w-3.5 text-fg-4" />
                            <div className="min-w-0 text-fg-4">no file selected</div>
                            <ImportStatus phase={importPhase} />
                            <span aria-hidden />
                          </div>
                        )}
                      </div>

                      {importMessage ? (
                        <div className={`mt-2 flex items-start gap-2 font-mono text-xs ${importPhase === 'failed' ? 'text-amber' : 'text-fg-3'}`}>
                          {importPhase === 'failed' ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : null}
                          <span>{importMessage}</span>
                        </div>
                      ) : null}
                    </div>
                  )}
                </>
              ) : null}

              {selectedReviewGroup ? (
                <section className="border border-[rgba(0,255,140,0.12)] bg-pit font-mono">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,255,140,0.12)] px-3 py-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-label text-fg-4">step 2 · review draft</div>
                      <div className="mt-0.5 max-w-[520px] truncate text-xs text-fg-2" title={selectedReviewGroup.fileLabel}>
                        {selectedReviewGroup.fileLabel}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-label">
                      <span className="text-accent">{reviewCounts.ready} ready</span>
                      <span className="text-amber">{reviewCounts.needsReview} review</span>
                      <span className="text-fg-4">{reviewCounts.duplicate} duplicate</span>
                      <span className="text-fg-4">{reviewCounts.ignored} ignored</span>
                    </div>
                  </div>

                  <div className="max-h-[62vh] overflow-auto">
                    <table className="w-full table-fixed border-collapse text-xs">
                      <colgroup>
                        <col className="w-[12%]" />
                        <col className="w-[27%]" />
                        <col className="w-[17%]" />
                        <col className="w-[18%]" />
                        <col className="w-[13%]" />
                        <col className="w-[11%]" />
                        <col className="w-[2%]" />
                      </colgroup>
                      <thead className="sticky top-0 bg-pit text-[10px] uppercase tracking-label text-fg-4">
                        <tr>
                          <MovementDateSortHeader direction={reviewSortDirection} onSort={toggleReviewDateSort} />
                          <th className="border-b border-[rgba(0,255,140,0.12)] px-3 py-2 text-left">movement</th>
                          <th className="border-b border-[rgba(0,255,140,0.12)] px-3 py-2 text-left">account</th>
                          <th className="border-b border-[rgba(0,255,140,0.12)] px-3 py-2 text-left">category</th>
                          <th className="border-b border-[rgba(0,255,140,0.12)] px-3 py-2 text-right">amount</th>
                          <th className="border-b border-[rgba(0,255,140,0.12)] px-3 py-2 text-right">status</th>
                          <th className="border-b border-[rgba(0,255,140,0.12)] px-2 py-2 text-right"> </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleReviewItems.map((item) => {
                          const locked = item.status === 'applied'
                          const sourceImport = selectedReviewImportById.get(item.importId)
                          const account = scopedAccounts.find((entry) => entry.id === item.accountId)
                          const category = scopedCategories.find((entry) => entry.id === item.suggestedCategoryId)
                          return (
                            <tr key={item.id} className="border-b border-[rgba(0,255,140,0.08)] text-fg-2">
                              <td className="whitespace-nowrap px-3 py-2 text-fg-3">
                                <div>{formatZeroDate(item.transactionDate)}</div>
                                {isMeaningfulTransactionTime(item.transactionTime) ? (
                                  <div className="mt-0.5 text-[10px] text-fg-4">{formatTransactionTime(item.transactionTime)}</div>
                                ) : null}
                              </td>
                              <td className="min-w-0 px-3 py-2">
                                <div className="truncate text-fg-1" title={item.merchantName || item.description}>
                                  {item.merchantName || item.description}
                                </div>
                                {item.merchantName ? (
                                  <div className="mt-0.5 truncate text-[10px] text-fg-4" title={item.description}>
                                    {item.description}
                                  </div>
                                ) : null}
                                {selectedReviewImports.length > 1 && sourceImport ? (
                                  <div className="mt-0.5 truncate text-[10px] uppercase tracking-label text-fg-4" title={sourceImport.fileName}>
                                    {sourceImport.fileName}
                                  </div>
                                ) : null}
                              </td>
                              <td className="min-w-0 px-3 py-2">
                                <PachSelect
                                  value={item.accountId}
                                  onChange={(next) => void updateImportItemAccount(item, next)}
                                  options={locked ? [] : importAccountOptions}
                                  display={account?.name ?? 'unknown'}
                                  popupWidth="240px"
                                  triggerClassName={`flex h-7 w-full min-w-0 items-center justify-between border border-transparent bg-transparent px-2 text-left font-mono text-xs text-fg-2 outline-none transition hover:border-[rgba(0,255,140,0.18)] hover:bg-[rgba(0,255,136,0.04)] hover:text-fg-1 focus-visible:border-accent ${locked ? 'pointer-events-none opacity-55' : ''}`}
                                />
                              </td>
                              <td className="min-w-0 px-3 py-2">
                                <PachSelect
                                  value={item.suggestedCategoryId ?? UNCATEGORIZED_VALUE}
                                  onChange={(next) => void updateImportItemCategory(item, next)}
                                  options={locked ? [] : categoryOptions}
                                  display={category?.name ?? 'uncategorized'}
                                  popupWidth="240px"
                                  triggerClassName={`flex h-7 w-full min-w-0 items-center justify-between border border-transparent bg-transparent px-2 text-left font-mono text-xs text-fg-2 outline-none transition hover:border-[rgba(0,255,140,0.18)] hover:bg-[rgba(0,255,136,0.04)] hover:text-fg-1 focus-visible:border-accent ${locked ? 'pointer-events-none opacity-55' : ''}`}
                                />
                              </td>
                              <td className={`whitespace-nowrap px-3 py-2 text-right ${item.amountMinor < 0 ? 'text-fail' : 'text-ok'}`}>
                                {formatMoney(item.amountMinor, item.currencyCode)}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {locked ? (
                                  <span className="text-[10px] uppercase tracking-label text-fg-4">
                                    {item.status}
                                  </span>
                                ) : (
                                  <PachSelect
                                    value={item.status === 'needs_review' ? 'needs_review' : item.status === 'ignored' ? 'ignored' : item.status === 'duplicate' ? 'duplicate' : 'parsed'}
                                    onChange={(next) => void updateImportItemStatus(item, next)}
                                    options={importItemStatusOptions}
                                    display={importItemStatusLabel(item.status)}
                                    popupWidth="160px"
                                    align="right"
                                    triggerClassName="ml-auto flex h-7 w-full min-w-0 items-center justify-between border border-transparent bg-transparent px-2 text-left font-mono text-xs text-fg-2 outline-none transition hover:border-[rgba(0,255,140,0.18)] hover:bg-[rgba(0,255,136,0.04)] hover:text-fg-1 focus-visible:border-accent"
                                  />
                                )}
                              </td>
                              <td className="px-2 py-2 text-right">
                                {locked ? (
                                  <span aria-hidden className="block h-7 w-7" />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => void removeImportItem(item)}
                                    className="group relative inline-flex h-7 w-7 items-center justify-center border border-transparent text-fg-4 transition hover:border-[rgba(255,83,124,0.35)] hover:bg-[rgba(255,83,124,0.08)] hover:text-fail"
                                    aria-label="Remove from import"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    <span className="pointer-events-none absolute bottom-full right-0 mb-1 hidden whitespace-nowrap border border-[rgba(255,83,124,0.25)] bg-pit-2 px-2 py-1 font-mono text-[10px] uppercase tracking-label text-fail shadow-[0_12px_30px_rgba(0,0,0,0.45)] group-hover:block">
                                      remove
                                    </span>
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                        {visibleReviewItems.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-3 py-10 text-center text-sm text-fg-4">
                              // no draft movements
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center justify-between border-t border-[rgba(0,255,140,0.12)] px-5 py-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setImportModalOpen(false)}
                  disabled={importPhase === 'processing'}
                  className="px-2 py-1.5 font-mono text-xs uppercase tracking-label text-fg-3 transition hover:text-fg-1 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  [cancel]
                </button>
                {selectedReviewGroup ? (
                  <button
                    type="button"
                    onClick={() => void discardReviewedImport()}
                    disabled={importPhase === 'processing'}
                    className="px-2 py-1.5 font-mono text-xs uppercase tracking-label text-fail transition hover:text-fail disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    discard review
                  </button>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {selectedReviewGroup ? (
                  <button
                    type="button"
                    disabled={!canApplyReview || importPhase === 'processing'}
                    onClick={() => void applyReviewedImport()}
                    className="inline-flex items-center gap-2 border border-[rgba(0,255,140,0.3)] bg-[rgba(0,255,136,0.08)] px-3 py-1.5 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-[rgba(0,255,136,0.16)] hover:shadow-glow-xs disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[rgba(0,255,136,0.08)] disabled:hover:shadow-none"
                  >
                    {importPhase === 'processing' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
                    finish review
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={importFiles.length === 0 || !importAccountId || importPhase === 'processing' || scopedAccounts.length === 0}
                  onClick={() => void confirmImport()}
                  className={`inline-flex items-center gap-2 border border-[rgba(0,255,140,0.3)] bg-[rgba(0,255,136,0.08)] px-3 py-1.5 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-[rgba(0,255,136,0.16)] hover:shadow-glow-xs disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[rgba(0,255,136,0.08)] disabled:hover:shadow-none ${importModalStep === 'review' ? 'hidden' : ''}`}
                >
                  {importPhase === 'processing' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
                  {importPhase === 'processing' ? 'processing' : 'process import'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedDeleteMovement && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(0,0,0,0.72)] px-4 pt-[12vh] backdrop-blur-sm"
          onClick={() => setDeleteMovementId(null)}
        >
          <div
            className="w-full max-w-lg border border-[rgba(255,83,124,0.28)] bg-pit-2 shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[rgba(255,83,124,0.16)] px-5 py-3">
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="inline-flex items-center gap-1.5 border border-[rgba(255,83,124,0.3)] bg-[rgba(255,83,124,0.07)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-fail">
                  <Trash2 className="h-3 w-3" />
                  delete
                </span>
                <span className="text-fg-4">›</span>
                <span className="text-fg-2 lowercase">movement</span>
              </div>
              <button
                type="button"
                onClick={() => setDeleteMovementId(null)}
                className="font-mono text-xs uppercase tracking-label text-fg-4 transition hover:text-fg-1"
                title="close"
              >
                [esc]
              </button>
            </div>

            <div className="grid gap-4 px-5 py-4 font-mono">
              <div>
                <div className="text-lg text-fg-1">delete this movement?</div>
                <div className="mt-2 text-xs leading-relaxed text-fg-4">
                  this removes it from account balances, dashboard totals, imports review, and category spend. categorization rules learned from it stay active, but no longer point to this movement.
                </div>
              </div>

              <section className="border border-[rgba(0,255,140,0.12)] bg-pit px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-fg-1" title={selectedDeleteMovement.merchantName || selectedDeleteMovement.description}>
                      {selectedDeleteMovement.merchantName || selectedDeleteMovement.description}
                    </div>
                    {selectedDeleteMovement.merchantName ? (
                      <div className="mt-1 truncate text-[10px] text-fg-4" title={selectedDeleteMovement.description}>
                        {selectedDeleteMovement.description}
                      </div>
                    ) : null}
                    <div className="mt-2 text-[10px] uppercase tracking-label text-fg-4">
                      {formatZeroDate(selectedDeleteMovement.transactionDate)} · {accountLabel(selectedDeleteMovement.accountId, scopedAccounts)}
                    </div>
                  </div>
                  <div className={`shrink-0 text-sm ${selectedDeleteMovement.amountMinor < 0 ? 'text-fail' : 'text-ok'}`}>
                    {formatMoney(selectedDeleteMovement.amountMinor, selectedDeleteMovement.currencyCode)}
                  </div>
                </div>
              </section>
            </div>

            <div className="flex items-center justify-between border-t border-[rgba(255,83,124,0.16)] px-5 py-3">
              <button
                type="button"
                onClick={() => setDeleteMovementId(null)}
                className="px-2 py-1.5 font-mono text-xs uppercase tracking-label text-fg-3 transition hover:text-fg-1"
              >
                [cancel]
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteMovement()}
                className="inline-flex items-center gap-2 border border-[rgba(255,83,124,0.34)] bg-[rgba(255,83,124,0.08)] px-3 py-1.5 font-mono text-xs uppercase tracking-label text-fail transition hover:bg-[rgba(255,83,124,0.14)]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                delete movement
              </button>
            </div>
          </div>
        </div>
      )}

      {transferModalMovementId && selectedTransferMovement && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(0,0,0,0.7)] px-4 pt-[8vh] backdrop-blur-sm"
          onClick={() => setTransferModalMovementId(null)}
        >
          <div
            className="w-full max-w-3xl border border-[rgba(0,255,140,0.2)] bg-pit-2 shadow-[0_30px_80px_rgba(0,0,0,0.5)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[rgba(0,255,140,0.12)] px-5 py-3">
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="inline-flex items-center gap-1.5 border border-[rgba(0,255,140,0.25)] bg-[rgba(0,255,136,0.05)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-accent">
                  transfer
                </span>
                <span className="text-fg-4">›</span>
                <span className="text-fg-2 lowercase">link movement</span>
              </div>
              <button
                type="button"
                onClick={() => setTransferModalMovementId(null)}
                className="font-mono text-xs uppercase tracking-label text-fg-4 transition hover:text-fg-1"
                title="close"
              >
                [esc]
              </button>
            </div>

            <div className="grid gap-4 px-5 py-4">
              <section className="border border-[rgba(0,255,140,0.12)] bg-pit px-3 py-3 font-mono">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm text-fg-1">{selectedTransferMovement.merchantName || selectedTransferMovement.description}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-label text-fg-4">
                      {formatZeroDate(selectedTransferMovement.transactionDate)} · {accountLabel(selectedTransferMovement.accountId, scopedAccounts)}
                    </div>
                  </div>
                  <div className={`text-sm ${selectedTransferMovement.amountMinor < 0 ? 'text-fail' : 'text-ok'}`}>
                    {formatMoney(selectedTransferMovement.amountMinor, selectedTransferMovement.currencyCode)}
                  </div>
                </div>
                {selectedTransfer ? (
                  <div className="mt-3 border-t border-[rgba(0,255,140,0.08)] pt-3 text-xs text-fg-3">
                    linked transfer · {selectedTransfer.status}
                  </div>
                ) : (
                  <div className="mt-3 border-t border-[rgba(0,255,140,0.08)] pt-3 text-xs text-fg-4">
                    transfers are excluded from income, outflow, and category spend, but still affect account balances.
                  </div>
                )}
              </section>

              <section className="border border-[rgba(0,255,140,0.12)] bg-pit">
                <div className="flex items-center justify-between border-b border-[rgba(0,255,140,0.12)] px-3 py-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
                  <span>suggested matches</span>
                  <span>{transferCandidates.length}</span>
                </div>
                <div className="max-h-[320px] overflow-auto">
                  {transferCandidates.length === 0 ? (
                    <div className="px-3 py-10 text-center font-mono text-sm text-fg-4">
                      // no likely opposite-side movements found
                    </div>
                  ) : (
                    transferCandidates.slice(0, 10).map((candidate) => (
                      <button
                        key={candidate.movement.id}
                        type="button"
                        onClick={() => void linkTransferMovement(selectedTransferMovement.id, candidate.movement.id)}
                        className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-[rgba(0,255,140,0.08)] px-3 py-3 text-left font-mono text-xs transition hover:bg-[rgba(0,255,136,0.05)]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-fg-1">{candidate.movement.merchantName || candidate.movement.description}</span>
                          <span className="mt-1 block truncate text-[10px] uppercase tracking-label text-fg-4">
                            {formatZeroDate(candidate.movement.transactionDate)} · {accountLabel(candidate.movement.accountId, scopedAccounts)} · {candidate.reasons.join(' · ')}
                          </span>
                        </span>
                        <span className={`whitespace-nowrap ${candidate.movement.amountMinor < 0 ? 'text-fail' : 'text-ok'}`}>
                          {formatMoney(candidate.movement.amountMinor, candidate.movement.currencyCode)}
                        </span>
                        <span className="whitespace-nowrap text-accent">{candidate.score}%</span>
                      </button>
                    ))
                  )}
                </div>
              </section>
            </div>

            <div className="flex items-center justify-between border-t border-[rgba(0,255,140,0.12)] px-5 py-3">
              <button
                type="button"
                onClick={() => setTransferModalMovementId(null)}
                className="px-2 py-1.5 font-mono text-xs uppercase tracking-label text-fg-3 transition hover:text-fg-1"
              >
                [cancel]
              </button>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {isTransferLikeMovement(selectedTransferMovement, scopedCategories) ? (
                  <button
                    type="button"
                    onClick={() => void unmarkTransferMovement(selectedTransferMovement.id)}
                    className="inline-flex items-center gap-2 border border-[rgba(255,95,135,0.28)] bg-[rgba(255,95,135,0.06)] px-3 py-1.5 font-mono text-xs uppercase tracking-label text-fail transition hover:bg-[rgba(255,95,135,0.12)]"
                  >
                    <X className="h-3.5 w-3.5" />
                    unmark transfer
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void markMovementAsTransfer(selectedTransferMovement.id)}
                  className="inline-flex items-center gap-2 border border-[rgba(0,255,140,0.3)] bg-[rgba(0,255,136,0.08)] px-3 py-1.5 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-[rgba(0,255,136,0.16)] hover:shadow-glow-xs"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  mark transfer only
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {movementModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(0,0,0,0.7)] px-4 pt-[10vh] backdrop-blur-sm"
          onClick={() => setMovementModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl border border-[rgba(0,255,140,0.2)] bg-pit-2 shadow-[0_30px_80px_rgba(0,0,0,0.5)]"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault()
                if (canCreateMovement) void createMovement()
              }
            }}
          >
            <div className="flex items-center justify-between border-b border-[rgba(0,255,140,0.12)] px-5 py-3">
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="inline-flex items-center gap-1.5 border border-[rgba(0,255,140,0.25)] bg-[rgba(0,255,136,0.05)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-accent">
                  finance
                </span>
                <span className="text-fg-4">›</span>
                <span className="text-fg-2 lowercase">new movement</span>
              </div>
              <button
                type="button"
                onClick={() => setMovementModalOpen(false)}
                className="font-mono text-xs uppercase tracking-label text-fg-4 transition hover:text-fg-1"
                title="close"
              >
                [esc]
              </button>
            </div>

            <div className="px-5 pt-4">
              <input
                value={movementDraft.description}
                onChange={(event) => setMovementDraft((draft) => ({ ...draft, description: event.target.value }))}
                placeholder="movement description"
                className="w-full bg-transparent px-0 py-1 font-mono text-lg text-fg-1 outline-none placeholder:text-fg-4"
                autoFocus
              />
              <input
                value={movementDraft.amount}
                onChange={(event) => setMovementDraft((draft) => ({ ...draft, amount: event.target.value }))}
                placeholder={selectedMovementAccount ? `${selectedMovementAccount.currencyCode} amount` : 'amount'}
                inputMode="decimal"
                className="w-full bg-transparent px-0 py-2 font-mono text-sm leading-relaxed text-fg-2 outline-none placeholder:text-fg-4"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 px-5 py-3">
              <PachSelect
                variant="button"
                value={movementDraft.accountId}
                onChange={(next) => setMovementDraft((draft) => ({ ...draft, accountId: next }))}
                options={importAccountOptions}
                trigger={
                  <FinanceComposerPill
                    icon={selectedMovementAccount?.type === 'credit_card' ? <CreditCard className="h-3 w-3" /> : <Landmark className="h-3 w-3" />}
                    label={selectedMovementAccount?.name?.toLowerCase() ?? 'account'}
                  />
                }
                triggerTitle="account"
                triggerClassName="transition"
                popupWidth="260px"
              />
              <PachSelect
                variant="button"
                value={movementDraft.categoryId}
                onChange={(next) => setMovementDraft((draft) => ({ ...draft, categoryId: next }))}
                options={categoryOptions}
                trigger={
                  <FinanceComposerPill
                    icon={<Tag className="h-3 w-3" />}
                    label={categoryOptions.find((entry) => entry.value === movementDraft.categoryId)?.label?.toLowerCase() ?? 'uncategorized'}
                  />
                }
                triggerTitle="category"
                triggerClassName="transition"
                popupWidth="260px"
              />
              <PachSelect
                variant="button"
                value={movementDraft.type}
                onChange={(next) => setMovementDraft((draft) => ({ ...draft, type: next }))}
                options={movementTypeOptions}
                trigger={<FinanceComposerPill icon={<CircleDollarSign className="h-3 w-3" />} label={movementTypeLabel(movementDraft.type)} />}
                triggerTitle="type"
                triggerClassName="transition"
                popupWidth="170px"
              />
              <PachSelect
                variant="button"
                value={movementDraft.status}
                onChange={(next) => setMovementDraft((draft) => ({ ...draft, status: next }))}
                options={movementStatusOptions}
                trigger={<FinanceComposerPill icon={<Layers2 className="h-3 w-3" />} label={statusLabel(movementDraft.status)} />}
                triggerTitle="status"
                triggerClassName="transition"
                popupWidth="170px"
              />
              {selectedMovementAccount ? (
                <FinanceComposerPill
                  icon={<span className="font-mono text-[10px] text-fg-3">$</span>}
                  label={selectedMovementAccount.currencyCode}
                />
              ) : null}
              <label className="inline-flex items-center gap-1.5 border border-[rgba(0,255,140,0.2)] bg-pit-3 px-2.5 py-1 font-mono text-[11px] lowercase text-fg-2 transition hover:border-[rgba(0,255,140,0.4)] hover:bg-[rgba(0,255,136,0.04)] hover:text-fg-1">
                <CalendarDays className="h-3 w-3" />
                <input
                  type="date"
                  value={movementDraft.transactionDate}
                  onChange={(event) => setMovementDraft((draft) => ({ ...draft, transactionDate: event.target.value }))}
                  className="w-[110px] bg-transparent font-mono text-[11px] text-fg-2 outline-none"
                />
              </label>
            </div>

            <div className="flex items-center justify-between border-t border-[rgba(0,255,140,0.12)] px-5 py-3">
              <button
                type="button"
                onClick={() => setMovementModalOpen(false)}
                className="px-2 py-1.5 font-mono text-xs uppercase tracking-label text-fg-3 transition hover:text-fg-1"
              >
                [cancel]
              </button>
              <button
                type="button"
                disabled={!canCreateMovement}
                onClick={() => void createMovement()}
                className="inline-flex items-center gap-2 border border-[rgba(0,255,140,0.3)] bg-[rgba(0,255,136,0.08)] px-3 py-1.5 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-[rgba(0,255,136,0.16)] hover:shadow-glow-xs disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[rgba(0,255,136,0.08)] disabled:hover:shadow-none"
              >
                <Plus className="h-3.5 w-3.5" />
                add movement
              </button>
            </div>
          </div>
        </div>
      )}

      {accountModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(0,0,0,0.7)] px-4 pt-[10vh] backdrop-blur-sm"
          onClick={closeAccountModal}
        >
          <div
            className="w-full max-w-2xl border border-[rgba(0,255,140,0.2)] bg-pit-2 shadow-[0_30px_80px_rgba(0,0,0,0.5)]"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault()
                if (canCreateAccount) saveAccount()
              }
            }}
          >
            <div className="flex items-center justify-between border-b border-[rgba(0,255,140,0.12)] px-5 py-3">
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="inline-flex items-center gap-1.5 border border-[rgba(0,255,140,0.25)] bg-[rgba(0,255,136,0.05)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-accent">
                  finance
                </span>
                <span className="text-fg-4">›</span>
                <span className="text-fg-2 lowercase">{editingAccountId ? 'edit account/card' : 'new account/card'}</span>
              </div>
              <button
                type="button"
                onClick={closeAccountModal}
                className="font-mono text-xs uppercase tracking-label text-fg-4 transition hover:text-fg-1"
                title="close"
              >
                [esc]
              </button>
            </div>

            <div className="px-5 pt-4">
              <div>
                <input
                  value={accountDraft.name}
                  onChange={(event) => setAccountDraft((draft) => ({ ...draft, name: event.target.value }))}
                  placeholder="account/card name"
                  className="w-full bg-transparent px-0 py-1 font-mono text-lg text-fg-1 outline-none placeholder:text-fg-4"
                  autoFocus
                />
              </div>
              {editingAccount && (
                <div className="mt-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
                  {accountStats.get(editingAccount.id)?.movementCount ?? 0} linked movements stay unchanged
                </div>
              )}

              <div className="relative">
                <div className="relative">
                  <input
                    value={accountDraft.institutionName}
                    onFocus={() => setInstitutionSuggestionsOpen(true)}
                    onBlur={() => window.setTimeout(() => setInstitutionSuggestionsOpen(false), 120)}
                    onChange={(event) => {
                      setAccountDraft((draft) => ({ ...draft, institutionName: event.target.value }))
                      setInstitutionSuggestionsOpen(true)
                    }}
                    placeholder="bank or issuer"
                    className="w-full bg-transparent px-0 py-2 font-mono text-sm leading-relaxed text-fg-2 outline-none placeholder:text-fg-4"
                  />
                  {institutionSuggestionsOpen && institutionSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-[70] max-h-44 overflow-auto border border-[rgba(0,255,140,0.25)] bg-pit shadow-[0_0_18px_rgba(0,255,136,0.18),0_18px_44px_rgba(0,0,0,0.6)]">
                      {filteredInstitutionSuggestions.length > 0 ? (
                        filteredInstitutionSuggestions.map((institution) => (
                          <button
                            key={institution}
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault()
                              setAccountDraft((draft) => ({ ...draft, institutionName: institution }))
                              setInstitutionSuggestionsOpen(false)
                            }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs normal-case tracking-normal text-fg-2 transition hover:bg-[rgba(0,255,136,0.12)] hover:text-accent"
                          >
                            <Landmark className="h-3.5 w-3.5 text-fg-4" />
                            <span className="flex-1 truncate">{institution}</span>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 font-mono text-xs normal-case tracking-normal text-fg-4">
                          no matching institutions
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 px-5 py-3">
              <PachSelect
                variant="button"
                value={accountDraft.type}
                onChange={(next) => setAccountDraft((draft) => ({ ...draft, type: next }))}
                options={typeOptions}
                trigger={
                  <FinanceComposerPill
                    icon={accountDraft.type === 'credit_card' ? <CreditCard className="h-3 w-3" /> : <Landmark className="h-3 w-3" />}
                    label={typeDisplay}
                  />
                }
                triggerTitle="type"
                triggerClassName="transition"
                popupWidth="190px"
              />

              <PachSelect
                variant="button"
                value={accountDraft.currencyCode}
                onChange={(next) => setAccountDraft((draft) => ({ ...draft, currencyCode: next }))}
                options={currencyOptions}
                trigger={
                  <FinanceComposerPill
                    icon={<span className="font-mono text-[10px] text-fg-3">$</span>}
                    label={accountDraft.currencyCode}
                  />
                }
                triggerTitle="currency"
                triggerClassName="transition"
                popupWidth="140px"
              />

              <PachSelect
                variant="button"
                value={accountDraft.holderUserId || '__unassigned__'}
                onChange={(next) => setAccountDraft((draft) => ({ ...draft, holderUserId: next === '__unassigned__' ? '' : next }))}
                options={holderOptions}
                trigger={
                  <FinanceComposerPill
                    icon={<UserRound className="h-3 w-3" />}
                    label={holderDisplay}
                  />
                }
                triggerTitle="holder"
                triggerClassName="transition"
                popupWidth="220px"
              />
            </div>

            <div className="flex items-center justify-between border-t border-[rgba(0,255,140,0.12)] px-5 py-3">
              <button
                type="button"
                onClick={closeAccountModal}
                className="px-2 py-1.5 font-mono text-xs uppercase tracking-label text-fg-3 transition hover:text-fg-1"
              >
                [cancel]
              </button>
              <button
                type="button"
                disabled={!canCreateAccount}
                onClick={saveAccount}
                className="inline-flex items-center gap-2 border border-[rgba(0,255,140,0.3)] bg-[rgba(0,255,136,0.08)] px-3 py-1.5 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-[rgba(0,255,136,0.16)] hover:shadow-glow-xs disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[rgba(0,255,136,0.08)] disabled:hover:shadow-none"
              >
                {editingAccountId ? <CheckCircle className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {editingAccountId ? 'save account' : 'add account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {categoryModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(0,0,0,0.7)] px-4 pt-[8vh] backdrop-blur-sm"
          onClick={() => setCategoryModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl border border-[rgba(0,255,140,0.2)] bg-pit-2 shadow-[0_30px_80px_rgba(0,0,0,0.5)]"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault()
                if (canCreateCategory) createCategory()
              }
            }}
          >
            <div className="flex items-center justify-between border-b border-[rgba(0,255,140,0.12)] px-5 py-3">
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="inline-flex items-center gap-1.5 border border-[rgba(0,255,140,0.25)] bg-[rgba(0,255,136,0.05)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-accent">
                  finance
                </span>
                <span className="text-fg-4">›</span>
                <span className="text-fg-2 lowercase">categories</span>
              </div>
              <button
                type="button"
                onClick={() => setCategoryModalOpen(false)}
                className="font-mono text-xs uppercase tracking-label text-fg-4 transition hover:text-fg-1"
                title="close"
              >
                [esc]
              </button>
            </div>

            <div className="grid max-h-[70vh] gap-4 overflow-auto px-5 py-4">
              <section className="border border-[rgba(0,255,140,0.12)] bg-pit px-3 py-3">
                <div className="mb-3 font-mono text-[10px] uppercase tracking-label text-fg-4">new category</div>
                <input
                  value={categoryDraft.name}
                  onChange={(event) => setCategoryDraft((draft) => ({ ...draft, name: event.target.value }))}
                  placeholder="category name"
                  className="w-full bg-transparent px-0 py-1 font-mono text-lg text-fg-1 outline-none placeholder:text-fg-4"
                  autoFocus
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <PachSelect
                    variant="button"
                    value={categoryDraft.type}
                    onChange={(next) => setCategoryDraft((draft) => ({ ...draft, type: next }))}
                    options={categoryTypeOptions}
                    trigger={
                      <FinanceComposerPill
                        icon={<Tag className="h-3 w-3" />}
                        label={categoryTypeOptions.find((entry) => entry.value === categoryDraft.type)?.label ?? 'type'}
                      />
                    }
                    triggerTitle="type"
                    triggerClassName="transition"
                    popupWidth="170px"
                  />
                  <button
                    type="button"
                    disabled={!canCreateCategory}
                    onClick={createCategory}
                    className="inline-flex items-center gap-2 border border-[rgba(0,255,140,0.3)] bg-[rgba(0,255,136,0.08)] px-3 py-1.5 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-[rgba(0,255,136,0.16)] hover:shadow-glow-xs disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[rgba(0,255,136,0.08)] disabled:hover:shadow-none"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    add category
                  </button>
                </div>
              </section>

              <section className="border border-[rgba(0,255,140,0.12)] bg-pit">
                <div className="flex items-center justify-between border-b border-[rgba(0,255,140,0.12)] px-3 py-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
                  <span>manage categories</span>
                  <span>{scopedCategories.length}</span>
                </div>
                <div className="max-h-[320px] overflow-auto">
                  {scopedCategories.map((category) => {
                    const movementCount = scopedMovements.filter((movement) => movement.categoryId === category.id).length
                    const ruleCount = categorizationRules.filter((rule) => rule.organizationId === selectedOrganizationId && rule.categoryId === category.id).length
                    const isMerging = categoryMergeDraft.categoryId === category.id
                    const targetOptions = scopedCategories
                      .filter((entry) => entry.id !== category.id)
                      .map((entry) => ({ value: entry.id, label: entry.name, icon: <Tag className="h-3.5 w-3.5" /> }))

                    return (
                      <div key={category.id} className="border-b border-[rgba(0,255,140,0.08)] px-3 py-3 font-mono text-xs">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-fg-1">{category.name}</div>
                            <div className="mt-1 text-[10px] uppercase tracking-label text-fg-4">
                              {category.type} · {movementCount} movements · {ruleCount} rules
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={targetOptions.length === 0}
                            onClick={() => setCategoryMergeDraft({
                              categoryId: category.id,
                              targetCategoryId: targetOptions[0]?.value ?? '',
                            })}
                            className="shrink-0 px-2 py-1 text-fail transition hover:text-fg-1 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            delete
                          </button>
                        </div>
                        {isMerging ? (
                          <div className="mt-3 grid gap-2 border border-[rgba(255,95,135,0.16)] bg-[rgba(255,95,135,0.04)] p-2 sm:grid-cols-[1fr_auto_auto]">
                            <PachSelect
                              value={categoryMergeDraft.targetCategoryId}
                              onChange={(next) => setCategoryMergeDraft((draft) => ({ ...draft, targetCategoryId: next }))}
                              options={targetOptions}
                              display={targetOptions.find((option) => option.value === categoryMergeDraft.targetCategoryId)?.label ?? 'select replacement'}
                              popupWidth="260px"
                              triggerClassName="flex h-8 w-full items-center justify-between border border-[rgba(0,255,140,0.12)] bg-pit px-2 text-left font-mono text-xs text-fg-2 outline-none transition hover:border-[rgba(0,255,140,0.22)] hover:bg-[rgba(0,255,136,0.04)] hover:text-fg-1 focus-visible:border-accent"
                            />
                            <button
                              type="button"
                              onClick={() => setCategoryMergeDraft({ categoryId: '', targetCategoryId: '' })}
                              className="px-2 py-1.5 font-mono text-xs uppercase tracking-label text-fg-3 transition hover:text-fg-1"
                            >
                              cancel
                            </button>
                            <button
                              type="button"
                              disabled={!canMergeCategory}
                              onClick={() => void mergeAndArchiveCategory()}
                              className="px-2 py-1.5 font-mono text-xs uppercase tracking-label text-fail transition hover:text-fg-1 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              merge + archive
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                  {scopedCategories.length === 0 ? (
                    <div className="px-3 py-10 text-center font-mono text-sm text-fg-4">
                      // no categories yet
                    </div>
                  ) : null}
                </div>
              </section>
            </div>

            <div className="flex items-center justify-between border-t border-[rgba(0,255,140,0.12)] px-5 py-3">
              <button
                type="button"
                onClick={() => setCategoryModalOpen(false)}
                className="px-2 py-1.5 font-mono text-xs uppercase tracking-label text-fg-3 transition hover:text-fg-1"
              >
                [cancel]
              </button>
              <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">
                delete = merge + archive
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AccountBalanceBreakdown({
  entries,
  showFlow = false,
}: {
  entries: AccountBalanceEntry[]
  showFlow?: boolean
}) {
  if (entries.length === 0) {
    return (
      <div className="px-1 py-4 text-center font-mono text-xs text-fg-4">
        // no account balances in this period
      </div>
    )
  }

  return (
    <div className="divide-y divide-[rgba(0,255,140,0.08)] font-mono text-xs">
      {entries.map((entry) => (
        <div
          key={entry.accountId}
          className={`grid gap-2 py-2 md:items-center ${showFlow ? 'md:grid-cols-[minmax(0,1.2fr)_0.7fr_0.7fr_0.7fr_0.7fr]' : 'md:grid-cols-[minmax(0,1fr)_auto]'}`}
        >
          <div className="min-w-0">
            <div className="truncate text-fg-1">{entry.accountName}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-label text-fg-4">
              {entry.currencyCode} · {entry.movementCount} movements
            </div>
          </div>
          {showFlow ? (
            <>
              <div className="flex items-center justify-between gap-2 md:block md:text-right">
                <span className="text-[10px] uppercase tracking-label text-fg-4 md:hidden">start</span>
                <MoneyStack amounts={[{ currencyCode: entry.currencyCode, amountMinor: entry.startingAmountMinor }]} tone="byAmount" align="right" />
              </div>
              <div className="flex items-center justify-between gap-2 md:block md:text-right">
                <span className="text-[10px] uppercase tracking-label text-fg-4 md:hidden">income</span>
                <MoneyStack amounts={[{ currencyCode: entry.currencyCode, amountMinor: entry.positiveMinor }]} tone="ok" align="right" />
              </div>
              <div className="flex items-center justify-between gap-2 md:block md:text-right">
                <span className="text-[10px] uppercase tracking-label text-fg-4 md:hidden">outflow</span>
                <MoneyStack amounts={[{ currencyCode: entry.currencyCode, amountMinor: entry.negativeMinor }]} tone="fail" align="right" />
              </div>
            </>
          ) : null}
          <div className="flex items-center justify-between gap-2 md:block md:text-right">
            <span className="text-[10px] uppercase tracking-label text-fg-4 md:hidden">balance</span>
            <MoneyStack amounts={[{ currencyCode: entry.currencyCode, amountMinor: entry.endingAmountMinor }]} tone="byAmount" align="right" />
          </div>
        </div>
      ))}
    </div>
  )
}

function FinanceMetric({ label, value, tone = 'default' }: { label: string; value: ReactNode; tone?: 'default' | 'ok' | 'fail' }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="text-[10px] uppercase tracking-label text-fg-4">{label}</span>
      <span className={`min-w-0 truncate ${tone === 'ok' ? 'text-ok' : tone === 'fail' ? 'text-fail' : 'text-fg-2'}`}>{value}</span>
    </div>
  )
}

function MovementDateSortHeader({
  direction,
  onSort,
}: {
  direction: MovementSortDirection
  onSort: () => void
}) {
  const Icon = direction === 'asc' ? ArrowUp : ArrowDown
  return (
    <th className="border-b border-[rgba(0,255,140,0.12)] px-0 py-0 text-left">
      <button
        type="button"
        onClick={onSort}
        className="flex h-9 w-full items-center justify-start gap-1.5 px-3 text-left font-mono text-[10px] uppercase tracking-label text-accent transition hover:bg-[rgba(0,255,136,0.06)] hover:text-fg-1"
      >
        <span>date</span>
        <Icon className="h-3 w-3 shrink-0" />
      </button>
    </th>
  )
}

function MovementHeader({
  label,
  align = 'left',
}: {
  label: string
  align?: 'left' | 'right'
}) {
  return (
    <th className={`h-9 border-b border-[rgba(0,255,140,0.12)] px-3 py-0 font-mono text-[10px] uppercase tracking-label text-fg-4 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {label}
    </th>
  )
}

function MoneyStack({
  amounts,
  tone = 'default',
  size = 'default',
  align = 'left',
  aligned = false,
}: {
  amounts: MoneyAmount[]
  tone?: 'default' | 'ok' | 'fail' | 'byAmount'
  size?: 'default' | 'hero'
  align?: 'left' | 'right'
  aligned?: boolean
}) {
  const displayAmounts = amounts.length > 0 ? amounts : [{ currencyCode: 'MXN', amountMinor: 0 }]
  const sizeClass = size === 'hero' ? 'text-3xl leading-none' : 'text-sm'
  const alignClass = align === 'right' ? 'items-end text-right' : 'items-start text-left'
  return (
    <span className={`flex flex-col gap-1 ${alignClass}`}>
      {displayAmounts.map((amount) => {
        const toneClass = tone === 'ok'
          ? 'text-ok'
          : tone === 'fail'
            ? 'text-fail'
            : tone === 'byAmount'
              ? amount.amountMinor < 0 ? 'text-fail' : 'text-ok'
              : 'text-fg-1'
        if (aligned) {
          const parts = formatMoneyParts(amount.amountMinor, amount.currencyCode)
          return (
            <span key={amount.currencyCode} className={`grid grid-cols-[1ch_minmax(2.5ch,max-content)_auto_minmax(2.5ch,max-content)] items-baseline gap-1 whitespace-nowrap tabular-nums ${sizeClass} ${toneClass}`}>
              <span className="text-right">{parts.sign}</span>
              <span>{parts.prefix}</span>
              <span className="text-right">{parts.number}</span>
              <span>{parts.suffix}</span>
            </span>
          )
        }
        return (
          <span key={amount.currencyCode} className={`block whitespace-nowrap ${sizeClass} ${toneClass}`}>
            {formatMoney(amount.amountMinor, amount.currencyCode)}
          </span>
        )
      })}
    </span>
  )
}

function FinanceSidebarButton({
  active,
  label,
  meta,
  onClick,
}: {
  active: boolean
  label: string
  meta?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between px-3 py-2 text-left font-mono text-xs lowercase transition ${
        active
          ? 'bg-[rgba(0,255,136,0.08)] text-accent ring-1 ring-[rgba(0,255,136,0.2)]'
          : 'text-fg-2 hover:bg-[rgba(0,255,136,0.04)] hover:text-fg-1'
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta ? <span className="ml-3 text-[10px] text-fg-4">{meta}</span> : null}
    </button>
  )
}

function IconTooltip({ label, children, align = 'left' }: { label: string; children: ReactNode; align?: 'left' | 'right' }) {
  return (
    <div className="group relative">
      {children}
      <div className={`pointer-events-none absolute top-[calc(100%+6px)] z-30 whitespace-nowrap border border-[rgba(0,255,140,0.2)] bg-pit px-2 py-1 font-mono text-[10px] uppercase tracking-label text-fg-2 opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition group-hover:opacity-100 ${align === 'right' ? 'right-0' : 'left-0'}`}>
        {label}
      </div>
    </div>
  )
}

function EditableMovementLabel({
  movement,
  editingValue,
  className,
  onStart,
  onChange,
  onSave,
  onCancel,
}: {
  movement: FinanceMovement
  editingValue: string | null
  className?: string
  onStart: () => void
  onChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  const label = movement.merchantName || movement.description
  if (editingValue != null) {
    return (
      <input
        value={editingValue}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onSave}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onSave()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        }}
        className={`h-7 min-w-0 flex-1 border border-[rgba(0,255,140,0.24)] bg-pit-3 px-2 font-mono text-xs text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs ${className ?? ''}`}
        autoFocus
      />
    )
  }
  return (
    <button
      type="button"
      onClick={onStart}
      className={`min-w-0 flex-1 truncate text-left transition hover:text-accent ${className ?? ''}`}
      title={`${label} · click to edit`}
    >
      {label}
    </button>
  )
}

function EditableMovementDate({
  movement,
  editingValue,
  compact = false,
  onStart,
  onChange,
  onSave,
  onCancel,
}: {
  movement: FinanceMovement
  editingValue: string | null
  compact?: boolean
  onStart: () => void
  onChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  if (editingValue != null) {
    return (
      <input
        type="date"
        value={editingValue}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onSave}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onSave()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        }}
        className={`${compact ? 'h-8 w-full text-xs' : 'h-7 w-[9.5rem] text-xs'} border border-[rgba(0,255,140,0.24)] bg-pit-3 px-2 font-mono text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs`}
        autoFocus
      />
    )
  }

  return (
    <button
      type="button"
      onClick={onStart}
      className={`${compact ? 'text-[10px] uppercase tracking-label' : 'text-xs'} whitespace-nowrap text-left text-fg-3 transition hover:text-accent`}
      title="click to edit date"
    >
      <span>{formatZeroDate(movement.transactionDate)}</span>
      {isMeaningfulTransactionTime(movement.transactionTime) ? (
        <span className={`${compact ? 'ml-1' : 'block mt-0.5'} text-[10px] text-fg-4`}>{formatTransactionTime(movement.transactionTime)}</span>
      ) : null}
    </button>
  )
}

function CategoryPieChart({ slices }: { slices: CategoryBreakdownEntry[] }) {
  const [tooltip, setTooltip] = useState<{ slice: CategoryBreakdownEntry; x: number; y: number } | null>(null)
  const radius = 76
  const circumference = 2 * Math.PI * radius
  let offset = 0
  function moveTooltip(event: MouseEvent<SVGCircleElement>, slice: CategoryBreakdownEntry) {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
    setTooltip({
      slice,
      x: rect ? event.clientX - rect.left : 100,
      y: rect ? event.clientY - rect.top : 100,
    })
  }

  return (
    <div className="relative">
      <svg viewBox="0 0 200 200" className="h-56 w-56" role="img" aria-label="Spend by category">
        <circle cx="100" cy="100" r={radius} fill="transparent" stroke="rgba(0,255,140,0.08)" strokeWidth="28" />
        {slices.map((slice) => {
          const length = (slice.percent / 100) * circumference
          const currentOffset = offset
          offset += length
          return (
            <circle
              key={slice.id}
              cx="100"
              cy="100"
              r={radius}
              fill="transparent"
              stroke={slice.color}
              strokeWidth="28"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-currentOffset + circumference * 0.25}
              strokeLinecap="butt"
              className="transition hover:brightness-125"
              style={{ pointerEvents: 'stroke' }}
              onMouseEnter={(event) => moveTooltip(event, slice)}
              onMouseMove={(event) => moveTooltip(event, slice)}
              onMouseLeave={() => setTooltip(null)}
            />
          )
        })}
        <circle cx="100" cy="100" r="48" fill="rgb(0,7,4)" stroke="rgba(0,255,140,0.12)" pointerEvents="none" />
        <text x="100" y="96" textAnchor="middle" className="fill-[rgb(119,150,132)] font-mono text-[10px] uppercase tracking-label" pointerEvents="none">
          spend
        </text>
        <text x="100" y="114" textAnchor="middle" className="fill-[rgb(220,255,231)] font-mono text-sm" pointerEvents="none">
          {slices.length}
        </text>
      </svg>
      {tooltip ? (
        <div
          className="pointer-events-none absolute z-20 min-w-44 border border-[rgba(0,255,140,0.22)] bg-pit px-3 py-2 font-mono text-xs shadow-[0_12px_36px_rgba(0,0,0,0.55)]"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
        >
          <div className="flex items-center gap-2 text-fg-1">
            <span className="h-2.5 w-2.5" style={{ backgroundColor: tooltip.slice.color }} />
            <span className="truncate">{tooltip.slice.name}</span>
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-label text-fg-4">{tooltip.slice.percent.toFixed(1)}%</div>
          <div className="mt-1 text-fail">{formatMoney(-tooltip.slice.amountMinor, tooltip.slice.currencyCode)}</div>
        </div>
      ) : null}
    </div>
  )
}

function MonthlyBalanceAreaChart({
  points,
  currencyCode,
}: {
  points: MonthlyBalanceChartPoint[]
  currencyCode: string
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const width = 640
  const height = 220
  const padTop = 18
  const padBottom = 24
  const values = points.map((point) => point.amountMinor)
  const minValue = Math.min(0, ...values)
  const maxValue = Math.max(0, ...values)
  const range = Math.max(maxValue - minValue, 1)
  const chartHeight = height - padTop - padBottom
  const chartPoints = points.map((point, index) => ({
    ...point,
    x: (index / Math.max(points.length - 1, 1)) * width,
    y: padTop + ((maxValue - point.amountMinor) / range) * chartHeight,
  }))
  const linePath = chartPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x},${point.y}`).join(' ')
  const areaPath = `${linePath} L ${width},${height - padBottom} L 0,${height - padBottom} Z`
  const zeroY = padTop + ((maxValue - 0) / range) * chartHeight
  const hoveredPoint = hoverIndex == null ? null : chartPoints[hoverIndex]
  const tooltipXPercent = hoveredPoint ? (hoveredPoint.x / width) * 100 : 0
  const tooltipTransform = hoverIndex === 0
    ? 'translateY(-100%)'
    : hoverIndex === chartPoints.length - 1
      ? 'translate(-100%, -100%)'
      : 'translate(-50%, -100%)'

  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    if (!wrapperRef.current || points.length === 0) return
    const rect = wrapperRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    setHoverIndex(Math.round(ratio * (points.length - 1)))
  }

  return (
    <div
      ref={wrapperRef}
      className="relative h-full w-full cursor-crosshair"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverIndex(null)}
    >
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block h-full w-full">
        <defs>
          <linearGradient id="finance-monthly-balance-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(0,255,136)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="rgb(0,255,136)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
          <line
            key={ratio}
            x1="0"
            x2={width}
            y1={padTop + ratio * chartHeight}
            y2={padTop + ratio * chartHeight}
            stroke="rgba(0,255,140,0.12)"
            strokeDasharray="2 5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <line
          x1="0"
          x2={width}
          y1={zeroY}
          y2={zeroY}
          stroke="rgba(220,255,231,0.18)"
          strokeDasharray="4 5"
          vectorEffect="non-scaling-stroke"
        />
        <path d={areaPath} fill="url(#finance-monthly-balance-grad)" />
        <path d={linePath} fill="none" stroke="rgb(0,255,136)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
        {hoveredPoint ? (
          <line
            x1={hoveredPoint.x}
            x2={hoveredPoint.x}
            y1={0}
            y2={height}
            stroke="rgb(0,255,136)"
            strokeWidth="1"
            strokeDasharray="2 3"
            opacity="0.5"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>
      {chartPoints.map((point, index) => {
        const size = index === chartPoints.length - 1 ? 8 : 5
        const xPercent = (point.x / width) * 100
        const yPercent = (point.y / height) * 100
        return (
          <span
            key={point.id}
            aria-hidden
            className="pointer-events-none absolute rounded-full"
            style={{
              left: `${xPercent}%`,
              top: `${yPercent}%`,
              width: size,
              height: size,
              marginLeft: index === 0 ? 0 : index === chartPoints.length - 1 ? -size : -size / 2,
              marginTop: -size / 2,
              backgroundColor: index === chartPoints.length - 1 ? 'rgb(0,255,136)' : 'rgb(0,7,4)',
              border: '1px solid rgb(0,255,136)',
              boxSizing: 'border-box',
            }}
          />
        )
      })}
      {hoveredPoint ? (
        <div
          className="pointer-events-none absolute z-20 min-w-44 border border-[rgba(0,255,140,0.24)] bg-pit px-3 py-2 font-mono text-xs shadow-[0_12px_36px_rgba(0,0,0,0.55)]"
          style={{
            left: `${tooltipXPercent}%`,
            top: `${(hoveredPoint.y / height) * 100}%`,
            marginTop: '-12px',
            transform: tooltipTransform,
          }}
        >
          <div className="text-[10px] uppercase tracking-label text-fg-4">{hoveredPoint.label}</div>
          <div className="mt-1 text-fg-1 tabular-nums">{formatMoney(hoveredPoint.amountMinor, currencyCode)}</div>
          {hoveredPoint.missingCurrencies.length > 0 ? (
            <div className="mt-1 text-[10px] uppercase tracking-label text-fail">missing {hoveredPoint.missingCurrencies.join(', ')}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function FinanceEmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string
  body: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="flex min-h-[320px] items-center justify-center border border-dashed border-[rgba(0,255,140,0.15)] bg-pit-2 px-6">
      <div className="max-w-lg text-center">
        <div className="font-mono text-xl lowercase text-fg-1">{title}</div>
        <div className="mt-3 text-sm leading-6 text-fg-3">{body}</div>
        <button
          type="button"
          onClick={onAction}
          className="mt-5 inline-flex items-center gap-2 border border-[rgba(0,255,140,0.3)] bg-[rgba(0,255,136,0.08)] px-4 py-2 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-[rgba(0,255,136,0.16)] hover:shadow-glow-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          {actionLabel}
        </button>
      </div>
    </div>
  )
}

function FinanceComposerPill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 border border-[rgba(0,255,140,0.2)] bg-pit-3 px-2.5 py-1 font-mono text-[11px] lowercase text-fg-2 transition hover:border-[rgba(0,255,140,0.4)] hover:bg-[rgba(0,255,136,0.04)] hover:text-fg-1">
      <span className="flex h-3.5 w-3.5 items-center justify-center">{icon}</span>
      <span className="max-w-[160px] truncate">{label}</span>
    </span>
  )
}

function ImportStatus({ phase }: { phase: ImportPhase }) {
  if (phase === 'ready') return <span className="text-right text-fg-3">pending confirm</span>
  const status = phase
  if (status === 'processing' || status === 'parsing') {
    return (
      <span className="inline-flex items-center justify-end gap-1.5 text-fg-3">
        <Loader2 className="h-3 w-3 animate-spin" />
        processing
      </span>
    )
  }
  if (status === 'success' || status === 'applied' || status === 'ready') {
    return (
      <span className="inline-flex items-center justify-end gap-1.5 text-accent">
        <CheckCircle className="h-3 w-3" />
        ready
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center justify-end gap-1.5 text-amber">
        <AlertTriangle className="h-3 w-3" />
        failed
      </span>
    )
  }
  return <span className="text-right text-fg-4">{status === 'select' ? 'pending' : status}</span>
}

function summarizeImportReview(items: FinanceImportItem[]) {
  return {
    ready: items.filter((item) => item.status === 'parsed').length,
    needsReview: items.filter((item) => item.status === 'needs_review').length,
    duplicate: items.filter((item) => item.status === 'duplicate').length,
    ignored: items.filter((item) => item.status === 'ignored').length,
    applied: items.filter((item) => item.status === 'applied').length,
  }
}

function importBatchKey(entry: FinanceImport) {
  return entry.batchId ?? entry.id
}

function buildImportReviewGroups(imports: FinanceImport[], items: FinanceImportItem[]) {
  const grouped = new Map<string, FinanceImport[]>()
  for (const entry of imports) {
    const key = importBatchKey(entry)
    grouped.set(key, [...(grouped.get(key) ?? []), entry])
  }

  return Array.from(grouped.entries())
    .map(([id, batchImports]) => buildImportReviewGroup(id, batchImports, items))
    .sort((a, b) => Math.max(...b.imports.map((entry) => entry.updatedAt)) - Math.max(...a.imports.map((entry) => entry.updatedAt)))
}

function buildImportReviewGroup(id: string, imports: FinanceImport[], items: FinanceImportItem[]): ImportReviewGroup {
  const importIds = new Set(imports.map((entry) => entry.id))
  const groupItems = items.filter((item) => importIds.has(item.importId))
  const fileNames = imports.map((entry) => entry.fileName)
  const fileLabel = fileNames.length <= 1
    ? fileNames[0] ?? 'import draft'
    : `${fileNames.length} files · ${fileNames.slice(0, 2).join(', ')}${fileNames.length > 2 ? ', ...' : ''}`

  return {
    id,
    imports,
    items: groupItems,
    counts: summarizeImportReview(groupItems),
    fileLabel,
  }
}

function importItemStatusLabel(status: string) {
  if (status === 'parsed') return 'ready'
  if (status === 'needs_review') return 'needs review'
  return status.replace(/_/g, ' ')
}

function displayUser(user: Schema['tables']['users']['row'] | undefined) {
  return user?.name || user?.email || 'unknown user'
}

function typeLabel(type: string) {
  return ACCOUNT_TYPES.find((entry) => entry.value === type)?.label ?? type
}

function movementTypeLabel(type: string) {
  return MOVEMENT_TYPES.find((entry) => entry.value === type)?.label ?? type
}

function statusLabel(status: string) {
  return MOVEMENT_STATUSES.find((entry) => entry.value === status)?.label ?? status
}

function sortMovementsByDate(
  movements: FinanceMovement[],
  direction: MovementSortDirection,
) {
  const directionValue = direction === 'asc' ? 1 : -1
  return [...movements].sort((a, b) => {
    const compared = (a.transactionDate - b.transactionDate) * directionValue
    const timeCompared = formatTransactionTime(a.transactionTime).localeCompare(formatTransactionTime(b.transactionTime)) * directionValue
    return compared || timeCompared || a.description.localeCompare(b.description)
  })
}

function sortImportItemsByDate(
  items: FinanceImportItem[],
  direction: MovementSortDirection,
) {
  const directionValue = direction === 'asc' ? 1 : -1
  return [...items].sort((a, b) => {
    const compared = (a.transactionDate - b.transactionDate) * directionValue
    const timeCompared = formatTransactionTime(a.transactionTime).localeCompare(formatTransactionTime(b.transactionTime)) * directionValue
    return compared || timeCompared || a.description.localeCompare(b.description)
  })
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'pending_review') return <AlertTriangle className="h-3.5 w-3.5" />
  if (status === 'ignored') return <X className="h-3.5 w-3.5" />
  return <CheckCircle className="h-3.5 w-3.5" />
}

function reviewReasonForStatus(status: string) {
  if (status === 'pending_review') return 'manual_review'
  if (status === 'ignored') return 'ignored'
  return null
}

function formatMoney(amountMinor: number, currencyCode: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  }).format(amountMinor / 100)
}

function formatMoneyParts(amountMinor: number, currencyCode: string) {
  const parts = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  }).formatToParts(Math.abs(amountMinor) / 100)
  const number = parts
    .filter((part) => ['integer', 'group', 'decimal', 'fraction'].includes(part.type))
    .map((part) => part.value)
    .join('')
  const firstNumberIndex = parts.findIndex((part) => part.type === 'integer')
  const prefix = parts
    .filter((part, index) => part.type === 'currency' && (firstNumberIndex === -1 || index < firstNumberIndex))
    .map((part) => part.value)
    .join('')
  const suffix = parts
    .filter((part, index) => part.type === 'currency' && firstNumberIndex !== -1 && index > firstNumberIndex)
    .map((part) => part.value)
    .join('')
  return {
    sign: amountMinor < 0 ? '-' : amountMinor > 0 ? '+' : '',
    prefix,
    number,
    suffix,
  }
}

function formatZeroDate(value: number) {
  return new Date(value).toISOString().slice(0, 10)
}

function isMeaningfulTransactionTime(value: string | null | undefined) {
  return Boolean(value && value !== '00:00:00')
}

function formatTransactionTime(value: string | null | undefined) {
  if (!value) return '00:00:00'
  return value.slice(0, 8)
}

function todayInputDate() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

function dateInputToMs(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return Date.now()
  return Date.UTC(year, month - 1, day)
}

function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return formatZeroDate(dateInputToMs(value)) === value
}

async function buildMovementFingerprintForUpdate(input: {
  accountId: string
  transactionDate: string
  transactionTime?: string | null
  amountMinor: number
  description: string
}) {
  return sha256Text(`${input.accountId}|${input.transactionDate}T${formatTransactionTime(input.transactionTime)}|${input.amountMinor}|${normalizeFingerprintText(input.description)}`)
}

function normalizeFingerprintText(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

async function sha256Text(value: string) {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function monthKey(value: number) {
  return formatZeroDate(value).slice(0, 7)
}

function quarterKey(value: number) {
  const date = new Date(value)
  const year = date.getUTCFullYear()
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1
  return `${year}-Q${quarter}`
}

function formatMonthLabel(value: number) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value))
}

function formatMonthShortLabel(value: string) {
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  if (!year || !month) return value
  return new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)))
}

function parseFrankfurterRates(payload: FrankfurterRatesPayload, baseCurrencyCode: string) {
  if (Array.isArray(payload)) {
    const rates: Record<string, number> = {}
    let date: string | null = null
    for (const row of payload) {
      if (row.base && row.base !== baseCurrencyCode) continue
      if (!row.quote || typeof row.rate !== 'number') continue
      rates[row.quote] = row.rate
      date = date ?? row.date ?? null
    }
    return { date, rates }
  }

  return {
    date: payload.date ?? null,
    rates: payload.rates ?? {},
  }
}

function parseMoneyToMinor(value: string) {
  const normalized = value.replace(/,/g, '').trim()
  if (!normalized) return null
  const amount = Number(normalized)
  if (!Number.isFinite(amount)) return null
  return Math.round(amount * 100)
}

function signedAmountForType(amountMinor: number, type: string) {
  if (type === 'expense') return -Math.abs(amountMinor)
  if (type === 'income') return Math.abs(amountMinor)
  return amountMinor
}

function inferType(amountMinor: number) {
  return amountMinor >= 0 ? 'income' : 'expense'
}

function summarizeMovements(movements: Schema['tables']['fin_movements']['row'][]): MovementSummary {
  const totals = movementCurrencyTotals(movements)
  return {
    positiveAmounts: moneyAmountsFromMap(totals, 'positiveMinor'),
    negativeAmounts: moneyAmountsFromMap(totals, 'negativeMinor'),
    netAmounts: moneyAmountsFromMap(totals, 'netMinor'),
  }
}

function convertMoneyAmounts(
  amounts: MoneyAmount[],
  reportingCurrencyCode: string,
  ratesFromReportingCurrency: Record<string, number>,
): ConvertedMoney {
  const missingCurrencies = new Set<string>()
  const amountMinor = amounts.reduce((sum, amount) => {
    const rate = conversionRateToReportingCurrency(amount.currencyCode, reportingCurrencyCode, ratesFromReportingCurrency)
    if (rate == null) {
      missingCurrencies.add(amount.currencyCode)
      return sum
    }
    return sum + Math.round(amount.amountMinor * rate)
  }, 0)

  return {
    currencyCode: reportingCurrencyCode,
    amountMinor,
    missingCurrencies: Array.from(missingCurrencies).sort((a, b) => currencySortValue(a).localeCompare(currencySortValue(b))),
  }
}

function conversionRateToReportingCurrency(
  sourceCurrencyCode: string,
  reportingCurrencyCode: string,
  ratesFromReportingCurrency: Record<string, number>,
) {
  if (sourceCurrencyCode === reportingCurrencyCode) return 1
  const reportingToSourceRate = ratesFromReportingCurrency[sourceCurrencyCode]
  if (!reportingToSourceRate || reportingToSourceRate <= 0) return null
  return 1 / reportingToSourceRate
}

function buildMonthlyBalanceChartPoints(
  monthlyBalance: MonthlyBalanceEntry[],
  reportingCurrencyCode: string,
  ratesFromReportingCurrency: Record<string, number>,
): MonthlyBalanceChartPoint[] {
  return [...monthlyBalance]
    .reverse()
    .map((entry) => {
      const converted = convertMoneyAmounts(entry.endingAmounts, reportingCurrencyCode, ratesFromReportingCurrency)
      return {
        id: entry.id,
        label: entry.label,
        shortLabel: formatMonthShortLabel(entry.id),
        amountMinor: converted.amountMinor,
        missingCurrencies: converted.missingCurrencies,
      }
    })
}

function summarizeAccountBalances(entries: AccountBalanceEntry[]): MovementSummary {
  const totals = new Map<string, { positiveMinor: number; negativeMinor: number; netMinor: number }>()
  for (const entry of entries) {
    const current = totals.get(entry.currencyCode) ?? { positiveMinor: 0, negativeMinor: 0, netMinor: 0 }
    current.positiveMinor += entry.positiveMinor
    current.negativeMinor += entry.negativeMinor
    current.netMinor += entry.endingAmountMinor
    totals.set(entry.currencyCode, current)
  }
  return {
    positiveAmounts: moneyAmountsFromMap(totals, 'positiveMinor'),
    negativeAmounts: moneyAmountsFromMap(totals, 'negativeMinor'),
    netAmounts: moneyAmountsFromMap(totals, 'netMinor'),
  }
}

function buildAccountBalanceBreakdown(
  movements: FinanceMovement[],
  accounts: FinanceAccount[],
  currencyFilterIds: string[] = [],
): AccountBalanceEntry[] {
  const accountMap = new Map(
    accounts
      .filter((account) => currencyFilterIds.length === 0 || currencyFilterIds.includes(account.currencyCode))
      .map((account) => [account.id, account]),
  )
  const stats = new Map<string, { positiveMinor: number; negativeMinor: number; netMinor: number; movementCount: number }>()

  for (const movement of movements) {
    const account = accountMap.get(movement.accountId)
    if (!account) continue
    const current = stats.get(account.id) ?? { positiveMinor: 0, negativeMinor: 0, netMinor: 0, movementCount: 0 }
    current.positiveMinor += movement.amountMinor > 0 ? movement.amountMinor : 0
    current.negativeMinor += movement.amountMinor < 0 ? movement.amountMinor : 0
    current.netMinor += movement.amountMinor
    current.movementCount += 1
    stats.set(account.id, current)
  }

  return Array.from(accountMap.values())
    .map((account) => {
      const accountStats = stats.get(account.id) ?? { positiveMinor: 0, negativeMinor: 0, netMinor: 0, movementCount: 0 }
      return {
        accountId: account.id,
        accountName: account.name,
        currencyCode: account.currencyCode,
        movementCount: accountStats.movementCount,
        startingAmountMinor: 0,
        positiveMinor: accountStats.positiveMinor,
        negativeMinor: accountStats.negativeMinor,
        endingAmountMinor: accountStats.netMinor,
      }
    })
    .sort(sortAccountBalanceEntries)
}

function movementCurrencyTotals(movements: Schema['tables']['fin_movements']['row'][]) {
  const totals = new Map<string, { positiveMinor: number; negativeMinor: number; netMinor: number }>()
  for (const movement of movements) {
    addMovementToCurrencyTotals(totals, movement)
  }
  return totals
}

function addMovementToCurrencyTotals(
  totals: Map<string, { positiveMinor: number; negativeMinor: number; netMinor: number }>,
  movement: Schema['tables']['fin_movements']['row'],
) {
  const current = totals.get(movement.currencyCode) ?? { positiveMinor: 0, negativeMinor: 0, netMinor: 0 }
  current.positiveMinor += movement.amountMinor > 0 ? movement.amountMinor : 0
  current.negativeMinor += movement.amountMinor < 0 ? movement.amountMinor : 0
  current.netMinor += movement.amountMinor
  totals.set(movement.currencyCode, current)
}

function moneyAmountsFromMap(
  totals: Map<string, { positiveMinor: number; negativeMinor: number; netMinor: number }>,
  field: 'positiveMinor' | 'negativeMinor' | 'netMinor',
): MoneyAmount[] {
  return Array.from(totals.entries())
    .map(([currencyCode, value]) => ({ currencyCode, amountMinor: value[field] }))
    .sort((a, b) => currencySortValue(a.currencyCode).localeCompare(currencySortValue(b.currencyCode)))
}

function currencySortValue(currencyCode: string) {
  const knownIndex = CURRENCIES.indexOf(currencyCode)
  return `${knownIndex === -1 ? 999 : knownIndex}:${currencyCode}`
}

function buildMonthlyBalance(
  movements: FinanceMovement[],
  accounts: FinanceAccount[],
  currencyFilterIds: string[] = [],
): MonthlyBalanceEntry[] {
  const accountMap = new Map(
    accounts
      .filter((account) => currencyFilterIds.length === 0 || currencyFilterIds.includes(account.currencyCode))
      .map((account) => [account.id, account]),
  )
  const months = new Map<string, {
    totals: Map<string, { positiveMinor: number; negativeMinor: number; netMinor: number }>
    accountTotals: Map<string, { positiveMinor: number; negativeMinor: number; netMinor: number; movementCount: number }>
  }>()

  for (const movement of movements) {
    const account = accountMap.get(movement.accountId)
    if (!account) continue
    const id = monthKey(movement.transactionDate)
    const current = months.get(id) ?? {
      totals: new Map<string, { positiveMinor: number; negativeMinor: number; netMinor: number }>(),
      accountTotals: new Map<string, { positiveMinor: number; negativeMinor: number; netMinor: number; movementCount: number }>(),
    }
    addMovementToAccountCurrencyTotals(current.totals, movement, account.currencyCode)
    const accountCurrent = current.accountTotals.get(account.id) ?? { positiveMinor: 0, negativeMinor: 0, netMinor: 0, movementCount: 0 }
    accountCurrent.positiveMinor += movement.amountMinor > 0 ? movement.amountMinor : 0
    accountCurrent.negativeMinor += movement.amountMinor < 0 ? movement.amountMinor : 0
    accountCurrent.netMinor += movement.amountMinor
    accountCurrent.movementCount += 1
    current.accountTotals.set(account.id, accountCurrent)
    months.set(id, current)
  }

  const runningTotals = new Map<string, number>()
  const runningAccountTotals = new Map<string, number>()
  const ascendingEntries = Array.from(months.entries()).sort(([a], [b]) => a.localeCompare(b))
  const entries = ascendingEntries.map(([id, value]) => {
    const monthCurrencies = Array.from(value.totals.keys())
    const startingAmounts = moneyAmountsFromSimpleMap(withZeroCurrencies(runningTotals, monthCurrencies))
    const accountBalances = Array.from(accountMap.values())
      .map((account) => {
        const accountMonthTotals = value.accountTotals.get(account.id) ?? { positiveMinor: 0, negativeMinor: 0, netMinor: 0, movementCount: 0 }
        const startingAmountMinor = runningAccountTotals.get(account.id) ?? 0
        const endingAmountMinor = startingAmountMinor + accountMonthTotals.netMinor
        return {
          accountId: account.id,
          accountName: account.name,
          currencyCode: account.currencyCode,
          movementCount: accountMonthTotals.movementCount,
          startingAmountMinor,
          positiveMinor: accountMonthTotals.positiveMinor,
          negativeMinor: accountMonthTotals.negativeMinor,
          endingAmountMinor,
        }
      })
      .filter((entry) => entry.movementCount > 0 || entry.startingAmountMinor !== 0 || entry.endingAmountMinor !== 0)
      .sort(sortAccountBalanceEntries)
    for (const [currencyCode, totals] of value.totals.entries()) {
      runningTotals.set(currencyCode, (runningTotals.get(currencyCode) ?? 0) + totals.netMinor)
    }
    for (const [accountId, totals] of value.accountTotals.entries()) {
      runningAccountTotals.set(accountId, (runningAccountTotals.get(accountId) ?? 0) + totals.netMinor)
    }
    return {
      id,
      label: formatMonthLabel(Date.UTC(Number(id.slice(0, 4)), Number(id.slice(5, 7)) - 1, 1)),
      startingAmounts,
      positiveAmounts: moneyAmountsFromMap(value.totals, 'positiveMinor'),
      negativeAmounts: moneyAmountsFromMap(value.totals, 'negativeMinor'),
      endingAmounts: moneyAmountsFromSimpleMap(runningTotals),
      accountBalances,
    }
  })
  return entries.reverse()
}

function addMovementToAccountCurrencyTotals(
  totals: Map<string, { positiveMinor: number; negativeMinor: number; netMinor: number }>,
  movement: FinanceMovement,
  currencyCode: string,
) {
  const current = totals.get(currencyCode) ?? { positiveMinor: 0, negativeMinor: 0, netMinor: 0 }
  current.positiveMinor += movement.amountMinor > 0 ? movement.amountMinor : 0
  current.negativeMinor += movement.amountMinor < 0 ? movement.amountMinor : 0
  current.netMinor += movement.amountMinor
  totals.set(currencyCode, current)
}

function sortAccountBalanceEntries(a: AccountBalanceEntry, b: AccountBalanceEntry) {
  return currencySortValue(a.currencyCode).localeCompare(currencySortValue(b.currencyCode)) ||
    b.endingAmountMinor - a.endingAmountMinor ||
    a.accountName.localeCompare(b.accountName)
}

function moneyAmountsFromSimpleMap(totals: Map<string, number>): MoneyAmount[] {
  return Array.from(totals.entries())
    .map(([currencyCode, amountMinor]) => ({ currencyCode, amountMinor }))
    .sort((a, b) => currencySortValue(a.currencyCode).localeCompare(currencySortValue(b.currencyCode)))
}

function withZeroCurrencies(totals: Map<string, number>, currencies: string[]) {
  const next = new Map(totals)
  for (const currencyCode of currencies) {
    if (!next.has(currencyCode)) next.set(currencyCode, 0)
  }
  return next
}

function buildCategoryBreakdown(
  movements: Schema['tables']['fin_movements']['row'][],
  categories: Schema['tables']['fin_categories']['row'][],
): CategoryBreakdownGroup[] {
  const categoryMap = new Map(categories.map((category) => [category.id, category]))
  const totals = new Map<string, Map<string, { name: string; amountMinor: number; currencyCode: string }>>()

  for (const movement of movements) {
    if (movement.amountMinor >= 0) continue
    const category = movement.categoryId ? categoryMap.get(movement.categoryId) : null
    const id = category?.id ?? UNCATEGORIZED_VALUE
    const currencyTotals = totals.get(movement.currencyCode) ?? new Map<string, { name: string; amountMinor: number; currencyCode: string }>()
    const current = currencyTotals.get(id) ?? {
      name: category?.name ?? 'uncategorized',
      amountMinor: 0,
      currencyCode: movement.currencyCode,
    }
    current.amountMinor += Math.abs(movement.amountMinor)
    currencyTotals.set(id, current)
    totals.set(movement.currencyCode, currencyTotals)
  }

  return Array.from(totals.entries())
    .sort(([a], [b]) => currencySortValue(a).localeCompare(currencySortValue(b)))
    .map(([currencyCode, currencyTotals]) => {
      const entries = Array.from(currencyTotals.entries())
        .map(([id, value], index) => ({
          id: `${currencyCode}:${id}`,
          name: value.name,
          amountMinor: value.amountMinor,
          currencyCode: value.currencyCode,
          percent: 0,
          color: CATEGORY_CHART_COLORS[index % CATEGORY_CHART_COLORS.length],
        }))
        .sort((a, b) => b.amountMinor - a.amountMinor)
        .slice(0, 9)
      const total = entries.reduce((sum, entry) => sum + entry.amountMinor, 0)
      return {
        currencyCode,
        entries: entries.map((entry) => ({
          ...entry,
          percent: total === 0 ? 0 : (entry.amountMinor / total) * 100,
        })),
      }
    })
}

function isTransferLikeMovement(
  movement: Schema['tables']['fin_movements']['row'],
  categories: Schema['tables']['fin_categories']['row'][],
) {
  if (movement.type === 'transfer' || movement.transferId) return true
  const category = movement.categoryId ? categories.find((entry) => entry.id === movement.categoryId) : null
  return category?.type === 'transfer'
}

function buildAccountStats(
  account: Schema['tables']['fin_accounts']['row'],
  movements: Schema['tables']['fin_movements']['row'][],
) {
  const accountMovements = movements.filter((movement) =>
    movement.accountId === account.id &&
    movement.status !== 'ignored'
  )
  const calculatedBalanceMinor = accountMovements.reduce((sum, movement) => sum + movement.amountMinor, 0)
  return {
    movementCount: accountMovements.length,
    calculatedBalanceMinor,
  }
}

function accountLabel(accountId: string, accounts: FinanceAccount[]) {
  return accounts.find((account) => account.id === accountId)?.name ?? 'unknown account'
}

function findTransferCandidates(
  source: FinanceMovement,
  movements: FinanceMovement[],
  accounts: FinanceAccount[],
): TransferCandidate[] {
  return movements
    .filter((candidate) => candidate.id !== source.id)
    .filter((candidate) => candidate.accountId !== source.accountId)
    .filter((candidate) => candidate.status !== 'ignored')
    .filter((candidate) => !candidate.transferId || candidate.transferId === source.transferId)
    .filter((candidate) => Math.sign(candidate.amountMinor) !== Math.sign(source.amountMinor))
    .map((candidate) => ({
      movement: candidate,
      score: scoreTransferCandidate(source, candidate),
      reasons: transferCandidateReasons(source, candidate, accounts),
    }))
    .filter((candidate) => candidate.score >= 45)
    .sort((a, b) => b.score - a.score || Math.abs(source.transactionDate - a.movement.transactionDate) - Math.abs(source.transactionDate - b.movement.transactionDate))
}

function scoreTransferCandidate(source: FinanceMovement, candidate: FinanceMovement) {
  const amountDelta = Math.abs(Math.abs(source.amountMinor) - Math.abs(candidate.amountMinor))
  const largestAmount = Math.max(Math.abs(source.amountMinor), Math.abs(candidate.amountMinor), 1)
  const amountRatio = amountDelta / largestAmount
  const dayDelta = Math.abs(source.transactionDate - candidate.transactionDate) / (24 * 60 * 60 * 1000)
  let score = 0

  if (source.currencyCode === candidate.currencyCode && amountRatio <= 0.005) score += 45
  else if (source.currencyCode === candidate.currencyCode && amountRatio <= 0.02) score += 35
  else if (amountRatio <= 0.05) score += 20
  else if (amountRatio <= 0.12) score += 10

  if (dayDelta <= 1) score += 25
  else if (dayDelta <= 3) score += 18
  else if (dayDelta <= 7) score += 10
  else if (dayDelta <= 14) score += 4

  if (source.accountId !== candidate.accountId) score += 20
  if (source.currencyCode === candidate.currencyCode) score += 10
  return Math.min(99, Math.round(score))
}

function transferCandidateReasons(source: FinanceMovement, candidate: FinanceMovement, accounts: FinanceAccount[]) {
  const reasons: string[] = []
  const amountDelta = Math.abs(Math.abs(source.amountMinor) - Math.abs(candidate.amountMinor))
  const dayDelta = Math.round(Math.abs(source.transactionDate - candidate.transactionDate) / (24 * 60 * 60 * 1000))
  if (amountDelta === 0 && source.currencyCode === candidate.currencyCode) reasons.push('same amount')
  else reasons.push(`${formatMoney(amountDelta, source.currencyCode)} apart`)
  reasons.push(dayDelta === 0 ? 'same day' : `${dayDelta}d apart`)
  reasons.push(accountLabel(candidate.accountId, accounts))
  if (source.currencyCode !== candidate.currencyCode) reasons.push('different currency')
  return reasons
}

function buildRuleMatch(movement: Schema['tables']['fin_movements']['row']) {
  const merchant = movement.merchantName?.trim()
  if (merchant && merchant.length >= 3) return { kind: 'merchant', value: normalizeRuleValue(merchant) }
  const description = movement.description.trim()
  if (description.length < 3) return null
  return { kind: 'contains', value: normalizeRuleValue(description) }
}

function normalizeRuleValue(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80)
}

function uniqueBy<T>(values: T[], getKey: (value: T) => string) {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = getKey(value)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const value = String(reader.result ?? '')
      resolve(value.includes(',') ? value.split(',')[1] : value)
    }
    reader.readAsDataURL(file)
  })
}

async function readJsonResponse(response: Response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text) as {
      error?: string
      message?: string
      importId?: string
      summary?: {
        parsed?: number
        ready?: number
        created?: number
        skipped?: number
        needsReview?: number
        remainingReview?: number
        duplicates?: number
      }
      duplicateFile?: boolean
      categories?: FinanceCategory[]
    }
  } catch {
    return {
      error: 'INVALID_RESPONSE',
      message: response.status === 413 ? 'Upload is too large for the server.' : text.slice(0, 240),
    }
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function compactImportMessage(message: string) {
  if (/processing/i.test(message)) return 'processing'
  if (/too large/i.test(message)) return 'failed · file too large'
  if (/already|duplicate/i.test(message)) return 'duplicate file'
  if (/draft ready/i.test(message)) return 'draft ready'
  if (/applied/i.test(message)) return 'applied'
  return message.length > 44 ? `${message.slice(0, 44)}...` : message
}

function sourceTypeFor(file: File) {
  if (file.type.startsWith('image/')) return 'screenshot'
  if (file.type === 'application/pdf') return 'statement_pdf'
  return 'statement_csv'
}

function guessFileType(fileName: string) {
  if (fileName.toLowerCase().endsWith('.pdf')) return 'application/pdf'
  if (fileName.toLowerCase().endsWith('.csv')) return 'text/csv'
  return 'text/plain'
}
