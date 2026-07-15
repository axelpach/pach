import { useQuery, useZero } from '@rocicorp/zero/react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import timeGridPlugin from '@fullcalendar/timegrid'
import type {
  DatesSetArg,
  DayCellContentArg,
  DayCellMountArg,
  EventClickArg,
  EventContentArg,
  EventInput,
  EventMountArg,
} from '@fullcalendar/core'
import {
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Edit3,
  ExternalLink,
  Info,
  Link2,
  Linkedin,
  Mail,
  Menu,
  Megaphone,
  MessageCircleMore,
  Newspaper,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Rss,
  Send,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Button, Metric, Panel, StatusPill, TermInput, TermTextarea } from '../../components/pach'
import { PachSelect, type PachSelectOption } from '../../components/PachSelect'
import { FilterButton, type ActiveFilters, type FilterFieldConfig } from '../issues/IssueFilters'
import { authFetch } from '../../lib/auth'
import { config } from '../../config'
import type { Mutators } from '../../mutators'
import type { Schema } from '../../zero-schema'
import { RichEditor, type RichEditorHandle } from '../../components/rich-editor/RichEditor'
import WhatsAppLayout from '../whatsapp/WhatsAppLayout'
import WhatsAppTemplates from '../whatsapp/Templates'
import Campaigns from '../whatsapp/Campaigns'
import CampaignDetail from '../whatsapp/CampaignDetail'
import '../calendar/Calendar.css'

type OrganizationRow = Schema['tables']['organizations']['row']
type DocumentRow = Schema['tables']['documents']['row']
type IssueRow = Schema['tables']['pm_issues']['row']
type ContentItemRow = Schema['tables']['mkt_content_items']['row']
type PublicationRow = Schema['tables']['mkt_publications']['row']
type SenderProfileRow = Schema['tables']['mkt_sender_profiles']['row']
type AudienceMemberRow = Schema['tables']['mkt_audience_members']['row']
type AudienceSubscriptionRow = Schema['tables']['mkt_audience_subscriptions']['row']
type DistributionRunRow = Schema['tables']['mkt_distribution_runs']['row']
type EditorialIdeaRow = Schema['tables']['mkt_editorial_ideas']['row']
type PublicationSlotRow = Schema['tables']['mkt_publication_slots']['row']
type CtaRow = Schema['tables']['mkt_ctas']['row']
type ContentEventRow = Schema['tables']['mkt_content_events']['row']
type ContentOutputRow = Schema['tables']['mkt_content_outputs']['row']
type PromotablePageRecord = Schema['tables']['mkt_promotable_pages']['row']
type KeywordIdeaRow = Schema['tables']['mkt_keyword_ideas']['row']
type AdPromotionRow = Schema['tables']['mkt_ad_promotions']['row']
type AdMetricSnapshotRow = Schema['tables']['mkt_ad_metric_snapshots']['row']

type SearchConsolePropertyRow = {
  id: string
  organizationId: string
  displayName: string
  selected: boolean
}

type SearchConsoleDimensionSummaryRow = {
  organizationId: string
  propertyId: string
  summaryType: 'page' | 'query' | 'page_query' | string
  summaryKey: string
  contentItemId?: string | null
  contentOutputId?: string | null
  page?: string | null
  query?: string | null
  clicks: number
  impressions: number
  position?: string | null
}

type SearchConsoleDailySnapshotRow = {
  organizationId: string
  propertyId: string
  dataDate: number | string
  clicks: number
  impressions: number
  position?: string | null
}

type SearchConsoleUrlInspectionRow = {
  id: string
  organizationId: string
  propertyId: string
  inspectionUrl: string
  verdict?: string | null
}

type AgentRunRow = Schema['tables']['agent_runs']['row']
type AgentRunProgressReportRow = Schema['tables']['agent_run_progress_reports']['row']

type OrganizationCredentialSummary = {
  id: string
  organizationId: string
  name: string
  provider: string
  envVarName: string
  secretLast4: string
  allowedUses: string[]
  status: string
}

type PublicationResearchSource = {
  id: string
  name: string
  credentialId: string
  baseUrl: string
  docsUrl: string
  instructions: string
  enabled: boolean
}

const SEARCH_ANALYTICS_LOOKBACK_DAYS = 92

type AnalyticsDetailTab = 'search' | 'newsletter' | 'social' | 'ads'

type SocialChannelRow = Schema['tables']['social_channels']['row']
type SocialPostRow = Schema['tables']['social_posts']['row']
type SocialPostTargetRow = Schema['tables']['social_post_targets']['row']
type EmailThemeMode = 'dark' | 'light'
type EmailRenderWarning = { code: string; message: string; severity: 'info' | 'warning' | 'error' }
type EmailRenderPreview = { html: string; text: string; warnings: EmailRenderWarning[]; mode?: EmailThemeMode }
type PublicationEmailWrapper = {
  header: string
  headerLogo: Record<string, unknown>
  headerLogoEnabled: boolean
  beforeContent: string
  footer: string
  ctaId: string
  ctaLabel: string
  ctaUrl: string
}
type PublicationCadenceConfig = {
  enabled: boolean
  mode: 'autonomous' | 'issue'
  frequency: 'weekly' | 'monthly' | 'quarterly'
  lookaheadDays: number
  cooldownDays: number
  timezone: string
  time: string
  dayOfWeek: number
  dayOfMonth: number
  minIdeaBacklog: number
}
type LinkedInAdPromotionDraftPayload = {
  adAccountExternalId: string
  objective: string
  audiencePreset: string
  budgetMinor?: number
  currencyCode: string
  startsAt?: number
  endsAt?: number
  headline: string
  primaryText: string
  ctaLabel: string
}

type GoogleSearchPromotionDraftPayload = {
  adAccountExternalId: string
  objective: string
  geo: string
  language: string
  budgetMinor?: number
  currencyCode: string
  startsAt?: number
  endsAt?: number
  keywords: string[]
  headlines: string[]
  descriptions: string[]
}

type MarketingSection = 'newsletters' | 'social' | 'whatsapp' | 'promotions' | 'calendar' | 'analytics'
type NewsletterTab = 'content' | 'publications' | 'subscribers' | 'broadcasts' | 'ctas'
type MarketingCalendarView = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek'
type MarketingCalendarEventTone = 'ok' | 'warn' | 'fail' | 'info' | 'idle'
type MarketingCalendarEvent = {
  id: string
  type: string
  title: string
  startsAt: number
  endsAt: number
  status: string
  channelName: string
  destinationKey: string
  destinationName: string
  contentTitle: string
  timezone: string
  href: string
  tone: MarketingCalendarEventTone
}
type StoredMarketingCalendarState = {
  view: MarketingCalendarView
  currentDate: number | null
  filters: ActiveFilters
  searchQuery: string
}

const SECTIONS: Array<{ id: MarketingSection; label: string }> = [
  { id: 'newsletters', label: 'newsletters' },
  { id: 'social', label: 'social' },
  { id: 'whatsapp', label: 'whatsapp' },
  { id: 'promotions', label: 'promotions' },
  { id: 'calendar', label: 'calendar' },
  { id: 'analytics', label: 'analytics' },
]

const NEWSLETTER_TABS: Array<{ id: NewsletterTab; label: string }> = [
  { id: 'content', label: 'content' },
  { id: 'publications', label: 'publications' },
  { id: 'subscribers', label: 'subscribers' },
  { id: 'broadcasts', label: 'broadcasts' },
  { id: 'ctas', label: 'ctas' },
]

const CONTENT_CHANNELS = ['blog', 'newsletter'] as const
const DEFAULT_MARKETING_TIMEZONE = 'America/Mexico_City'
const MARKETING_CALENDAR_STATE_STORAGE_KEY = 'pach.marketing.calendar.state'
const MARKETING_CALENDAR_EVENT_DURATION_MS = 30 * 60 * 1000
const MARKETING_CALENDAR_VIEW_OPTIONS: Array<{ value: MarketingCalendarView; label: string }> = [
  { value: 'dayGridMonth', label: 'month' },
  { value: 'timeGridWeek', label: 'week' },
  { value: 'timeGridDay', label: 'day' },
  { value: 'listWeek', label: 'agenda' },
]
const MARKETING_CALENDAR_STATUS_ORDER = [
  'scheduled',
  'publishing',
  'published',
  'sent',
  'sending',
  'active',
  'ready',
  'draft',
  'paused',
  'completed',
  'failed',
  'canceled',
  'blocked_waiting_for_output',
  'archived',
]
const EMPTY_MARKETING_CALENDAR_FILTERS: ActiveFilters = {
  eventType: [],
  channel: [],
  status: [],
  destination: [],
}
const MARKETING_TIMEZONES = [
  { value: 'America/Mexico_City', label: 'Mexico City' },
  { value: 'Europe/Madrid', label: 'Madrid' },
] as const
const MARKETING_TIMEZONE_OPTIONS: PachSelectOption[] = MARKETING_TIMEZONES.map((timezone) => ({
  value: timezone.value,
  label: timezone.label,
}))
const CADENCE_MODE_OPTIONS: PachSelectOption[] = [
  { value: 'autonomous', label: 'autonomous' },
  { value: 'issue', label: 'issue' },
]
const CADENCE_FREQUENCY_OPTIONS: PachSelectOption[] = [
  { value: 'weekly', label: 'weekly' },
  { value: 'monthly', label: 'monthly' },
  { value: 'quarterly', label: 'quarterly' },
]
const WEEKDAY_OPTIONS: PachSelectOption[] = [
  { value: '0', label: 'sunday' },
  { value: '1', label: 'monday' },
  { value: '2', label: 'tuesday' },
  { value: '3', label: 'wednesday' },
  { value: '4', label: 'thursday' },
  { value: '5', label: 'friday' },
  { value: '6', label: 'saturday' },
]

export default function Marketing({ canAccessWhatsApp = false }: { canAccessWhatsApp?: boolean }) {
  const z = useZero<Schema, Mutators>()
  const navigate = useNavigate()
  const location = useLocation()

  const [organizations] = useQuery(z.query.organizations.orderBy('name', 'asc'))
  const [contentItems] = useQuery(z.query.mkt_content_items.orderBy('updatedAt', 'desc'))
  const [publications] = useQuery(z.query.mkt_publications.orderBy('name', 'asc'))
  const [senderProfiles] = useQuery(z.query.mkt_sender_profiles.orderBy('name', 'asc'))
  const [audienceMembers] = useQuery(z.query.mkt_audience_members.orderBy('updatedAt', 'desc'))
  const [subscriptions] = useQuery(z.query.mkt_audience_subscriptions.orderBy('updatedAt', 'desc'))
  const [distributionRuns] = useQuery(z.query.mkt_distribution_runs.orderBy('updatedAt', 'desc'))
  const [editorialIdeas] = useQuery(z.query.mkt_editorial_ideas.orderBy('updatedAt', 'desc'))
  const [publicationSlots] = useQuery(z.query.mkt_publication_slots.orderBy('scheduledAt', 'asc'))
  const [contentOutputs] = useQuery(z.query.mkt_content_outputs.orderBy('updatedAt', 'desc'))
  const [promotablePageRecords] = useQuery(z.query.mkt_promotable_pages.orderBy('updatedAt', 'desc'))
  const [keywordIdeas] = useQuery(z.query.mkt_keyword_ideas.orderBy('updatedAt', 'desc'))
  const [ctas] = useQuery(z.query.mkt_ctas.orderBy('updatedAt', 'desc'))
  const [events] = useQuery(z.query.mkt_content_events.orderBy('createdAt', 'desc'))
  const [documents] = useQuery(z.query.documents.orderBy('updatedAt', 'desc'))
  const [issues] = useQuery(z.query.pm_issues.orderBy('updatedAt', 'desc'))
  const [socialChannels] = useQuery(z.query.social_channels.orderBy('displayName', 'asc'))
  const [socialPosts] = useQuery(z.query.social_posts.orderBy('updatedAt', 'desc'))
  const [socialPostTargets] = useQuery(z.query.social_post_targets.orderBy('updatedAt', 'desc'))
  const [adPromotions] = useQuery(z.query.mkt_ad_promotions.orderBy('updatedAt', 'desc'))
  const [adMetricSnapshots] = useQuery(z.query.mkt_ad_metric_snapshots.orderBy('periodEnd', 'desc'))
  const [searchConsoleProperties] = useQuery(z.query.search_console_properties.orderBy('updatedAt', 'desc'))
  const [searchConsoleDimensionSummaries] = useQuery(z.query.search_console_dimension_summaries.orderBy('impressions', 'desc'))
  const [searchConsoleDailySnapshots] = useQuery(z.query.search_console_daily_snapshots.orderBy('dataDate', 'desc'))
  const [searchConsoleUrlInspections] = useQuery(z.query.search_console_url_inspections.orderBy('inspectedAt', 'desc'))
  const [agentRuns] = useQuery(z.query.agent_runs.orderBy('createdAt', 'desc'))
  const [agentRunProgressReports] = useQuery(z.query.agent_run_progress_reports.orderBy('createdAt', 'desc'))

  const section = sectionFromPath(location.pathname)
  const newsletterTab = newsletterTabFromPath(location.pathname)
  const [organizationId, setOrganizationId] = useState('')
  const [selectedContentId, setSelectedContentId] = useState('')
  const [selectedPublicationId, setSelectedPublicationId] = useState('')
  const [message, setMessage] = useState('')
  const [mobileMarketingOpen, setMobileMarketingOpen] = useState(false)

  const organization = organizations.find((entry) => entry.id === organizationId) ?? null
  const orgContentItems = useMemo(() => byOrganization(contentItems, organizationId), [contentItems, organizationId])
  const orgPublications = useMemo(() => byOrganization(publications, organizationId), [publications, organizationId])
  const orgSenderProfiles = useMemo(() => byOrganization(senderProfiles, organizationId), [senderProfiles, organizationId])
  const orgMembers = useMemo(() => byOrganization(audienceMembers, organizationId), [audienceMembers, organizationId])
  const orgSubscriptions = useMemo(() => byOrganization(subscriptions, organizationId), [subscriptions, organizationId])
  const orgRuns = useMemo(() => byOrganization(distributionRuns, organizationId), [distributionRuns, organizationId])
  const orgContentOutputs = useMemo(() => byOrganization(contentOutputs, organizationId), [contentOutputs, organizationId])
  const orgPromotablePageRecords = useMemo(() => byOrganization(promotablePageRecords, organizationId), [organizationId, promotablePageRecords])
  const orgKeywordIdeas = useMemo(() => byOrganization(keywordIdeas, organizationId), [keywordIdeas, organizationId])
  const orgCtas = useMemo(() => byOrganization(ctas, organizationId), [ctas, organizationId])
  const orgEvents = useMemo(() => byOrganization(events, organizationId), [events, organizationId])
  const orgSocialChannels = useMemo(() => byOrganization(socialChannels, organizationId), [organizationId, socialChannels])
  const orgSocialPosts = useMemo(() => byOrganization(socialPosts, organizationId), [organizationId, socialPosts])
  const orgSocialPostTargets = useMemo(() => byOrganization(socialPostTargets, organizationId), [organizationId, socialPostTargets])
  const orgAdPromotions = useMemo(() => byOrganization(adPromotions, organizationId), [adPromotions, organizationId])
  const orgAdMetricSnapshots = useMemo(() => byOrganization(adMetricSnapshots, organizationId), [adMetricSnapshots, organizationId])
  const orgSearchConsoleProperties = useMemo(() => byOrganization(searchConsoleProperties, organizationId), [organizationId, searchConsoleProperties])
  const orgSearchConsoleSummaries = useMemo(() => byOrganization(searchConsoleDimensionSummaries, organizationId), [organizationId, searchConsoleDimensionSummaries])
  const orgSearchConsoleDailySnapshots = useMemo(() => byOrganization(searchConsoleDailySnapshots, organizationId), [organizationId, searchConsoleDailySnapshots])
  const orgSearchConsoleInspections = useMemo(() => byOrganization(searchConsoleUrlInspections, organizationId), [organizationId, searchConsoleUrlInspections])
  const orgKeywordAgentRuns = useMemo(() => keywordGenerationRunsForOrganization(agentRuns, organizationId), [agentRuns, organizationId])
  const orgKeywordAgentRunProgressReports = useMemo(
    () => keywordGenerationProgressReportsForRuns(agentRunProgressReports, orgKeywordAgentRuns),
    [agentRunProgressReports, orgKeywordAgentRuns],
  )
  const selectedContent = orgContentItems.find((item) => item.id === selectedContentId) ?? null
  const selectedPublication = orgPublications.find((item) => item.id === selectedPublicationId) ?? orgPublications[0] ?? null
  const contentItemIdFromUrl = new URLSearchParams(location.search).get('content')
  const broadcastRunIdFromUrl = broadcastRunIdFromPath(location.pathname)
  const publicationIdFromUrl = publicationIdFromPath(location.pathname)
  const publicationDetail = publicationIdFromUrl ? publications.find((entry) => entry.id === publicationIdFromUrl) ?? null : null
  const isBroadcastDetail = section === 'newsletters' && newsletterTab === 'broadcasts' && Boolean(broadcastRunIdFromUrl)
  const isPublicationDetail = section === 'newsletters' && newsletterTab === 'publications' && Boolean(publicationIdFromUrl)
  const isMarketingDetail = isBroadcastDetail || isPublicationDetail
  const visibleSections = useMemo(
    () => SECTIONS.filter((entry) => entry.id !== 'whatsapp' || canAccessWhatsApp),
    [canAccessWhatsApp],
  )

  const organizationOptions = useMemo<PachSelectOption[]>(
    () => organizations.map((entry) => ({ value: entry.id, label: entry.name })),
    [organizations],
  )

  useEffect(() => {
    if (section) return
    navigate('/marketing/newsletters/content', { replace: true })
  }, [navigate, section])

  useEffect(() => {
    setMobileMarketingOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!mobileMarketingOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileMarketingOpen(false)
    }
    const previousBodyOverflow = document.body.style.overflow
    window.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousBodyOverflow
    }
  }, [mobileMarketingOpen])

  useEffect(() => {
    if (organizationId && organizations.some((entry) => entry.id === organizationId)) return
    const ardia = organizations.find((entry) => entry.project === 'ardia')
    setOrganizationId(ardia?.id ?? organizations[0]?.id ?? '')
  }, [organizationId, organizations])

  useEffect(() => {
    if (!selectedContentId || orgContentItems.some((item) => item.id === selectedContentId)) return
    setSelectedContentId('')
  }, [orgContentItems, selectedContentId])

  useEffect(() => {
    if (!contentItemIdFromUrl) return
    const item = contentItems.find((entry) => entry.id === contentItemIdFromUrl)
    if (!item) return
    if (item.organizationId !== organizationId) setOrganizationId(item.organizationId)
    setSelectedContentId(item.id)
  }, [contentItemIdFromUrl, contentItems, organizationId])

  useEffect(() => {
    if (!broadcastRunIdFromUrl) return
    const run = distributionRuns.find((entry) => entry.id === broadcastRunIdFromUrl)
    if (run && run.organizationId !== organizationId) setOrganizationId(run.organizationId)
  }, [broadcastRunIdFromUrl, distributionRuns, organizationId])

  useEffect(() => {
    if (!publicationDetail) return
    if (publicationDetail.organizationId !== organizationId) setOrganizationId(publicationDetail.organizationId)
  }, [organizationId, publicationDetail])

  useEffect(() => {
    if (!selectedPublicationId || orgPublications.some((item) => item.id === selectedPublicationId)) return
    setSelectedPublicationId(orgPublications[0]?.id ?? '')
  }, [orgPublications, selectedPublicationId])

  async function createSenderProfile() {
    if (!organization) return
    const defaultEmail = organization.project === 'ardia' ? 'newsletter@mail.ardia.mx' : 'newsletter@example.com'
    const defaultName = organization.project === 'ardia' ? 'Ardia' : `${organization.name} Newsletter`
    const existing = orgSenderProfiles.find((profile) => profile.provider === 'resend' && profile.fromEmail === defaultEmail)
    if (existing) {
      flash('sender profile already exists')
      return
    }
    const id = crypto.randomUUID()
    try {
      await z.mutate.mkt_sender_profiles.create({
        id,
        organizationId,
        name: defaultName,
        provider: 'resend',
        fromName: defaultName,
        fromEmail: defaultEmail,
        replyToName: 'Axel Pacheco',
        replyToEmail: organization.project === 'ardia' ? 'axel@ardia.mx' : undefined,
        status: 'active',
      })
      flash('sender profile created')
    } catch (error) {
      console.error('Sender profile create failed', error)
      flash('sender profile could not be created')
    }
  }

  function flash(next: string) {
    setMessage(next)
    window.setTimeout(() => setMessage(''), 2800)
  }

  if (!section) return null
  if (section === 'whatsapp' && !canAccessWhatsApp) return <Navigate to="/marketing/newsletters/content" replace />
  const isCalendarSection = section === 'calendar'
  const isWhatsAppSection = section === 'whatsapp'

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 bg-pit text-fg-1">
      <div className="relative flex h-full min-h-0 w-full min-w-0 flex-1">
        <aside
          className={`${
            mobileMarketingOpen
              ? 'fixed inset-0 z-50 flex md:relative md:inset-auto md:z-auto md:w-[200px]'
              : 'hidden md:relative md:z-auto md:flex md:w-[200px]'
          } shrink-0 flex-col overflow-y-auto border-r border-edge/12 bg-pit px-2 py-4 backdrop-blur-sm md:bg-pit/60`}
        >
          <div className="mb-2 flex items-start justify-between gap-2 px-4 pb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
                {isWhatsAppSection ? <MessageCircleMore className="h-3.5 w-3.5 text-accent" /> : <Megaphone className="h-3.5 w-3.5 text-accent" />}
                marketing
              </div>
              <div className="mt-1 font-mono text-lg font-bold lowercase text-fg-1">{isWhatsAppSection ? 'outbound' : 'inbound'}</div>
            </div>
            <button
              type="button"
              onClick={() => setMobileMarketingOpen(false)}
              className="flex h-7 w-7 items-center justify-center text-fg-3 transition hover:text-accent md:hidden"
              aria-label="close marketing menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-4 px-2">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-label text-fg-4">organization</div>
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-fg-4" />
              <PachSelect
                value={organizationId}
                onChange={setOrganizationId}
                options={organizationOptions}
                display={organization?.name ?? 'organization'}
                popupWidth="200"
                triggerClassName="flex h-8 w-full items-center justify-between border border-edge/18 bg-rim pl-9 pr-2 text-left font-mono text-xs text-fg-1 outline-none transition hover:border-edge/32 hover:bg-accent-fill/4 focus-visible:border-accent focus-visible:shadow-glow-xs"
              />
            </div>
          </div>

          <div className="mt-4 space-y-1">
            <div className="px-3 pb-1 font-mono text-[10px] uppercase tracking-label text-fg-4">sections</div>
            {visibleSections.map((entry) => (
              <MarketingSidebarButton
                key={entry.id}
                active={section === entry.id}
                label={entry.label}
                onClick={() => {
                  navigate(marketingSectionPath(entry.id))
                  setMobileMarketingOpen(false)
                }}
              />
            ))}
          </div>
        </aside>

      <main className={`w-full min-w-0 flex-1 ${isCalendarSection || isWhatsAppSection ? 'flex min-h-0 flex-col overflow-hidden' : 'overflow-auto'}`}>
        <div className="flex items-center gap-2 border-b border-edge/12 bg-pit/60 px-3 py-2 backdrop-blur-sm md:hidden">
          <button
            type="button"
            onClick={() => setMobileMarketingOpen(true)}
            className="flex h-8 w-8 items-center justify-center border border-edge/20 bg-pit-3 text-fg-2 transition hover:border-edge/40 hover:text-accent"
            aria-label="open marketing menu"
          >
            <Menu className="h-4 w-4" />
          </button>
          <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-label text-fg-3">
            ◊ marketing · {organization?.name?.toLowerCase() ?? 'organization'} · {section}
          </span>
        </div>

        {message ? (
          <div className="pointer-events-none fixed right-5 top-16 z-50 border border-ok/25 bg-pit px-3 py-2 font-mono text-xs text-ok shadow-terminal-popover">
            {message}
          </div>
        ) : null}

        <div className={isMarketingDetail ? 'min-h-full min-w-0' : isCalendarSection || isWhatsAppSection ? 'flex min-h-0 min-w-0 flex-1 flex-col' : 'min-w-0 px-5 py-5 md:px-8'}>
          {section === 'newsletters' ? (
            <div className={isMarketingDetail ? 'min-h-full min-w-0' : 'min-w-0 space-y-4'}>
              {isPublicationDetail ? (
                <PublicationDetailPage
                  z={z}
                  publication={publicationDetail}
                  organization={publicationDetail ? organizations.find((entry) => entry.id === publicationDetail.organizationId) ?? organization : organization}
                  senderProfiles={publicationDetail ? senderProfiles.filter((profile) => profile.organizationId === publicationDetail.organizationId) : orgSenderProfiles}
                  ctas={publicationDetail ? ctas.filter((cta) => cta.organizationId === publicationDetail.organizationId) : orgCtas}
                  subscriptions={publicationDetail ? subscriptions.filter((subscription) => subscription.organizationId === publicationDetail.organizationId) : orgSubscriptions}
                  ideas={publicationDetail ? editorialIdeas.filter((idea) => idea.publicationId === publicationDetail.id) : []}
                  slots={publicationDetail ? publicationSlots.filter((slot) => slot.publicationId === publicationDetail.id) : []}
                  contentItems={publicationDetail ? contentItems.filter((item) => item.organizationId === publicationDetail.organizationId) : orgContentItems}
                  runs={publicationDetail ? distributionRuns.filter((run) => run.publicationId === publicationDetail.id) : []}
                  documents={documents}
                  issues={issues}
                  onBack={() => navigate('/marketing/newsletters/publications')}
                  onShowSubscribers={(publicationId) => {
                    setSelectedPublicationId(publicationId)
                    navigate('/marketing/newsletters/subscribers')
                  }}
                  onCreateSenderProfile={createSenderProfile}
                  onFlash={flash}
                />
              ) : null}
              {!isMarketingDetail ? (
                <MarketingSubtabMenu
                  tabs={NEWSLETTER_TABS}
                  value={newsletterTab}
                  onChange={(tab) => navigate(`/marketing/newsletters/${tab}`)}
                />
              ) : null}
              {!isPublicationDetail && newsletterTab === 'content' ? (
                <ContentSection
                  z={z}
                  contentItems={orgContentItems}
                  ctas={orgCtas}
                  runs={orgRuns}
                  contentOutputs={orgContentOutputs}
                  socialChannels={orgSocialChannels}
                  socialPosts={orgSocialPosts}
                  socialPostTargets={orgSocialPostTargets}
                  adPromotions={orgAdPromotions}
                  adMetricSnapshots={orgAdMetricSnapshots}
                  selectedContent={selectedContent}
                  onSelectContent={setSelectedContentId}
                  onFlash={flash}
                />
              ) : null}
              {!isPublicationDetail && (newsletterTab === 'publications' || newsletterTab === 'subscribers') ? (
                <NewslettersSection
                  z={z}
                  organization={organization}
                  organizationId={organizationId}
                  publications={orgPublications}
                  selectedPublication={selectedPublication}
                  onSelectPublication={setSelectedPublicationId}
                  senderProfiles={orgSenderProfiles}
                  ctas={orgCtas}
                  members={orgMembers}
                  subscriptions={orgSubscriptions}
                  documents={documents}
                  issues={issues}
                  initialTab={newsletterTab}
                  onCreateSenderProfile={createSenderProfile}
                  onFlash={flash}
                />
              ) : null}
              {!isPublicationDetail && newsletterTab === 'broadcasts' ? (
                <BroadcastsSection
                  z={z}
                  organizationId={organizationId}
                  publications={orgPublications}
                  senderProfiles={orgSenderProfiles}
                  ctas={orgCtas}
                  contentItems={orgContentItems}
                  runs={orgRuns}
                  selectedPublication={selectedPublication}
                  selectedRunId={broadcastRunIdFromUrl}
                  basePath="/marketing/newsletters/broadcasts"
                  onSelectPublication={setSelectedPublicationId}
                  onFlash={flash}
                />
              ) : null}
              {!isPublicationDetail && newsletterTab === 'ctas' ? (
                <CtasSection z={z} organizationId={organizationId} ctas={orgCtas} onFlash={flash} />
              ) : null}
            </div>
          ) : null}
          {section === 'social' ? (
            <SocialSection
              contentItems={orgContentItems}
              contentOutputs={orgContentOutputs}
              socialChannels={orgSocialChannels}
              socialPosts={orgSocialPosts}
              socialPostTargets={orgSocialPostTargets}
            />
          ) : null}
          {section === 'promotions' ? (
            <PromotionsSection
              z={z}
              organizationId={organizationId}
              contentItems={orgContentItems}
              contentOutputs={orgContentOutputs}
              promotablePageRecords={orgPromotablePageRecords}
              keywordIdeas={orgKeywordIdeas}
              adPromotions={orgAdPromotions}
              adMetricSnapshots={orgAdMetricSnapshots}
              searchConsoleSummaries={orgSearchConsoleSummaries}
              keywordAgentRuns={orgKeywordAgentRuns}
              keywordProgressReports={orgKeywordAgentRunProgressReports}
              onFlash={flash}
            />
          ) : null}
          {section === 'whatsapp' ? (
            <Routes>
              <Route path="whatsapp" element={<WhatsAppLayout basePath="/marketing/whatsapp" />}>
                <Route index element={<WhatsAppTemplates />} />
                <Route path="templates" element={<WhatsAppTemplates />} />
                <Route path="campaigns" element={<Campaigns basePath="/marketing/whatsapp/campaigns" />} />
                <Route path="campaigns/:id" element={<CampaignDetail basePath="/marketing/whatsapp/campaigns" />} />
              </Route>
            </Routes>
          ) : null}
          {section === 'calendar' ? (
            <MarketingCalendarSection
              contentItems={orgContentItems}
              runs={orgRuns}
              socialChannels={orgSocialChannels}
              socialPosts={orgSocialPosts}
              socialPostTargets={orgSocialPostTargets}
              adPromotions={orgAdPromotions}
            />
          ) : null}
          {section === 'analytics' ? (
            <AnalyticsSection
              contentItems={orgContentItems}
              audienceMembers={orgMembers}
              events={orgEvents}
              subscriptions={orgSubscriptions}
              ctas={orgCtas}
              socialChannels={orgSocialChannels}
              socialPostTargets={orgSocialPostTargets}
              adMetricSnapshots={orgAdMetricSnapshots}
              searchConsoleProperties={orgSearchConsoleProperties}
              searchConsoleSummaries={orgSearchConsoleSummaries}
              searchConsoleDailySnapshots={orgSearchConsoleDailySnapshots}
              searchConsoleInspections={orgSearchConsoleInspections}
            />
          ) : null}
        </div>
      </main>
      </div>
    </div>
  )
}

function InfoTitle({ label, info }: { label: string; info: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate">{label}</span>
      <span className="group relative inline-flex">
        <Info className="h-3 w-3 text-fg-4 transition group-hover:text-accent" />
        <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden w-60 -translate-x-1/2 border border-edge/25 bg-pit px-3 py-2 text-left font-mono text-[10px] normal-case leading-relaxed tracking-normal text-fg-2 shadow-terminal-popover group-hover:block">
          {info}
        </span>
      </span>
    </span>
  )
}

function MarketingSubtabMenu<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ id: T; label: string }>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex max-w-full gap-1 overflow-x-auto border-b border-edge/12 font-mono text-[10px] uppercase tracking-label md:flex-wrap">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`-mb-px shrink-0 border-b-2 px-3 py-2 transition ${
            value === tab.id
              ? 'border-accent text-accent glow'
              : 'border-transparent text-fg-4 hover:text-fg-1'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

function RowMeta({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 overflow-hidden ${className}`}>
      <div className="font-mono text-[9px] uppercase tracking-label text-fg-4">{label}</div>
      <div className="mt-1 min-w-0 overflow-hidden font-mono text-xs text-fg-2">{children}</div>
    </div>
  )
}

function ContentSection({
  z,
  contentItems,
  ctas,
  runs,
  contentOutputs,
  socialChannels,
  socialPosts,
  socialPostTargets,
  adPromotions,
  adMetricSnapshots,
  selectedContent,
  onSelectContent,
  onFlash,
}: {
  z: ReturnType<typeof useZero<Schema, Mutators>>
  contentItems: ContentItemRow[]
  ctas: CtaRow[]
  runs: DistributionRunRow[]
  contentOutputs: ContentOutputRow[]
  socialChannels: SocialChannelRow[]
  socialPosts: SocialPostRow[]
  socialPostTargets: SocialPostTargetRow[]
  adPromotions: AdPromotionRow[]
  adMetricSnapshots: AdMetricSnapshotRow[]
  selectedContent: ContentItemRow | null
  onSelectContent: (id: string) => void
  onFlash: (message: string) => void
}) {
  const [publishing, setPublishing] = useState(false)
  const [blogScheduleTimezone, setBlogScheduleTimezone] = useState(DEFAULT_MARKETING_TIMEZONE)
  const [blogScheduleDraft, setBlogScheduleDraft] = useState('')
  const [blogScheduleError, setBlogScheduleError] = useState('')
  const [linkedinModalOpen, setLinkedinModalOpen] = useState(false)
  const [linkedinAdModalOpen, setLinkedinAdModalOpen] = useState(false)

  const ctaOptions = useMemo<PachSelectOption[]>(
    () => [{ value: '', label: 'no cta' }, ...ctas.map((cta) => ({ value: cta.id, label: cta.label }))],
    [ctas],
  )
  const selectedBlogRun = useMemo(
    () => selectedContent ? runs.find((run) => run.contentItemId === selectedContent.id && run.channel === 'blog') ?? null : null,
    [runs, selectedContent?.id],
  )

  useEffect(() => {
    const timezone = selectedBlogRun?.scheduledTimezone || DEFAULT_MARKETING_TIMEZONE
    setBlogScheduleTimezone(timezone)
    setBlogScheduleDraft(dateTimeLocalValue(selectedBlogRun?.scheduledAt, timezone))
    setBlogScheduleError('')
  }, [selectedBlogRun?.id, selectedBlogRun?.scheduledAt, selectedBlogRun?.scheduledTimezone])
  const linkedinChannels = useMemo(
    () => socialChannels.filter((channel) => channel.provider === 'linkedin' && channel.status === 'active'),
    [socialChannels],
  )

  async function snapshotContent(item: ContentItemRow) {
    const response = await authFetch(`${config.apiUrl}/marketing/content/${item.id}/snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    await readJson(response)
    onFlash('snapshot refreshed')
  }

  async function publishBlog(item: ContentItemRow) {
    setPublishing(true)
    setBlogScheduleError('')
    try {
      const response = await authFetch(`${config.apiUrl}/marketing/content/${item.id}/publish-blog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      await readJson(response)
      onFlash('blog post published')
    } finally {
      setPublishing(false)
    }
  }

  async function scheduleBlog(item: ContentItemRow) {
    const scheduledAt = dateTimeLocalToTimestamp(blogScheduleDraft, blogScheduleTimezone)
    if (!scheduledAt) {
      setBlogScheduleError('Pick a valid schedule time')
      return
    }
    setBlogScheduleError('')
    try {
      if (selectedBlogRun) {
        const result = z.mutate.mkt_distribution_runs.update({
          id: selectedBlogRun.id,
          name: item.title,
          status: 'scheduled',
          scheduledAt,
          scheduledTimezone: blogScheduleTimezone,
          error: null,
        })
        await result.client
      } else {
        const result = z.mutate.mkt_distribution_runs.create({
          id: crypto.randomUUID(),
          organizationId: item.organizationId,
          contentItemId: item.id,
          channel: 'blog',
          distributionType: 'publish',
          name: item.title,
          status: 'scheduled',
          scheduledAt,
          scheduledTimezone: blogScheduleTimezone,
          recipientFilter: {},
        })
        await result.client
      }
      onFlash('blog post scheduled')
    } catch (error) {
      setBlogScheduleError(error instanceof Error ? error.message : String(error))
    }
  }

  function unscheduleBlog() {
    if (!selectedBlogRun || selectedBlogRun.status === 'published' || selectedBlogRun.status === 'sending') return
    setBlogScheduleDraft('')
    setBlogScheduleError('')
    void z.mutate.mkt_distribution_runs.update({
      id: selectedBlogRun.id,
      status: 'draft',
      scheduledAt: null,
      startedAt: null,
      error: null,
    })
    onFlash('blog schedule cleared')
  }

  async function scheduleLinkedInPromotion(payload: { channelId: string; caption: string; scheduledAt: number; timezone: string }) {
    if (!selectedContent) return
    const output = blogOutputForContent(selectedContent, contentOutputs)
    if (!output || !['published', 'scheduled'].includes(output.status) || !output.publicUrl) {
      onFlash('publish or schedule the blog first')
      return
    }
    if (output.status === 'scheduled' && output.scheduledAt && payload.scheduledAt <= output.scheduledAt) {
      onFlash('linkedin must be scheduled after blog')
      return
    }

    const socialPostId = crypto.randomUUID()
    await z.mutate.social_posts.create({
      id: socialPostId,
      organizationId: selectedContent.organizationId,
      contentItemId: selectedContent.id,
      contentOutputId: output.id,
      title: selectedContent.title,
      caption: payload.caption,
      linkUrl: output.publicUrl,
      status: 'scheduled',
      metadata: {
        source: 'marketing-content',
      },
    })
    await z.mutate.social_post_targets.create({
      id: crypto.randomUUID(),
      organizationId: selectedContent.organizationId,
      socialPostId,
      channelId: payload.channelId,
      status: 'scheduled',
      scheduledAt: payload.scheduledAt,
      scheduledTimezone: payload.timezone,
      metadata: {
        blockedUntilOutputPublished: output.status === 'scheduled',
      },
    })
    setLinkedinModalOpen(false)
    onFlash('linkedin post scheduled')
  }

  async function createLinkedInAdPromotion(payload: LinkedInAdPromotionDraftPayload) {
    if (!selectedContent) return
    const output = blogOutputForContent(selectedContent, contentOutputs)
    if (!output || !output.publicUrl) {
      onFlash('publish or schedule the blog first')
      return
    }
    const post = socialPostsForContent(selectedContent, socialPosts)[0] ?? null
    const target = post ? socialPostTargets.find((entry) => entry.socialPostId === post.id) ?? null : null
    await z.mutate.mkt_ad_promotions.create({
      id: crypto.randomUUID(),
      organizationId: selectedContent.organizationId,
      contentItemId: selectedContent.id,
      contentOutputId: output.id,
      socialPostId: post?.id,
      socialPostTargetId: target?.id,
      provider: 'linkedin',
      adAccountExternalId: payload.adAccountExternalId || undefined,
      landingUrl: output.publicUrl,
      objective: payload.objective,
      status: 'draft',
      budgetMinor: payload.budgetMinor,
      currencyCode: payload.currencyCode,
      startsAt: payload.startsAt,
      endsAt: payload.endsAt,
      targeting: {
        preset: payload.audiencePreset,
      },
      creative: {
        headline: payload.headline,
        primaryText: payload.primaryText,
        ctaLabel: payload.ctaLabel,
      },
      metadata: {
        source: 'marketing-content',
        requiresPublishedPagePost: target?.status !== 'published',
        organicTargetStatus: target?.status ?? null,
      },
    })
    setLinkedinAdModalOpen(false)
    onFlash('linkedin ad draft created')
  }

  return (
    <>
      <Panel title="content">
        <div className="divide-y divide-edge/8">
          {contentItems.map((item) => {
            const blogRun = runs.find((run) => run.contentItemId === item.id && run.channel === 'blog')
            const blogPublished = blogRun?.status === 'published'
            const blogScheduled = blogRun?.status === 'scheduled'
            const blogVisible = blogPublished && isPublicBlogContentItem(item)
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectContent(item.id)}
                className={`grid w-full grid-cols-1 gap-2 py-3 text-left transition hover:bg-accent-fill/4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${
                  selectedContent?.id === item.id ? 'bg-accent-fill/8 text-accent' : 'text-fg-2'
                }`}
              >
                <div className="min-w-0 px-3">
                  <div className="truncate text-sm text-fg-1">{item.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-label text-fg-4">
                    <span>{item.supportedChannels.join(', ')}</span>
                    <span>{formatDate(item.updatedAt)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 px-3 sm:justify-end">
                  <StatusPill kind={statusKind(item.status)}>{item.status}</StatusPill>
                  {blogScheduled ? (
                    <StatusPill kind="warn">{formatScheduledDate(blogRun?.scheduledAt, blogRun?.scheduledTimezone)}</StatusPill>
                  ) : blogVisible ? (
                    <StatusPill>blog published</StatusPill>
                  ) : blogPublished ? (
                    <StatusPill kind="warn">blog hidden</StatusPill>
                  ) : (
                    <span className="font-mono text-xs text-fg-4">no blog run</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
        {contentItems.length === 0 ? <EmptyState label="no content items" /> : null}
      </Panel>

      {selectedContent ? (
        <MarketingAppFrame title={selectedContent.title} eyebrow="content item" onClose={() => onSelectContent('')}>
          <div className="space-y-3">
            {(() => {
              const output = blogOutputForContent(selectedContent, contentOutputs)
              const linkedInTargets = socialTargetsForContent(selectedContent, socialPosts, socialPostTargets)
              const promotions = adPromotionsForContent(selectedContent, adPromotions)
              const paidMetrics = sumAdMetricSnapshots(adMetricSnapshotsForPromotions(promotions, adMetricSnapshots))
              return (
                <div className="grid gap-2 border border-edge/12 bg-rim px-3 py-3 md:grid-cols-3">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">blog output</div>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusPill kind={output?.status === 'published' ? 'ok' : output?.status === 'scheduled' ? 'info' : 'idle'}>
                        {output?.status ?? 'missing'}
                      </StatusPill>
                      {output?.publicUrl ? (
                        <a href={output.publicUrl} target="_blank" rel="noreferrer" className="truncate font-mono text-[11px] text-accent hover:text-fg-1">
                          open
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">linkedin post</div>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusPill kind={linkedInTargets.length ? 'info' : 'idle'}>
                        {linkedInTargets.length ? `${linkedInTargets.length} target${linkedInTargets.length === 1 ? '' : 's'}` : 'not scheduled'}
                      </StatusPill>
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">linkedin ads</div>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusPill kind={promotions.length ? 'info' : 'idle'}>
                        {promotions.length ? `${promotions.length} draft${promotions.length === 1 ? '' : 's'}` : 'no draft'}
                      </StatusPill>
                      {paidMetrics.impressions ? (
                        <span className="font-mono text-[11px] text-fg-3">{formatCompactNumber(paidMetrics.impressions)} impressions</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })()}

            <CommitInput
              label="title"
              value={selectedContent.title}
              onCommit={(title) => z.mutate.mkt_content_items.update({ id: selectedContent.id, title })}
            />
            <CommitInput
              label="slug"
              value={selectedContent.slug}
              onCommit={(slug) => z.mutate.mkt_content_items.update({ id: selectedContent.id, slug: slugify(slug) })}
            />
            <CommitTextarea
              label="excerpt"
              value={selectedContent.excerpt ?? ''}
              onCommit={(excerpt) => z.mutate.mkt_content_items.update({ id: selectedContent.id, excerpt: excerpt || undefined })}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>status</FieldLabel>
                <PachSelect
                  value={selectedContent.status}
                  onChange={(status) => void z.mutate.mkt_content_items.update({ id: selectedContent.id, status })}
                  options={['draft', 'ready', 'archived'].map((status) => ({ value: status, label: status }))}
                  display={selectedContent.status}
                />
              </div>
              <div>
                <FieldLabel>primary cta</FieldLabel>
                <PachSelect
                  value={selectedContent.primaryCtaId ?? ''}
                  onChange={(primaryCtaId) => void z.mutate.mkt_content_items.update({ id: selectedContent.id, primaryCtaId: primaryCtaId || null })}
                  options={ctaOptions}
                  display={ctaOptions.find((entry) => entry.value === (selectedContent.primaryCtaId ?? ''))?.label ?? 'cta'}
                />
              </div>
            </div>
            <div>
              <FieldLabel>supported channels</FieldLabel>
              <ChannelToggles
                value={selectedContent.supportedChannels}
                onChange={(supportedChannels) => void z.mutate.mkt_content_items.update({ id: selectedContent.id, supportedChannels })}
              />
            </div>
            <div className="border-t border-edge/12 pt-4">
              <FieldLabel>blog schedule</FieldLabel>
              <div className="grid gap-2">
                <TermInput
                  type="datetime-local"
                  value={blogScheduleDraft}
                  onChange={(event) => {
                    setBlogScheduleDraft(event.target.value)
                    if (blogScheduleError) setBlogScheduleError('')
                  }}
                />
                <PachSelect
                  value={blogScheduleTimezone}
                  onChange={setBlogScheduleTimezone}
                  options={MARKETING_TIMEZONE_OPTIONS}
                  display={timezoneLabel(blogScheduleTimezone)}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  onClick={() => void scheduleBlog(selectedContent)}
                  disabled={!selectedContent.supportedChannels.includes('blog') || selectedBlogRun?.status === 'published' || selectedBlogRun?.status === 'sending'}
                >
                  schedule
                </Button>
                <Button
                  onClick={unscheduleBlog}
                  disabled={!selectedBlogRun?.scheduledAt || selectedBlogRun?.status === 'published' || selectedBlogRun?.status === 'sending'}
                >
                  unschedule
                </Button>
              </div>
              <div className={`mt-2 font-mono text-[10px] uppercase tracking-label ${blogScheduleError ? 'text-fail' : 'text-fg-4'}`}>
                {blogScheduleError || (selectedBlogRun?.scheduledAt ? `queued ${formatScheduledDate(selectedBlogRun.scheduledAt, selectedBlogRun.scheduledTimezone)}` : 'not scheduled')}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void snapshotContent(selectedContent)} disabled={!selectedContent.sourceDocumentId}>
                snapshot
              </Button>
              <Button kind="primary" icon={<Rss className="h-3.5 w-3.5" />} onClick={() => void publishBlog(selectedContent)} disabled={publishing || !selectedContent.supportedChannels.includes('blog')}>
                publish blog
              </Button>
              <Button
                icon={<Linkedin className="h-3.5 w-3.5" />}
                onClick={() => setLinkedinModalOpen(true)}
                disabled={!blogOutputForContent(selectedContent, contentOutputs)?.publicUrl || linkedinChannels.length === 0}
              >
                schedule linkedin
              </Button>
              <Button
                icon={<Megaphone className="h-3.5 w-3.5" />}
                onClick={() => setLinkedinAdModalOpen(true)}
                disabled={!blogOutputForContent(selectedContent, contentOutputs)?.publicUrl}
              >
                ad draft
              </Button>
            </div>
            {(() => {
              const promotions = adPromotionsForContent(selectedContent, adPromotions)
              if (!promotions.length) return null
              return (
                <div className="border border-edge/12 bg-rim px-3 py-3">
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-label text-fg-4">linkedin ad promotion drafts</div>
                  <div className="divide-y divide-edge/10">
                    {promotions.map((promotion) => {
                      const metrics = sumAdMetricSnapshots(adMetricSnapshotsForPromotions([promotion], adMetricSnapshots))
                      return (
                        <div key={promotion.id} className="grid gap-2 py-2 font-mono text-xs text-fg-2 md:grid-cols-[1fr_auto_auto] md:items-center">
                          <div className="min-w-0">
                            <div className="truncate text-fg-1">{adPromotionHeadline(promotion) || selectedContent.title}</div>
                            <div className="mt-0.5 truncate text-[10px] uppercase tracking-label text-fg-4">
                              {promotion.objective.replace(/_/g, ' ')} · {promotion.adAccountExternalId || 'ad account pending'}
                            </div>
                          </div>
                          <StatusPill kind={statusKind(promotion.status)}>{promotion.status}</StatusPill>
                          <div className="text-right text-[11px] text-fg-3">
                            {promotion.budgetMinor ? `${formatMoneyMinor(promotion.budgetMinor, promotion.currencyCode)} budget` : 'budget pending'}
                            {metrics.impressions ? ` · ${formatCompactNumber(metrics.impressions)} views` : ''}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
            <div className="border border-edge/12 bg-rim px-3 py-2 font-mono text-[11px] text-fg-3">
              /public/organizations/:project/marketing/posts/{selectedContent.slug}
            </div>
          </div>
        </MarketingAppFrame>
      ) : null}

      {selectedContent && linkedinModalOpen ? (
        <LinkedInPromotionModal
          item={selectedContent}
          output={blogOutputForContent(selectedContent, contentOutputs)}
          channels={linkedinChannels}
          onClose={() => setLinkedinModalOpen(false)}
          onSubmit={(payload) => void scheduleLinkedInPromotion(payload)}
        />
      ) : null}

      {selectedContent && linkedinAdModalOpen ? (
        <LinkedInAdPromotionModal
          item={selectedContent}
          output={blogOutputForContent(selectedContent, contentOutputs)}
          hasLinkedInPost={socialTargetsForContent(selectedContent, socialPosts, socialPostTargets).length > 0}
          onClose={() => setLinkedinAdModalOpen(false)}
          onSubmit={(payload) => void createLinkedInAdPromotion(payload)}
        />
      ) : null}
    </>
  )
}

function LinkedInPromotionModal({
  item,
  output,
  channels,
  onClose,
  onSubmit,
}: {
  item: ContentItemRow
  output: ContentOutputRow | null
  channels: SocialChannelRow[]
  onClose: () => void
  onSubmit: (payload: { channelId: string; caption: string; scheduledAt: number; timezone: string }) => void
}) {
  const [channelId, setChannelId] = useState(channels[0]?.id ?? '')
  const [caption, setCaption] = useState(() => defaultLinkedInCaption(item))
  const [scheduledAt, setScheduledAt] = useState(() => toDatetimeLocalValue(defaultSocialScheduleDate(output)))
  const [timezone, setTimezone] = useState(DEFAULT_MARKETING_TIMEZONE)
  const scheduledAtMs = Date.parse(scheduledAt)
  const outputReady = output?.status === 'published' || output?.status === 'scheduled'
  const afterOutput = !output?.scheduledAt || Number.isNaN(scheduledAtMs) || scheduledAtMs > output.scheduledAt
  const canSubmit = Boolean(channelId && caption.trim() && outputReady && output?.publicUrl && !Number.isNaN(scheduledAtMs) && afterOutput)

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-overlay/70 px-4 pt-[8vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl border border-edge/20 bg-pit-2 shadow-terminal-overlay"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-edge/12 px-5 py-3">
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="inline-flex items-center gap-1.5 border border-edge/25 bg-accent-fill/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-accent">
              marketing
            </span>
            <span className="text-fg-4">›</span>
            <span className="text-fg-2 lowercase">linkedin</span>
          </div>
          <button
            onClick={onClose}
            className="font-mono text-xs uppercase tracking-label text-fg-4 transition hover:text-fg-1"
            title="close"
          >
            [esc]
          </button>
        </div>

        <div className="border-b border-edge/12 px-5 py-4">
          <h2 className="font-mono text-2xl font-bold lowercase text-fg-1">schedule promotion</h2>
        </div>

        <div className="grid gap-4 px-5 py-5 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            <div>
              <FieldLabel>post to</FieldLabel>
              <PachSelect
                value={channelId}
                onChange={setChannelId}
                options={channels.map((channel) => ({ value: channel.id, label: channel.displayName }))}
                display={channels.find((channel) => channel.id === channelId)?.displayName ?? 'linkedin channel'}
              />
            </div>

            <label className="block">
              <FieldLabel>caption</FieldLabel>
              <TermTextarea rows={7} value={caption} onChange={(event) => setCaption(event.target.value)} />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <FieldLabel>date</FieldLabel>
                <TermInput type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
              </label>
              <div>
                <FieldLabel>timezone</FieldLabel>
                <PachSelect
                  value={timezone}
                  onChange={setTimezone}
                  options={MARKETING_TIMEZONE_OPTIONS}
                  display={MARKETING_TIMEZONE_OPTIONS.find((entry) => entry.value === timezone)?.label ?? 'timezone'}
                />
              </div>
            </div>

            {!afterOutput ? (
              <div className="border border-amber/25 bg-amber/5 px-3 py-2 font-mono text-xs text-amber">
                linkedin must run after the blog output
              </div>
            ) : null}
          </div>

          <div className="border border-edge/12 bg-rim p-3">
            <div className="flex items-center gap-2 font-mono text-xs text-fg-1">
              <Linkedin className="h-4 w-4 text-accent" />
              {channels.find((channel) => channel.id === channelId)?.displayName ?? 'LinkedIn'}
            </div>
            <div className="mt-3 whitespace-pre-wrap font-sans text-sm leading-5 text-fg-2">{caption}</div>
            <div className="mt-4 overflow-hidden border border-edge/12 bg-pit">
              <div className="aspect-[1.91/1] bg-accent-fill/8" />
              <div className="space-y-1 px-3 py-3">
                <div className="line-clamp-2 font-mono text-xs text-fg-1">{item.title}</div>
                <div className="line-clamp-2 text-xs text-fg-3">{item.excerpt || firstParagraphText(item.body) || '-'}</div>
                <div className="truncate font-mono text-[10px] uppercase tracking-label text-fg-4">{output?.publicUrl ?? 'blog output'}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-edge/12 px-5 py-3">
          <Button onClick={onClose}>cancel</Button>
          <Button
            kind="primary"
            icon={<Linkedin className="h-3.5 w-3.5" />}
            onClick={() => onSubmit({ channelId, caption: caption.trim(), scheduledAt: scheduledAtMs, timezone })}
            disabled={!canSubmit}
          >
            schedule
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function LinkedInAdPromotionModal({
  item,
  output,
  hasLinkedInPost,
  onClose,
  onSubmit,
}: {
  item: ContentItemRow
  output: ContentOutputRow | null
  hasLinkedInPost: boolean
  onClose: () => void
  onSubmit: (payload: LinkedInAdPromotionDraftPayload) => void
}) {
  const startDate = defaultSocialScheduleDate(output)
  const endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000)
  const [adAccountExternalId, setAdAccountExternalId] = useState('')
  const [objective, setObjective] = useState('website_visits')
  const [audiencePreset, setAudiencePreset] = useState('real_estate_developers_mx')
  const [budgetMajor, setBudgetMajor] = useState('1000')
  const [currencyCode, setCurrencyCode] = useState('MXN')
  const [startsAt, setStartsAt] = useState(() => toDatetimeLocalValue(startDate))
  const [endsAt, setEndsAt] = useState(() => toDatetimeLocalValue(endDate))
  const [headline, setHeadline] = useState(item.title)
  const [primaryText, setPrimaryText] = useState(() => defaultLinkedInCaption(item))
  const [ctaLabel, setCtaLabel] = useState('LEARN_MORE')

  const startsAtMs = startsAt ? Date.parse(startsAt) : undefined
  const endsAtMs = endsAt ? Date.parse(endsAt) : undefined
  const budgetNumber = budgetMajor.trim() ? Number(budgetMajor) : undefined
  const budgetMinor = typeof budgetNumber === 'number' && Number.isFinite(budgetNumber) && budgetNumber > 0
    ? Math.round(budgetNumber * 100)
    : undefined
  const invalidBudget = Boolean(budgetMajor.trim()) && !budgetMinor
  const invalidDates = (startsAt && (!startsAtMs || Number.isNaN(startsAtMs)))
    || (endsAt && (!endsAtMs || Number.isNaN(endsAtMs)))
    || (startsAtMs && endsAtMs ? endsAtMs <= startsAtMs : false)
  const canSubmit = Boolean(output?.publicUrl && headline.trim() && primaryText.trim() && !invalidBudget && !invalidDates)

  const objectiveOptions: PachSelectOption[] = [
    { value: 'website_visits', label: 'website visits' },
    { value: 'lead_generation', label: 'lead generation' },
    { value: 'brand_awareness', label: 'brand awareness' },
  ]
  const audienceOptions: PachSelectOption[] = [
    { value: 'real_estate_developers_mx', label: 'real estate developers mx' },
    { value: 'founders_and_operators_latam', label: 'founders/operators latam' },
    { value: 'remarketing', label: 'remarketing' },
  ]
  const currencyOptions: PachSelectOption[] = [
    { value: 'MXN', label: 'MXN' },
    { value: 'USD', label: 'USD' },
  ]
  const ctaOptions: PachSelectOption[] = [
    { value: 'LEARN_MORE', label: 'learn more' },
    { value: 'SIGN_UP', label: 'sign up' },
    { value: 'CONTACT_US', label: 'contact us' },
  ]

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-overlay/70 px-4 pt-[5vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl border border-edge/20 bg-pit-2 shadow-terminal-overlay"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-edge/12 px-5 py-3">
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="inline-flex items-center gap-1.5 border border-edge/25 bg-accent-fill/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-accent">
              marketing
            </span>
            <span className="text-fg-4">›</span>
            <span className="text-fg-2 lowercase">linkedin ads</span>
          </div>
          <button
            onClick={onClose}
            className="font-mono text-xs uppercase tracking-label text-fg-4 transition hover:text-fg-1"
            title="close"
          >
            [esc]
          </button>
        </div>

        <div className="border-b border-edge/12 px-5 py-4">
          <h2 className="font-mono text-2xl font-bold lowercase text-fg-1">create ad draft</h2>
        </div>

        <div className="grid max-h-[72vh] gap-4 overflow-y-auto px-5 py-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            {!hasLinkedInPost ? (
              <div className="border border-amber/25 bg-amber/5 px-3 py-2 font-mono text-xs text-amber">
                this draft can be prepared now, but activation should wait until the linkedin page post exists
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <FieldLabel>ad account id</FieldLabel>
                <TermInput
                  value={adAccountExternalId}
                  onChange={(event) => setAdAccountExternalId(event.target.value)}
                  placeholder="optional until ad account sync exists"
                />
              </label>
              <div>
                <FieldLabel>objective</FieldLabel>
                <PachSelect
                  value={objective}
                  onChange={setObjective}
                  options={objectiveOptions}
                  display={objectiveOptions.find((entry) => entry.value === objective)?.label ?? 'objective'}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="md:col-span-2">
                <FieldLabel>audience</FieldLabel>
                <PachSelect
                  value={audiencePreset}
                  onChange={setAudiencePreset}
                  options={audienceOptions}
                  display={audienceOptions.find((entry) => entry.value === audiencePreset)?.label ?? 'audience'}
                />
              </div>
              <div>
                <FieldLabel>currency</FieldLabel>
                <PachSelect
                  value={currencyCode}
                  onChange={setCurrencyCode}
                  options={currencyOptions}
                  display={currencyCode}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="block">
                <FieldLabel>budget</FieldLabel>
                <TermInput type="number" min="0" step="100" value={budgetMajor} onChange={(event) => setBudgetMajor(event.target.value)} />
              </label>
              <label className="block">
                <FieldLabel>starts</FieldLabel>
                <TermInput type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
              </label>
              <label className="block">
                <FieldLabel>ends</FieldLabel>
                <TermInput type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
              </label>
            </div>

            <label className="block">
              <FieldLabel>headline</FieldLabel>
              <TermInput value={headline} onChange={(event) => setHeadline(event.target.value)} />
            </label>

            <label className="block">
              <FieldLabel>primary text</FieldLabel>
              <TermTextarea rows={6} value={primaryText} onChange={(event) => setPrimaryText(event.target.value)} />
            </label>

            <div>
              <FieldLabel>cta</FieldLabel>
              <PachSelect
                value={ctaLabel}
                onChange={setCtaLabel}
                options={ctaOptions}
                display={ctaOptions.find((entry) => entry.value === ctaLabel)?.label ?? 'cta'}
              />
            </div>

            {invalidBudget || invalidDates ? (
              <div className="border border-fail/25 bg-fail/5 px-3 py-2 font-mono text-xs text-fail">
                {invalidBudget ? 'budget must be a positive amount' : 'end date must be after start date'}
              </div>
            ) : null}
          </div>

          <div className="border border-edge/12 bg-rim p-3">
            <div className="flex items-center gap-2 font-mono text-xs text-fg-1">
              <Megaphone className="h-4 w-4 text-accent" />
              LinkedIn sponsored post
            </div>
            <div className="mt-3 whitespace-pre-wrap font-sans text-sm leading-5 text-fg-2">{primaryText}</div>
            <div className="mt-4 overflow-hidden border border-edge/12 bg-pit">
              <div className="aspect-[1.91/1] bg-accent-fill/8" />
              <div className="space-y-1 px-3 py-3">
                <div className="line-clamp-2 font-mono text-xs text-fg-1">{headline || item.title}</div>
                <div className="line-clamp-2 text-xs text-fg-3">{item.excerpt || firstParagraphText(item.body) || '-'}</div>
                <div className="truncate font-mono text-[10px] uppercase tracking-label text-fg-4">{output?.publicUrl ?? 'blog output'}</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
              <div className="border border-edge/12 px-2 py-1.5">{objective.replace(/_/g, ' ')}</div>
              <div className="border border-edge/12 px-2 py-1.5">{budgetMinor ? formatMoneyMinor(budgetMinor, currencyCode) : 'no budget'}</div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-edge/12 px-5 py-3">
          <Button onClick={onClose}>cancel</Button>
          <Button
            kind="primary"
            icon={<Megaphone className="h-3.5 w-3.5" />}
            onClick={() => onSubmit({
              adAccountExternalId: adAccountExternalId.trim(),
              objective,
              audiencePreset,
              budgetMinor,
              currencyCode,
              startsAt: startsAtMs,
              endsAt: endsAtMs,
              headline: headline.trim(),
              primaryText: primaryText.trim(),
              ctaLabel,
            })}
            disabled={!canSubmit}
          >
            create draft
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

type PromotionWorkspaceTab = 'pages' | 'drafts' | 'learning'

type PromotablePageRow = {
  page: PromotablePageRecord
  item: ContentItemRow | null
  output: ContentOutputRow | null
  title: string
  url: string
  keywordIdeas: KeywordIdeaRow[]
  searchSummaries: SearchConsoleDimensionSummaryRow[]
  searchTotals: { clicks: number; impressions: number }
  topQuery: string
  promotions: AdPromotionRow[]
  googlePromotion: AdPromotionRow | null
  paidTotals: ReturnType<typeof sumAdMetricSnapshots>
}

type KeywordGenerationPageRunState = {
  status: 'queued' | 'running' | 'needs_human' | 'done' | 'failed' | 'canceled'
  label: string
  detail: string
  run: AgentRunRow | null
  progress: AgentRunProgressReportRow | null
}

type PromotablePageFormPayload = {
  title: string
  url: string
  canonicalUrl: string
  status: string
}

type SitemapImportResult = {
  found: number
  created: number
  updated: number
  skipped: number
}

function PromotionsSection({
  z,
  organizationId,
  contentItems,
  contentOutputs,
  promotablePageRecords,
  keywordIdeas,
  adPromotions,
  adMetricSnapshots,
  searchConsoleSummaries,
  keywordAgentRuns,
  keywordProgressReports,
  onFlash,
}: {
  z: ReturnType<typeof useZero<Schema, Mutators>>
  organizationId: string
  contentItems: ContentItemRow[]
  contentOutputs: ContentOutputRow[]
  promotablePageRecords: PromotablePageRecord[]
  keywordIdeas: KeywordIdeaRow[]
  adPromotions: AdPromotionRow[]
  adMetricSnapshots: AdMetricSnapshotRow[]
  searchConsoleSummaries: SearchConsoleDimensionSummaryRow[]
  keywordAgentRuns: AgentRunRow[]
  keywordProgressReports: AgentRunProgressReportRow[]
  onFlash: (message: string) => void
}) {
  const [tab, setTab] = useState<PromotionWorkspaceTab>('pages')
  const [promoteTarget, setPromoteTarget] = useState<{ page: PromotablePageRow; promotion: AdPromotionRow | null } | null>(null)
  const [pageEditor, setPageEditor] = useState<{ page: PromotablePageRecord | null } | null>(null)
  const [sitemapImporterOpen, setSitemapImporterOpen] = useState(false)
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([])
  const [keywordRunStatus, setKeywordRunStatus] = useState<'idle' | 'loading' | 'success'>('idle')
  const pages = useMemo(
    () => promotablePages(promotablePageRecords, contentItems, contentOutputs, keywordIdeas, adPromotions, adMetricSnapshots, searchConsoleSummaries),
    [adMetricSnapshots, adPromotions, contentItems, contentOutputs, keywordIdeas, promotablePageRecords, searchConsoleSummaries],
  )
  const googlePromotions = useMemo(() => adPromotions.filter((promotion) => promotion.provider === 'google'), [adPromotions])
  const googleMetrics = useMemo(() => adMetricSnapshotsForPromotions(googlePromotions, adMetricSnapshots), [adMetricSnapshots, googlePromotions])
  const googleTotals = sumAdMetricSnapshots(googleMetrics)
  const draftPromotions = googlePromotions.filter((promotion) => promotion.status === 'draft' || promotion.status === 'ready')
  const activePromotions = googlePromotions.filter((promotion) => ['active', 'scheduled', 'paused'].includes(promotion.status))
  const unpromotedOpportunityPages = pages.filter((page) => !page.googlePromotion && page.searchTotals.impressions > 0)
  const incompleteDrafts = draftPromotions.filter((promotion) => !promotion.budgetMinor || !promotion.adAccountExternalId)
  const selectedPages = pages.filter((page) => selectedPageIds.includes(page.page.id))
  const allPagesSelected = pages.length > 0 && selectedPageIds.length === pages.length
  const keywordRunStateByPageId = useMemo(
    () => keywordGenerationRunStateByPage(pages, keywordAgentRuns, keywordProgressReports),
    [keywordAgentRuns, keywordProgressReports, pages],
  )

  useEffect(() => {
    setSelectedPageIds((ids) => ids.filter((id) => pages.some((page) => page.page.id === id)))
  }, [pages])

  async function saveGoogleDraft(page: PromotablePageRow, promotion: AdPromotionRow | null, payload: GoogleSearchPromotionDraftPayload) {
    const values = {
      organizationId: page.page.organizationId,
      promotablePageId: page.page.id,
      contentItemId: page.item?.id,
      contentOutputId: page.output?.id,
      provider: 'google',
      adAccountExternalId: payload.adAccountExternalId || undefined,
      landingUrl: page.url,
      objective: payload.objective,
      status: 'draft',
      budgetMinor: payload.budgetMinor,
      currencyCode: payload.currencyCode,
      startsAt: payload.startsAt,
      endsAt: payload.endsAt,
      targeting: {
        campaignType: 'search',
        keywords: payload.keywords,
        matchType: 'phrase',
        geo: payload.geo,
        language: payload.language,
      },
      creative: {
        finalUrl: page.url,
        headlines: payload.headlines,
        descriptions: payload.descriptions,
      },
      metadata: {
        source: 'promotions',
        publishMode: 'draft_only',
        providerAction: 'google_search_campaign_draft',
        budgetCadence: 'daily',
      },
    }

    if (promotion) {
      await z.mutate.mkt_ad_promotions.update({ id: promotion.id, ...values })
      onFlash('google draft updated')
    } else {
      await z.mutate.mkt_ad_promotions.create({ id: crypto.randomUUID(), ...values })
      onFlash('google draft created')
    }
    setPromoteTarget(null)
    setTab('drafts')
  }

  async function savePromotablePage(page: PromotablePageRecord | null, payload: PromotablePageFormPayload) {
    const url = normalizePromotablePageUrl(payload.url)
    const values = {
      organizationId,
      title: payload.title.trim() || pageTitleFromUrl(url),
      url,
      canonicalUrl: payload.canonicalUrl.trim() ? normalizePromotablePageUrl(payload.canonicalUrl) : url,
      status: payload.status,
      source: page?.source ?? 'manual',
      metadata: { ...(page?.metadata ?? {}), updatedFrom: 'promotions' },
    }
    if (page) {
      await z.mutate.mkt_promotable_pages.update({ id: page.id, ...values })
      onFlash('page updated')
    } else {
      await z.mutate.mkt_promotable_pages.create({ id: crypto.randomUUID(), ...values })
      onFlash('page added')
    }
    setPageEditor(null)
  }

  async function queueKeywordGeneration(targetPages: PromotablePageRow[]) {
    if (targetPages.length === 0 || keywordRunStatus === 'loading') return
    setKeywordRunStatus('loading')
    try {
      const response = await authFetch(`${config.apiUrl}/marketing/promotions/keyword-runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, pageIds: targetPages.map((page) => page.page.id) }),
      })
      const json = await readJson(response) as { queuedPages?: number }
      setKeywordRunStatus('success')
      onFlash(`keyword run queued · ${json.queuedPages ?? targetPages.length} page${targetPages.length === 1 ? '' : 's'}`)
      window.setTimeout(() => {
        setSelectedPageIds([])
        setKeywordRunStatus('idle')
      }, 1400)
    } catch (err) {
      setKeywordRunStatus('idle')
      onFlash(err instanceof Error ? err.message : 'could not queue keyword run')
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="pages" value={pages.length} />
        <Metric label="google drafts" value={draftPromotions.length} />
        <Metric label="active" value={activePromotions.length} />
        <Metric label="spend" value={formatMoneyMinor(googleTotals.spendMinor, googleMetrics[0]?.currencyCode ?? 'MXN')} />
        <Metric label="clicks" value={formatCompactNumber(googleTotals.clicks)} />
        <Metric label="leads" value={formatCompactNumber(googleTotals.leads)} />
      </div>

      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-edge/12">
          <div className="flex flex-wrap">
            <MarketingTabButton active={tab === 'pages'} onClick={() => setTab('pages')}>
              pages · {pages.length}
            </MarketingTabButton>
            <MarketingTabButton active={tab === 'drafts'} onClick={() => setTab('drafts')}>
              drafts · {draftPromotions.length}
            </MarketingTabButton>
            <MarketingTabButton active={tab === 'learning'} onClick={() => setTab('learning')}>
              learning · {unpromotedOpportunityPages.length + incompleteDrafts.length}
            </MarketingTabButton>
          </div>
          <div className="flex flex-wrap items-center gap-2 pb-2">
            {tab === 'pages' ? (
              <>
                <Button icon={<Rss className="h-3.5 w-3.5" />} onClick={() => setSitemapImporterOpen(true)}>
                  import sitemap
                </Button>
                <Button icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setPageEditor({ page: null })}>
                  add page
                </Button>
              </>
            ) : null}
            <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">paid distribution</div>
          </div>
        </div>

        <div className="pt-4">
          {tab === 'pages' ? (
            <PromotablePagesTable
              pages={pages}
              selectedPageIds={selectedPageIds}
              allPagesSelected={allPagesSelected}
              keywordRunStateByPageId={keywordRunStateByPageId}
              onToggleAll={() => setSelectedPageIds(allPagesSelected ? [] : pages.map((page) => page.page.id))}
              onTogglePage={(pageId) => setSelectedPageIds((ids) => (
                ids.includes(pageId) ? ids.filter((id) => id !== pageId) : [...ids, pageId]
              ))}
              onEdit={(page) => setPageEditor({ page: page.page })}
              onPromote={(page) => setPromoteTarget({ page, promotion: page.googlePromotion })}
            />
          ) : null}
          {tab === 'drafts' ? (
            <GoogleDraftsTable
              promotions={draftPromotions}
              pages={pages}
              metrics={adMetricSnapshots}
              onEdit={(page, promotion) => setPromoteTarget({ page, promotion })}
            />
          ) : null}
          {tab === 'learning' ? (
            <PromotionsLearningPanel
              unpromotedPages={unpromotedOpportunityPages}
              incompleteDrafts={incompleteDrafts}
              pages={pages}
              onPromote={(page) => setPromoteTarget({ page, promotion: page.googlePromotion })}
            />
          ) : null}
        </div>
      </Panel>

      {promoteTarget ? (
        <GoogleSearchPromotionDrawer
          page={promoteTarget.page}
          promotion={promoteTarget.promotion}
          onClose={() => setPromoteTarget(null)}
          keywordRunStatus={keywordRunStatus}
          onGenerateKeywords={() => void queueKeywordGeneration([promoteTarget.page])}
          onSubmit={(payload) => void saveGoogleDraft(promoteTarget.page, promoteTarget.promotion, payload)}
        />
      ) : null}
      {pageEditor ? (
        <PromotablePageDrawer
          page={pageEditor.page}
          onClose={() => setPageEditor(null)}
          onSubmit={(payload) => savePromotablePage(pageEditor.page, payload)}
        />
      ) : null}
      {sitemapImporterOpen ? (
        <SitemapImportDrawer
          organizationId={organizationId}
          onClose={() => setSitemapImporterOpen(false)}
          onImported={(result) => {
            onFlash(`sitemap imported · ${result.created} new · ${result.updated} seen`)
            setSitemapImporterOpen(false)
          }}
        />
      ) : null}
      {tab === 'pages' && selectedPages.length > 0 ? (
        <SelectionActionTray
          count={selectedPages.length}
          status={keywordRunStatus}
          onClear={() => setSelectedPageIds([])}
          onGenerate={() => void queueKeywordGeneration(selectedPages)}
        />
      ) : null}
    </div>
  )
}

function PromotablePagesTable({
  pages,
  selectedPageIds,
  allPagesSelected,
  keywordRunStateByPageId,
  onToggleAll,
  onTogglePage,
  onEdit,
  onPromote,
}: {
  pages: PromotablePageRow[]
  selectedPageIds: string[]
  allPagesSelected: boolean
  keywordRunStateByPageId: Map<string, KeywordGenerationPageRunState>
  onToggleAll: () => void
  onTogglePage: (pageId: string) => void
  onEdit: (page: PromotablePageRow) => void
  onPromote: (page: PromotablePageRow) => void
}) {
  if (pages.length === 0) return <EmptyState label="no published pages" />
  return (
    <div className="overflow-auto border border-edge/12">
      <table className="w-full min-w-[1120px] text-left font-mono text-xs">
        <thead className="bg-rim text-[10px] uppercase tracking-label text-fg-4">
          <tr className="border-b border-edge/12">
            <th className="w-10 px-3 py-2 font-normal">
              <SelectionMark
                selected={allPagesSelected}
                label="select all pages"
                onClick={onToggleAll}
              />
            </th>
            <th className="px-3 py-2 font-normal">page</th>
            <th className="px-3 py-2 text-right font-normal">organic</th>
            <th className="px-3 py-2 font-normal">ideas</th>
            <th className="px-3 py-2 text-right font-normal">paid</th>
            <th className="px-3 py-2 font-normal">status</th>
            <th className="px-3 py-2 text-right font-normal">action</th>
          </tr>
        </thead>
        <tbody>
          {pages.map((page) => {
            const positiveKeywords = usableKeywordIdeas(page).length
            const negativeKeywords = page.keywordIdeas.filter((idea) => idea.negative && idea.status !== 'rejected').length
            const selected = selectedPageIds.includes(page.page.id)
            const keywordRunState = keywordRunStateByPageId.get(page.page.id)
            return (
              <tr
                key={page.page.id}
                onClick={() => onTogglePage(page.page.id)}
                className={`cursor-pointer border-b border-edge/8 text-fg-2 transition-colors last:border-b-0 ${selected ? 'bg-accent-fill/10 text-fg-1 shadow-[inset_3px_0_0_rgb(var(--accent-rgb)/0.55)]' : 'hover:bg-rim/35'}`}
              >
                <td className="px-3 py-3 align-top">
                  <SelectionMark
                    selected={selected}
                    label={`select ${page.title}`}
                    onClick={() => onTogglePage(page.page.id)}
                  />
                </td>
                <td className="max-w-[360px] px-3 py-3">
                  <div className="truncate text-fg-1">{page.title}</div>
                  <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-fg-4">
                    <span className="truncate">{page.url}</span>
                    <a
                      href={page.url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-fg-4 transition hover:text-accent"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="text-fg-1">{formatCompactNumber(page.searchTotals.clicks)} clicks</div>
                  <div className="mt-1 text-[11px] text-fg-4">{formatCompactNumber(page.searchTotals.impressions)} impressions</div>
                  {page.topQuery ? <div className="mt-1 text-[11px] text-accent">{page.topQuery}</div> : null}
                </td>
                <td className="px-3 py-3">
                  <KeywordIdeasCell
                    page={page.page}
                    positiveKeywords={positiveKeywords}
                    negativeKeywords={negativeKeywords}
                    runState={keywordRunState}
                  />
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="text-fg-1">{page.promotions.length ? `${page.promotions.length} draft${page.promotions.length === 1 ? '' : 's'}` : 'not promoted'}</div>
                  <div className="mt-1 text-[11px] text-fg-4">{formatMoneyMinor(page.paidTotals.spendMinor, 'MXN')} spend</div>
                </td>
                <td className="px-3 py-3">
                  <StatusPill kind={page.googlePromotion ? statusKind(page.googlePromotion.status) : 'idle'}>
                    {page.googlePromotion?.status ?? page.page.status}
                  </StatusPill>
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="flex justify-end gap-1.5">
                    <RowIconButton label="edit page" onClick={() => onEdit(page)}>
                      <Edit3 className="h-3.5 w-3.5" />
                    </RowIconButton>
                    <RowIconButton
                      label={page.googlePromotion ? 'edit google draft' : 'create google draft'}
                      onClick={() => onPromote(page)}
                    >
                      {page.googlePromotion ? <Edit3 className="h-3.5 w-3.5" /> : <CircleDollarSign className="h-3.5 w-3.5" />}
                    </RowIconButton>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function KeywordIdeasCell({
  page,
  positiveKeywords,
  negativeKeywords,
  runState,
}: {
  page: PromotablePageRecord
  positiveKeywords: number
  negativeKeywords: number
  runState?: KeywordGenerationPageRunState
}) {
  if (runState) {
    const doneWithIdeas = runState.status === 'done' && positiveKeywords > 0
    return (
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-fg-1">
            {doneWithIdeas ? `${positiveKeywords} ideas` : runState.label}
          </div>
          <StatusPill kind={keywordGenerationStatusKind(runState.status)}>
            {runState.status === 'done' ? 'done' : runState.status}
          </StatusPill>
        </div>
        <div className="mt-1 max-w-[240px] truncate text-[11px] text-fg-4" title={runState.detail}>
          {runState.detail}
        </div>
        {doneWithIdeas && negativeKeywords ? (
          <div className="mt-1 text-[11px] text-fg-4">{negativeKeywords} negative</div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="min-w-0">
      <div className="text-fg-1">{positiveKeywords ? `${positiveKeywords} ideas` : 'not generated'}</div>
      <div className="mt-1 text-[11px] text-fg-4">{negativeKeywords ? `${negativeKeywords} negative` : keywordStatusLabel(page)}</div>
    </div>
  )
}

function SelectionMark({
  selected,
  label,
  onClick,
}: {
  selected: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={`inline-flex h-5 w-5 items-center justify-center border font-mono text-[10px] transition ${
        selected
          ? 'border-accent bg-accent-fill/12 text-accent shadow-glow-xs'
          : 'border-edge/24 bg-pit-3 text-fg-4 hover:border-accent/55 hover:bg-accent-fill/6 hover:text-accent'
      }`}
    >
      {selected ? <Check className="h-3.5 w-3.5" /> : null}
    </button>
  )
}

function RowIconButton({
  label,
  children,
  onClick,
}: {
  label: string
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className="inline-flex h-8 w-8 items-center justify-center border border-edge/20 bg-pit-3 text-fg-3 transition hover:border-accent/55 hover:bg-accent-fill/6 hover:text-accent active:scale-[0.98]"
    >
      {children}
    </button>
  )
}

function SelectionActionTray({
  count,
  status,
  onClear,
  onGenerate,
}: {
  count: number
  status: 'idle' | 'loading' | 'success'
  onClear: () => void
  onGenerate: () => void
}) {
  return (
    <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 border border-edge/30 bg-pit-2/95 px-4 py-3 font-mono text-xs text-fg-2 shadow-popover backdrop-blur-sm">
      <span className="text-fg-1">{count} selected</span>
      <span className="h-4 w-px bg-edge/20" />
      <Button
        kind="primary"
        icon={<Sparkles className="h-3.5 w-3.5" />}
        onClick={onGenerate}
        disabled={status === 'loading'}
      >
        {status === 'loading'
          ? 'generating'
          : status === 'success'
            ? 'queued'
            : `generate keywords for ${count === 1 ? 'this page' : 'these pages'}`}
      </Button>
      <button
        type="button"
        aria-label="clear selection"
        title="clear selection"
        onClick={onClear}
        className="inline-flex h-8 w-8 items-center justify-center border border-transparent text-fg-4 transition hover:border-edge/20 hover:bg-accent-fill/4 hover:text-fg-1"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

function GoogleDraftsTable({
  promotions,
  pages,
  metrics,
  onEdit,
}: {
  promotions: AdPromotionRow[]
  pages: PromotablePageRow[]
  metrics: AdMetricSnapshotRow[]
  onEdit: (page: PromotablePageRow, promotion: AdPromotionRow) => void
}) {
  if (promotions.length === 0) return <EmptyState label="no google drafts" />
  return (
    <div className="overflow-auto border border-edge/12">
      <table className="w-full min-w-[980px] text-left font-mono text-xs">
        <thead className="bg-rim text-[10px] uppercase tracking-label text-fg-4">
          <tr className="border-b border-edge/12">
            <th className="px-3 py-2 font-normal">draft</th>
            <th className="px-3 py-2 font-normal">keywords</th>
            <th className="px-3 py-2 text-right font-normal">budget</th>
            <th className="px-3 py-2 text-right font-normal">metrics</th>
            <th className="px-3 py-2 text-right font-normal">action</th>
          </tr>
        </thead>
        <tbody>
          {promotions.map((promotion) => {
            const page = pages.find((entry) => (
              entry.page.id === promotion.promotablePageId ||
              (entry.output?.id && entry.output.id === promotion.contentOutputId) ||
              (entry.item?.id && entry.item.id === promotion.contentItemId)
            )) ?? null
            const totals = sumAdMetricSnapshots(adMetricSnapshotsForPromotions([promotion], metrics))
            const keywords = promotionKeywords(promotion).slice(0, 4)
            return (
              <tr key={promotion.id} className="border-b border-edge/8 text-fg-2 last:border-b-0">
                <td className="max-w-[320px] px-3 py-3">
                  <div className="truncate text-fg-1">{adPromotionHeadline(promotion) || page?.title || 'google search draft'}</div>
                  <div className="mt-1 truncate text-[11px] text-fg-4">{promotion.landingUrl ?? page?.url ?? '-'}</div>
                  <div className="mt-2">
                    <StatusPill kind={statusKind(promotion.status)}>{promotion.status}</StatusPill>
                  </div>
                </td>
                <td className="max-w-[260px] px-3 py-3">
                  <div className="truncate text-fg-1">{keywords.join(', ') || '-'}</div>
                  <div className="mt-1 text-[11px] text-fg-4">{promotionDateRange(promotion)}</div>
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="text-fg-1">{promotion.budgetMinor ? formatMoneyMinor(promotion.budgetMinor, promotion.currencyCode) : '-'}</div>
                  <div className="mt-1 text-[11px] text-fg-4">daily</div>
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="text-fg-1">{formatCompactNumber(totals.clicks)} clicks</div>
                  <div className="mt-1 text-[11px] text-fg-4">{formatMoneyMinor(totals.spendMinor, promotion.currencyCode)} spend</div>
                </td>
                <td className="px-3 py-3 text-right">
                  {page ? (
                    <RowIconButton label="edit google draft" onClick={() => onEdit(page, promotion)}>
                      <Edit3 className="h-3.5 w-3.5" />
                    </RowIconButton>
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PromotionsLearningPanel({
  unpromotedPages,
  incompleteDrafts,
  pages,
  onPromote,
}: {
  unpromotedPages: PromotablePageRow[]
  incompleteDrafts: AdPromotionRow[]
  pages: PromotablePageRow[]
  onPromote: (page: PromotablePageRow) => void
}) {
  const rows = [
    ...unpromotedPages.slice(0, 6).map((page) => ({
      id: `page-${page.page.id}`,
      signal: 'organic opportunity',
      title: page.title,
      detail: `${formatCompactNumber(page.searchTotals.impressions)} impressions · ${page.topQuery || 'search demand'}`,
      page,
      promotion: null as AdPromotionRow | null,
    })),
    ...incompleteDrafts.slice(0, 6).map((promotion) => {
      const page = pages.find((entry) => (
        entry.page.id === promotion.promotablePageId ||
        (entry.output?.id && entry.output.id === promotion.contentOutputId) ||
        (entry.item?.id && entry.item.id === promotion.contentItemId)
      )) ?? null
      return {
        id: `draft-${promotion.id}`,
        signal: 'draft incomplete',
        title: adPromotionHeadline(promotion) || page?.title || 'google search draft',
        detail: !promotion.budgetMinor ? 'budget missing' : 'account id missing',
        page,
        promotion,
      }
    }),
  ]

  if (rows.length === 0) return <EmptyState label="no learning signals" />
  return (
    <div className="overflow-auto border border-edge/12">
      <table className="w-full min-w-[820px] text-left font-mono text-xs">
        <thead className="bg-rim text-[10px] uppercase tracking-label text-fg-4">
          <tr className="border-b border-edge/12">
            <th className="px-3 py-2 font-normal">signal</th>
            <th className="px-3 py-2 font-normal">page</th>
            <th className="px-3 py-2 font-normal">detail</th>
            <th className="px-3 py-2 text-right font-normal">action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-edge/8 text-fg-2 last:border-b-0">
              <td className="px-3 py-3"><StatusPill kind={row.signal === 'organic opportunity' ? 'info' : 'warn'}>{row.signal}</StatusPill></td>
              <td className="max-w-[320px] px-3 py-3">
                <div className="truncate text-fg-1">{row.title}</div>
              </td>
              <td className="px-3 py-3 text-fg-3">{row.detail}</td>
              <td className="px-3 py-3 text-right">
                {row.page ? (
                  <RowIconButton label="create google draft" onClick={() => onPromote(row.page)}>
                    <CircleDollarSign className="h-3.5 w-3.5" />
                  </RowIconButton>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GoogleSearchPromotionDrawer({
  page,
  promotion,
  onClose,
  keywordRunStatus,
  onGenerateKeywords,
  onSubmit,
}: {
  page: PromotablePageRow
  promotion: AdPromotionRow | null
  onClose: () => void
  keywordRunStatus: 'idle' | 'loading' | 'success'
  onGenerateKeywords: () => void
  onSubmit: (payload: GoogleSearchPromotionDraftPayload) => void
}) {
  const creative = readRecord(promotion?.creative)
  const targeting = readRecord(promotion?.targeting)
  const startDate = promotion?.startsAt ? new Date(promotion.startsAt) : defaultSocialScheduleDate(page.output)
  const endDate = promotion?.endsAt ? new Date(promotion.endsAt) : new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000)
  const [adAccountExternalId, setAdAccountExternalId] = useState(promotion?.adAccountExternalId ?? '')
  const [objective, setObjective] = useState(promotion?.objective ?? 'website_visits')
  const [geo, setGeo] = useState(readString(targeting.geo) || 'MX')
  const [language, setLanguage] = useState(readString(targeting.language) || 'es')
  const [budgetMajor, setBudgetMajor] = useState(promotion?.budgetMinor ? String(Math.round(promotion.budgetMinor / 100)) : '150')
  const [currencyCode, setCurrencyCode] = useState(promotion?.currencyCode ?? 'MXN')
  const [startsAt, setStartsAt] = useState(() => toDatetimeLocalValue(startDate))
  const [endsAt, setEndsAt] = useState(() => toDatetimeLocalValue(endDate))
  const [keywordText, setKeywordText] = useState(() => {
    const existing = readStringList(targeting.keywords)
    return (existing.length ? existing : defaultGoogleKeywords(page)).join('\n')
  })
  const [headlineText, setHeadlineText] = useState(() => {
    const existing = readStringList(creative.headlines)
    return (existing.length ? existing : defaultGoogleHeadlines(page)).join('\n')
  })
  const [descriptionText, setDescriptionText] = useState(() => {
    const existing = readStringList(creative.descriptions)
    return (existing.length ? existing : defaultGoogleDescriptions(page)).join('\n')
  })

  const startsAtMs = startsAt ? Date.parse(startsAt) : undefined
  const endsAtMs = endsAt ? Date.parse(endsAt) : undefined
  const budgetNumber = budgetMajor.trim() ? Number(budgetMajor) : undefined
  const budgetMinor = typeof budgetNumber === 'number' && Number.isFinite(budgetNumber) && budgetNumber > 0
    ? Math.round(budgetNumber * 100)
    : undefined
  const keywords = lineList(keywordText).slice(0, 25)
  const headlines = lineList(headlineText).slice(0, 15)
  const descriptions = lineList(descriptionText).slice(0, 4)
  const invalidBudget = Boolean(budgetMajor.trim()) && !budgetMinor
  const invalidDates = (startsAt && (!startsAtMs || Number.isNaN(startsAtMs)))
    || (endsAt && (!endsAtMs || Number.isNaN(endsAtMs)))
    || (startsAtMs && endsAtMs ? endsAtMs <= startsAtMs : false)
  const canSubmit = Boolean(page.url && keywords.length && headlines.length && descriptions.length && !invalidBudget && !invalidDates)
  const objectiveOptions: PachSelectOption[] = [
    { value: 'website_visits', label: 'website visits' },
    { value: 'lead_generation', label: 'lead generation' },
    { value: 'newsletter_signup', label: 'newsletter signup' },
  ]
  const currencyOptions: PachSelectOption[] = [
    { value: 'MXN', label: 'MXN' },
    { value: 'USD', label: 'USD' },
  ]

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-overlay/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="h-screen min-h-screen w-[720px] max-w-full overflow-y-auto border-l border-edge/25 bg-pit-2 shadow-terminal-overlay"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-edge/12 bg-pit-2 px-5 py-3">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">promotions · google search</div>
            <h2 className="mt-1 truncate font-mono text-lg font-bold lowercase text-fg-1">{promotion ? 'edit draft' : 'create draft'}</h2>
          </div>
          <button onClick={onClose} className="font-mono text-xs uppercase tracking-label text-fg-4 transition hover:text-fg-1">
            [esc]
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="border border-edge/12 bg-rim px-3 py-3">
            <div className="truncate font-mono text-sm text-fg-1">{page.title}</div>
            <div className="mt-1 truncate font-mono text-[11px] text-fg-4">{page.url}</div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <FieldLabel>google ads customer id</FieldLabel>
              <TermInput
                value={adAccountExternalId}
                onChange={(event) => setAdAccountExternalId(event.target.value)}
                placeholder="optional until account sync exists"
              />
            </label>
            <div>
              <FieldLabel>goal</FieldLabel>
              <PachSelect
                value={objective}
                onChange={setObjective}
                options={objectiveOptions}
                display={objectiveOptions.find((entry) => entry.value === objective)?.label ?? 'goal'}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <label className="block">
              <FieldLabel>daily budget</FieldLabel>
              <TermInput type="number" min="0" step="50" value={budgetMajor} onChange={(event) => setBudgetMajor(event.target.value)} />
            </label>
            <div>
              <FieldLabel>currency</FieldLabel>
              <PachSelect value={currencyCode} onChange={setCurrencyCode} options={currencyOptions} display={currencyCode} />
            </div>
            <label className="block">
              <FieldLabel>geo</FieldLabel>
              <TermInput value={geo} onChange={(event) => setGeo(event.target.value.toUpperCase())} />
            </label>
            <label className="block">
              <FieldLabel>language</FieldLabel>
              <TermInput value={language} onChange={(event) => setLanguage(event.target.value.toLowerCase())} />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <FieldLabel>starts</FieldLabel>
              <TermInput type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
            </label>
            <label className="block">
              <FieldLabel>ends</FieldLabel>
              <TermInput type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
            </label>
          </div>

          <div className="block">
            <div className="mb-1 flex items-center justify-between gap-2">
              <FieldLabel>keywords</FieldLabel>
              <Button
                icon={<Sparkles className="h-3.5 w-3.5" />}
                onClick={onGenerateKeywords}
                disabled={keywordRunStatus === 'loading'}
              >
                {keywordRunStatus === 'loading'
                  ? 'generating'
                  : keywordRunStatus === 'success'
                    ? 'queued'
                    : 'generate keywords'}
              </Button>
            </div>
            <TermTextarea rows={7} value={keywordText} onChange={(event) => setKeywordText(event.target.value)} />
          </div>

          <label className="block">
            <FieldLabel>headlines</FieldLabel>
            <TermTextarea rows={6} value={headlineText} onChange={(event) => setHeadlineText(event.target.value)} />
          </label>

          <label className="block">
            <FieldLabel>descriptions</FieldLabel>
            <TermTextarea rows={5} value={descriptionText} onChange={(event) => setDescriptionText(event.target.value)} />
          </label>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="border border-edge/12 bg-rim px-3 py-2 font-mono text-xs text-fg-2">
              <div className="text-[10px] uppercase tracking-label text-fg-4">keywords</div>
              <div className="mt-1 text-fg-1">{keywords.length}</div>
            </div>
            <div className="border border-edge/12 bg-rim px-3 py-2 font-mono text-xs text-fg-2">
              <div className="text-[10px] uppercase tracking-label text-fg-4">headlines</div>
              <div className="mt-1 text-fg-1">{headlines.length}</div>
            </div>
            <div className="border border-edge/12 bg-rim px-3 py-2 font-mono text-xs text-fg-2">
              <div className="text-[10px] uppercase tracking-label text-fg-4">descriptions</div>
              <div className="mt-1 text-fg-1">{descriptions.length}</div>
            </div>
          </div>

          {invalidBudget || invalidDates || !keywords.length || !headlines.length || !descriptions.length ? (
            <div className="border border-fail/25 bg-fail/5 px-3 py-2 font-mono text-xs text-fail">
              {invalidBudget ? 'budget must be a positive amount' : invalidDates ? 'end date must be after start date' : 'keywords, headlines, and descriptions are required'}
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-edge/12 bg-pit-2 px-5 py-3">
          <Button onClick={onClose}>cancel</Button>
          <Button
            kind="primary"
            icon={<Check className="h-3.5 w-3.5" />}
            onClick={() => onSubmit({
              adAccountExternalId: adAccountExternalId.trim(),
              objective,
              geo: geo.trim() || 'MX',
              language: language.trim() || 'es',
              budgetMinor,
              currencyCode,
              startsAt: startsAtMs,
              endsAt: endsAtMs,
              keywords,
              headlines,
              descriptions,
            })}
            disabled={!canSubmit}
          >
            save draft
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function PromotablePageDrawer({
  page,
  onClose,
  onSubmit,
}: {
  page: PromotablePageRecord | null
  onClose: () => void
  onSubmit: (payload: PromotablePageFormPayload) => Promise<void> | void
}) {
  const [title, setTitle] = useState(page?.title ?? '')
  const [url, setUrl] = useState(page?.url ?? '')
  const [canonicalUrl, setCanonicalUrl] = useState(page?.canonicalUrl ?? page?.url ?? '')
  const [status, setStatus] = useState(page?.status ?? 'ready')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const statusOptions: PachSelectOption[] = [
    { value: 'imported', label: 'imported' },
    { value: 'ready', label: 'ready' },
    { value: 'promoted', label: 'promoted' },
    { value: 'paused', label: 'paused' },
    { value: 'archived', label: 'archived' },
  ]

  async function submit() {
    setError('')
    let normalizedUrl = ''
    let normalizedCanonicalUrl = ''
    try {
      normalizedUrl = normalizePromotablePageUrl(url)
      normalizedCanonicalUrl = canonicalUrl.trim() ? normalizePromotablePageUrl(canonicalUrl) : normalizedUrl
    } catch {
      setError('enter a valid http or https URL')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({
        title: title.trim() || pageTitleFromUrl(normalizedUrl),
        url: normalizedUrl,
        canonicalUrl: normalizedCanonicalUrl,
        status,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not save page')
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-overlay/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="h-screen min-h-screen w-[560px] max-w-full overflow-y-auto border-l border-edge/25 bg-pit-2 shadow-terminal-overlay"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-edge/12 bg-pit-2 px-5 py-3">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">promotions · page</div>
            <h2 className="mt-1 truncate font-mono text-lg font-bold lowercase text-fg-1">{page ? 'edit page' : 'add page'}</h2>
          </div>
          <button onClick={onClose} className="font-mono text-xs uppercase tracking-label text-fg-4 transition hover:text-fg-1">
            [esc]
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {page ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="border border-edge/12 bg-rim px-3 py-2 font-mono text-xs text-fg-2">
                <div className="text-[10px] uppercase tracking-label text-fg-4">source</div>
                <div className="mt-1 text-fg-1">{page.source}</div>
              </div>
              <div className="border border-edge/12 bg-rim px-3 py-2 font-mono text-xs text-fg-2">
                <div className="text-[10px] uppercase tracking-label text-fg-4">status</div>
                <div className="mt-1 text-fg-1">{page.status}</div>
              </div>
            </div>
          ) : null}

          <label className="block">
            <FieldLabel>title</FieldLabel>
            <TermInput value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ardia landing" />
          </label>

          <label className="block">
            <FieldLabel>landing url</FieldLabel>
            <TermInput value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://ardia.mx" />
          </label>

          <label className="block">
            <FieldLabel>canonical url</FieldLabel>
            <TermInput value={canonicalUrl} onChange={(event) => setCanonicalUrl(event.target.value)} placeholder="defaults to landing url" />
          </label>

          <div>
            <FieldLabel>status</FieldLabel>
            <PachSelect
              value={status}
              onChange={setStatus}
              options={statusOptions}
              display={statusOptions.find((entry) => entry.value === status)?.label ?? status}
            />
          </div>

          {page?.sourceUrl ? (
            <div className="border border-edge/12 bg-rim px-3 py-3 font-mono text-xs text-fg-3">
              <div className="text-[10px] uppercase tracking-label text-fg-4">source url</div>
              <div className="mt-1 truncate">{page.sourceUrl}</div>
            </div>
          ) : null}

          {error ? <div className="border border-fail/25 bg-fail/5 px-3 py-2 font-mono text-xs text-fail">{error}</div> : null}
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-edge/12 bg-pit-2 px-5 py-3">
          <Button onClick={onClose}>cancel</Button>
          <Button kind="primary" icon={<Check className="h-3.5 w-3.5" />} onClick={() => void submit()} disabled={submitting || !url.trim()}>
            {submitting ? 'saving' : 'save page'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function SitemapImportDrawer({
  organizationId,
  onClose,
  onImported,
}: {
  organizationId: string
  onClose: () => void
  onImported: (result: SitemapImportResult) => void
}) {
  const [sitemapUrl, setSitemapUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<SitemapImportResult | null>(null)

  async function importSitemap() {
    setError('')
    setResult(null)
    setImporting(true)
    try {
      const response = await authFetch(`${config.apiUrl}/marketing/promotions/import-sitemap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, sitemapUrl }),
      })
      const json = await readJson(response) as SitemapImportResult
      setResult(json)
      onImported(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not import sitemap')
    } finally {
      setImporting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-overlay/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="h-screen min-h-screen w-[560px] max-w-full overflow-y-auto border-l border-edge/25 bg-pit-2 shadow-terminal-overlay"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-edge/12 bg-pit-2 px-5 py-3">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">promotions · sitemap</div>
            <h2 className="mt-1 truncate font-mono text-lg font-bold lowercase text-fg-1">import pages</h2>
          </div>
          <button onClick={onClose} className="font-mono text-xs uppercase tracking-label text-fg-4 transition hover:text-fg-1">
            [esc]
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <label className="block">
            <FieldLabel>sitemap url</FieldLabel>
            <TermInput value={sitemapUrl} onChange={(event) => setSitemapUrl(event.target.value)} placeholder="https://ardia.mx/sitemap.xml" />
          </label>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="border border-edge/12 bg-rim px-3 py-2 font-mono text-xs text-fg-2">
              <div className="text-[10px] uppercase tracking-label text-fg-4">new</div>
              <div className="mt-1 text-fg-1">{result?.created ?? '-'}</div>
            </div>
            <div className="border border-edge/12 bg-rim px-3 py-2 font-mono text-xs text-fg-2">
              <div className="text-[10px] uppercase tracking-label text-fg-4">seen</div>
              <div className="mt-1 text-fg-1">{result?.updated ?? '-'}</div>
            </div>
            <div className="border border-edge/12 bg-rim px-3 py-2 font-mono text-xs text-fg-2">
              <div className="text-[10px] uppercase tracking-label text-fg-4">found</div>
              <div className="mt-1 text-fg-1">{result?.found ?? '-'}</div>
            </div>
          </div>

          {error ? <div className="border border-fail/25 bg-fail/5 px-3 py-2 font-mono text-xs text-fail">{error}</div> : null}
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-edge/12 bg-pit-2 px-5 py-3">
          <Button onClick={onClose}>cancel</Button>
          <Button kind="primary" icon={<Rss className="h-3.5 w-3.5" />} onClick={() => void importSitemap()} disabled={importing || !sitemapUrl.trim()}>
            {importing ? 'importing' : 'import pages'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function NewslettersSection({
  z,
  organization,
  organizationId,
  publications,
  selectedPublication,
  onSelectPublication,
  senderProfiles,
  ctas,
  members,
  subscriptions,
  documents,
  issues,
  initialTab,
  onCreateSenderProfile,
  onFlash,
}: {
  z: ReturnType<typeof useZero<Schema, Mutators>>
  organization: OrganizationRow | null
  organizationId: string
  publications: PublicationRow[]
  selectedPublication: PublicationRow | null
  onSelectPublication: (id: string) => void
  senderProfiles: SenderProfileRow[]
  ctas: CtaRow[]
  members: AudienceMemberRow[]
  subscriptions: AudienceSubscriptionRow[]
  documents: DocumentRow[]
  issues: IssueRow[]
  initialTab: 'publications' | 'subscribers'
  onCreateSenderProfile: () => Promise<void>
  onFlash: (message: string) => void
}) {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'publications' | 'subscribers'>(initialTab)
  const [editingPublicationId, setEditingPublicationId] = useState('')
  const [guidelinesEditorPublicationId, setGuidelinesEditorPublicationId] = useState('')
  const [guidelinesDraft, setGuidelinesDraft] = useState('')
  const [publicationModalOpen, setPublicationModalOpen] = useState(false)
  const [subscriberModalOpen, setSubscriberModalOpen] = useState(false)
  const [publicationDraft, setPublicationDraft] = useState({ name: '', slug: '', defaultSenderProfileId: '' })
  const [publicationSlugTouched, setPublicationSlugTouched] = useState(false)
  const [subscriberDraft, setSubscriberDraft] = useState({ publicationId: '', name: '', email: '', company: '', role: '', whatsappPhone: '' })
  const [subscriberFilters, setSubscriberFilters] = useState<ActiveFilters>({})
  const guidelinesEditorRef = useRef<RichEditorHandle | null>(null)

  const publicationOptions = useMemo(() => publications.map((publication) => ({ value: publication.id, label: publication.name })), [publications])
  const senderOptions = [
    { value: '', label: 'no sender' },
    ...senderProfiles.map((profile) => ({ value: profile.id, label: `${profile.name} · ${profile.fromEmail}` })),
  ]
  const editingPublication = publications.find((publication) => publication.id === editingPublicationId) ?? null
  const subscriberCounts = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const subscription of subscriptions) {
      if (subscription.channel !== 'newsletter' || subscription.status !== 'subscribed') continue
      const set = map.get(subscription.publicationId) ?? new Set<string>()
      set.add(subscription.audienceMemberId)
      map.set(subscription.publicationId, set)
    }
    return new Map(Array.from(map.entries()).map(([publicationId, memberIds]) => [publicationId, memberIds.size]))
  }, [subscriptions])
  const subscriberFilterConfigs = useMemo<FilterFieldConfig[]>(
    () => [{
      field: 'publication',
      label: 'publication',
      icon: Rss,
      options: publicationOptions,
    }],
    [publicationOptions],
  )
  const selectedPublicationFilterIds = subscriberFilters.publication ?? []
  const editingPublicationWrapper = publicationEmailWrapper(editingPublication)
  const editingPublicationThemeMode = publicationEmailThemeMode(editingPublication)
  const editingPublicationCadence = publicationCadenceConfig(editingPublication)
  const editingPublicationMetadata = readRecord(editingPublication?.metadata)
  const editingPublicationGuidelines = publicationNewsletterGuidelines(editingPublication)
  const guidelinesEditorPublication = publications.find((publication) => publication.id === guidelinesEditorPublicationId) ?? null
  const subscriberRows = useMemo(() => subscriptions
    .filter((subscription) => subscription.channel === 'newsletter' && subscription.status === 'subscribed')
    .filter((subscription) => selectedPublicationFilterIds.length === 0 || selectedPublicationFilterIds.includes(subscription.publicationId))
    .map((subscription) => {
      const member = members.find((entry) => entry.id === subscription.audienceMemberId)
      const publication = publications.find((entry) => entry.id === subscription.publicationId)
      return member && publication ? { subscription, member, publication } : null
    })
    .filter((row): row is { subscription: AudienceSubscriptionRow; member: AudienceMemberRow; publication: PublicationRow } => Boolean(row)),
    [members, publications, selectedPublicationFilterIds, subscriptions],
  )

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  useEffect(() => {
    if (!editingPublicationId || publications.some((publication) => publication.id === editingPublicationId)) return
    setEditingPublicationId('')
  }, [editingPublicationId, publications])

  useEffect(() => {
    if (!guidelinesEditorPublicationId) return
    if (publications.some((publication) => publication.id === guidelinesEditorPublicationId)) return
    setGuidelinesEditorPublicationId('')
    setGuidelinesDraft('')
  }, [guidelinesEditorPublicationId, publications])

  function openPublicationModal() {
    const name = organization?.project === 'ardia' && publications.length === 0 ? 'Real Estate Developers' : 'New Publication'
    setPublicationDraft({
      name,
      slug: uniqueSlug(name, publications),
      defaultSenderProfileId: senderProfiles[0]?.id ?? '',
    })
    setPublicationSlugTouched(false)
    setPublicationModalOpen(true)
  }

  async function createPublicationFromModal() {
    if (!organization || !publicationDraft.name.trim()) return
    const id = crypto.randomUUID()
    const name = publicationDraft.name.trim()
    try {
      await z.mutate.mkt_publications.create({
        id,
        organizationId,
        name,
        slug: uniqueSlug(publicationDraft.slug.trim() || name, publications),
        type: 'newsletter',
        status: 'active',
        audienceDescription: '',
        defaultSenderProfileId: publicationDraft.defaultSenderProfileId || undefined,
        metadata: {
          emailThemeMode: 'light',
          emailWrapper: emailWrapperPayload(defaultEmailWrapper()),
        },
        editorialProfile: {
          ideaGuidelines: '',
          newsletterGuidelines: '',
        },
      })
      onSelectPublication(id)
      setPublicationModalOpen(false)
      onFlash('publication created')
      navigate(`/marketing/newsletters/publications/${id}`)
    } catch (error) {
      console.error('Publication create failed', error)
      onFlash('publication could not be created')
    }
  }

  function showSubscribers(publicationId: string) {
    setSubscriberFilters({ publication: [publicationId] })
    setTab('subscribers')
    navigate('/marketing/newsletters/subscribers')
  }

  function openPublicationEditor(publicationId: string) {
    onSelectPublication(publicationId)
    navigate(`/marketing/newsletters/publications/${publicationId}`)
  }

  function openGuidelinesEditor(publication: PublicationRow) {
    setGuidelinesDraft(publicationNewsletterGuidelines(publication))
    setGuidelinesEditorPublicationId(publication.id)
    setEditingPublicationId('')
    requestAnimationFrame(() => guidelinesEditorRef.current?.focus())
  }

  function closeGuidelinesEditor() {
    setGuidelinesEditorPublicationId('')
    setGuidelinesDraft('')
  }

  async function saveGuidelinesEditor() {
    if (!guidelinesEditorPublication) return
    await updatePublicationGuidelines(guidelinesEditorPublication, guidelinesDraft)
    closeGuidelinesEditor()
    onFlash('editorial profile saved')
  }

  async function updatePublicationEmailWrapper(updates: Partial<PublicationEmailWrapper>) {
    if (!editingPublication) return
    const metadata = readRecord(editingPublication.metadata)
    const current = publicationEmailWrapper(editingPublication)
    const next = { ...current, ...updates }
    await z.mutate.mkt_publications.update({
      id: editingPublication.id,
      metadata: {
        ...metadata,
        emailWrapper: emailWrapperPayload(next),
      },
    })
  }

  async function updatePublicationThemeMode(emailThemeMode: EmailThemeMode) {
    if (!editingPublication) return
    await z.mutate.mkt_publications.update({
      id: editingPublication.id,
      metadata: {
        ...readRecord(editingPublication.metadata),
        emailThemeMode,
      },
    })
  }

  async function updatePublicationCadence(updates: Partial<PublicationCadenceConfig>) {
    if (!editingPublication) return
    const metadata = readRecord(editingPublication.metadata)
    const current = publicationCadenceConfig(editingPublication)
    const next = { ...current, ...updates }
    await z.mutate.mkt_publications.update({
      id: editingPublication.id,
      metadata: {
        ...metadata,
        marketingCadence: publicationCadencePayload(next),
      },
    })
  }

  async function updatePublicationGuidelines(publication: PublicationRow, newsletterGuidelines: string) {
    await z.mutate.mkt_publications.update({
      id: publication.id,
      editorialProfile: {
        ...readRecord(publication.editorialProfile),
        newsletterGuidelines,
      },
    })
  }

  function openSubscriberModal(publicationId?: string) {
    const defaultPublicationId =
      publicationId ||
      (selectedPublicationFilterIds.length === 1 ? selectedPublicationFilterIds[0] : '') ||
      selectedPublication?.id ||
      publications[0]?.id ||
      ''
    setSubscriberDraft({ publicationId: defaultPublicationId, name: '', email: '', company: '', role: '', whatsappPhone: '' })
    setSubscriberModalOpen(true)
  }

  function setSubscriberFilterField(field: string, values: string[]) {
    setSubscriberFilters((current) => {
      const next = { ...current }
      if (values.length) next[field] = values
      else delete next[field]
      return next
    })
  }

  async function createSubscriberFromModal() {
    if (!subscriberDraft.publicationId || !subscriberDraft.email.trim()) return
    const email = subscriberDraft.email.trim().toLowerCase()
    let member = members.find((entry) => entry.email?.toLowerCase() === email)
    if (!member) {
      const id = crypto.randomUUID()
      await z.mutate.mkt_audience_members.create({
        id,
        organizationId,
        name: subscriberDraft.name.trim() || undefined,
        email,
        whatsappPhone: subscriberDraft.whatsappPhone.trim() || undefined,
        company: subscriberDraft.company.trim() || undefined,
        role: subscriberDraft.role.trim() || undefined,
        source: 'manual',
        status: 'active',
      })
      member = { id } as AudienceMemberRow
    }
    const existing = subscriptions.find((entry) => entry.audienceMemberId === member.id && entry.publicationId === subscriberDraft.publicationId && entry.channel === 'newsletter')
    if (existing) {
      await z.mutate.mkt_audience_subscriptions.update({ id: existing.id, status: 'subscribed', unsubscribedAt: null })
    } else {
      await z.mutate.mkt_audience_subscriptions.create({
        id: crypto.randomUUID(),
        organizationId,
        audienceMemberId: member.id,
        publicationId: subscriberDraft.publicationId,
        channel: 'newsletter',
        status: 'subscribed',
        consentSource: 'manual',
        consentedAt: Date.now(),
      })
    }
    setSubscriberModalOpen(false)
    setSubscriberDraft({ publicationId: '', name: '', email: '', company: '', role: '', whatsappPhone: '' })
    onFlash('subscriber added')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-edge/15 md:flex-row md:items-end md:justify-between">
        <div className="pb-2">
          <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">newsletter</div>
          <div className="mt-1 font-mono text-base font-bold lowercase text-fg-1">{tab}</div>
        </div>
        <div className="pb-2">
          {tab === 'publications' ? (
            <Button kind="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={openPublicationModal} disabled={!organization}>
              publication
            </Button>
          ) : (
            <Button kind="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => openSubscriberModal()} disabled={!organization || publications.length === 0}>
              add
            </Button>
          )}
        </div>
      </div>

      {tab === 'publications' ? (
        <Panel title={<InfoTitle label="publications" info="Newsletter publications. Click a row to open the publication detail page for cadence, guidelines, ideas, and slots." />}>
          <div className="divide-y divide-edge/8">
            {publications.map((publication) => {
              const sender = senderProfiles.find((profile) => profile.id === publication.defaultSenderProfileId)
              return (
                <div
                  key={publication.id}
                  role="button"
                  tabIndex={0}
                  className="grid cursor-pointer grid-cols-1 gap-3 px-3 py-3 transition hover:bg-accent-fill/4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                  onClick={() => openPublicationEditor(publication.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openPublicationEditor(publication.id)
                    }
                  }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-fg-1">{publication.name}</div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <RowMeta label="slug"><span className="truncate text-fg-4">{publication.slug}</span></RowMeta>
                      <RowMeta label="sender"><span className="truncate">{sender?.fromEmail ?? '-'}</span></RowMeta>
                      <RowMeta label="subscribers">{subscriberCounts.get(publication.id) ?? 0}</RowMeta>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <StatusPill kind={statusKind(publication.status)}>{publication.status}</StatusPill>
                    <Button
                      className="px-2 py-1 text-[10px]"
                      icon={<Users className="h-3 w-3" />}
                      onClick={(event) => {
                        event.stopPropagation()
                        showSubscribers(publication.id)
                      }}
                    >
                      subscribers
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
          {publications.length === 0 ? <EmptyState label="no publications" /> : null}
        </Panel>
      ) : (
        <Panel title={<InfoTitle label="subscribers" info="People subscribed to newsletter publications, filtered by publication when needed." />}>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <FilterButton
              activeFilters={subscriberFilters}
              filterConfigs={subscriberFilterConfigs}
              onFilterChange={setSubscriberFilterField}
              onClearAll={() => setSubscriberFilters({})}
            />
            <div className="ml-auto font-mono text-xs uppercase tracking-label text-fg-3">{subscriberRows.length} visible</div>
          </div>

          <div className="divide-y divide-edge/8">
            {subscriberRows.map(({ subscription, member, publication }) => (
              <div key={subscription.id} className="grid gap-3 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <div className="min-w-0 truncate text-sm text-fg-1">{member.name || member.email}</div>
                    <StatusPill kind="ok">subscribed</StatusPill>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <RowMeta label="email"><span className="truncate">{member.email}</span></RowMeta>
                    <RowMeta label="publication"><span className="truncate">{publication.name}</span></RowMeta>
                    <RowMeta label="company"><span className="truncate">{member.company || '-'}</span></RowMeta>
                    <RowMeta label="role"><span className="truncate">{member.role || member.whatsappPhone || '-'}</span></RowMeta>
                  </div>
                </div>
                <button
                  className="justify-self-start font-mono text-xs text-fg-4 transition hover:text-amber lg:justify-self-end"
                  onClick={() => void z.mutate.mkt_audience_subscriptions.update({ id: subscription.id, status: 'unsubscribed', unsubscribedAt: Date.now() })}
                >
                  unsubscribe
                </button>
              </div>
            ))}
          </div>
          {subscriberRows.length === 0 ? <EmptyState label="no subscribers" /> : null}
        </Panel>
      )}

      {editingPublication ? (
        <MarketingAppFrame title={editingPublication.name} eyebrow="publication" onClose={() => setEditingPublicationId('')}>
          <div className="space-y-3">
            <CommitInput
              label="name"
              value={editingPublication.name}
              onCommit={(name) => z.mutate.mkt_publications.update({ id: editingPublication.id, name })}
            />
            <CommitInput
              label="slug"
              value={editingPublication.slug}
              onCommit={(slug) => z.mutate.mkt_publications.update({ id: editingPublication.id, slug: slugify(slug) })}
            />
            <div>
              <FieldLabel>default sender</FieldLabel>
              <PachSelect
                value={editingPublication.defaultSenderProfileId ?? ''}
                onChange={(defaultSenderProfileId) => void z.mutate.mkt_publications.update({ id: editingPublication.id, defaultSenderProfileId: defaultSenderProfileId || null })}
                options={senderOptions}
                display={senderOptions.find((entry) => entry.value === (editingPublication.defaultSenderProfileId ?? ''))?.label ?? 'sender'}
              />
            </div>
            <div>
              <FieldLabel>status</FieldLabel>
              <PachSelect
                value={editingPublication.status}
                onChange={(status) => void z.mutate.mkt_publications.update({ id: editingPublication.id, status })}
                options={['active', 'paused', 'archived'].map((status) => ({ value: status, label: status }))}
                display={editingPublication.status}
              />
            </div>

            <div className="border-t border-edge/12 pt-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <FieldLabel>newsletter guidelines</FieldLabel>
                <Button className="px-2 py-1 text-[10px]" icon={<Edit3 className="h-3 w-3" />} onClick={() => openGuidelinesEditor(editingPublication)}>
                  edit
                </Button>
              </div>
              <button
                type="button"
                onClick={() => openGuidelinesEditor(editingPublication)}
                className="block w-full border border-edge/12 bg-rim px-3 py-3 text-left font-mono text-xs leading-relaxed text-fg-3 transition hover:border-accent/45 hover:text-fg-1"
              >
                <span className="line-clamp-5 whitespace-pre-wrap">
                  {editingPublicationGuidelines.trim() || 'No publication-specific editorial guidance yet.'}
                </span>
              </button>
            </div>

            <div className="border-t border-edge/12 pt-4">
              <FieldLabel>email wrapper</FieldLabel>
              <div className="space-y-3">
                <div>
                  <FieldLabel>default mode</FieldLabel>
                  <EmailThemeModeControl
                    value={editingPublicationThemeMode}
                    onChange={(emailThemeMode) => void updatePublicationThemeMode(emailThemeMode)}
                  />
                </div>
                <div>
                  <FieldLabel>header logo</FieldLabel>
                  <EmailBinaryControl
                    value={editingPublicationWrapper.headerLogoEnabled}
                    onChange={(headerLogoEnabled) => updatePublicationEmailWrapper({ headerLogoEnabled })}
                  />
                </div>
                <CommitTextarea
                  label="header"
                  value={editingPublicationWrapper.header}
                  onCommit={(header) => updatePublicationEmailWrapper({ header })}
                />
                <CommitTextarea
                  label="before content"
                  value={editingPublicationWrapper.beforeContent}
                  onCommit={(beforeContent) => updatePublicationEmailWrapper({ beforeContent })}
                />
                <EmailWrapperCtaSelect
                  wrapper={editingPublicationWrapper}
                  ctas={ctas}
                  onChange={updatePublicationEmailWrapper}
                />
                <CommitTextarea
                  label="footer"
                  value={editingPublicationWrapper.footer}
                  onCommit={(footer) => updatePublicationEmailWrapper({ footer })}
                />
              </div>
            </div>

            <div className="border-t border-edge/12 pt-4">
              <FieldLabel>cadence</FieldLabel>
              <div className="space-y-3">
                <EmailBinaryControl
                  value={editingPublicationCadence.enabled}
                  onChange={(enabled) => void updatePublicationCadence({ enabled })}
                />
                <div>
                  <FieldLabel>mode</FieldLabel>
                  <PachSelect
                    value={editingPublicationCadence.mode}
                    onChange={(mode) => void updatePublicationCadence({ mode: mode === 'issue' ? 'issue' : 'autonomous' })}
                    options={CADENCE_MODE_OPTIONS}
                    display={editingPublicationCadence.mode}
                  />
                </div>
                <div>
                  <FieldLabel>frequency</FieldLabel>
                  <PachSelect
                    value={editingPublicationCadence.frequency}
                    onChange={(frequency) => void updatePublicationCadence({
                      frequency: frequency === 'monthly' || frequency === 'quarterly' ? frequency : 'weekly',
                    })}
                    options={CADENCE_FREQUENCY_OPTIONS}
                    display={editingPublicationCadence.frequency}
                  />
                </div>
                {editingPublicationCadence.frequency === 'weekly' ? (
                  <div>
                    <FieldLabel>day</FieldLabel>
                    <PachSelect
                      value={String(editingPublicationCadence.dayOfWeek)}
                      onChange={(dayOfWeek) => void updatePublicationCadence({ dayOfWeek: boundedInteger(dayOfWeek, 1, 0, 6) })}
                      options={WEEKDAY_OPTIONS}
                      display={WEEKDAY_OPTIONS.find((entry) => entry.value === String(editingPublicationCadence.dayOfWeek))?.label ?? 'day'}
                    />
                  </div>
                ) : (
                  <CommitInput
                    label="day"
                    type="number"
                    value={String(editingPublicationCadence.dayOfMonth)}
                    onCommit={(dayOfMonth) => updatePublicationCadence({ dayOfMonth: boundedInteger(dayOfMonth, 1, 1, 31) })}
                  />
                )}
                <div className="grid grid-cols-2 gap-2">
                  <CommitInput
                    label="time"
                    type="time"
                    value={editingPublicationCadence.time}
                    onCommit={(time) => updatePublicationCadence({ time: time || '09:00' })}
                  />
                  <div>
                    <FieldLabel>timezone</FieldLabel>
                    <PachSelect
                      value={editingPublicationCadence.timezone}
                      onChange={(timezone) => void updatePublicationCadence({ timezone })}
                      options={MARKETING_TIMEZONE_OPTIONS}
                      display={timezoneLabel(editingPublicationCadence.timezone)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <CommitInput
                    label="lookahead days"
                    type="number"
                    value={String(editingPublicationCadence.lookaheadDays)}
                    onCommit={(lookaheadDays) => updatePublicationCadence({ lookaheadDays: positiveInteger(lookaheadDays, 14) })}
                  />
                  <CommitInput
                    label="cooldown days"
                    type="number"
                    value={String(editingPublicationCadence.cooldownDays)}
                    onCommit={(cooldownDays) => updatePublicationCadence({ cooldownDays: positiveInteger(cooldownDays, 7) })}
                  />
                </div>
                <CommitInput
                  label="idea backlog"
                  type="number"
                  value={String(editingPublicationCadence.minIdeaBacklog)}
                  onCommit={(minIdeaBacklog) => updatePublicationCadence({ minIdeaBacklog: positiveInteger(minIdeaBacklog, 4) })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <div className="border border-edge/12 bg-rim px-3 py-2 font-mono">
                    <div className="text-[10px] uppercase tracking-label text-fg-4">last issue</div>
                    <div className="mt-1 truncate text-sm text-fg-2">{String(editingPublicationMetadata.marketingCadenceLastIssueIdentifier ?? '-')}</div>
                  </div>
                  <div className="border border-edge/12 bg-rim px-3 py-2 font-mono">
                    <div className="text-[10px] uppercase tracking-label text-fg-4">last issue at</div>
                    <div className="mt-1 truncate text-sm text-fg-2">{formatIsoDate(editingPublicationMetadata.marketingCadenceLastIssueAt)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="border border-edge/12 bg-rim px-3 py-2 font-mono">
                <div className="text-[10px] uppercase tracking-label text-fg-4">subscribers</div>
                <div className="mt-1 text-xl font-bold text-fg-1">{subscriberCounts.get(editingPublication.id) ?? 0}</div>
              </div>
              <div className="border border-edge/12 bg-rim px-3 py-2 font-mono">
                <div className="text-[10px] uppercase tracking-label text-fg-4">type</div>
                <div className="mt-1 text-sm text-fg-2">{editingPublication.type}</div>
              </div>
            </div>

            <Button icon={<Users className="h-3.5 w-3.5" />} onClick={() => showSubscribers(editingPublication.id)}>
              subscribers
            </Button>

            <div className="border-t border-edge/12 pt-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <FieldLabel>sender profiles</FieldLabel>
                <Button className="px-2 py-1 text-[10px]" icon={<Plus className="h-3 w-3" />} onClick={() => void onCreateSenderProfile()} disabled={!organization}>
                  sender
                </Button>
              </div>
              <div className="space-y-2">
                {senderProfiles.map((profile) => {
                  const selected = editingPublication.defaultSenderProfileId === profile.id
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => void z.mutate.mkt_publications.update({ id: editingPublication.id, defaultSenderProfileId: profile.id })}
                      className={`w-full border px-3 py-2 text-left font-mono text-xs transition ${
                        selected
                          ? 'border-accent/50 bg-accent-fill/10 text-accent'
                          : 'border-edge/12 bg-rim text-fg-2 hover:border-edge/30 hover:text-fg-1'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{profile.name}</span>
                        {selected ? <Check className="h-3.5 w-3.5" /> : null}
                      </div>
                      <div className="mt-1 truncate text-[11px] text-fg-4">{profile.fromName} · {profile.fromEmail}</div>
                    </button>
                  )
                })}
                {senderProfiles.length === 0 ? <EmptyState label="no sender profiles" /> : null}
              </div>
            </div>
          </div>
        </MarketingAppFrame>
      ) : null}

      {guidelinesEditorPublication ? (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center overflow-auto bg-overlay/75 px-4 py-8 backdrop-blur-sm"
          onClick={closeGuidelinesEditor}
        >
          <div
            className="flex max-h-[calc(100vh-4rem)] w-full max-w-4xl flex-col border border-edge/25 bg-pit shadow-terminal-popover"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-edge/12 px-4 py-3">
              <div className="min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">editorial profile</div>
                <div className="mt-1 truncate font-mono text-base font-bold lowercase text-fg-1">
                  {guidelinesEditorPublication.name}
                </div>
              </div>
              <button
                type="button"
                onClick={closeGuidelinesEditor}
                className="border border-edge/20 p-2 text-fg-3 transition hover:border-accent hover:text-accent"
                aria-label="Close editorial profile editor"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
              <RichEditor
                ref={guidelinesEditorRef}
                key={guidelinesEditorPublication.id}
                owner={{ type: 'publication', id: guidelinesEditorPublication.id }}
                value={guidelinesDraft}
                documents={documents}
                issues={issues}
                organizationId={guidelinesEditorPublication.organizationId}
                onChange={setGuidelinesDraft}
                onOpenDocument={(id) => navigate(`/docs/${id}`)}
                onOpenIssue={(id) => navigate(`/issues/${id}`)}
                enableUploads={false}
                placeholder="Write publication-specific voice, structure, audience, and newsletter rules..."
                className="min-h-[48vh]"
                wrapperClassName="relative mt-0"
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-edge/12 px-4 py-3">
              <Button onClick={closeGuidelinesEditor}>cancel</Button>
              <Button kind="primary" icon={<Check className="h-3.5 w-3.5" />} onClick={() => void saveGuidelinesEditor()}>
                save
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {publicationModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-overlay/70 px-4 pt-[10vh] backdrop-blur-sm"
          onClick={() => setPublicationModalOpen(false)}
        >
          <div
            className="w-full max-w-lg border border-edge/25 bg-pit shadow-terminal-popover"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-edge/12 px-4 py-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">newsletter</div>
                <div className="mt-1 font-mono text-base font-bold lowercase text-fg-1">new publication</div>
              </div>
              <button
                type="button"
                onClick={() => setPublicationModalOpen(false)}
                className="border border-edge/20 p-2 text-fg-3 transition hover:border-accent hover:text-accent"
                aria-label="Close publication modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 px-4 py-4">
              <label className="block">
                <FieldLabel>name</FieldLabel>
                <TermInput
                  autoFocus
                  value={publicationDraft.name}
                  onChange={(event) => {
                    const name = event.target.value
                    setPublicationDraft((draft) => ({
                      ...draft,
                      name,
                      slug: publicationSlugTouched ? draft.slug : uniqueSlug(name, publications),
                    }))
                  }}
                />
              </label>
              <label className="block">
                <FieldLabel>slug</FieldLabel>
                <TermInput
                  value={publicationDraft.slug}
                  onChange={(event) => {
                    setPublicationSlugTouched(true)
                    setPublicationDraft((draft) => ({ ...draft, slug: slugify(event.target.value) }))
                  }}
                />
              </label>
              <div>
                <FieldLabel>default sender</FieldLabel>
                <PachSelect
                  value={publicationDraft.defaultSenderProfileId}
                  onChange={(defaultSenderProfileId) => setPublicationDraft((draft) => ({ ...draft, defaultSenderProfileId }))}
                  options={senderOptions}
                  display={senderOptions.find((entry) => entry.value === publicationDraft.defaultSenderProfileId)?.label ?? 'sender'}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-edge/12 px-4 py-3">
              <Button onClick={() => setPublicationModalOpen(false)}>cancel</Button>
              <Button kind="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => void createPublicationFromModal()} disabled={!publicationDraft.name.trim()}>
                create
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {subscriberModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-overlay/70 px-4 pt-[10vh] backdrop-blur-sm"
          onClick={() => setSubscriberModalOpen(false)}
        >
          <div
            className="w-full max-w-xl border border-edge/25 bg-pit shadow-terminal-popover"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-edge/12 px-4 py-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">newsletter</div>
                <div className="mt-1 font-mono text-base font-bold lowercase text-fg-1">add subscriber</div>
              </div>
              <button
                type="button"
                onClick={() => setSubscriberModalOpen(false)}
                className="border border-edge/20 p-2 text-fg-3 transition hover:border-accent hover:text-accent"
                aria-label="Close subscriber modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3 px-4 py-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <FieldLabel>publication</FieldLabel>
                <PachSelect
                  value={subscriberDraft.publicationId}
                  onChange={(publicationId) => setSubscriberDraft((draft) => ({ ...draft, publicationId }))}
                  options={publicationOptions}
                  display={publicationOptions.find((entry) => entry.value === subscriberDraft.publicationId)?.label ?? 'publication'}
                />
              </div>
              <label className="block">
                <FieldLabel>name</FieldLabel>
                <TermInput value={subscriberDraft.name} onChange={(event) => setSubscriberDraft((draft) => ({ ...draft, name: event.target.value }))} />
              </label>
              <label className="block">
                <FieldLabel>email</FieldLabel>
                <TermInput autoFocus type="email" value={subscriberDraft.email} onChange={(event) => setSubscriberDraft((draft) => ({ ...draft, email: event.target.value }))} />
              </label>
              <label className="block">
                <FieldLabel>company</FieldLabel>
                <TermInput value={subscriberDraft.company} onChange={(event) => setSubscriberDraft((draft) => ({ ...draft, company: event.target.value }))} />
              </label>
              <label className="block">
                <FieldLabel>role</FieldLabel>
                <TermInput value={subscriberDraft.role} onChange={(event) => setSubscriberDraft((draft) => ({ ...draft, role: event.target.value }))} />
              </label>
              <label className="block md:col-span-2">
                <FieldLabel>whatsapp</FieldLabel>
                <TermInput value={subscriberDraft.whatsappPhone} onChange={(event) => setSubscriberDraft((draft) => ({ ...draft, whatsappPhone: event.target.value }))} />
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-edge/12 px-4 py-3">
              <Button onClick={() => setSubscriberModalOpen(false)}>cancel</Button>
              <Button kind="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => void createSubscriberFromModal()} disabled={!subscriberDraft.publicationId || !subscriberDraft.email.trim()}>
                add
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function PublicationDetailPage({
  z,
  publication,
  organization,
  senderProfiles,
  ctas,
  subscriptions,
  ideas,
  slots,
  contentItems,
  runs,
  documents,
  issues,
  onBack,
  onShowSubscribers,
  onCreateSenderProfile,
  onFlash,
}: {
  z: ReturnType<typeof useZero<Schema, Mutators>>
  publication: PublicationRow | null
  organization: OrganizationRow | null
  senderProfiles: SenderProfileRow[]
  ctas: CtaRow[]
  subscriptions: AudienceSubscriptionRow[]
  ideas: EditorialIdeaRow[]
  slots: PublicationSlotRow[]
  contentItems: ContentItemRow[]
  runs: DistributionRunRow[]
  documents: DocumentRow[]
  issues: IssueRow[]
  onBack: () => void
  onShowSubscribers: (publicationId: string) => void
  onCreateSenderProfile: () => Promise<void>
  onFlash: (message: string) => void
}) {
  const navigate = useNavigate()
  const [guidelinesEditorKind, setGuidelinesEditorKind] = useState<'idea' | 'newsletter' | null>(null)
  const [guidelinesDraft, setGuidelinesDraft] = useState('')
  const guidelinesEditorRef = useRef<RichEditorHandle | null>(null)
  const [organizationCredentials, setOrganizationCredentials] = useState<OrganizationCredentialSummary[]>([])
  const [researchSourceModal, setResearchSourceModal] = useState<PublicationResearchSource | 'new' | null>(null)

  useEffect(() => {
    if (!publication?.organizationId) {
      setOrganizationCredentials([])
      return
    }

    let active = true
    void authFetch(`${config.apiUrl}/api-keys?organizationId=${encodeURIComponent(publication.organizationId)}`)
      .then(readJson)
      .then((payload) => {
        if (!active) return
        setOrganizationCredentials(Array.isArray(payload.credentials) ? payload.credentials : [])
      })
      .catch((error) => {
        console.error('Provider credential load failed', error)
        if (active) setOrganizationCredentials([])
      })

    return () => {
      active = false
    }
  }, [publication?.organizationId])

  if (!publication) {
    return (
      <div className="flex min-h-full flex-col bg-pit text-fg-1">
        <div className="flex items-center justify-between gap-3 border-b border-edge/15 bg-pit/60 px-5 py-3 backdrop-blur-sm md:px-8">
          <Button icon={<ChevronLeft className="h-3.5 w-3.5" />} onClick={onBack}>publications</Button>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 py-12">
          <EmptyState label="publication not found" />
        </div>
      </div>
    )
  }

  const subscriberCount = newsletterSubscriberCount(subscriptions.filter((subscription) => subscription.publicationId === publication.id))
  const availableIdeaCount = ideas.filter((idea) => idea.status === 'available').length
  const reservedIdeaCount = ideas.filter((idea) => idea.status === 'reserved').length
  const upcomingSlots = [...slots]
    .sort((a, b) => a.scheduledAt - b.scheduledAt)
    .slice(0, 12)
  const scheduledRunCount = runs.filter((run) => ['scheduled', 'sending'].includes(run.status)).length
  const senderOptions = [
    { value: '', label: 'no sender' },
    ...senderProfiles.map((profile) => ({ value: profile.id, label: `${profile.name} · ${profile.fromEmail}` })),
  ]
  const wrapper = publicationEmailWrapper(publication)
  const themeMode = publicationEmailThemeMode(publication)
  const cadence = publicationCadenceConfig(publication)
  const metadata = readRecord(publication.metadata)
  const newsletterGuidelines = publicationNewsletterGuidelines(publication)
  const ideaGuidelines = publicationIdeaGuidelines(publication)
  const researchSources = publicationResearchSources(publication)
  const editorialCredentials = organizationCredentials.filter((credential) => credential.status === 'active' && credential.allowedUses.includes('editorial'))

  async function updateEmailWrapper(updates: Partial<PublicationEmailWrapper>) {
    const current = publicationEmailWrapper(publication)
    const next = { ...current, ...updates }
    await z.mutate.mkt_publications.update({
      id: publication.id,
      metadata: {
        ...readRecord(publication.metadata),
        emailWrapper: emailWrapperPayload(next),
      },
    })
  }

  async function updateThemeMode(emailThemeMode: EmailThemeMode) {
    await z.mutate.mkt_publications.update({
      id: publication.id,
      metadata: {
        ...readRecord(publication.metadata),
        emailThemeMode,
      },
    })
  }

  async function updateCadence(updates: Partial<PublicationCadenceConfig>) {
    const current = publicationCadenceConfig(publication)
    const next = { ...current, ...updates }
    await z.mutate.mkt_publications.update({
      id: publication.id,
      metadata: {
        ...readRecord(publication.metadata),
        marketingCadence: publicationCadencePayload(next),
      },
    })
  }

  function openIdeaGuidelinesEditor() {
    setGuidelinesDraft(ideaGuidelines)
    setGuidelinesEditorKind('idea')
    requestAnimationFrame(() => guidelinesEditorRef.current?.focus())
  }

  function openNewsletterGuidelinesEditor() {
    setGuidelinesDraft(newsletterGuidelines)
    setGuidelinesEditorKind('newsletter')
    requestAnimationFrame(() => guidelinesEditorRef.current?.focus())
  }

  async function saveGuidelinesEditor() {
    if (!guidelinesEditorKind) return
    await z.mutate.mkt_publications.update({
      id: publication.id,
      editorialProfile: {
        ...readRecord(publication.editorialProfile),
        [guidelinesEditorKind === 'idea' ? 'ideaGuidelines' : 'newsletterGuidelines']: guidelinesDraft,
      },
    })
    setGuidelinesEditorKind(null)
    onFlash('editorial profile saved')
  }

  async function saveResearchSource(source: PublicationResearchSource) {
    const nextSources = researchSources.some((entry) => entry.id === source.id)
      ? researchSources.map((entry) => entry.id === source.id ? source : entry)
      : [...researchSources, source]
    await z.mutate.mkt_publications.update({
      id: publication.id,
      editorialProfile: {
        ...readRecord(publication.editorialProfile),
        researchSources: nextSources,
      },
    })
    setResearchSourceModal(null)
    onFlash('research source saved')
  }

  async function removeResearchSource(sourceId: string) {
    await z.mutate.mkt_publications.update({
      id: publication.id,
      editorialProfile: {
        ...readRecord(publication.editorialProfile),
        researchSources: researchSources.filter((source) => source.id !== sourceId),
      },
    })
    onFlash('research source removed')
  }

  const guidelinesEditorTitle = guidelinesEditorKind === 'idea' ? 'idea guidelines' : 'newsletter guidelines'
  const guidelinesEditorPlaceholder = guidelinesEditorKind === 'idea'
    ? 'Write rules for what ideas the editorial agent should generate, avoid, prioritize, or revisit...'
    : 'Write publication-specific voice, structure, audience, and newsletter rules...'

  return (
    <div className="flex min-h-full flex-col bg-pit text-fg-1">
      <div className="border-b border-edge/15 bg-pit/60 px-5 py-3 backdrop-blur-sm md:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="mb-2 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-label text-fg-4 transition hover:text-accent"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              publications
            </button>
            <div className="flex min-w-0 items-center gap-3">
              <h1 className="truncate font-mono text-2xl font-bold lowercase text-fg-1">{publication.name}</h1>
              <span className="shrink-0"><StatusPill kind={statusKind(publication.status)}>{publication.status}</StatusPill></span>
            </div>
            <div className="mt-1 truncate font-mono text-xs text-fg-4">{organization?.name ?? 'organization'} / {publication.slug}</div>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 xl:w-[504px] xl:shrink-0">
            <Metric label="subscribers" value={subscriberCount} />
            <Metric label="ideas" value={availableIdeaCount} />
            <Metric label="reserved" value={reservedIdeaCount} />
            <Metric label="scheduled" value={scheduledRunCount} />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-5 py-5 md:px-8">
        <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-4">
            <Panel className="overflow-hidden" title={<InfoTitle label="editorial ideas" info="Unused, reserved, and used topics the autonomous editor can draft from without repeating prior newsletter work." />}>
              <div className="divide-y divide-edge/8">
                {ideas.slice(0, 80).map((idea) => {
                  const document = idea.documentId ? documents.find((entry) => entry.id === idea.documentId) : null
                  return (
                    <div key={idea.id} className="min-w-0 px-3 py-3.5">
                      <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(160px,240px)] lg:items-start">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                          <div className="min-w-0 max-w-full truncate text-sm text-fg-1 sm:flex-1" title={idea.title}>{idea.title}</div>
                          <span className="shrink-0"><StatusPill kind={statusKind(idea.status)}>{idea.status}</StatusPill></span>
                        </div>
                        <div className="w-full min-w-0 overflow-hidden lg:text-right">
                          {document ? (
                            <button
                              type="button"
                              className="inline-flex w-full min-w-0 max-w-full items-center gap-1 overflow-hidden font-mono text-xs text-fg-3 transition hover:text-accent lg:justify-end"
                              onClick={() => navigate(`/docs/${document.id}`)}
                              title={document.title}
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              <span className="min-w-0 truncate">{document.title}</span>
                            </button>
                          ) : (
                            <span className="font-mono text-xs text-fg-4">no document</span>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 grid min-w-0 gap-x-4 gap-y-2 border-t border-edge/6 pt-2.5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_max-content]">
                        <RowMeta label="angle">
                          <span className="block line-clamp-2 break-words" title={idea.angle || undefined}>{idea.angle || '-'}</span>
                        </RowMeta>
                        <RowMeta label="dedupe">
                          <span className="block truncate text-fg-4" title={idea.dedupeKey}>{idea.dedupeKey}</span>
                        </RowMeta>
                        <RowMeta label="updated" className="lg:text-right">
                          <span className="whitespace-nowrap">{formatDate(idea.updatedAt)}</span>
                        </RowMeta>
                      </div>
                    </div>
                  )
                })}
              </div>
              {ideas.length === 0 ? <EmptyState label="no ideas yet" /> : null}
            </Panel>

            <Panel title={<InfoTitle label="publication slots" info="Upcoming cadence windows the automation keeps filled with a draft document, content snapshot, and scheduled newsletter run." />}>
              <div className="divide-y divide-edge/8">
                {upcomingSlots.map((slot) => {
                  const idea = slot.ideaId ? ideas.find((entry) => entry.id === slot.ideaId) : null
                  const contentItem = slot.contentItemId ? contentItems.find((entry) => entry.id === slot.contentItemId) : null
                  const run = slot.distributionRunId ? runs.find((entry) => entry.id === slot.distributionRunId) : null
                  return (
                    <div key={slot.id} className="grid gap-3 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <div className="font-mono text-xs text-fg-1">{formatScheduledDate(slot.scheduledAt, slot.scheduledTimezone)}</div>
                          <StatusPill kind={statusKind(slot.status)}>{slot.status}</StatusPill>
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <RowMeta label="idea"><span className="truncate">{idea?.title ?? '-'}</span></RowMeta>
                          <RowMeta label="content">
                            {contentItem ? (
                              <button
                                type="button"
                                className="inline-flex max-w-full text-fg-3 transition hover:text-accent"
                                onClick={() => navigate(`/marketing/newsletters/content?content=${contentItem.id}`)}
                              >
                                <span className="truncate">{contentItem.title}</span>
                              </button>
                            ) : '-'}
                          </RowMeta>
                        </div>
                      </div>
                      <RowMeta label="run" className="lg:justify-self-end">{run ? run.status : '-'}</RowMeta>
                    </div>
                  )
                })}
              </div>
              {slots.length === 0 ? <EmptyState label="no slots yet" /> : null}
            </Panel>

            <Panel title={<InfoTitle label="research sources" info="Reusable API documentation and access grants the editorial agent can consult when researching this publication." />}>
              <div className="mb-3 flex justify-end">
                <Button
                  className="px-2 py-1 text-[10px]"
                  icon={<Plus className="h-3 w-3" />}
                  onClick={() => setResearchSourceModal('new')}
                  disabled={editorialCredentials.length === 0}
                >
                  source
                </Button>
              </div>
              <div className="divide-y divide-edge/8 border-y border-edge/8">
                {researchSources.map((source) => {
                  const credential = organizationCredentials.find((entry) => entry.id === source.credentialId)
                  return (
                    <div key={source.id} className="grid gap-3 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm text-fg-1">{source.name}</span>
                          <StatusPill kind={source.enabled && credential?.status === 'active' ? 'ok' : 'warn'}>
                            {source.enabled ? credential?.status ?? 'credential missing' : 'disabled'}
                          </StatusPill>
                        </div>
                        <div className="mt-2 grid gap-2 font-mono text-[11px] text-fg-4 sm:grid-cols-2">
                          <span className="truncate">{credential ? `${credential.name} · ${credential.envVarName}` : 'No credential'}</span>
                          {source.docsUrl ? (
                            <a className="inline-flex min-w-0 items-center gap-1 text-fg-3 transition hover:text-accent" href={source.docsUrl} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              <span className="truncate">{source.docsUrl}</span>
                            </a>
                          ) : <span>No documentation URL</span>}
                        </div>
                        {source.instructions ? <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-fg-3">{source.instructions}</p> : null}
                      </div>
                      <div className="flex items-center gap-2 lg:justify-self-end">
                        <Button className="px-2 py-1 text-[10px]" icon={<Edit3 className="h-3 w-3" />} onClick={() => setResearchSourceModal(source)}>
                          edit
                        </Button>
                        <Button kind="danger" className="px-2 py-1 text-[10px]" icon={<Trash2 className="h-3 w-3" />} onClick={() => void removeResearchSource(source.id)}>
                          remove
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
              {researchSources.length === 0 ? (
                <EmptyState label={editorialCredentials.length === 0 ? 'add an editorial provider credential in settings first' : 'no research sources'} />
              ) : null}
            </Panel>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title={<InfoTitle label="idea guidelines" info="Guidance for generating new editorial ideas: themes, sources, angles to prefer, and topics to avoid." />}>
                <div className="mb-3 flex justify-end">
                  <Button className="px-2 py-1 text-[10px]" icon={<Edit3 className="h-3 w-3" />} onClick={openIdeaGuidelinesEditor}>
                    edit
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={openIdeaGuidelinesEditor}
                  className="block min-h-[120px] w-full border border-edge/12 bg-rim px-3 py-3 text-left font-mono text-xs leading-relaxed text-fg-2 transition hover:border-accent/45 hover:text-fg-1"
                >
                  <span className="line-clamp-6 whitespace-pre-wrap">
                    {ideaGuidelines.trim() || 'No idea-specific guidance yet.'}
                  </span>
                </button>
              </Panel>
              <Panel title={<InfoTitle label="newsletter guidelines" info="Guidance for writing the actual newsletter article: audience, voice, structure, claims, and publishing standards." />}>
                <div className="mb-3 flex justify-end">
                  <Button className="px-2 py-1 text-[10px]" icon={<Edit3 className="h-3 w-3" />} onClick={openNewsletterGuidelinesEditor}>
                    edit
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={openNewsletterGuidelinesEditor}
                  className="block min-h-[120px] w-full border border-edge/12 bg-rim px-3 py-3 text-left font-mono text-xs leading-relaxed text-fg-2 transition hover:border-accent/45 hover:text-fg-1"
                >
                  <span className="line-clamp-6 whitespace-pre-wrap">
                    {newsletterGuidelines.trim() || 'No publication-specific editorial guidance yet.'}
                  </span>
                </button>
              </Panel>
            </div>

            <Panel title={<InfoTitle label="email wrapper" info="Reusable header, CTA, theme, and footer blocks applied when article content is rendered into a newsletter email." />}>
              <div className="grid gap-3 lg:grid-cols-2">
                <div>
                  <FieldLabel>default mode</FieldLabel>
                  <EmailThemeModeControl value={themeMode} onChange={(emailThemeMode) => void updateThemeMode(emailThemeMode)} />
                </div>
                <div>
                  <FieldLabel>header logo</FieldLabel>
                  <EmailBinaryControl value={wrapper.headerLogoEnabled} onChange={(headerLogoEnabled) => void updateEmailWrapper({ headerLogoEnabled })} />
                </div>
                <CommitTextarea label="header" value={wrapper.header} onCommit={(header) => updateEmailWrapper({ header })} />
                <CommitTextarea label="before content" value={wrapper.beforeContent} onCommit={(beforeContent) => updateEmailWrapper({ beforeContent })} />
                <div className="lg:col-span-2">
                  <EmailWrapperCtaSelect wrapper={wrapper} ctas={ctas} onChange={updateEmailWrapper} />
                </div>
                <div className="lg:col-span-2">
                  <CommitTextarea label="footer" value={wrapper.footer} onCommit={(footer) => updateEmailWrapper({ footer })} />
                </div>
              </div>
            </Panel>
          </div>

          <aside className="min-w-0 space-y-4">
            <Panel title={<InfoTitle label="publication" info="Core newsletter identity, sender, status, and subscriber access for this publication." />}>
              <div className="space-y-3">
                <CommitInput label="name" value={publication.name} onCommit={(name) => { void z.mutate.mkt_publications.update({ id: publication.id, name }) }} />
                <CommitInput label="slug" value={publication.slug} onCommit={(slug) => { void z.mutate.mkt_publications.update({ id: publication.id, slug: slugify(slug) }) }} />
                <div>
                  <FieldLabel>default sender</FieldLabel>
                  <PachSelect
                    value={publication.defaultSenderProfileId ?? ''}
                    onChange={(defaultSenderProfileId) => void z.mutate.mkt_publications.update({ id: publication.id, defaultSenderProfileId: defaultSenderProfileId || null })}
                    options={senderOptions}
                    display={senderOptions.find((entry) => entry.value === (publication.defaultSenderProfileId ?? ''))?.label ?? 'sender'}
                  />
                </div>
                <div>
                  <FieldLabel>status</FieldLabel>
                  <PachSelect
                    value={publication.status}
                    onChange={(status) => void z.mutate.mkt_publications.update({ id: publication.id, status })}
                    options={['active', 'paused', 'archived'].map((status) => ({ value: status, label: status }))}
                    display={publication.status}
                  />
                </div>
                <Button icon={<Users className="h-3.5 w-3.5" />} onClick={() => onShowSubscribers(publication.id)}>
                  subscribers
                </Button>
              </div>
            </Panel>

            <Panel title={<InfoTitle label="cadence" info="The autonomous schedule policy: when to publish, how far ahead to fill slots, and how many ideas to keep ready." />}>
              <div className="space-y-3">
                <EmailBinaryControl value={cadence.enabled} onChange={(enabled) => void updateCadence({ enabled })} />
                <div>
                  <FieldLabel>mode</FieldLabel>
                  <PachSelect
                    value={cadence.mode}
                    onChange={(mode) => void updateCadence({ mode: mode === 'issue' ? 'issue' : 'autonomous' })}
                    options={CADENCE_MODE_OPTIONS}
                    display={cadence.mode}
                  />
                </div>
                <div>
                  <FieldLabel>frequency</FieldLabel>
                  <PachSelect
                    value={cadence.frequency}
                    onChange={(frequency) => void updateCadence({ frequency: frequency === 'monthly' || frequency === 'quarterly' ? frequency : 'weekly' })}
                    options={CADENCE_FREQUENCY_OPTIONS}
                    display={cadence.frequency}
                  />
                </div>
                {cadence.frequency === 'weekly' ? (
                  <div>
                    <FieldLabel>day</FieldLabel>
                    <PachSelect
                      value={String(cadence.dayOfWeek)}
                      onChange={(dayOfWeek) => void updateCadence({ dayOfWeek: boundedInteger(dayOfWeek, 1, 0, 6) })}
                      options={WEEKDAY_OPTIONS}
                      display={WEEKDAY_OPTIONS.find((entry) => entry.value === String(cadence.dayOfWeek))?.label ?? 'day'}
                    />
                  </div>
                ) : (
                  <CommitInput label="day" type="number" value={String(cadence.dayOfMonth)} onCommit={(dayOfMonth) => updateCadence({ dayOfMonth: boundedInteger(dayOfMonth, 1, 1, 31) })} />
                )}
                <div className="grid grid-cols-2 gap-2">
                  <CommitInput label="time" type="time" value={cadence.time} onCommit={(time) => updateCadence({ time: time || '09:00' })} />
                  <div>
                    <FieldLabel>timezone</FieldLabel>
                    <PachSelect
                      value={cadence.timezone}
                      onChange={(timezone) => void updateCadence({ timezone })}
                      options={MARKETING_TIMEZONE_OPTIONS}
                      display={timezoneLabel(cadence.timezone)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <CommitInput label="lookahead days" type="number" value={String(cadence.lookaheadDays)} onCommit={(lookaheadDays) => updateCadence({ lookaheadDays: positiveInteger(lookaheadDays, 14) })} />
                  <CommitInput label="cooldown days" type="number" value={String(cadence.cooldownDays)} onCommit={(cooldownDays) => updateCadence({ cooldownDays: positiveInteger(cooldownDays, 7) })} />
                </div>
                <CommitInput label="idea backlog" type="number" value={String(cadence.minIdeaBacklog)} onCommit={(minIdeaBacklog) => updateCadence({ minIdeaBacklog: positiveInteger(minIdeaBacklog, 4) })} />
                <div className="grid grid-cols-2 gap-2">
                  <div className="border border-edge/12 bg-rim px-3 py-2 font-mono">
                    <div className="text-[10px] uppercase tracking-label text-fg-4">last issue</div>
                    <div className="mt-1 truncate text-sm text-fg-2">{String(metadata.marketingCadenceLastIssueIdentifier ?? '-')}</div>
                  </div>
                  <div className="border border-edge/12 bg-rim px-3 py-2 font-mono">
                    <div className="text-[10px] uppercase tracking-label text-fg-4">last issue at</div>
                    <div className="mt-1 truncate text-sm text-fg-2">{formatIsoDate(metadata.marketingCadenceLastIssueAt)}</div>
                  </div>
                </div>
              </div>
            </Panel>

            <Panel title={<InfoTitle label="sender profiles" info="Email identities available for broadcasts; the selected sender becomes the default for this publication." />}>
              <div className="mb-3 flex justify-end">
                <Button className="px-2 py-1 text-[10px]" icon={<Plus className="h-3 w-3" />} onClick={() => void onCreateSenderProfile()} disabled={!organization}>
                  sender
                </Button>
              </div>
              <div className="space-y-2">
                {senderProfiles.map((profile) => {
                  const selected = publication.defaultSenderProfileId === profile.id
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => void z.mutate.mkt_publications.update({ id: publication.id, defaultSenderProfileId: profile.id })}
                      className={`w-full border px-3 py-2 text-left font-mono text-xs transition ${
                        selected
                          ? 'border-accent/50 bg-accent-fill/10 text-accent'
                          : 'border-edge/12 bg-rim text-fg-2 hover:border-edge/30 hover:text-fg-1'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{profile.name}</span>
                        {selected ? <Check className="h-3.5 w-3.5" /> : null}
                      </div>
                      <div className="mt-1 truncate text-[11px] text-fg-4">{profile.fromName} · {profile.fromEmail}</div>
                    </button>
                  )
                })}
                {senderProfiles.length === 0 ? <EmptyState label="no sender profiles" /> : null}
              </div>
            </Panel>
          </aside>
        </div>
      </div>

      {researchSourceModal ? (
        <ResearchSourceModal
          source={researchSourceModal === 'new' ? null : researchSourceModal}
          credentials={editorialCredentials}
          onClose={() => setResearchSourceModal(null)}
          onSubmit={(source) => void saveResearchSource(source)}
        />
      ) : null}

      {guidelinesEditorKind ? (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center overflow-auto bg-overlay/75 px-4 py-8 backdrop-blur-sm"
          onClick={() => setGuidelinesEditorKind(null)}
        >
          <div
            className="flex max-h-[calc(100vh-4rem)] w-full max-w-4xl flex-col border border-edge/25 bg-pit shadow-terminal-popover"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-edge/12 px-4 py-3">
              <div className="min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">{guidelinesEditorTitle}</div>
                <div className="mt-1 truncate font-mono text-base font-bold lowercase text-fg-1">{publication.name}</div>
              </div>
              <button
                type="button"
                onClick={() => setGuidelinesEditorKind(null)}
                className="border border-edge/20 p-2 text-fg-3 transition hover:border-accent hover:text-accent"
                aria-label="Close editorial profile editor"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
              <RichEditor
                ref={guidelinesEditorRef}
                key={`${publication.id}:${guidelinesEditorKind}`}
                owner={{ type: 'publication', id: publication.id }}
                value={guidelinesDraft}
                documents={documents}
                issues={issues}
                organizationId={publication.organizationId}
                onChange={setGuidelinesDraft}
                onOpenDocument={(id) => navigate(`/docs/${id}`)}
                onOpenIssue={(id) => navigate(`/issues/${id}`)}
                enableUploads={false}
                placeholder={guidelinesEditorPlaceholder}
                className="min-h-[48vh]"
                wrapperClassName="relative mt-0"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-edge/12 px-4 py-3">
              <Button onClick={() => setGuidelinesEditorKind(null)}>cancel</Button>
              <Button kind="primary" icon={<Check className="h-3.5 w-3.5" />} onClick={() => void saveGuidelinesEditor()}>
                save
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ResearchSourceModal({
  source,
  credentials,
  onClose,
  onSubmit,
}: {
  source: PublicationResearchSource | null
  credentials: OrganizationCredentialSummary[]
  onClose: () => void
  onSubmit: (source: PublicationResearchSource) => void
}) {
  const [name, setName] = useState(source?.name ?? '')
  const [credentialId, setCredentialId] = useState(source?.credentialId ?? credentials[0]?.id ?? '')
  const [baseUrl, setBaseUrl] = useState(source?.baseUrl ?? '')
  const [docsUrl, setDocsUrl] = useState(source?.docsUrl ?? '')
  const [instructions, setInstructions] = useState(source?.instructions ?? '')
  const [enabled, setEnabled] = useState(source?.enabled ?? true)
  const credentialOptions = credentials.map((credential) => ({
    value: credential.id,
    label: `${credential.name} · ${credential.envVarName}`,
  }))
  const selectedCredential = credentials.find((credential) => credential.id === credentialId)

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-auto bg-overlay/75 px-4 py-8 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl border border-edge/25 bg-pit shadow-terminal-popover" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-edge/12 px-4 py-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">research source</div>
            <div className="mt-1 font-mono text-base font-bold lowercase text-fg-1">{source ? 'edit source' : 'new source'}</div>
          </div>
          <button type="button" onClick={onClose} className="border border-edge/20 p-2 text-fg-3 transition hover:border-accent hover:text-accent" aria-label="Close research source editor">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <label className="block">
            <FieldLabel>name</FieldLabel>
            <TermInput autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="S&P market data" />
          </label>
          <div>
            <FieldLabel>credential</FieldLabel>
            <PachSelect
              value={credentialId}
              onChange={setCredentialId}
              options={credentialOptions}
              display={selectedCredential ? `${selectedCredential.name} · ${selectedCredential.envVarName}` : 'Select credential'}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <FieldLabel>base URL</FieldLabel>
              <TermInput value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com" />
            </label>
            <label className="block">
              <FieldLabel>documentation URL</FieldLabel>
              <TermInput value={docsUrl} onChange={(event) => setDocsUrl(event.target.value)} placeholder="https://docs.example.com/api" />
            </label>
          </div>
          <label className="block">
            <FieldLabel>usage instructions</FieldLabel>
            <TermTextarea
              rows={7}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Describe authentication placement, useful endpoints, response fields, limits, and attribution requirements."
            />
          </label>
          <button
            type="button"
            onClick={() => setEnabled((value) => !value)}
            className={`flex w-full items-center justify-between border px-3 py-2 text-left font-mono text-xs transition ${
              enabled ? 'border-accent/50 bg-accent-fill/10 text-accent' : 'border-edge/12 bg-rim text-fg-3'
            }`}
          >
            enabled
            {enabled ? <Check className="h-3.5 w-3.5" /> : null}
          </button>
        </div>

        <div className="flex justify-end gap-2 border-t border-edge/12 px-4 py-3">
          <Button onClick={onClose}>cancel</Button>
          <Button
            kind="primary"
            icon={<Check className="h-3.5 w-3.5" />}
            onClick={() => onSubmit({
              id: source?.id ?? crypto.randomUUID(),
              name: name.trim(),
              credentialId,
              baseUrl: baseUrl.trim(),
              docsUrl: docsUrl.trim(),
              instructions: instructions.trim(),
              enabled,
            })}
            disabled={!name.trim() || !selectedCredential || !instructions.trim()}
          >
            save
          </Button>
        </div>
      </div>
    </div>
  )
}

function BroadcastsSection({
  z,
  organizationId,
  publications,
  senderProfiles,
  ctas,
  contentItems,
  runs,
  selectedPublication,
  selectedRunId,
  basePath = '/marketing/newsletters/broadcasts',
  onSelectPublication,
  onFlash,
}: {
  z: ReturnType<typeof useZero<Schema, Mutators>>
  organizationId: string
  publications: PublicationRow[]
  senderProfiles: SenderProfileRow[]
  ctas: CtaRow[]
  contentItems: ContentItemRow[]
  runs: DistributionRunRow[]
  selectedPublication: PublicationRow | null
  selectedRunId: string
  basePath?: string
  onSelectPublication: (id: string) => void
  onFlash: (message: string) => void
}) {
  const navigate = useNavigate()
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [runDraft, setRunDraft] = useState({
    publicationId: '',
    contentItemId: '',
    senderProfileId: '',
    subject: '',
    preheader: '',
    scheduledAt: '',
    scheduledTimezone: DEFAULT_MARKETING_TIMEZONE,
  })
  const [sendingId, setSendingId] = useState('')
  const newsletterRuns = runs.filter((run) => run.channel === 'newsletter')
  const contentOptions = contentItems
    .filter((item) => item.supportedChannels.includes('newsletter'))
    .map((item) => ({ value: item.id, label: item.title }))
  const publicationOptions = publications.map((publication) => ({ value: publication.id, label: publication.name }))
  const senderOptions = [{ value: '', label: 'publication default' }, ...senderProfiles.map((profile) => ({ value: profile.id, label: profile.name }))]
  const selectedRun = selectedRunId ? newsletterRuns.find((run) => run.id === selectedRunId) ?? null : null

  function openCreateModal() {
    setRunDraft({
      publicationId: selectedPublication?.id ?? publications[0]?.id ?? '',
      contentItemId: contentOptions[0]?.value ?? '',
      senderProfileId: '',
      subject: '',
      preheader: '',
      scheduledAt: '',
      scheduledTimezone: DEFAULT_MARKETING_TIMEZONE,
    })
    setCreateModalOpen(true)
  }

  async function createRunFromModal() {
    if (!runDraft.publicationId || !runDraft.contentItemId) return
    const item = contentItems.find((entry) => entry.id === runDraft.contentItemId)
    const scheduledTimezone = runDraft.scheduledTimezone || DEFAULT_MARKETING_TIMEZONE
    const scheduledAt = dateTimeLocalToTimestamp(runDraft.scheduledAt, scheduledTimezone)
    const id = crypto.randomUUID()
    await z.mutate.mkt_distribution_runs.create({
      id,
      organizationId,
      publicationId: runDraft.publicationId,
      contentItemId: runDraft.contentItemId,
      senderProfileId: runDraft.senderProfileId || undefined,
      channel: 'newsletter',
      distributionType: 'broadcast',
      name: runDraft.subject.trim() || item?.title || 'Newsletter broadcast',
      subject: runDraft.subject.trim() || item?.title || 'Newsletter broadcast',
      preheader: runDraft.preheader.trim() || undefined,
      status: scheduledAt ? 'scheduled' : 'draft',
      scheduledAt: scheduledAt ?? undefined,
      scheduledTimezone,
      recipientFilter: { publicationId: runDraft.publicationId },
    })
    onSelectPublication(runDraft.publicationId)
    setCreateModalOpen(false)
    setRunDraft({
      publicationId: '',
      contentItemId: '',
      senderProfileId: '',
      subject: '',
      preheader: '',
      scheduledAt: '',
      scheduledTimezone: DEFAULT_MARKETING_TIMEZONE,
    })
    onFlash(scheduledAt ? 'broadcast scheduled' : 'broadcast created')
    navigate(`${basePath}/${id}`)
  }

  async function deleteRun(run: DistributionRunRow) {
    if (run.status !== 'draft') return
    await z.mutate.mkt_distribution_runs.delete({ id: run.id })
    navigate(basePath)
    onFlash('draft deleted')
  }

  async function sendRun(run: DistributionRunRow, testOnly: boolean) {
    setSendingId(run.id)
    try {
      const response = await authFetch(`${config.apiUrl}/marketing/distribution-runs/${run.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testOnly }),
      })
      const payload = await readJson(response)
      onFlash(testOnly ? 'test email sent to axel@ardia.mx' : `broadcast sent: ${payload.metrics?.sent ?? 0}`)
    } finally {
      setSendingId('')
    }
  }

  if (selectedRunId) {
    if (!selectedRun) {
      return (
        <div className="space-y-4">
          <Button onClick={() => navigate(basePath)}>back to broadcasts</Button>
          <EmptyState label="broadcast not found" />
        </div>
      )
    }
    return (
      <BroadcastDetailView
        z={z}
        run={selectedRun}
        publications={publications}
        senderProfiles={senderProfiles}
        ctas={ctas}
        contentItems={contentItems}
        contentOptions={contentOptions}
        publicationOptions={publicationOptions}
        senderOptions={senderOptions}
        sending={sendingId === selectedRun.id}
        onBack={() => navigate(basePath)}
        onDelete={() => void deleteRun(selectedRun)}
        onSend={(testOnly) => void sendRun(selectedRun, testOnly)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button kind="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={openCreateModal} disabled={publications.length === 0 || contentOptions.length === 0}>
          create run
        </Button>
      </div>
      <Panel title="broadcasts">
        <div className="divide-y divide-edge/8">
          {newsletterRuns.map((run) => {
            const item = contentItems.find((entry) => entry.id === run.contentItemId)
            const publication = publications.find((entry) => entry.id === run.publicationId)
            const metrics = run.metrics as Record<string, unknown>
            return (
              <button
                key={run.id}
                type="button"
                className="grid w-full grid-cols-1 gap-3 px-3 py-3 text-left text-fg-2 transition hover:bg-accent-fill/4 hover:text-fg-1 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                onClick={() => navigate(`${basePath}/${run.id}`)}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm text-fg-1">{run.name}</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <RowMeta label="content"><span className="truncate">{item?.title ?? '-'}</span></RowMeta>
                    <RowMeta label="publication"><span className="truncate">{publication?.name ?? '-'}</span></RowMeta>
                    <RowMeta label="scheduled">{formatScheduledDate(run.scheduledAt, run.scheduledTimezone)}</RowMeta>
                    <RowMeta label="updated">{formatDate(run.updatedAt)}</RowMeta>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <StatusPill kind={statusKind(run.status)}>{run.status}</StatusPill>
                  <span className="font-mono text-xs text-fg-4">sent {String(metrics.sent ?? 0)} · failed {String(metrics.failed ?? 0)}</span>
                </div>
              </button>
            )
          })}
        </div>
        {newsletterRuns.length === 0 ? <EmptyState label="no broadcasts" /> : null}
      </Panel>

      {createModalOpen ? (
        <MarketingCreateModal
          eyebrow="new broadcast"
          title="create broadcast run"
          onClose={() => setCreateModalOpen(false)}
          onSubmit={() => void createRunFromModal()}
          submitLabel="create run"
          submitDisabled={!runDraft.publicationId || !runDraft.contentItemId}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <FieldLabel>publication</FieldLabel>
              <PachSelect
                value={runDraft.publicationId}
                onChange={(publicationId) => setRunDraft((draft) => ({ ...draft, publicationId }))}
                options={publicationOptions}
                display={publicationOptions.find((entry) => entry.value === runDraft.publicationId)?.label ?? 'publication'}
              />
            </div>
            <div>
              <FieldLabel>content</FieldLabel>
              <PachSelect
                value={runDraft.contentItemId}
                onChange={(contentItemId) => {
                  const item = contentItems.find((entry) => entry.id === contentItemId)
                  setRunDraft((draft) => ({ ...draft, contentItemId, subject: draft.subject || item?.title || '' }))
                }}
                options={contentOptions}
                display={contentOptions.find((entry) => entry.value === runDraft.contentItemId)?.label ?? 'content'}
              />
            </div>
            <div>
              <FieldLabel>sender</FieldLabel>
              <PachSelect
                value={runDraft.senderProfileId}
                onChange={(senderProfileId) => setRunDraft((draft) => ({ ...draft, senderProfileId }))}
                options={senderOptions}
                display={senderOptions.find((entry) => entry.value === runDraft.senderProfileId)?.label ?? 'sender'}
              />
            </div>
            <label className="block">
              <FieldLabel>subject</FieldLabel>
              <TermInput autoFocus value={runDraft.subject} onChange={(event) => setRunDraft((draft) => ({ ...draft, subject: event.target.value }))} />
            </label>
            <label className="block md:col-span-2">
              <FieldLabel>preheader</FieldLabel>
              <TermInput value={runDraft.preheader} onChange={(event) => setRunDraft((draft) => ({ ...draft, preheader: event.target.value }))} />
            </label>
            <label className="block md:col-span-2">
              <FieldLabel>scheduled at</FieldLabel>
              <TermInput type="datetime-local" value={runDraft.scheduledAt} onChange={(event) => setRunDraft((draft) => ({ ...draft, scheduledAt: event.target.value }))} />
            </label>
            <div className="md:col-span-2">
              <FieldLabel>timezone</FieldLabel>
              <PachSelect
                value={runDraft.scheduledTimezone}
                onChange={(scheduledTimezone) => setRunDraft((draft) => ({ ...draft, scheduledTimezone }))}
                options={MARKETING_TIMEZONE_OPTIONS}
                display={timezoneLabel(runDraft.scheduledTimezone)}
              />
            </div>
          </div>
        </MarketingCreateModal>
      ) : null}
    </div>
  )
}

function BroadcastDetailView({
  z,
  run,
  publications,
  senderProfiles,
  ctas,
  contentItems,
  contentOptions,
  publicationOptions,
  senderOptions,
  sending,
  onBack,
  onDelete,
  onSend,
}: {
  z: ReturnType<typeof useZero<Schema, Mutators>>
  run: DistributionRunRow
  publications: PublicationRow[]
  senderProfiles: SenderProfileRow[]
  ctas: CtaRow[]
  contentItems: ContentItemRow[]
  contentOptions: PachSelectOption[]
  publicationOptions: PachSelectOption[]
  senderOptions: PachSelectOption[]
  sending: boolean
  onBack: () => void
  onDelete: () => void
  onSend: (testOnly: boolean) => void
}) {
  const [preview, setPreview] = useState<EmailRenderPreview | null>(null)
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile' | 'text'>('desktop')
  const [rendering, setRendering] = useState(false)
  const [renderError, setRenderError] = useState('')
  const [workspaceMode, setWorkspaceMode] = useState<'broadcast' | 'wrapper'>('broadcast')
  const [scheduleTimezone, setScheduleTimezone] = useState(run.scheduledTimezone || DEFAULT_MARKETING_TIMEZONE)
  const [scheduleDraft, setScheduleDraft] = useState(dateTimeLocalValue(run.scheduledAt, scheduleTimezone))
  const scheduleInputRef = useRef<HTMLInputElement | null>(null)

  const item = contentItems.find((entry) => entry.id === run.contentItemId) ?? null
  const publication = publications.find((entry) => entry.id === run.publicationId) ?? null
  const publicationWrapper = publicationEmailWrapper(publication)
  const publicationMode = publicationEmailThemeMode(publication)
  const selectedEmailMode = runEmailThemeMode(run, publication)
  const explicitSender = senderProfiles.find((entry) => entry.id === run.senderProfileId) ?? null
  const defaultSender = senderProfiles.find((entry) => entry.id === publication?.defaultSenderProfileId) ?? null
  const sender = explicitSender ?? defaultSender ?? null
  const metrics = run.metrics as Record<string, unknown>
  const isDraft = run.status === 'draft'
  const isScheduled = run.status === 'scheduled'

  useEffect(() => {
    setPreview(null)
    setRenderError('')
    setPreviewMode('desktop')
    const nextTimezone = run.scheduledTimezone || DEFAULT_MARKETING_TIMEZONE
    setScheduleTimezone(nextTimezone)
    setScheduleDraft(dateTimeLocalValue(run.scheduledAt, nextTimezone))
    void renderPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.id])

  useEffect(() => {
    const nextTimezone = run.scheduledTimezone || DEFAULT_MARKETING_TIMEZONE
    setScheduleTimezone(nextTimezone)
    setScheduleDraft(dateTimeLocalValue(run.scheduledAt, nextTimezone))
  }, [run.scheduledAt, run.scheduledTimezone])

  async function renderPreview() {
    if (!item) {
      setRenderError('Broadcast is missing a content item')
      return
    }
    if (!sender) {
      setRenderError(run.senderProfileId
        ? 'Selected sender profile was not found'
        : 'Publication default sender profile is missing. Pick a sender on this broadcast or set a default sender on the publication.')
      return
    }
    setRendering(true)
    setRenderError('')
    try {
      const response = await authFetch(`${config.apiUrl}/marketing/distribution-runs/${run.id}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const payload = await readJson(response)
      setPreview({
        html: String(payload.html ?? ''),
        text: String(payload.text ?? ''),
        warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
        mode: payload.mode === 'light' || payload.mode === 'dark' ? payload.mode : undefined,
      })
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : String(error))
    } finally {
      setRendering(false)
    }
  }

  function invalidatePreview() {
    setPreview(null)
    setRenderError('')
  }

  function updateRunThemeMode(emailThemeMode: EmailThemeMode) {
    invalidatePreview()
    void z.mutate.mkt_distribution_runs.update({
      id: run.id,
      metadata: {
        ...readRecord(run.metadata),
        emailThemeMode,
      },
    })
  }

  function updatePublicationThemeMode(emailThemeMode: EmailThemeMode) {
    if (!publication) return
    invalidatePreview()
    void z.mutate.mkt_publications.update({
      id: publication.id,
      metadata: {
        ...readRecord(publication.metadata),
        emailThemeMode,
      },
    })
  }

  function updatePublicationWrapper(updates: Partial<PublicationEmailWrapper>) {
    if (!publication) return
    invalidatePreview()
    const next = { ...publicationWrapper, ...updates }
    void z.mutate.mkt_publications.update({
      id: publication.id,
      metadata: {
        ...readRecord(publication.metadata),
        emailWrapper: emailWrapperPayload(next),
      },
    })
  }

  async function scheduleRun() {
    const scheduleValue = scheduleDraft || scheduleInputRef.current?.value || ''
    const scheduledAt = dateTimeLocalToTimestamp(scheduleValue, scheduleTimezone)
    if (!scheduledAt) {
      setRenderError('Pick a valid schedule time')
      return
    }
    setRenderError('')
    setScheduleDraft(scheduleValue)
    try {
      const result = z.mutate.mkt_distribution_runs.update({
        id: run.id,
        status: 'scheduled',
        scheduledAt,
        scheduledTimezone: scheduleTimezone,
        error: null,
      })
      await result.client
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : String(error))
    }
  }

  function unscheduleRun() {
    setScheduleDraft('')
    void z.mutate.mkt_distribution_runs.update({
      id: run.id,
      status: 'draft',
      scheduledAt: null,
      startedAt: null,
      error: null,
    })
  }

  return (
    <div className="grid min-h-[calc(100vh-45px)] lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
      <section className="border-b border-edge/12 bg-pit font-mono lg:border-b-0 lg:border-r">
        <div className="border-b border-edge/12 px-4 py-3">
          <button type="button" onClick={onBack} className="mb-3 text-[10px] uppercase tracking-label text-fg-4 transition hover:text-accent">
            ← broadcasts
          </button>
          <div className="text-[10px] uppercase tracking-label text-fg-4">broadcast workspace</div>
          <h2 className="mt-1 truncate text-xl font-bold lowercase text-fg-1">{run.name}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusPill kind={statusKind(run.status)}>{run.status}</StatusPill>
            <StatusPill kind="idle">{selectedEmailMode}</StatusPill>
            {preview ? <StatusPill kind="ok">render ready</StatusPill> : <StatusPill kind="idle">not rendered</StatusPill>}
          </div>
        </div>

        <div className="grid grid-cols-2 border-b border-edge/12">
          <button
            type="button"
            onClick={() => setWorkspaceMode('broadcast')}
            className={`px-4 py-2 text-left text-[10px] uppercase tracking-label transition ${workspaceMode === 'broadcast' ? 'bg-accent-fill/8 text-accent' : 'text-fg-4 hover:text-fg-1'}`}
          >
            broadcast
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceMode('wrapper')}
            className={`border-l border-edge/12 px-4 py-2 text-left text-[10px] uppercase tracking-label transition ${workspaceMode === 'wrapper' ? 'bg-accent-fill/8 text-accent' : 'text-fg-4 hover:text-fg-1'}`}
          >
            wrapper
          </button>
        </div>

        {workspaceMode === 'broadcast' ? (
          <div className="space-y-3 border-b border-edge/12 px-4 py-4">
            <CommitInput
              label="name"
              value={run.name}
              onCommit={(name) => {
                invalidatePreview()
                void z.mutate.mkt_distribution_runs.update({ id: run.id, name })
              }}
            />
            <div>
              <FieldLabel>publication</FieldLabel>
              <PachSelect
                value={run.publicationId ?? ''}
                onChange={(publicationId) => {
                  invalidatePreview()
                  void z.mutate.mkt_distribution_runs.update({ id: run.id, publicationId, recipientFilter: { publicationId } })
                }}
                options={publicationOptions}
                display={publication?.name ?? 'publication'}
              />
            </div>
            <div>
              <FieldLabel>content</FieldLabel>
              <PachSelect
                value={run.contentItemId ?? ''}
                onChange={(contentItemId) => {
                  invalidatePreview()
                  const nextItem = contentItems.find((entry) => entry.id === contentItemId)
                  void z.mutate.mkt_distribution_runs.update({
                    id: run.id,
                    contentItemId,
                    subject: run.subject || nextItem?.title || run.name,
                  })
                }}
                options={contentOptions}
                display={item?.title ?? 'content'}
              />
            </div>
            <div>
              <FieldLabel>sender</FieldLabel>
              <PachSelect
                value={run.senderProfileId ?? ''}
                onChange={(senderProfileId) => {
                  invalidatePreview()
                  void z.mutate.mkt_distribution_runs.update({ id: run.id, senderProfileId: senderProfileId || null })
                }}
                options={senderOptions}
                display={run.senderProfileId ? sender?.name ?? 'sender' : 'publication default'}
              />
              {sender ? (
                <div className="mt-1 truncate text-[11px] text-fg-4">{sender.fromName} · {sender.fromEmail}</div>
              ) : (
                <div className="mt-1 text-[11px] text-fail">missing sender profile</div>
              )}
            </div>
            <CommitInput
              label="subject"
              value={run.subject ?? ''}
              onCommit={(subject) => {
                invalidatePreview()
                void z.mutate.mkt_distribution_runs.update({ id: run.id, subject: subject || run.name })
              }}
            />
            <CommitInput
              label="preheader"
              value={run.preheader ?? ''}
              onCommit={(preheader) => {
                invalidatePreview()
                void z.mutate.mkt_distribution_runs.update({ id: run.id, preheader: preheader || null })
              }}
            />
          </div>
        ) : (
          <div className="space-y-3 border-b border-edge/12 px-4 py-4">
            {publication ? (
              <>
                <div className="border border-edge/12 bg-rim px-3 py-2">
                  <div className="text-[10px] uppercase tracking-label text-fg-4">shared publication wrapper</div>
                  <div className="mt-1 truncate text-xs text-fg-2">{publication.name}</div>
                </div>
                <div>
                  <FieldLabel>renderer mode</FieldLabel>
                  <EmailThemeModeControl value={selectedEmailMode} onChange={updateRunThemeMode} />
                </div>
                <div>
                  <FieldLabel>publication default</FieldLabel>
                  <EmailThemeModeControl value={publicationMode} onChange={updatePublicationThemeMode} />
                </div>
                <div>
                  <FieldLabel>header logo</FieldLabel>
                  <EmailBinaryControl
                    value={publicationWrapper.headerLogoEnabled}
                    onChange={(headerLogoEnabled) => updatePublicationWrapper({ headerLogoEnabled })}
                  />
                </div>
                <CommitTextarea
                  label="header"
                  value={publicationWrapper.header}
                  onCommit={(header) => updatePublicationWrapper({ header })}
                />
                <CommitTextarea
                  label="before content"
                  value={publicationWrapper.beforeContent}
                  onCommit={(beforeContent) => updatePublicationWrapper({ beforeContent })}
                />
                <EmailWrapperCtaSelect
                  wrapper={publicationWrapper}
                  ctas={ctas}
                  onChange={updatePublicationWrapper}
                />
                <CommitTextarea
                  label="footer"
                  value={publicationWrapper.footer}
                  onCommit={(footer) => updatePublicationWrapper({ footer })}
                />
              </>
            ) : (
              <EmptyState label="select publication" />
            )}
          </div>
        )}

        <div className="grid grid-cols-2 border-b border-edge/12">
            <div className="border-r border-edge/12 px-4 py-3">
              <div className="text-[10px] uppercase tracking-label text-fg-4">sent</div>
              <div className="mt-1 text-lg font-bold text-fg-1">{String(metrics.sent ?? 0)}</div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[10px] uppercase tracking-label text-fg-4">failed</div>
              <div className="mt-1 text-lg font-bold text-fg-1">{String(metrics.failed ?? 0)}</div>
            </div>
        </div>

        <div className="space-y-3 border-b border-edge/12 px-4 py-4">
          <FieldLabel>schedule</FieldLabel>
          <div className="grid gap-2">
            <label className="block">
              <TermInput
                ref={scheduleInputRef}
                type="datetime-local"
                value={scheduleDraft}
                onChange={(event) => {
                  setScheduleDraft(event.target.value)
                  if (renderError) setRenderError('')
                }}
                onInput={(event) => {
                  setScheduleDraft(event.currentTarget.value)
                  if (renderError) setRenderError('')
                }}
              />
            </label>
            <PachSelect
              value={scheduleTimezone}
              onChange={setScheduleTimezone}
              options={MARKETING_TIMEZONE_OPTIONS}
              display={timezoneLabel(scheduleTimezone)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void scheduleRun()} disabled={sending || run.status === 'sending' || run.status === 'sent'}>
              schedule
            </Button>
            <Button onClick={unscheduleRun} disabled={sending || (!run.scheduledAt && !isScheduled) || run.status === 'sending' || run.status === 'sent'}>
              unschedule
            </Button>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">
            {run.scheduledAt ? `queued ${formatScheduledDate(run.scheduledAt, run.scheduledTimezone)}` : 'not scheduled'}
          </div>
        </div>

        <div className="border-b border-edge/12 px-4 py-4">
            <FieldLabel>send controls</FieldLabel>
            <div className="flex flex-wrap gap-2">
              <Button icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void renderPreview()} disabled={rendering || !item || !sender}>
                render
              </Button>
              <Button icon={<Mail className="h-3.5 w-3.5" />} onClick={() => onSend(true)} disabled={sending || !preview}>
                test
              </Button>
              <Button kind="primary" icon={<Send className="h-3.5 w-3.5" />} onClick={() => onSend(false)} disabled={sending || !preview || run.status === 'sending'}>
                send
              </Button>
            </div>
        </div>

        <div className="px-4 py-4">
            <FieldLabel>danger zone</FieldLabel>
            <Button kind="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={onDelete} disabled={!isDraft}>
              delete draft
            </Button>
        </div>
      </section>

      <section className="flex min-h-[calc(100vh-45px)] min-w-0 flex-col bg-pit font-mono">
        <div className="flex flex-col gap-3 border-b border-edge/12 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-label text-fg-4">email renderer</div>
            <div className="mt-1 text-sm text-fg-2">
              {preview ? 'preview ready' : rendering ? 'rendering preview' : 'render to preview'}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(['desktop', 'mobile', 'text'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setPreviewMode(mode)}
                className={`border px-3 py-1.5 text-[10px] uppercase tracking-label transition ${
                  previewMode === mode
                    ? 'border-accent/60 bg-accent-fill/10 text-accent'
                    : 'border-edge/14 text-fg-3 hover:border-edge/30 hover:text-fg-1'
                }`}
              >
                {mode}
              </button>
            ))}
            <Button icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void renderPreview()} disabled={rendering}>
              render
            </Button>
          </div>
        </div>

        {renderError ? (
          <div className="border-b border-fail/30 bg-fail/5 px-4 py-3 text-xs text-fail">{renderError}</div>
        ) : null}

        {preview?.warnings.length ? (
          <div className="border-b border-edge/12 px-4 py-3">
            <div className="mb-2 text-[10px] uppercase tracking-label text-fg-4">preflight</div>
            <div className="space-y-2">
              {preview.warnings.map((warning) => (
                <div key={`${warning.code}-${warning.message}`} className={`border px-3 py-2 text-xs ${renderWarningClass(warning.severity)}`}>
                  <span className="mr-2 uppercase tracking-label">{warning.severity}</span>
                  {warning.message}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto bg-rim/30 p-4">
          {!preview && !rendering ? (
            <div className="flex h-full min-h-[420px] items-center justify-center border border-dashed border-edge/16 text-center text-xs lowercase text-fg-4">
              render an email preview
            </div>
          ) : null}
          {rendering ? (
            <div className="flex h-full min-h-[420px] items-center justify-center border border-dashed border-edge/16 text-xs uppercase tracking-label text-fg-4">
              rendering
            </div>
          ) : null}
          {preview && previewMode === 'text' ? (
            <pre className="min-h-[560px] whitespace-pre-wrap border border-edge/12 bg-pit p-4 text-xs leading-6 text-fg-2">{preview.text}</pre>
          ) : null}
          {preview && previewMode !== 'text' ? (
            <div className={`mx-auto min-h-[560px] bg-white shadow-terminal-popover ${previewMode === 'mobile' ? 'w-[390px] max-w-full' : 'w-full max-w-[860px]'}`}>
              <iframe
                title="email preview"
                srcDoc={preview.html}
                sandbox=""
                className="h-[760px] w-full border-0 bg-white"
              />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}

function SocialSection({
  contentItems,
  contentOutputs,
  socialChannels,
  socialPosts,
  socialPostTargets,
}: {
  contentItems: ContentItemRow[]
  contentOutputs: ContentOutputRow[]
  socialChannels: SocialChannelRow[]
  socialPosts: SocialPostRow[]
  socialPostTargets: SocialPostTargetRow[]
}) {
  const rows = socialPostTargets
    .map((target) => {
      const post = socialPosts.find((entry) => entry.id === target.socialPostId) ?? null
      const channel = socialChannels.find((entry) => entry.id === target.channelId) ?? null
      const item = post?.contentItemId ? contentItems.find((entry) => entry.id === post.contentItemId) ?? null : null
      const output = post?.contentOutputId ? contentOutputs.find((entry) => entry.id === post.contentOutputId) ?? null : null
      return { target, post, channel, item, output }
    })
    .sort((a, b) => socialTargetSortTime(b.target, b.post) - socialTargetSortTime(a.target, a.post))

  return (
    <div className="space-y-4">
      <Panel title="social posts">
        <div className="overflow-auto">
          <table className="w-full min-w-[1120px] text-left font-mono text-xs">
            <thead className="text-[10px] uppercase tracking-label text-fg-4">
              <tr className="border-b border-edge/12">
                <th className="pb-2 pr-3 font-normal">content</th>
                <th className="pb-2 pr-3 font-normal">destination</th>
                <th className="pb-2 pr-3 font-normal">caption</th>
                <th className="pb-2 pr-3 font-normal">status</th>
                <th className="pb-2 pr-3 font-normal">scheduled</th>
                <th className="pb-2 pr-3 font-normal">published</th>
                <th className="pb-2 font-normal">link</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ target, post, channel, item, output }) => (
                <tr key={target.id} className="border-b border-edge/8 text-fg-2">
                  <td className="max-w-[260px] py-2.5 pr-3">
                    <div className="truncate text-fg-1">{post?.title || item?.title || '-'}</div>
                    <div className="mt-0.5 truncate text-[10px] uppercase tracking-label text-fg-4">
                      {item?.contentKind ?? 'social'} · {output?.channel || post?.linkUrl ? 'linked output' : 'native post'}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      {channel?.provider === 'linkedin' ? <Linkedin className="h-3.5 w-3.5 text-accent" /> : <Link2 className="h-3.5 w-3.5 text-fg-4" />}
                      <div className="min-w-0">
                        <div className="truncate text-fg-1">{channel?.displayName ?? 'destination missing'}</div>
                        <div className="mt-0.5 truncate text-[10px] uppercase tracking-label text-fg-4">{channel?.provider ?? 'social'} · {channel?.kind ?? '-'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-[320px] truncate py-2.5 pr-3">{post?.caption ?? '-'}</td>
                  <td className="py-2.5 pr-3"><StatusPill kind={statusKind(target.status)}>{target.status}</StatusPill></td>
                  <td className="py-2.5 pr-3 text-fg-4">{formatScheduledDate(target.scheduledAt, target.scheduledTimezone)}</td>
                  <td className="py-2.5 pr-3 text-fg-4">{formatDate(target.publishedAt)}</td>
                  <td className="py-2.5">
                    {target.providerPostUrl || post?.linkUrl ? (
                      <a
                        href={target.providerPostUrl || post?.linkUrl || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-fg-2 transition hover:text-accent"
                      >
                        open
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-fg-4">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? <EmptyState label="no social posts" /> : null}
      </Panel>
    </div>
  )
}

function MarketingCalendarSection({
  contentItems,
  runs,
  socialChannels,
  socialPosts,
  socialPostTargets,
  adPromotions,
}: {
  contentItems: ContentItemRow[]
  runs: DistributionRunRow[]
  socialChannels: SocialChannelRow[]
  socialPosts: SocialPostRow[]
  socialPostTargets: SocialPostTargetRow[]
  adPromotions: AdPromotionRow[]
}) {
  const navigate = useNavigate()
  const calendarRef = useRef<FullCalendar | null>(null)
  const dayCellCleanupRef = useRef(new WeakMap<HTMLElement, () => void>())
  const initialCalendarStateRef = useRef<StoredMarketingCalendarState | null>(null)
  const pendingCalendarNavigationRef = useRef<{ view: MarketingCalendarView; date: number } | null>(null)

  if (!initialCalendarStateRef.current) {
    initialCalendarStateRef.current = readStoredMarketingCalendarState()
  }

  const initialCalendarState = initialCalendarStateRef.current
  const [calendarTitle, setCalendarTitle] = useState('')
  const [visibleRange, setVisibleRange] = useState<{ start: number; end: number } | null>(null)
  const [view, setView] = useState<MarketingCalendarView>(initialCalendarState.view)
  const [currentDate, setCurrentDate] = useState<number | null>(initialCalendarState.currentDate)
  const [searchQuery, setSearchQuery] = useState(initialCalendarState.searchQuery)
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>(initialCalendarState.filters)

  const calendarEvents = useMemo(
    () => buildMarketingCalendarEvents({
      contentItems,
      runs,
      socialChannels,
      socialPosts,
      socialPostTargets,
      adPromotions,
    }),
    [adPromotions, contentItems, runs, socialChannels, socialPostTargets, socialPosts],
  )
  const filterConfigs = useMemo(() => buildMarketingCalendarFilterConfigs(calendarEvents), [calendarEvents])
  const filteredEvents = useMemo(
    () => filterMarketingCalendarEvents(calendarEvents, activeFilters, searchQuery),
    [activeFilters, calendarEvents, searchQuery],
  )
  const fullCalendarEvents = useMemo<EventInput[]>(
    () => filteredEvents.map(toMarketingFullCalendarEvent),
    [filteredEvents],
  )
  const rangeEvents = useMemo(
    () => visibleRange
      ? filteredEvents.filter((event) => event.startsAt >= visibleRange.start && event.startsAt < visibleRange.end)
      : filteredEvents,
    [filteredEvents, visibleRange],
  )
  const upcomingEvents = useMemo(
    () => filteredEvents.filter((event) => event.startsAt >= Date.now()).slice(0, 5),
    [filteredEvents],
  )

  useEffect(() => {
    writeStoredMarketingCalendarState({ view, currentDate, filters: activeFilters, searchQuery })
  }, [activeFilters, currentDate, searchQuery, view])

  function setFilterField(field: string, values: string[]) {
    setActiveFilters((current) => ({ ...current, [field]: values }))
  }

  function clearAllFilters() {
    setActiveFilters({ ...EMPTY_MARKETING_CALENDAR_FILTERS })
    setSearchQuery('')
  }

  function changeView(nextView: MarketingCalendarView) {
    pendingCalendarNavigationRef.current = null
    setView(nextView)
    calendarRef.current?.getApi().changeView(nextView)
  }

  function moveCalendar(direction: 'prev' | 'next' | 'today') {
    const api = calendarRef.current?.getApi()
    if (!api) return
    pendingCalendarNavigationRef.current = null
    if (direction === 'prev') api.prev()
    if (direction === 'next') api.next()
    if (direction === 'today') api.today()
  }

  function handleDatesSet(arg: DatesSetArg) {
    const nextView = readMarketingCalendarView(arg.view.type) ?? 'timeGridWeek'
    const nextDate = calendarRef.current?.getApi().getDate() ?? arg.view.currentStart
    const pendingNavigation = pendingCalendarNavigationRef.current
    if (pendingNavigation && pendingNavigation.view !== nextView) return

    setCalendarTitle(arg.view.title)
    setVisibleRange({ start: arg.start.getTime(), end: arg.end.getTime() })
    setView(nextView)
    setCurrentDate(pendingNavigation?.date ?? nextDate.getTime())
    if (pendingNavigation?.view === nextView) {
      pendingCalendarNavigationRef.current = null
    }
  }

  function openMonthDay(date: Date) {
    const api = calendarRef.current?.getApi()
    if (!api || api.view.type !== 'dayGridMonth') return
    pendingCalendarNavigationRef.current = { view: 'timeGridDay', date: date.getTime() }
    setView('timeGridDay')
    setCurrentDate(date.getTime())
    api.changeView('timeGridDay', date)
  }

  function handleDayCellDidMount(arg: DayCellMountArg) {
    if (arg.view.type !== 'dayGridMonth') return

    dayCellCleanupRef.current.get(arg.el)?.()

    const dayButton = arg.el.querySelector<HTMLElement>('.pach-calendar-day-number[data-calendar-date]')
    if (!dayButton) return

    const handlePointerDown = (event: PointerEvent) => {
      openMonthDayFromPointer(arg.date, event)
    }

    dayButton.addEventListener('pointerdown', handlePointerDown, true)
    dayCellCleanupRef.current.set(arg.el, () => {
      dayButton.removeEventListener('pointerdown', handlePointerDown, true)
    })
  }

  function handleDayCellWillUnmount(arg: DayCellMountArg) {
    dayCellCleanupRef.current.get(arg.el)?.()
    dayCellCleanupRef.current.delete(arg.el)
  }

  function openMonthDayFromPointer(date: Date, event: PointerEvent) {
    const api = calendarRef.current?.getApi()
    if (!api || api.view.type !== 'dayGridMonth') return

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    pendingCalendarNavigationRef.current = { view: 'timeGridDay', date: date.getTime() }
    window.setTimeout(() => {
      setView('timeGridDay')
      setCurrentDate(date.getTime())
      api.changeView('timeGridDay', date)
    }, 0)
  }

  function handleEventClick(arg: EventClickArg) {
    const href = String(arg.event.extendedProps.href ?? '')
    if (!href) return
    arg.jsEvent.preventDefault()
    navigate(href)
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-pit text-fg-1">
      <header className="relative z-20 shrink-0 border-b border-edge/12 bg-pit/80 px-4 py-3 backdrop-blur-sm md:px-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">marketing calendar</div>
              <h2 className="mt-0.5 truncate font-mono text-xl font-bold lowercase text-fg-1 md:text-2xl">
                {calendarTitle || 'schedule'}
              </h2>
            </div>

            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => moveCalendar('prev')}
                className="flex h-8 w-8 items-center justify-center border border-edge/18 bg-pit-3 text-fg-3 transition hover:border-accent hover:text-accent"
                aria-label="Previous marketing calendar range"
                title="previous"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => moveCalendar('today')}
                className="h-8 border border-edge/18 bg-pit-3 px-3 font-mono text-[10px] uppercase tracking-label text-fg-2 transition hover:border-accent hover:text-accent"
              >
                today
              </button>
              <button
                type="button"
                onClick={() => moveCalendar('next')}
                className="flex h-8 w-8 items-center justify-center border border-edge/18 bg-pit-3 text-fg-3 transition hover:border-accent hover:text-accent"
                aria-label="Next marketing calendar range"
                title="next"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative z-30 flex flex-wrap items-center gap-2">
              <FilterButton
                activeFilters={activeFilters}
                filterConfigs={filterConfigs}
                onFilterChange={setFilterField}
                onClearAll={clearAllFilters}
                buttonClassName="h-8 px-4 py-0"
              />
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-4" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="$ search marketing"
                  className="h-8 w-[min(72vw,260px)] border border-edge/15 bg-pit-3 pl-8 pr-3 font-mono text-xs text-fg-1 outline-none transition placeholder:text-fg-4 focus:border-accent focus:shadow-glow-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex border border-edge/18 bg-pit-3">
                {MARKETING_CALENDAR_VIEW_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => changeView(option.value)}
                    className={`h-8 min-w-[72px] border-r border-edge/12 px-3 font-mono text-[10px] uppercase tracking-label transition last:border-r-0 ${
                      view === option.value
                        ? 'bg-accent-fill/10 text-accent'
                        : 'text-fg-3 hover:bg-accent-fill/5 hover:text-fg-1'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="hidden items-center gap-3 font-mono text-[10px] uppercase tracking-label text-fg-4 sm:flex">
                <span><span className="text-accent">{rangeEvents.length}</span> in view</span>
                <span><span className="text-accent">{filteredEvents.length}</span> total</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="pach-calendar-shell relative min-h-0 overflow-hidden border-edge/12 xl:border-r">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView={view}
            initialDate={currentDate ? new Date(currentDate) : undefined}
            headerToolbar={false}
            height="100%"
            events={fullCalendarEvents}
            datesSet={handleDatesSet}
            eventClick={handleEventClick}
            eventContent={renderMarketingCalendarEventContent}
            eventDidMount={handleMarketingCalendarEventMount}
            dayCellContent={(arg) => renderMarketingCalendarDayCellContent(arg, openMonthDay)}
            dayCellDidMount={handleDayCellDidMount}
            dayCellWillUnmount={handleDayCellWillUnmount}
            eventClassNames={(arg) => [`pach-calendar-event--${String(arg.event.extendedProps.tone ?? 'idle')}`]}
            nowIndicator
            expandRows
            dayMaxEvents={3}
            eventMinHeight={64}
            eventShortHeight={48}
            slotMinTime="06:00:00"
            slotMaxTime="22:00:00"
            scrollTime="08:00:00"
            allDaySlot={false}
            firstDay={1}
            timeZone="local"
            displayEventTime={false}
            eventTimeFormat={{ hour: '2-digit', minute: '2-digit', meridiem: false }}
          />
          {filteredEvents.length === 0 ? (
            <div className="pointer-events-none absolute inset-x-4 top-20 border border-edge/16 bg-pit-2/95 px-4 py-6 text-center shadow-terminal-overlay md:left-1/2 md:w-[420px] md:-translate-x-1/2">
              <div className="font-mono text-xs uppercase tracking-label text-fg-3">// no scheduled marketing</div>
              <div className="mt-2 text-sm text-fg-4">
                {calendarEvents.length === 0 ? 'newsletter, social, and ad schedules will appear here' : 'no events match the current filters'}
              </div>
            </div>
          ) : null}
        </section>

        <aside className="hidden min-h-0 overflow-auto bg-pit-2/55 px-4 py-4 xl:block">
          <div className="border-b border-edge/12 pb-3">
            <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">upcoming</div>
            <div className="mt-1 font-mono text-lg font-bold lowercase text-fg-1">{upcomingEvents.length}</div>
          </div>
          <div className="mt-4 space-y-2">
            {upcomingEvents.length === 0 ? (
              <div className="font-mono text-xs text-fg-4">// no upcoming marketing</div>
            ) : (
              upcomingEvents.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => navigate(event.href)}
                  className="w-full border border-edge/12 bg-pit px-3 py-2 text-left transition hover:border-accent hover:bg-accent-fill/5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-mono text-xs font-bold lowercase text-fg-1">{event.title}</span>
                    <span className={`shrink-0 font-mono text-[10px] uppercase tracking-label ${marketingCalendarStatusTextClass(event.tone)}`}>
                      {event.status}
                    </span>
                  </div>
                  <div className="mt-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
                    {formatScheduledDate(event.startsAt, event.timezone)}
                  </div>
                  <div className="mt-1 truncate text-xs text-fg-3">
                    {event.channelName} · {event.destinationName}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>
      </main>
    </div>
  )
}

function CtasSection({
  z,
  organizationId,
  ctas,
  onFlash,
}: {
  z: ReturnType<typeof useZero<Schema, Mutators>>
  organizationId: string
  ctas: CtaRow[]
  onFlash: (message: string) => void
}) {
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editingCtaId, setEditingCtaId] = useState('')
  const [form, setForm] = useState({ label: '', url: '', key: '' })
  const editingCta = ctas.find((cta) => cta.id === editingCtaId) ?? null

  useEffect(() => {
    if (!editingCtaId || ctas.some((cta) => cta.id === editingCtaId)) return
    setEditingCtaId('')
  }, [ctas, editingCtaId])

  function openCreateModal() {
    setForm({ label: '', url: '', key: '' })
    setCreateModalOpen(true)
  }

  async function createCta() {
    if (!form.label.trim() || !form.url.trim()) return
    await z.mutate.mkt_ctas.create({
      id: crypto.randomUUID(),
      organizationId,
      label: form.label.trim(),
      key: uniqueKey(form.key.trim() || form.label.trim(), ctas),
      url: form.url.trim(),
      status: 'active',
    })
    setForm({ label: '', url: '', key: '' })
    setCreateModalOpen(false)
    onFlash('cta created')
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button kind="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={openCreateModal}>
          cta
        </Button>
      </div>
      <Panel title="ctas">
        <div className="divide-y divide-edge/8">
          {ctas.map((cta) => (
            <div key={cta.id} className="grid gap-3 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <div className="min-w-0 truncate text-sm text-fg-1">{cta.label}</div>
                  <StatusPill kind={statusKind(cta.status)}>{cta.status}</StatusPill>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(120px,0.35fr)_minmax(0,1fr)]">
                  <RowMeta label="key"><span className="truncate">{cta.key}</span></RowMeta>
                  <RowMeta label="destination">
                    <a href={cta.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 text-fg-2 transition hover:text-accent">
                      <span className="truncate">{cta.url}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </RowMeta>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <Button className="px-2 py-1 text-[10px]" icon={<Edit3 className="h-3 w-3" />} onClick={() => setEditingCtaId(cta.id)}>
                  edit
                </Button>
                <Button kind="danger" className="px-2 py-1 text-[10px]" icon={<Trash2 className="h-3 w-3" />} onClick={() => void z.mutate.mkt_ctas.delete({ id: cta.id })}>
                  delete
                </Button>
              </div>
            </div>
          ))}
        </div>
        {ctas.length === 0 ? <EmptyState label="no ctas" /> : null}
      </Panel>

      {editingCta ? (
        <MarketingAppFrame title={editingCta.label} eyebrow="cta" onClose={() => setEditingCtaId('')}>
          <div className="space-y-3">
            <CommitInput label="label" value={editingCta.label} onCommit={(label) => void z.mutate.mkt_ctas.update({ id: editingCta.id, label })} />
            <CommitInput label="key" value={editingCta.key} onCommit={(key) => void z.mutate.mkt_ctas.update({ id: editingCta.id, key: slugify(key) })} />
            <CommitInput label="destination" value={editingCta.url} onCommit={(url) => void z.mutate.mkt_ctas.update({ id: editingCta.id, url })} />
            <div>
              <FieldLabel>status</FieldLabel>
              <PachSelect
                value={editingCta.status}
                onChange={(status) => void z.mutate.mkt_ctas.update({ id: editingCta.id, status })}
                options={['active', 'paused', 'archived'].map((status) => ({ value: status, label: status }))}
                display={editingCta.status}
              />
            </div>
            <div className="flex gap-2 border-t border-edge/12 pt-4">
              <Button kind="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => void z.mutate.mkt_ctas.delete({ id: editingCta.id })}>
                delete
              </Button>
            </div>
          </div>
        </MarketingAppFrame>
      ) : null}

      {createModalOpen ? (
        <MarketingCreateModal
          eyebrow="new cta"
          title="create cta"
          onClose={() => setCreateModalOpen(false)}
          onSubmit={() => void createCta()}
          submitLabel="create"
          submitDisabled={!form.label.trim() || !form.url.trim()}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <FieldLabel>label</FieldLabel>
              <TermInput autoFocus value={form.label} onChange={(event) => setForm((draft) => ({ ...draft, label: event.target.value }))} />
            </label>
            <label className="block">
              <FieldLabel>key</FieldLabel>
              <TermInput value={form.key} onChange={(event) => setForm((draft) => ({ ...draft, key: slugify(event.target.value) }))} />
            </label>
            <label className="block md:col-span-2">
              <FieldLabel>destination</FieldLabel>
              <TermInput value={form.url} onChange={(event) => setForm((draft) => ({ ...draft, url: event.target.value }))} />
            </label>
          </div>
        </MarketingCreateModal>
      ) : null}
    </div>
  )
}

function AnalyticsSection({
  contentItems,
  audienceMembers,
  events,
  subscriptions,
  ctas,
  socialChannels,
  socialPostTargets,
  adMetricSnapshots,
  searchConsoleProperties,
  searchConsoleSummaries,
  searchConsoleDailySnapshots,
  searchConsoleInspections,
}: {
  contentItems: ContentItemRow[]
  audienceMembers: AudienceMemberRow[]
  events: ContentEventRow[]
  subscriptions: AudienceSubscriptionRow[]
  ctas: CtaRow[]
  socialChannels: SocialChannelRow[]
  socialPostTargets: SocialPostTargetRow[]
  adMetricSnapshots: AdMetricSnapshotRow[]
  searchConsoleProperties: SearchConsolePropertyRow[]
  searchConsoleSummaries: SearchConsoleDimensionSummaryRow[]
  searchConsoleDailySnapshots: SearchConsoleDailySnapshotRow[]
  searchConsoleInspections: SearchConsoleUrlInspectionRow[]
}) {
  const [activeTab, setActiveTab] = useState<AnalyticsDetailTab>('search')
  const adTotals = sumAdMetricSnapshots(adMetricSnapshots)
  const contentById = new Map(contentItems.map((item) => [item.id, item]))
  const selectedProperty = searchConsoleProperties.find((property) => property.selected) ?? searchConsoleProperties[0] ?? null
  const selectedSearchSummaries = selectedProperty
    ? searchConsoleSummaries.filter((summary) => summary.propertyId === selectedProperty.id)
    : searchConsoleSummaries
  const selectedSearchDailySnapshots = selectedProperty
    ? searchConsoleDailySnapshots.filter((snapshot) => snapshot.propertyId === selectedProperty.id)
    : searchConsoleDailySnapshots
  const searchWindowAnchor = latestSearchSnapshotTimestamp(selectedSearchDailySnapshots)
  const visibleSearchDailySnapshots = filterSearchSnapshotsByTrailingDays(
    selectedSearchDailySnapshots,
    searchWindowAnchor,
    SEARCH_ANALYTICS_LOOKBACK_DAYS,
  )
  const selectedSearchInspections = selectedProperty
    ? searchConsoleInspections.filter((inspection) => inspection.propertyId === selectedProperty.id)
    : searchConsoleInspections
  const searchTotals = visibleSearchDailySnapshots.length > 0
    ? sumSearchConsoleDailySnapshots(visibleSearchDailySnapshots)
    : sumSearchConsoleSummaries(selectedSearchSummaries.filter((summary) => summary.summaryType === 'page'))
  const searchTrendPoints = buildSearchDailyTrendPoints(visibleSearchDailySnapshots)
  const topPages = searchConsoleSummaryRows(selectedSearchSummaries, 'page').slice(0, 8)
  const topQueries = searchConsoleSummaryRows(selectedSearchSummaries, 'query').slice(0, 8)
  const topRemotePage = topPages[0] ?? null
  const topRemoteQuery = topQueries[0] ?? null
  const opportunities = searchConsoleOpportunities(selectedSearchSummaries).slice(0, 8)
  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="views" value={countEvents(events, 'view')} />
        <Metric label="clicks" value={countEvents(events, 'click')} />
        <Metric label="sends" value={countEvents(events, 'send')} />
        <Metric label="subscribed" value={newsletterSubscriberCount(subscriptions)} />
        <Metric label="search impressions" value={formatCompactNumber(searchTotals.impressions)} />
        <Metric label="search clicks" value={formatCompactNumber(searchTotals.clicks)} />
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        <RemoteSearchKpiCard
          label="top remote page"
          row={topRemotePage}
          primary={topRemotePage
            ? topRemotePage.contentItemId
              ? contentById.get(topRemotePage.contentItemId)?.title ?? urlPathLabel(topRemotePage.page ?? '')
              : urlPathLabel(topRemotePage.page ?? '')
            : null}
          secondary={topRemotePage?.page ?? null}
        />
        <RemoteSearchKpiCard
          label="top remote query"
          row={topRemoteQuery}
          primary={topRemoteQuery?.query ?? null}
          secondary={topRemoteQuery?.page ? urlPathLabel(topRemoteQuery.page) : null}
        />
      </div>

      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-edge/12">
          <div className="flex flex-wrap">
            <MarketingTabButton active={activeTab === 'search'} onClick={() => setActiveTab('search')}>
              search · {formatCompactNumber(searchTotals.impressions)}
            </MarketingTabButton>
            <MarketingTabButton active={activeTab === 'newsletter'} onClick={() => setActiveTab('newsletter')}>
              newsletter · {events.length}
            </MarketingTabButton>
            <MarketingTabButton active={activeTab === 'social'} onClick={() => setActiveTab('social')}>
              social · {socialPostTargets.length}
            </MarketingTabButton>
            <MarketingTabButton active={activeTab === 'ads'} onClick={() => setActiveTab('ads')}>
              ads · {formatCompactNumber(adTotals.impressions)}
            </MarketingTabButton>
          </div>
          <div className="pb-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
            {analyticsTabLabel(activeTab)}
          </div>
        </div>

        <div className="pt-4">
          {activeTab === 'search' ? (
            <OrganicSearchAnalyticsPanel
              contentById={contentById}
              selectedProperty={selectedProperty}
              properties={searchConsoleProperties}
              summaries={selectedSearchSummaries}
              inspections={selectedSearchInspections}
              trendPoints={searchTrendPoints}
              totals={searchTotals}
              topPages={topPages}
              topQueries={topQueries}
              opportunities={opportunities}
            />
          ) : null}
          {activeTab === 'newsletter' ? (
            <NewsletterAnalyticsPanel
              contentItems={contentItems}
              audienceMembers={audienceMembers}
              events={events}
              subscriptions={subscriptions}
              ctas={ctas}
            />
          ) : null}
          {activeTab === 'social' ? <SocialAnalyticsPanel channels={socialChannels} targets={socialPostTargets} /> : null}
          {activeTab === 'ads' ? <AdAnalyticsPanel snapshots={adMetricSnapshots} totals={adTotals} /> : null}
        </div>
      </Panel>
    </div>
  )
}

function RemoteSearchKpiCard({
  label,
  row,
  primary,
  secondary,
}: {
  label: string
  row: SearchAggregateRow | null
  primary: string | null
  secondary: string | null
}) {
  return (
    <div className="min-w-0 border border-edge/12 bg-pit-2 px-3 py-3">
      <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">{label}</div>
      {row ? (
        <>
          <div className="mt-2 truncate font-mono text-sm font-semibold text-fg-1">{primary || '-'}</div>
          {secondary ? <div className="mt-1 truncate font-mono text-[11px] text-fg-4">{secondary}</div> : null}
          <div className="mt-3 grid grid-cols-4 gap-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
            <div>
              <div className="text-xs normal-case tracking-normal text-fg-1">{formatCompactNumber(row.clicks)}</div>
              <div>clicks</div>
            </div>
            <div>
              <div className="text-xs normal-case tracking-normal text-fg-1">{formatCompactNumber(row.impressions)}</div>
              <div>impr.</div>
            </div>
            <div>
              <div className="text-xs normal-case tracking-normal text-fg-1">{formatPercent(row.ctr)}</div>
              <div>ctr</div>
            </div>
            <div>
              <div className="text-xs normal-case tracking-normal text-fg-1">{row.position ? row.position.toFixed(1) : '-'}</div>
              <div>pos</div>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-2 font-mono text-xs text-fg-4">sync search analytics in settings</div>
      )}
    </div>
  )
}

type SearchAggregateRow = {
  key: string
  page?: string | null
  query?: string | null
  contentItemId?: string | null
  clicks: number
  impressions: number
  ctr: number
  position: number
}

type SearchTrendPoint = {
  id: string
  label: string
  timestamp: number
  clicks: number
  impressions: number
  ctr: number
  position: number
}

function SearchAnalyticsTable({
  title,
  rows,
  primaryLabel,
  renderPrimary,
}: {
  title: string
  rows: SearchAggregateRow[]
  primaryLabel: string
  renderPrimary: (row: SearchAggregateRow) => ReactNode
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-label text-fg-4">{title}</div>
      <div className="overflow-auto border border-edge/12">
        <table className="w-full min-w-[460px] text-left font-mono text-xs">
          <thead className="bg-rim text-[10px] uppercase tracking-label text-fg-4">
            <tr className="border-b border-edge/12">
              <th className="px-3 py-2 font-normal">{primaryLabel}</th>
              <th className="px-3 py-2 text-right font-normal">clicks</th>
              <th className="px-3 py-2 text-right font-normal">impressions</th>
              <th className="px-3 py-2 text-right font-normal">ctr</th>
              <th className="px-3 py-2 text-right font-normal">pos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${title}-${row.key}-${row.page ?? ''}-${row.query ?? ''}`} className="border-b border-edge/8 text-fg-2 last:border-b-0">
                <td className="max-w-[220px] px-3 py-2.5">{renderPrimary(row)}</td>
                <td className="px-3 py-2.5 text-right text-fg-1">{formatCompactNumber(row.clicks)}</td>
                <td className="px-3 py-2.5 text-right">{formatCompactNumber(row.impressions)}</td>
                <td className="px-3 py-2.5 text-right">{formatPercent(row.ctr)}</td>
                <td className="px-3 py-2.5 text-right">{row.position ? row.position.toFixed(1) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <EmptyState label="no rows" /> : null}
      </div>
    </div>
  )
}

function OrganicSearchAnalyticsPanel({
  contentById,
  selectedProperty,
  properties,
  summaries,
  inspections,
  trendPoints,
  totals,
  topPages,
  topQueries,
  opportunities,
}: {
  contentById: Map<string, ContentItemRow>
  selectedProperty: SearchConsolePropertyRow | null
  properties: SearchConsolePropertyRow[]
  summaries: SearchConsoleDimensionSummaryRow[]
  inspections: SearchConsoleUrlInspectionRow[]
  trendPoints: SearchTrendPoint[]
  totals: { clicks: number; impressions: number }
  topPages: SearchAggregateRow[]
  topQueries: SearchAggregateRow[]
  opportunities: SearchAggregateRow[]
}) {
  const passCount = inspections.filter((inspection) => inspection.verdict === 'PASS').length

  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-4">
        <Metric label="properties" value={properties.length} />
        <Metric label="summaries" value={formatCompactNumber(summaries.length)} />
        <Metric label="inspections" value={inspections.length} />
        <Metric label="indexed" value={passCount} />
      </div>

      <div className="border border-edge/12 bg-rim px-3 py-2 font-mono text-xs text-fg-3">
        <span className="text-fg-4">active property</span>
        <span className="ml-2 text-fg-1">{selectedProperty?.displayName ?? 'none selected'}</span>
        <span className="mx-2 text-fg-4">/</span>
        <span>{formatCompactNumber(totals.clicks)} clicks</span>
        <span className="mx-2 text-fg-4">/</span>
        <span>{formatCompactNumber(totals.impressions)} impressions</span>
      </div>

      {trendPoints.length > 0 ? (
        <SearchConsoleTrendChart points={trendPoints} />
      ) : null}

      {properties.length === 0 ? (
        <EmptyState label="connect google search console in settings" />
      ) : summaries.length === 0 ? (
        <EmptyState label="sync search analytics in settings" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <SearchAnalyticsTable
            title="top pages"
            rows={topPages}
            primaryLabel="page"
            renderPrimary={(row) => (
              <div className="min-w-0">
                <div className="truncate text-fg-1">
                  {row.contentItemId ? contentById.get(row.contentItemId)?.title ?? urlPathLabel(row.page ?? '') : urlPathLabel(row.page ?? '')}
                </div>
                <div className="mt-1 truncate text-[11px] text-fg-4">{row.page}</div>
              </div>
            )}
          />
          <SearchAnalyticsTable
            title="top queries"
            rows={topQueries}
            primaryLabel="query"
            renderPrimary={(row) => (
              <div className="truncate text-fg-1">{row.query ?? '-'}</div>
            )}
          />
          <SearchAnalyticsTable
            title="improve next"
            rows={opportunities}
            primaryLabel="candidate"
            renderPrimary={(row) => (
              <div className="min-w-0">
                <div className="truncate text-fg-1">{row.query ?? '-'}</div>
                <div className="mt-1 truncate text-[11px] text-fg-4">{urlPathLabel(row.page ?? '')}</div>
              </div>
            )}
          />
        </div>
      )}
    </div>
  )
}

function SearchConsoleTrendChart({ points }: { points: SearchTrendPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const width = 760
  const height = 240
  const padTop = 20
  const padBottom = 28
  const chartHeight = height - padTop - padBottom
  const maxClicks = Math.max(...points.map((point) => point.clicks), 1)
  const maxImpressions = Math.max(...points.map((point) => point.impressions), 1)
  const chartPoints = points.map((point, index) => {
    const x = (index / Math.max(points.length - 1, 1)) * width
    return {
      ...point,
      x,
      clicksY: padTop + (1 - point.clicks / maxClicks) * chartHeight,
      impressionsY: padTop + (1 - point.impressions / maxImpressions) * chartHeight,
    }
  })
  const pathFor = (entries: typeof chartPoints, yKey: 'clicksY' | 'impressionsY') => (
    entries.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x},${point[yKey]}`).join(' ')
  )
  const clicksPath = pathFor(chartPoints, 'clicksY')
  const impressionsPath = pathFor(chartPoints, 'impressionsY')
  const impressionsAreaPath = `${impressionsPath} L ${width},${height - padBottom} L 0,${height - padBottom} Z`
  const hoveredPoint = hoverIndex == null ? null : chartPoints[hoverIndex]
  const tooltipXPercent = hoveredPoint ? (hoveredPoint.x / width) * 100 : 0
  const tooltipYPercent = hoveredPoint ? (Math.min(hoveredPoint.clicksY, hoveredPoint.impressionsY) / height) * 100 : 0
  const tooltipNearTop = tooltipYPercent < 28
  const tooltipWidthRem = 13
  const tooltipLeft = `clamp(0.75rem, ${tooltipXPercent}%, calc(100% - ${tooltipWidthRem}rem - 0.75rem))`

  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    if (!wrapperRef.current || points.length === 0) return
    const rect = wrapperRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    setHoverIndex(Math.round(ratio * (points.length - 1)))
  }

  return (
    <div className="border border-edge/12 bg-pit-2">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge/12 px-3 py-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">daily search trend</div>
          <div className="mt-1 font-mono text-xs text-fg-2">
            {points[0]?.label ?? '-'} - {points[points.length - 1]?.label ?? '-'}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-label">
          <span className="inline-flex items-center gap-1.5 text-info">
            <span className="h-2 w-2 bg-info" />
            clicks
          </span>
          <span className="inline-flex items-center gap-1.5 text-accent">
            <span className="h-2 w-2 bg-accent" />
            impressions
          </span>
        </div>
      </div>
      <div
        ref={wrapperRef}
        className="relative h-[280px] cursor-crosshair px-3 pb-8 pt-3"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <div className="absolute left-3 top-3 font-mono text-[10px] uppercase tracking-label text-info">
          clicks {formatCompactNumber(maxClicks)}
        </div>
        <div className="absolute right-3 top-3 font-mono text-[10px] uppercase tracking-label text-accent">
          impressions {formatCompactNumber(maxImpressions)}
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block h-full w-full">
          <defs>
            <linearGradient id="search-console-impressions-grad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgb(var(--accent-rgb))" stopOpacity="0.16" />
              <stop offset="100%" stopColor="rgb(var(--accent-rgb))" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
            <line
              key={ratio}
              x1="0"
              x2={width}
              y1={padTop + ratio * chartHeight}
              y2={padTop + ratio * chartHeight}
              stroke="rgb(var(--edge-rgb) / 0.12)"
              strokeDasharray="2 5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {impressionsPath ? <path d={impressionsAreaPath} fill="url(#search-console-impressions-grad)" /> : null}
          {impressionsPath ? (
            <path d={impressionsPath} fill="none" stroke="rgb(var(--accent-rgb))" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
          ) : null}
          {clicksPath ? (
            <path d={clicksPath} fill="none" stroke="rgb(var(--info-rgb))" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
          ) : null}
          {hoveredPoint ? (
            <line
              x1={hoveredPoint.x}
              x2={hoveredPoint.x}
              y1={0}
              y2={height}
              stroke="rgb(var(--fg-1-rgb))"
              strokeWidth="1"
              strokeDasharray="2 3"
              opacity="0.45"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        {hoveredPoint ? (
          <div
            className="pointer-events-none absolute z-20 w-52 border border-edge/24 bg-pit px-3 py-2 font-mono text-xs shadow-terminal-popover"
            style={{
              left: tooltipLeft,
              top: `${tooltipYPercent}%`,
              marginTop: tooltipNearTop ? '8px' : '-8px',
              transform: tooltipNearTop ? 'translateY(0)' : 'translateY(-100%)',
            }}
          >
            <div className="text-[10px] uppercase tracking-label text-fg-4">{hoveredPoint.label}</div>
            <div className="mt-1 flex items-center justify-between gap-4 text-info">
              <span>clicks</span>
              <span className="text-fg-1 tabular-nums">{formatCompactNumber(hoveredPoint.clicks)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-4 text-accent">
              <span>impressions</span>
              <span className="text-fg-1 tabular-nums">{formatCompactNumber(hoveredPoint.impressions)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-4 text-fg-3">
              <span>ctr</span>
              <span className="text-fg-1 tabular-nums">{formatPercent(hoveredPoint.ctr)}</span>
            </div>
          </div>
        ) : null}
        <div className="pointer-events-none absolute bottom-2 left-3 right-3 flex justify-between font-mono text-[10px] uppercase tracking-label text-fg-4">
          <span>{points[0]?.label ?? '-'}</span>
          <span>{points[Math.floor(points.length / 2)]?.label ?? '-'}</span>
          <span>{points[points.length - 1]?.label ?? '-'}</span>
        </div>
      </div>
    </div>
  )
}

function NewsletterAnalyticsPanel({
  contentItems,
  audienceMembers,
  events,
  subscriptions,
  ctas,
}: {
  contentItems: ContentItemRow[]
  audienceMembers: AudienceMemberRow[]
  events: ContentEventRow[]
  subscriptions: AudienceSubscriptionRow[]
  ctas: CtaRow[]
}) {
  const contentById = new Map(contentItems.map((item) => [item.id, item]))
  const audienceById = new Map(audienceMembers.map((member) => [member.id, member]))
  const ctaById = new Map(ctas.map((cta) => [cta.id, cta]))
  const recentEvents = [...events].sort((a, b) => b.createdAt - a.createdAt).slice(0, 80)

  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-4">
        <Metric label="replies" value={countEvents(events, 'reply')} />
        <Metric label="unsubscribed" value={newsletterUnsubscriberCount(subscriptions)} />
        <Metric label="members" value={audienceMembers.length} />
        <Metric label="ctas" value={ctas.filter((cta) => cta.status === 'active').length} />
      </div>

      <div className="overflow-auto border border-edge/12">
        <table className="w-full min-w-[980px] text-left font-mono text-xs">
          <thead className="bg-rim text-[10px] uppercase tracking-label text-fg-4">
            <tr className="border-b border-edge/12">
              <th className="px-3 py-2 font-normal">event</th>
              <th className="px-3 py-2 font-normal">channel</th>
              <th className="px-3 py-2 font-normal">content</th>
              <th className="px-3 py-2 font-normal">cta</th>
              <th className="px-3 py-2 font-normal">subscriber</th>
              <th className="px-3 py-2 font-normal">source</th>
              <th className="px-3 py-2 text-right font-normal">time</th>
            </tr>
          </thead>
          <tbody>
            {recentEvents.map((event) => {
              const content = event.contentItemId ? contentById.get(event.contentItemId) : null
              const subscriber = event.audienceMemberId ? audienceById.get(event.audienceMemberId) : null
              const cta = event.ctaId ? ctaById.get(event.ctaId) : null
              return (
                <tr key={event.id} className="border-b border-edge/8 text-fg-2 last:border-b-0">
                  <td className="px-3 py-2.5"><StatusPill kind={eventKind(event.eventType)}>{event.eventType}</StatusPill></td>
                  <td className="px-3 py-2.5">{event.channel ?? '-'}</td>
                  <td className="max-w-[260px] px-3 py-2.5">
                    <div className="truncate text-fg-1">{content?.title ?? '-'}</div>
                  </td>
                  <td className="max-w-[180px] px-3 py-2.5">
                    <div className="truncate">{cta?.label ?? '-'}</div>
                  </td>
                  <td className="max-w-[220px] px-3 py-2.5">
                    <div className="truncate">{subscriber?.email ?? subscriber?.name ?? '-'}</div>
                  </td>
                  <td className="px-3 py-2.5">{event.source ?? '-'}</td>
                  <td className="px-3 py-2.5 text-right text-fg-4">{formatDate(event.createdAt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {recentEvents.length === 0 ? <EmptyState label="no newsletter events yet" /> : null}
      </div>
    </div>
  )
}

function SocialAnalyticsPanel({
  channels,
  targets,
}: {
  channels: SocialChannelRow[]
  targets: SocialPostTargetRow[]
}) {
  const channelById = new Map(channels.map((channel) => [channel.id, channel]))
  const recentTargets = [...targets]
    .sort((a, b) => socialTargetAnalyticsTime(b) - socialTargetAnalyticsTime(a))
    .slice(0, 60)
  const statusRows = statusCountRows(targets)

  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-4">
        <Metric label="targets" value={targets.length} />
        <Metric label="scheduled" value={targets.filter((target) => target.status === 'scheduled').length} />
        <Metric label="published" value={targets.filter((target) => target.status === 'published').length} />
        <Metric label="failed" value={targets.filter((target) => target.status === 'failed').length} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="border border-edge/12">
          <div className="border-b border-edge/12 bg-rim px-3 py-2 font-mono text-[10px] uppercase tracking-label text-fg-4">status mix</div>
          <div className="divide-y divide-edge/8">
            {statusRows.map((row) => (
              <div key={row.status} className="flex items-center justify-between gap-3 px-3 py-2.5 font-mono text-xs">
                <StatusPill kind={statusKind(row.status)}>{row.status}</StatusPill>
                <span className="text-fg-1">{row.count}</span>
              </div>
            ))}
          </div>
          {statusRows.length === 0 ? <EmptyState label="no social targets yet" /> : null}
        </div>

        <div className="overflow-auto border border-edge/12">
          <table className="w-full min-w-[720px] text-left font-mono text-xs">
            <thead className="bg-rim text-[10px] uppercase tracking-label text-fg-4">
              <tr className="border-b border-edge/12">
                <th className="px-3 py-2 font-normal">status</th>
                <th className="px-3 py-2 font-normal">channel</th>
                <th className="px-3 py-2 font-normal">scheduled</th>
                <th className="px-3 py-2 font-normal">published</th>
                <th className="px-3 py-2 text-right font-normal">attempts</th>
              </tr>
            </thead>
            <tbody>
              {recentTargets.map((target) => {
                const channel = channelById.get(target.channelId)
                return (
                  <tr key={target.id} className="border-b border-edge/8 text-fg-2 last:border-b-0">
                    <td className="px-3 py-2.5"><StatusPill kind={statusKind(target.status)}>{target.status}</StatusPill></td>
                    <td className="max-w-[220px] px-3 py-2.5">
                      <div className="truncate text-fg-1">{channel?.displayName ?? target.channelId}</div>
                      <div className="mt-1 truncate text-[11px] text-fg-4">{channel?.provider ?? channel?.kind ?? '-'}</div>
                    </td>
                    <td className="px-3 py-2.5">{formatDate(target.scheduledAt)}</td>
                    <td className="px-3 py-2.5">{formatDate(target.publishedAt)}</td>
                    <td className="px-3 py-2.5 text-right">{target.attemptCount}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {recentTargets.length === 0 ? <EmptyState label="no social activity yet" /> : null}
        </div>
      </div>
    </div>
  )
}

function AdAnalyticsPanel({
  snapshots,
  totals,
}: {
  snapshots: AdMetricSnapshotRow[]
  totals: ReturnType<typeof sumAdMetricSnapshots>
}) {
  const recentSnapshots = [...snapshots].sort((a, b) => b.periodEnd - a.periodEnd).slice(0, 60)
  const currencyCode = snapshots[0]?.currencyCode ?? 'MXN'
  const ctr = totals.impressions ? totals.clicks / totals.impressions : 0

  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-5">
        <Metric label="views" value={formatCompactNumber(totals.impressions)} />
        <Metric label="clicks" value={formatCompactNumber(totals.clicks)} />
        <Metric label="ctr" value={formatPercent(ctr)} />
        <Metric label="leads" value={formatCompactNumber(totals.leads)} />
        <Metric label="spend" value={formatMoneyMinor(totals.spendMinor, currencyCode)} />
      </div>

      <div className="overflow-auto border border-edge/12">
        <table className="w-full min-w-[860px] text-left font-mono text-xs">
          <thead className="bg-rim text-[10px] uppercase tracking-label text-fg-4">
            <tr className="border-b border-edge/12">
              <th className="px-3 py-2 font-normal">provider</th>
              <th className="px-3 py-2 font-normal">entity</th>
              <th className="px-3 py-2 font-normal">period</th>
              <th className="px-3 py-2 text-right font-normal">views</th>
              <th className="px-3 py-2 text-right font-normal">clicks</th>
              <th className="px-3 py-2 text-right font-normal">leads</th>
              <th className="px-3 py-2 text-right font-normal">spend</th>
            </tr>
          </thead>
          <tbody>
            {recentSnapshots.map((snapshot) => (
              <tr key={snapshot.id} className="border-b border-edge/8 text-fg-2 last:border-b-0">
                <td className="px-3 py-2.5">{snapshot.provider}</td>
                <td className="max-w-[220px] px-3 py-2.5">
                  <div className="truncate text-fg-1">{snapshot.entityKind}</div>
                  <div className="mt-1 truncate text-[11px] text-fg-4">{snapshot.entityExternalId ?? snapshot.promotionId ?? '-'}</div>
                </td>
                <td className="px-3 py-2.5">{formatMetricPeriod(snapshot.periodStart, snapshot.periodEnd)}</td>
                <td className="px-3 py-2.5 text-right">{formatCompactNumber(snapshot.impressions)}</td>
                <td className="px-3 py-2.5 text-right text-fg-1">{formatCompactNumber(snapshot.clicks)}</td>
                <td className="px-3 py-2.5 text-right">{formatCompactNumber(snapshot.leads)}</td>
                <td className="px-3 py-2.5 text-right">{formatMoneyMinor(snapshot.spendMinor, snapshot.currencyCode)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {recentSnapshots.length === 0 ? <EmptyState label="no ad analytics yet" /> : null}
      </div>
    </div>
  )
}

function analyticsTabLabel(tab: AnalyticsDetailTab) {
  if (tab === 'search') return 'organic discovery'
  if (tab === 'newsletter') return 'newsletter activity'
  if (tab === 'social') return 'social publishing'
  return 'paid distribution'
}

function statusCountRows(rows: Array<{ status: string }>) {
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1)
  return Array.from(counts.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status))
}

function socialTargetAnalyticsTime(target: SocialPostTargetRow) {
  return target.publishedAt ?? target.scheduledAt ?? target.updatedAt ?? target.createdAt
}

function formatMetricPeriod(start: number, end: number) {
  if (!start && !end) return '-'
  if (!end || start === end) return formatDate(start)
  return `${formatDate(start)} - ${formatDate(end)}`
}

function MarketingTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 font-mono text-xs uppercase tracking-label transition-colors ${
        active
          ? 'border-accent text-accent glow'
          : 'border-transparent text-fg-3 hover:text-fg-1'
      }`}
    >
      {children}
    </button>
  )
}

function MarketingSidebarButton({
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
          ? 'bg-accent-fill/8 text-accent ring-1 ring-accent-fill/20'
          : 'text-fg-2 hover:bg-accent-fill/4 hover:text-fg-1'
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta ? <span className="ml-3 text-[10px] text-fg-4">{meta}</span> : null}
    </button>
  )
}

function MarketingAppFrame({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string
  eyebrow: string
  onClose: () => void
  children: ReactNode
}) {
  return createPortal(
    <div className="fixed inset-0 z-[900] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative h-screen min-h-screen w-[480px] max-w-full overflow-y-auto border-l border-edge/35 bg-bg-2 font-mono"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-edge/15 bg-bg-2 px-6 py-4">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">{eyebrow}</div>
            <h2 className="mt-1 truncate font-mono text-base font-bold lowercase text-fg-1">{title}</h2>
          </div>
          <button onClick={onClose} className="p-1 text-fg-4 transition hover:text-accent" aria-label="Close app frame">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

function MarketingCreateModal({
  eyebrow,
  title,
  children,
  submitLabel,
  submitDisabled,
  onClose,
  onSubmit,
}: {
  eyebrow: string
  title: string
  children: ReactNode
  submitLabel: string
  submitDisabled?: boolean
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-overlay/70 px-4 pt-[10vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl border border-edge/20 bg-pit-2 shadow-terminal-overlay"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !submitDisabled) {
            event.preventDefault()
            onSubmit()
          }
        }}
      >
        <div className="flex items-center justify-between border-b border-edge/12 px-5 py-3">
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="inline-flex items-center gap-1.5 border border-edge/25 bg-accent-fill/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-accent">
              marketing
            </span>
            <span className="text-fg-4">›</span>
            <span className="text-fg-2 lowercase">{eyebrow}</span>
          </div>
          <button
            onClick={onClose}
            className="font-mono text-xs uppercase tracking-label text-fg-4 transition hover:text-fg-1"
            title="close"
          >
            [esc]
          </button>
        </div>

        <div className="border-b border-edge/12 px-5 py-4">
          <h2 className="font-mono text-2xl font-bold lowercase text-fg-1">{title}</h2>
        </div>

        <div className="px-5 py-5">{children}</div>

        <div className="flex items-center justify-end gap-2 border-t border-edge/12 px-5 py-3">
          <Button onClick={onClose}>cancel</Button>
          <Button kind="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={onSubmit} disabled={submitDisabled}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ChannelToggles({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="flex gap-1.5">
      {CONTENT_CHANNELS.map((channel) => {
        const selected = value.includes(channel)
        return (
          <button
            key={channel}
            type="button"
            onClick={() => {
              const next = selected ? value.filter((item) => item !== channel) : [...value, channel]
              onChange(next.length ? next : [channel])
            }}
            className={`inline-flex h-9 items-center gap-2 border px-3 font-mono text-xs lowercase transition ${
              selected
                ? 'border-accent/60 bg-accent-fill/10 text-accent'
                : 'border-edge/16 bg-rim text-fg-3 hover:border-edge/35 hover:text-fg-1'
            }`}
          >
            {selected ? <Check className="h-3.5 w-3.5" /> : null}
            {channel}
          </button>
        )
      })}
    </div>
  )
}

function CommitInput({
  value,
  onCommit,
  label,
  type = 'text',
  compact = false,
}: {
  value: string
  onCommit: (next: string) => void | Promise<void>
  label?: string
  type?: string
  compact?: boolean
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  async function commit() {
    const next = draft.trim()
    if (next === value) return
    await onCommit(next)
  }
  return (
    <label className="block">
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <input
        type={type}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
        }}
        className={`w-full bg-rim text-fg-1 outline-none transition focus:border-accent ${
          compact
            ? 'border border-transparent px-1 py-1 text-xs hover:border-edge/18'
            : 'border border-edge/15 px-3 py-2 text-sm'
        }`}
      />
    </label>
  )
}

function CommitTextarea({
  value,
  onCommit,
  label,
  rows = 4,
}: {
  value: string
  onCommit: (next: string) => void | Promise<void>
  label?: string
  rows?: number
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  async function commit() {
    if (draft === value) return
    await onCommit(draft)
  }
  return (
    <label className="block">
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <TermTextarea rows={rows} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => void commit()} />
    </label>
  )
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 font-mono text-[10px] uppercase tracking-label text-fg-4">{children}</div>
}

function EmailThemeModeControl({ value, onChange }: { value: EmailThemeMode; onChange: (mode: EmailThemeMode) => void }) {
  return (
    <div className="grid grid-cols-2 border border-edge/15 bg-rim">
      {(['dark', 'light'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={`px-3 py-2 text-left font-mono text-[10px] uppercase tracking-label transition ${
            value === mode
              ? 'bg-accent-fill/10 text-accent'
              : 'text-fg-4 hover:text-fg-1'
          } ${mode === 'light' ? 'border-l border-edge/12' : ''}`}
        >
          {mode}
        </button>
      ))}
    </div>
  )
}

function EmailBinaryControl({ value, onChange }: { value: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 border border-edge/15 bg-rim">
      {[
        { label: 'on', value: true },
        { label: 'off', value: false },
      ].map((option) => (
        <button
          key={option.label}
          type="button"
          onClick={() => onChange(option.value)}
          className={`px-3 py-2 text-left font-mono text-[10px] uppercase tracking-label transition ${
            value === option.value
              ? 'bg-accent-fill/10 text-accent'
              : 'text-fg-4 hover:text-fg-1'
          } ${option.label === 'off' ? 'border-l border-edge/12' : ''}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function EmailWrapperCtaSelect({
  wrapper,
  ctas,
  onChange,
}: {
  wrapper: PublicationEmailWrapper
  ctas: CtaRow[]
  onChange: (updates: Partial<PublicationEmailWrapper>) => void
}) {
  const activeCtas = ctas.filter((cta) => cta.status === 'active')
  const ctaOptions = [
    { value: '', label: 'no cta' },
    ...activeCtas.map((cta) => ({ value: cta.id, label: cta.label })),
  ]
  const selectedCta = ctas.find((cta) => cta.id === wrapper.ctaId) ?? null
  const hasLegacyCta = !wrapper.ctaId && Boolean(wrapper.ctaLabel && wrapper.ctaUrl)
  const display = selectedCta?.label ?? (hasLegacyCta ? `legacy · ${wrapper.ctaLabel}` : 'no cta')

  return (
    <div>
      <FieldLabel>cta</FieldLabel>
      <PachSelect
        value={wrapper.ctaId}
        onChange={(ctaId) => {
          const cta = ctas.find((entry) => entry.id === ctaId)
          onChange({
            ctaId,
            ctaLabel: cta?.label ?? '',
            ctaUrl: cta?.url ?? '',
          })
        }}
        options={ctaOptions}
        display={display}
      />
      {hasLegacyCta ? (
        <div className="mt-1 font-mono text-[10px] lowercase text-fg-4">
          legacy url: select a saved cta to replace it
        </div>
      ) : null}
      {activeCtas.length === 0 ? (
        <div className="mt-1 font-mono text-[10px] lowercase text-fg-4">
          create an active cta in the ctas tab first
        </div>
      ) : null}
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="border border-dashed border-edge/16 px-3 py-6 text-center font-mono text-xs lowercase text-fg-4">
      {label}
    </div>
  )
}

function sectionFromPath(pathname: string): MarketingSection | null {
  const part = pathname.split('/')[2]
  if (part === 'content' || part === 'broadcasts' || part === 'ctas') return 'newsletters'
  return SECTIONS.some((entry) => entry.id === part) ? part as MarketingSection : null
}

function newsletterTabFromPath(pathname: string): NewsletterTab {
  const parts = pathname.split('/')
  const section = parts[2]
  const tab = parts[3]
  if (section === 'content') return 'content'
  if (section === 'broadcasts') return 'broadcasts'
  if (section === 'ctas') return 'ctas'
  if (section !== 'newsletters') return 'content'
  return NEWSLETTER_TABS.some((entry) => entry.id === tab) ? tab as NewsletterTab : 'content'
}

function marketingSectionPath(section: MarketingSection) {
  return section === 'newsletters' ? '/marketing/newsletters/content' : `/marketing/${section}`
}

function broadcastRunIdFromPath(pathname: string) {
  const parts = pathname.split('/')
  if (parts[2] === 'broadcasts' && parts[3]) return decodeURIComponent(parts[3])
  if (parts[2] === 'newsletters' && parts[3] === 'broadcasts' && parts[4]) return decodeURIComponent(parts[4])
  return ''
}

function publicationIdFromPath(pathname: string) {
  const parts = pathname.split('/')
  if (parts[2] === 'newsletters' && parts[3] === 'publications' && parts[4]) return decodeURIComponent(parts[4])
  return ''
}

function blogOutputForContent(item: ContentItemRow, outputs: ContentOutputRow[]) {
  return outputs.find((output) => output.contentItemId === item.id && output.channel === 'blog') ?? null
}

function socialTargetsForContent(item: ContentItemRow, posts: SocialPostRow[], targets: SocialPostTargetRow[]) {
  const postIds = new Set(posts.filter((post) => post.contentItemId === item.id).map((post) => post.id))
  return targets.filter((target) => postIds.has(target.socialPostId))
}

function socialTargetSortTime(target: SocialPostTargetRow, post: SocialPostRow | null) {
  return target.publishedAt ?? target.scheduledAt ?? target.updatedAt ?? post?.updatedAt ?? 0
}

function socialPostsForContent(item: ContentItemRow, posts: SocialPostRow[]) {
  return posts.filter((post) => post.contentItemId === item.id)
}

function adPromotionsForContent(item: ContentItemRow, promotions: AdPromotionRow[]) {
  return promotions.filter((promotion) => promotion.contentItemId === item.id)
}

function adMetricSnapshotsForPromotions(promotions: AdPromotionRow[], snapshots: AdMetricSnapshotRow[]) {
  const promotionIds = new Set(promotions.map((promotion) => promotion.id))
  return snapshots.filter((snapshot) => snapshot.promotionId && promotionIds.has(snapshot.promotionId))
}

function promotablePages(
  pageRecords: PromotablePageRecord[],
  contentItems: ContentItemRow[],
  contentOutputs: ContentOutputRow[],
  keywordIdeas: KeywordIdeaRow[],
  adPromotions: AdPromotionRow[],
  adMetricSnapshots: AdMetricSnapshotRow[],
  searchConsoleSummaries: SearchConsoleDimensionSummaryRow[],
): PromotablePageRow[] {
  const contentById = new Map(contentItems.map((item) => [item.id, item]))
  const outputById = new Map(contentOutputs.map((output) => [output.id, output]))
  const keywordsByPageId = new Map<string, KeywordIdeaRow[]>()
  for (const idea of keywordIdeas) {
    const list = keywordsByPageId.get(idea.promotablePageId) ?? []
    list.push(idea)
    keywordsByPageId.set(idea.promotablePageId, list)
  }
  return pageRecords
    .filter((page) => page.url && page.status !== 'archived')
    .map((page) => {
      const item = page.contentItemId ? contentById.get(page.contentItemId) ?? null : null
      const output = page.contentOutputId ? outputById.get(page.contentOutputId) ?? null : null
      const promotions = adPromotions.filter((promotion) => (
        promotion.promotablePageId === page.id ||
        (output?.id ? promotion.contentOutputId === output.id : false) ||
        (item?.id ? promotion.contentItemId === item.id : false) ||
        normalizeUrl(promotion.landingUrl) === normalizeUrl(page.url)
      ))
      const googlePromotion = promotions.find((promotion) => promotion.provider === 'google') ?? null
      const searchSummaries = searchConsoleSummariesForPage(page, output, item, searchConsoleSummaries)
      const paidMetrics = adMetricSnapshotsForPromotions(promotions, adMetricSnapshots)
      return {
        page,
        item,
        output,
        title: page.title || item?.title || pageTitleFromUrl(page.url),
        url: page.url,
        keywordIdeas: (keywordsByPageId.get(page.id) ?? []).sort((a, b) => b.priority - a.priority || a.keyword.localeCompare(b.keyword)),
        searchSummaries,
        searchTotals: sumSearchConsoleSummaries(searchSummaries.filter((summary) => summary.summaryType === 'page')),
        topQuery: topSearchQuery(searchSummaries),
        promotions,
        googlePromotion,
        paidTotals: sumAdMetricSnapshots(paidMetrics),
      }
    })
    .filter((page): page is PromotablePageRow => Boolean(page))
    .sort((a, b) => (b.page.updatedAt ?? b.output?.publishedAt ?? 0) - (a.page.updatedAt ?? a.output?.publishedAt ?? 0))
}

function searchConsoleSummariesForPage(
  page: PromotablePageRecord,
  output: ContentOutputRow | null,
  item: ContentItemRow | null,
  summaries: SearchConsoleDimensionSummaryRow[],
) {
  const pageUrls = new Set([
    page.url,
    page.canonicalUrl,
    page.sourceUrl,
    output?.publicUrl,
    output?.canonicalUrl,
  ].filter(Boolean).map((url) => normalizeUrl(url)))
  return summaries.filter((summary) => (
    (output?.id ? summary.contentOutputId === output.id : false) ||
    (item?.id ? summary.contentItemId === item.id : false) ||
    (summary.page ? pageUrls.has(normalizeUrl(summary.page)) : false)
  ))
}

function topSearchQuery(summaries: SearchConsoleDimensionSummaryRow[]) {
  return searchConsoleSummaryRows(summaries, 'page_query')[0]?.query ?? ''
}

function sumAdMetricSnapshots(snapshots: AdMetricSnapshotRow[]) {
  return snapshots.reduce(
    (totals, snapshot) => ({
      impressions: totals.impressions + snapshot.impressions,
      clicks: totals.clicks + snapshot.clicks,
      spendMinor: totals.spendMinor + snapshot.spendMinor,
      leads: totals.leads + snapshot.leads,
      conversions: totals.conversions + snapshot.conversions,
    }),
    { impressions: 0, clicks: 0, spendMinor: 0, leads: 0, conversions: 0 },
  )
}

function sumSearchConsoleSummaries(summaries: SearchConsoleDimensionSummaryRow[]) {
  return summaries.reduce(
    (totals, summary) => ({
      impressions: totals.impressions + summary.impressions,
      clicks: totals.clicks + summary.clicks,
    }),
    { impressions: 0, clicks: 0 },
  )
}

function sumSearchConsoleDailySnapshots(snapshots: SearchConsoleDailySnapshotRow[]) {
  return snapshots.reduce(
    (totals, snapshot) => ({
      impressions: totals.impressions + snapshot.impressions,
      clicks: totals.clicks + snapshot.clicks,
    }),
    { impressions: 0, clicks: 0 },
  )
}

function latestSearchSnapshotTimestamp(snapshots: Array<{ dataDate: number | string }>) {
  return snapshots.reduce((latest, snapshot) => {
    const timestamp = searchMetricDateTimestamp(snapshot.dataDate)
    return timestamp ? Math.max(latest, timestamp) : latest
  }, 0)
}

function filterSearchSnapshotsByTrailingDays<T extends { dataDate: number | string }>(snapshots: T[], anchorTimestamp: number, days: number) {
  if (!anchorTimestamp) return snapshots
  const startTimestamp = anchorTimestamp - (days - 1) * 24 * 60 * 60 * 1000
  return snapshots.filter((snapshot) => {
    const timestamp = searchMetricDateTimestamp(snapshot.dataDate)
    return timestamp ? timestamp >= startTimestamp && timestamp <= anchorTimestamp : false
  })
}

function buildSearchDailyTrendPoints(snapshots: SearchConsoleDailySnapshotRow[]) {
  const byDate = new Map<string, {
    timestamp: number
    clicks: number
    impressions: number
    weightedPosition: number
  }>()

  for (const snapshot of snapshots) {
    const timestamp = searchMetricDateTimestamp(snapshot.dataDate)
    if (!timestamp) continue
    const key = new Date(timestamp).toISOString().slice(0, 10)
    const current = byDate.get(key) ?? {
      timestamp,
      clicks: 0,
      impressions: 0,
      weightedPosition: 0,
    }
    current.clicks += snapshot.clicks
    current.impressions += snapshot.impressions
    current.weightedPosition += readNumericText(snapshot.position) * Math.max(1, snapshot.impressions)
    byDate.set(key, current)
  }

  return Array.from(byDate.entries())
    .map(([id, row]) => ({
      id,
      label: formatShortDate(row.timestamp),
      timestamp: row.timestamp,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.impressions ? row.clicks / row.impressions : 0,
      position: row.impressions ? row.weightedPosition / row.impressions : 0,
    }))
    .sort((a, b) => a.timestamp - b.timestamp)
}

function searchConsoleSummaryRows(summaries: SearchConsoleDimensionSummaryRow[], summaryType: 'page' | 'query' | 'page_query') {
  return summaries
    .filter((summary) => summary.summaryType === summaryType)
    .map((summary) => ({
      key: summary.summaryKey,
      page: summary.page,
      query: summary.query,
      contentItemId: summary.contentItemId,
      clicks: summary.clicks,
      impressions: summary.impressions,
      ctr: summary.impressions ? summary.clicks / summary.impressions : 0,
      position: readNumericText(summary.position),
    }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
}

function searchConsoleOpportunities(summaries: SearchConsoleDimensionSummaryRow[]) {
  return searchConsoleSummaryRows(summaries, 'page_query')
    .filter((row) => row.impressions >= 10 && row.ctr < 0.05)
    .sort((a, b) => b.impressions - a.impressions || a.position - b.position)
}

function readNumericText(value: string | null | undefined) {
  if (!value) return 0
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function adPromotionHeadline(promotion: AdPromotionRow) {
  const creative = readRecord(promotion.creative)
  if (typeof creative.headline === 'string') return creative.headline
  return readStringList(creative.headlines)[0] ?? ''
}

function promotionKeywords(promotion: AdPromotionRow) {
  return readStringList(readRecord(promotion.targeting).keywords)
}

function promotionDateRange(promotion: AdPromotionRow) {
  if (!promotion.startsAt && !promotion.endsAt) return 'no dates'
  if (!promotion.endsAt) return `from ${formatDate(promotion.startsAt)}`
  if (!promotion.startsAt) return `until ${formatDate(promotion.endsAt)}`
  return `${formatDate(promotion.startsAt)} - ${formatDate(promotion.endsAt)}`
}

function defaultGoogleKeywords(page: PromotablePageRow) {
  const generatedKeywords = usableKeywordIdeas(page)
    .map((idea) => idea.keyword)
    .slice(0, 16)
  const queryKeywords = searchConsoleSummaryRows(page.searchSummaries, 'page_query')
    .map((row) => row.query)
    .filter((query): query is string => Boolean(query))
    .slice(0, 8)
  const titleKeywords = [
    page.title,
    page.item?.excerpt,
    page.item ? firstParagraphText(page.item.body) : undefined,
    urlPathLabel(page.url),
  ]
    .flatMap((value) => keywordCandidates(value))
    .slice(0, 8)
  return uniqueStrings([...generatedKeywords, ...queryKeywords, ...titleKeywords]).slice(0, 16)
}

function usableKeywordIdeas(page: PromotablePageRow) {
  return page.keywordIdeas
    .filter((idea) => !idea.negative)
    .filter((idea) => ['approved', 'suggested', 'used'].includes(idea.status))
    .sort((a, b) => {
      const statusRank = keywordStatusRank(b.status) - keywordStatusRank(a.status)
      return statusRank || b.priority - a.priority || a.keyword.localeCompare(b.keyword)
    })
}

function keywordGenerationRunsForOrganization(runs: AgentRunRow[], organizationId: string) {
  if (!organizationId) return []
  return runs
    .filter((run) => {
      const metadata = readRecord(run.metadata)
      const isKeywordRun = run.subjectType === 'mkt_keyword_generation'
        || readString(metadata.handler) === 'keyword-generation-mcp'
        || readString(metadata.workflow) === 'google_search_keyword_generation'
      if (!isKeywordRun) return false
      return run.subjectId === organizationId || readString(metadata.organizationId) === organizationId
    })
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}

function keywordGenerationProgressReportsForRuns(reports: AgentRunProgressReportRow[], runs: AgentRunRow[]) {
  const runIds = new Set(runs.map((run) => run.id))
  return reports
    .filter((report) => runIds.has(report.runId))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}

function keywordGenerationRunStateByPage(
  pages: PromotablePageRow[],
  runs: AgentRunRow[],
  reports: AgentRunProgressReportRow[],
) {
  const runsById = new Map(runs.map((run) => [run.id, run]))
  const reportsByRunId = new Map<string, AgentRunProgressReportRow[]>()
  for (const report of reports) {
    const list = reportsByRunId.get(report.runId) ?? []
    list.push(report)
    reportsByRunId.set(report.runId, list)
  }

  const runsByPageId = new Map<string, AgentRunRow[]>()
  for (const run of runs) {
    for (const pageId of keywordGenerationRunPageIds(run)) {
      const list = runsByPageId.get(pageId) ?? []
      list.push(run)
      runsByPageId.set(pageId, list)
    }
  }

  const byPageId = new Map<string, KeywordGenerationPageRunState>()
  for (const page of pages) {
    const metadata = readRecord(page.page.metadata)
    const lastRunId = readString(metadata.lastKeywordRunId)
    const candidates = uniqueRuns([
      lastRunId ? runsById.get(lastRunId) ?? null : null,
      ...(runsByPageId.get(page.page.id) ?? []),
    ])
    const run = candidates.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0] ?? null
    const progress = run ? reportsByRunId.get(run.id)?.[0] ?? null : null
    const state = keywordGenerationRunStateForPage(page, run, progress)
    if (state) byPageId.set(page.page.id, state)
  }
  return byPageId
}

function keywordGenerationRunPageIds(run: AgentRunRow) {
  const metadata = readRecord(run.metadata)
  const pageIds = new Set(readStringList(metadata.pageIds))
  const pages = Array.isArray(metadata.pages) ? metadata.pages : []
  for (const page of pages) {
    const id = readString(readRecord(page).id)
    if (id) pageIds.add(id)
  }
  return [...pageIds]
}

function uniqueRuns(runs: Array<AgentRunRow | null>) {
  const seen = new Set<string>()
  const output: AgentRunRow[] = []
  for (const run of runs) {
    if (!run || seen.has(run.id)) continue
    seen.add(run.id)
    output.push(run)
  }
  return output
}

function keywordGenerationRunStateForPage(
  page: PromotablePageRow,
  run: AgentRunRow | null,
  progress: AgentRunProgressReportRow | null,
): KeywordGenerationPageRunState | null {
  const metadata = readRecord(page.page.metadata)
  const metadataStatus = readString(metadata.keywordGenerationStatus)
  const positiveKeywords = usableKeywordIdeas(page).length
  const generatedAt = readTimestamp(metadata.lastKeywordGeneratedAt)
  const status = normalizeKeywordGenerationStatus(run?.status, metadataStatus, positiveKeywords)
  if (!status) return null

  const detail = keywordGenerationDetail({
    status,
    run,
    progress,
    generatedAt,
    positiveKeywords,
  })

  return {
    status,
    label: keywordGenerationLabel(status),
    detail,
    run,
    progress,
  }
}

function normalizeKeywordGenerationStatus(runStatus: string | undefined, metadataStatus: string, positiveKeywords: number): KeywordGenerationPageRunState['status'] | null {
  if (runStatus === 'failed') return 'failed'
  if (runStatus === 'canceled') return 'canceled'
  if (runStatus === 'needs_human') return 'needs_human'
  if (runStatus === 'running') return 'running'
  if (runStatus === 'bootstrapping' || runStatus === 'reserved' || runStatus === 'queued') return 'queued'
  if (runStatus === 'completed' || metadataStatus === 'done' || positiveKeywords > 0) return 'done'
  if (metadataStatus === 'running') return 'running'
  if (metadataStatus === 'queued') return 'queued'
  return null
}

function keywordGenerationLabel(status: KeywordGenerationPageRunState['status']) {
  if (status === 'queued') return 'queued'
  if (status === 'running') return 'generating'
  if (status === 'needs_human') return 'needs review'
  if (status === 'done') return 'generated'
  if (status === 'failed') return 'failed'
  return 'canceled'
}

function keywordGenerationDetail({
  status,
  run,
  progress,
  generatedAt,
  positiveKeywords,
}: {
  status: KeywordGenerationPageRunState['status']
  run: AgentRunRow | null
  progress: AgentRunProgressReportRow | null
  generatedAt: number | null
  positiveKeywords: number
}) {
  if (status === 'done') {
    if (generatedAt) return `generated ${formatDate(generatedAt)}`
    if (positiveKeywords > 0) return `${positiveKeywords} ideas available`
  }
  return progress?.message || run?.statusMessage || keywordGenerationLabel(status)
}

function keywordGenerationStatusKind(status: KeywordGenerationPageRunState['status']): Parameters<typeof StatusPill>[0]['kind'] {
  if (status === 'done') return 'ok'
  if (status === 'failed' || status === 'canceled') return 'fail'
  if (status === 'queued' || status === 'needs_human') return 'warn'
  return 'info'
}

function keywordStatusRank(status: string) {
  if (status === 'approved') return 3
  if (status === 'used') return 2
  if (status === 'suggested') return 1
  return 0
}

function keywordStatusLabel(page: PromotablePageRecord) {
  const metadata = readRecord(page.metadata)
  const status = readString(metadata.keywordGenerationStatus)
  if (status === 'queued') return 'queued'
  if (status === 'running') return 'running'
  if (status === 'done') return 'generated'
  return 'no run'
}

function defaultGoogleHeadlines(page: PromotablePageRow) {
  const title = page.title.trim()
  const path = urlPathLabel(page.url)
  return uniqueStrings([
    title,
    title.length > 26 ? title.slice(0, 27).trim() : title,
    page.topQuery ? `Mejora ${page.topQuery}` : '',
    path && path !== '-' ? path.replace(/[-/]/g, ' ').trim() : '',
  ].filter(Boolean)).slice(0, 6)
}

function defaultGoogleDescriptions(page: PromotablePageRow) {
  const excerpt = page.item?.excerpt || (page.item ? firstParagraphText(page.item.body) : '')
  return uniqueStrings([
    excerpt,
    page.topQuery ? `Contenido para entender ${page.topQuery} y decidir el siguiente paso.` : '',
    `Conoce ${page.title} y encuentra el recurso correcto para avanzar.`,
  ].filter(Boolean)).slice(0, 4)
}

function keywordCandidates(value: string | null | undefined) {
  if (!value) return []
  return value
    .split(/[.,:;|/()\[\]\n]+/g)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length >= 4 && entry.length <= 60)
}

function lineList(value: string) {
  return uniqueStrings(value.split('\n').map((entry) => entry.trim()).filter(Boolean))
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values) {
    const normalized = value.trim()
    const key = normalized.toLowerCase()
    if (!normalized || seen.has(key)) continue
    seen.add(key)
    output.push(normalized)
  }
  return output
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function readStringList(value: unknown) {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return []
}

function readTimestamp(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeUrl(value: string | null | undefined) {
  if (!value) return ''
  try {
    const url = new URL(value)
    url.hash = ''
    return url.toString().replace(/\/+$/, '').toLowerCase()
  } catch {
    return value.trim().replace(/\/+$/, '').toLowerCase()
  }
}

function normalizePromotablePageUrl(value: string) {
  const trimmed = value.trim()
  const input = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : /^(localhost|127\.0\.0\.1|\[::1])(?::\d+)?(?:\/|$)/i.test(trimmed)
      ? `http://${trimmed}`
      : `https://${trimmed}`
  const url = new URL(input)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Invalid URL')
  url.protocol = url.protocol.toLowerCase()
  url.hostname = url.hostname.toLowerCase()
  url.hash = ''
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '')
  url.searchParams.sort()
  return url.toString()
}

function pageTitleFromUrl(value: string) {
  try {
    const url = new URL(value)
    const part = url.pathname.split('/').filter(Boolean).pop() || url.hostname
    return decodeURIComponent(part).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || url.hostname
  } catch {
    return value
  }
}

function buildMarketingCalendarEvents({
  contentItems,
  runs,
  socialChannels,
  socialPosts,
  socialPostTargets,
  adPromotions,
}: {
  contentItems: ContentItemRow[]
  runs: DistributionRunRow[]
  socialChannels: SocialChannelRow[]
  socialPosts: SocialPostRow[]
  socialPostTargets: SocialPostTargetRow[]
  adPromotions: AdPromotionRow[]
}) {
  const contentById = new Map(contentItems.map((entry) => [entry.id, entry]))
  const socialPostById = new Map(socialPosts.map((entry) => [entry.id, entry]))
  const socialChannelById = new Map(socialChannels.map((entry) => [entry.id, entry]))
  const events: MarketingCalendarEvent[] = []

  for (const run of runs) {
    if (!run.scheduledAt) continue
    const content = run.contentItemId ? contentById.get(run.contentItemId) : null
    const type = marketingCalendarRunType(run.channel)
    const destinationName = run.channel === 'newsletter' ? 'email broadcast' : run.channel
    events.push({
      id: `run-${run.id}`,
      type,
      title: run.name || content?.title || 'scheduled content',
      startsAt: run.scheduledAt,
      endsAt: run.scheduledAt + MARKETING_CALENDAR_EVENT_DURATION_MS,
      status: run.status,
      channelName: run.channel,
      destinationKey: `run:${run.channel}`,
      destinationName,
      contentTitle: content?.title ?? '',
      timezone: run.scheduledTimezone || DEFAULT_MARKETING_TIMEZONE,
      href: run.channel === 'blog' && run.contentItemId
        ? `/marketing/newsletters/content?content=${run.contentItemId}`
        : `/marketing/newsletters/broadcasts/${run.id}`,
      tone: marketingCalendarStatusTone(run.status),
    })
  }

  for (const target of socialPostTargets) {
    if (!target.scheduledAt) continue
    const post = socialPostById.get(target.socialPostId)
    const channel = socialChannelById.get(target.channelId)
    const content = post?.contentItemId ? contentById.get(post.contentItemId) : null
    events.push({
      id: `social-${target.id}`,
      type: 'social',
      title: post?.title || post?.caption || 'social post',
      startsAt: target.scheduledAt,
      endsAt: target.scheduledAt + MARKETING_CALENDAR_EVENT_DURATION_MS,
      status: target.status,
      channelName: channel?.provider ?? 'social',
      destinationKey: target.channelId,
      destinationName: channel?.displayName ?? 'social destination',
      contentTitle: content?.title ?? '',
      timezone: target.scheduledTimezone || DEFAULT_MARKETING_TIMEZONE,
      href: '/marketing/social',
      tone: marketingCalendarStatusTone(target.status),
    })
  }

  for (const promotion of adPromotions) {
    if (!promotion.startsAt) continue
    const content = contentById.get(promotion.contentItemId)
    const startsAt = promotion.startsAt
    const endsAt = promotion.endsAt && promotion.endsAt > startsAt
      ? promotion.endsAt
      : startsAt + MARKETING_CALENDAR_EVENT_DURATION_MS
    events.push({
      id: `ad-${promotion.id}`,
      type: 'ad',
      title: adPromotionHeadline(promotion) || content?.title || 'ad promotion',
      startsAt,
      endsAt,
      status: promotion.status,
      channelName: `${promotion.provider} ad`,
      destinationKey: promotion.adAccountExternalId ? `ad:${promotion.provider}:${promotion.adAccountExternalId}` : `ad:${promotion.provider}:pending`,
      destinationName: promotion.adAccountExternalId || 'ad account pending',
      contentTitle: content?.title ?? '',
      timezone: DEFAULT_MARKETING_TIMEZONE,
      href: promotion.socialPostId ? '/marketing/social' : `/marketing/newsletters/content?content=${promotion.contentItemId}`,
      tone: marketingCalendarStatusTone(promotion.status),
    })
  }

  return events.sort((a, b) => a.startsAt - b.startsAt)
}

function buildMarketingCalendarFilterConfigs(events: MarketingCalendarEvent[]): FilterFieldConfig[] {
  const eventTypes = uniqueMarketingCalendarOptions(events.map((event) => ({
    value: event.type,
    label: marketingCalendarEventTypeLabel(event.type),
  })))
  const channels = uniqueMarketingCalendarOptions(events.map((event) => ({
    value: event.channelName,
    label: event.channelName,
  })))
  const destinations = uniqueMarketingCalendarOptions(events.map((event) => ({
    value: event.destinationKey,
    label: event.destinationName,
  })))
  const statuses = new Set(events.map((event) => event.status))
  const statusOptions = [
    ...MARKETING_CALENDAR_STATUS_ORDER.filter((status) => statuses.has(status)),
    ...[...statuses].filter((status) => !MARKETING_CALENDAR_STATUS_ORDER.includes(status)).sort(),
  ]

  return [
    {
      field: 'eventType',
      label: 'type',
      icon: CalendarDays,
      options: eventTypes,
      allowSelectAll: true,
    },
    {
      field: 'channel',
      label: 'channel',
      icon: Newspaper,
      options: channels,
      allowSelectAll: true,
    },
    {
      field: 'status',
      label: 'status',
      icon: Radio,
      options: statusOptions.map((status) => ({ value: status, label: status })),
      allowSelectAll: true,
    },
    {
      field: 'destination',
      label: 'destination',
      icon: Building2,
      options: destinations,
      allowSelectAll: true,
    },
  ]
}

function uniqueMarketingCalendarOptions(options: Array<{ value: string; label: string }>) {
  const seen = new Map<string, string>()
  for (const option of options) {
    if (!option.value || seen.has(option.value)) continue
    seen.set(option.value, option.label)
  }
  return [...seen.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

function filterMarketingCalendarEvents(events: MarketingCalendarEvent[], activeFilters: ActiveFilters, searchQuery: string) {
  const q = searchQuery.trim().toLowerCase()
  return events.filter((event) => {
    if (!matchesMarketingCalendarFilter(activeFilters.eventType, event.type)) return false
    if (!matchesMarketingCalendarFilter(activeFilters.channel, event.channelName)) return false
    if (!matchesMarketingCalendarFilter(activeFilters.status, event.status)) return false
    if (!matchesMarketingCalendarFilter(activeFilters.destination, event.destinationKey)) return false
    if (!q) return true

    return [
      event.title,
      event.status,
      event.type,
      event.channelName,
      event.destinationName,
      event.contentTitle,
      event.timezone,
    ].join(' ').toLowerCase().includes(q)
  })
}

function matchesMarketingCalendarFilter(values: string[] | undefined, value: string) {
  return !values || values.length === 0 || values.includes(value)
}

function toMarketingFullCalendarEvent(event: MarketingCalendarEvent): EventInput {
  return {
    id: event.id,
    title: event.title,
    start: new Date(event.startsAt).toISOString(),
    end: new Date(event.endsAt).toISOString(),
    extendedProps: event,
  }
}

function renderMarketingCalendarDayCellContent(arg: DayCellContentArg, onOpenDay: (date: Date) => void) {
  if (arg.view.type !== 'dayGridMonth') return arg.dayNumberText

  return (
    <button
      type="button"
      className="pach-calendar-day-number"
      data-calendar-date={formatMarketingCalendarDateParam(arg.date)}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onOpenDay(arg.date)
      }}
    >
      {arg.dayNumberText}
    </button>
  )
}

function renderMarketingCalendarEventContent(arg: EventContentArg) {
  const event = arg.event.extendedProps as MarketingCalendarEvent
  return (
    <div className="pach-calendar-event">
      <div className="pach-calendar-event__topline">
        <span className="pach-calendar-event__time">{formatEventTime(event.startsAt)}</span>
        <span className="pach-calendar-event__status">{event.status}</span>
      </div>
      <div className="pach-calendar-event__title">{event.title}</div>
      <div className="pach-calendar-event__meta">{event.destinationName} · {timezoneLabel(event.timezone)}</div>
    </div>
  )
}

function handleMarketingCalendarEventMount(arg: EventMountArg) {
  const event = arg.event.extendedProps as MarketingCalendarEvent
  arg.el.title = [
    event.title,
    event.status,
    formatScheduledDate(event.startsAt, event.timezone),
    event.channelName,
    event.destinationName,
  ].filter(Boolean).join('\n')
}

function readStoredMarketingCalendarState(): StoredMarketingCalendarState {
  const fallback: StoredMarketingCalendarState = {
    view: 'timeGridWeek',
    currentDate: null,
    filters: { ...EMPTY_MARKETING_CALENDAR_FILTERS },
    searchQuery: '',
  }
  if (typeof window === 'undefined') return fallback

  try {
    const raw = window.localStorage.getItem(MARKETING_CALENDAR_STATE_STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<StoredMarketingCalendarState>
    return {
      view: readMarketingCalendarView(parsed.view) ?? fallback.view,
      currentDate: readFiniteTimestamp(parsed.currentDate),
      filters: normalizeStoredMarketingCalendarFilters(parsed.filters),
      searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery : '',
    }
  } catch {
    return fallback
  }
}

function writeStoredMarketingCalendarState(state: StoredMarketingCalendarState) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(MARKETING_CALENDAR_STATE_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage can be unavailable in restricted contexts.
  }
}

function readMarketingCalendarView(value: unknown): MarketingCalendarView | null {
  return typeof value === 'string' && MARKETING_CALENDAR_VIEW_OPTIONS.some((option) => option.value === value)
    ? value as MarketingCalendarView
    : null
}

function readFiniteTimestamp(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeStoredMarketingCalendarFilters(value: unknown): ActiveFilters {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...EMPTY_MARKETING_CALENDAR_FILTERS }
  const raw = value as Record<string, unknown>
  return {
    eventType: readStringArray(raw.eventType),
    channel: readStringArray(raw.channel),
    status: readStringArray(raw.status),
    destination: readStringArray(raw.destination),
  }
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function marketingCalendarRunType(channel: string) {
  if (channel === 'newsletter') return 'newsletter'
  if (channel === 'blog') return 'blog'
  return 'distribution'
}

function marketingCalendarEventTypeLabel(type: string) {
  if (type === 'ad') return 'ad promotion'
  if (type === 'social') return 'social post'
  return type
}

function marketingCalendarStatusTone(status: string): MarketingCalendarEventTone {
  if (['active', 'completed', 'published', 'ready', 'sent'].includes(status)) return 'ok'
  if (['draft', 'paused', 'publishing', 'scheduled', 'sending'].includes(status)) return 'warn'
  if (['archived', 'blocked_waiting_for_output', 'canceled', 'failed'].includes(status)) return 'fail'
  return 'info'
}

function marketingCalendarStatusTextClass(tone: MarketingCalendarEventTone) {
  if (tone === 'ok') return 'text-ok'
  if (tone === 'warn') return 'text-warn'
  if (tone === 'fail') return 'text-fail'
  if (tone === 'info') return 'text-info'
  return 'text-fg-4'
}

function formatEventTime(value: number) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function formatMarketingCalendarDateParam(value: Date | number) {
  const date = value instanceof Date ? value : new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function defaultLinkedInCaption(item: ContentItemRow) {
  const excerpt = item.excerpt || firstParagraphText(item.body)
  return excerpt ? `${item.title}\n\n${excerpt}` : item.title
}

function firstParagraphText(markdown: string) {
  return markdown
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#') && !line.startsWith(':::') && !line.startsWith('!['))
    ?.slice(0, 280)
}

function defaultSocialScheduleDate(output: ContentOutputRow | null) {
  const base = output?.scheduledAt && output.scheduledAt > Date.now()
    ? new Date(output.scheduledAt + 60 * 60 * 1000)
    : new Date(Date.now() + 24 * 60 * 60 * 1000)
  base.setMinutes(0, 0, 0)
  if (!output?.scheduledAt || output.scheduledAt <= Date.now()) base.setHours(9, 0, 0, 0)
  return base
}

function toDatetimeLocalValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('')
}

function byOrganization<T extends { organizationId: string }>(rows: T[], organizationId: string) {
  return rows.filter((row) => row.organizationId === organizationId)
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function defaultEmailWrapper(): PublicationEmailWrapper {
  return {
    header: 'Ardia',
    headerLogo: defaultHeaderLogo(),
    headerLogoEnabled: true,
    beforeContent: '',
    footer: 'Ardia · Infraestructura de cobranza, conciliación y seguimiento para desarrolladoras inmobiliarias en México.',
    ctaId: '',
    ctaLabel: '',
    ctaUrl: '',
  }
}

function defaultPublicationCadence(): PublicationCadenceConfig {
  return {
    enabled: false,
    mode: 'autonomous',
    frequency: 'weekly',
    lookaheadDays: 14,
    cooldownDays: 7,
    timezone: DEFAULT_MARKETING_TIMEZONE,
    time: '09:00',
    dayOfWeek: 1,
    dayOfMonth: 1,
    minIdeaBacklog: 4,
  }
}

function publicationCadenceConfig(publication: PublicationRow | null): PublicationCadenceConfig {
  const metadata = readRecord(publication?.metadata)
  const cadence = readRecord(metadata.marketingCadence)
  const fallback = defaultPublicationCadence()
  return {
    enabled: cadence.enabled === true,
    mode: cadence.mode === 'issue' ? 'issue' : fallback.mode,
    frequency: cadence.frequency === 'monthly' || cadence.frequency === 'quarterly' ? cadence.frequency : fallback.frequency,
    lookaheadDays: positiveInteger(cadence.lookaheadDays, fallback.lookaheadDays),
    cooldownDays: positiveInteger(cadence.cooldownDays, fallback.cooldownDays),
    timezone: typeof cadence.timezone === 'string' && cadence.timezone.trim() ? cadence.timezone : fallback.timezone,
    time: typeof cadence.time === 'string' && /^\d{1,2}:\d{2}$/.test(cadence.time) ? cadence.time : fallback.time,
    dayOfWeek: boundedInteger(cadence.dayOfWeek, fallback.dayOfWeek, 0, 6),
    dayOfMonth: boundedInteger(cadence.dayOfMonth, fallback.dayOfMonth, 1, 31),
    minIdeaBacklog: positiveInteger(cadence.minIdeaBacklog, fallback.minIdeaBacklog),
  }
}

function publicationNewsletterGuidelines(publication: PublicationRow | null) {
  const editorialProfile = readRecord(publication?.editorialProfile)
  return typeof editorialProfile.newsletterGuidelines === 'string' ? editorialProfile.newsletterGuidelines : ''
}

function publicationIdeaGuidelines(publication: PublicationRow | null) {
  const editorialProfile = readRecord(publication?.editorialProfile)
  if (typeof editorialProfile.ideaGuidelines === 'string') return editorialProfile.ideaGuidelines
  if (typeof editorialProfile.editorialIdeaGuidelines === 'string') return editorialProfile.editorialIdeaGuidelines
  return ''
}

function publicationResearchSources(publication: PublicationRow | null): PublicationResearchSource[] {
  const raw = readRecord(publication?.editorialProfile).researchSources
  if (!Array.isArray(raw)) return []

  return raw.flatMap((value) => {
    const source = readRecord(value)
    const id = typeof source.id === 'string' ? source.id.trim() : ''
    const name = typeof source.name === 'string' ? source.name.trim() : ''
    const credentialId = typeof source.credentialId === 'string' ? source.credentialId.trim() : ''
    if (!id || !name || !credentialId) return []
    return [{
      id,
      name,
      credentialId,
      baseUrl: typeof source.baseUrl === 'string' ? source.baseUrl : '',
      docsUrl: typeof source.docsUrl === 'string' ? source.docsUrl : '',
      instructions: typeof source.instructions === 'string' ? source.instructions : '',
      enabled: source.enabled !== false,
    }]
  })
}

function publicationCadencePayload(cadence: PublicationCadenceConfig) {
  return {
    enabled: cadence.enabled,
    mode: cadence.mode,
    frequency: cadence.frequency,
    lookaheadDays: positiveInteger(cadence.lookaheadDays, 14),
    cooldownDays: positiveInteger(cadence.cooldownDays, 7),
    timezone: cadence.timezone || DEFAULT_MARKETING_TIMEZONE,
    time: cadence.time || '09:00',
    dayOfWeek: boundedInteger(cadence.dayOfWeek, 1, 0, 6),
    dayOfMonth: boundedInteger(cadence.dayOfMonth, 1, 1, 31),
    minIdeaBacklog: positiveInteger(cadence.minIdeaBacklog, 4),
  }
}

function defaultHeaderLogo() {
  return {
    enabled: true,
    source: 'designSystem',
    darkModeAssetKey: 'logos.wordmarkTransactional',
    lightModeAssetKey: 'logos.wordmarkTransactional',
    alt: 'Ardia',
  }
}

function emailWrapperPayload(wrapper: PublicationEmailWrapper) {
  const ctaPayload = wrapper.ctaId
    ? { id: wrapper.ctaId, label: wrapper.ctaLabel, url: wrapper.ctaUrl }
    : wrapper.ctaLabel && wrapper.ctaUrl
      ? { label: wrapper.ctaLabel, url: wrapper.ctaUrl }
      : null

  return {
    header: wrapper.header,
    headerLogo: {
      ...defaultHeaderLogo(),
      ...wrapper.headerLogo,
      enabled: wrapper.headerLogoEnabled,
    },
    beforeContent: wrapper.beforeContent,
    footer: wrapper.footer,
    cta: ctaPayload,
  }
}

function publicationEmailWrapper(publication: PublicationRow | null): PublicationEmailWrapper {
  const metadata = readRecord(publication?.metadata)
  const emailWrapper = readRecord(metadata.emailWrapper)
  const emailBlocks = readRecord(metadata.emailBlocks)
  const source = Object.keys(emailWrapper).length ? emailWrapper : emailBlocks
  const cta = readRecord(source.cta)
  const headerLogo = { ...defaultHeaderLogo(), ...readRecord(source.headerLogo) }
  const fallback = defaultEmailWrapper()
  return {
    header: typeof source.header === 'string' ? source.header : fallback.header,
    headerLogo,
    headerLogoEnabled: headerLogo.enabled !== false,
    beforeContent: typeof source.beforeContent === 'string' ? source.beforeContent : fallback.beforeContent,
    footer: typeof source.footer === 'string' ? source.footer : fallback.footer,
    ctaId: typeof cta.id === 'string' ? cta.id : '',
    ctaLabel: typeof cta.label === 'string' ? cta.label : fallback.ctaLabel,
    ctaUrl: typeof cta.url === 'string' ? cta.url : fallback.ctaUrl,
  }
}

function publicationEmailThemeMode(publication: PublicationRow | null): EmailThemeMode {
  return readEmailThemeMode(readRecord(publication?.metadata).emailThemeMode) ?? 'light'
}

function runEmailThemeMode(run: DistributionRunRow, publication: PublicationRow | null): EmailThemeMode {
  return readEmailThemeMode(readRecord(run.metadata).emailThemeMode) ?? publicationEmailThemeMode(publication)
}

function readEmailThemeMode(value: unknown): EmailThemeMode | null {
  return value === 'dark' || value === 'light' ? value : null
}

function newsletterSubscriberCount(subscriptions: AudienceSubscriptionRow[]) {
  return new Set(
    subscriptions
      .filter((entry) => entry.channel === 'newsletter' && entry.status === 'subscribed')
      .map((entry) => entry.audienceMemberId),
  ).size
}

function newsletterUnsubscriberCount(subscriptions: AudienceSubscriptionRow[]) {
  return new Set(
    subscriptions
      .filter((entry) => entry.channel === 'newsletter' && entry.status === 'unsubscribed')
      .map((entry) => entry.audienceMemberId),
  ).size
}

function countEvents(events: ContentEventRow[], eventType: string) {
  return events.filter((event) => event.eventType === eventType).length
}

function isPublicBlogContentItem(item: Pick<ContentItemRow, 'status' | 'supportedChannels'>) {
  return ['ready', 'published'].includes(item.status) && item.supportedChannels.includes('blog')
}

function statusKind(status: string): Parameters<typeof StatusPill>[0]['kind'] {
  if (['active', 'ready', 'published', 'sent', 'subscribed'].includes(status)) return 'ok'
  if (['draft', 'scheduled', 'sending', 'paused'].includes(status)) return 'warn'
  if (['failed', 'archived', 'unsubscribed'].includes(status)) return 'fail'
  return 'idle'
}

function renderWarningClass(severity: EmailRenderWarning['severity']) {
  if (severity === 'error') return 'border-fail/30 bg-fail/5 text-fail'
  if (severity === 'warning') return 'border-warn/30 bg-warn/5 text-warn'
  return 'border-info/25 bg-info/5 text-info'
}

function eventKind(eventType: string): Parameters<typeof StatusPill>[0]['kind'] {
  if (eventType === 'click') return 'info'
  if (eventType === 'reply') return 'ok'
  if (eventType === 'subscribe') return 'ok'
  if (eventType === 'unsubscribe') return 'fail'
  if (eventType === 'send') return 'warn'
  return 'idle'
}

function formatDate(value: number | null | undefined) {
  if (!value) return '-'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function formatShortDate(value: number) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: '2-digit' }).format(new Date(value))
}

function searchMetricDateTimestamp(value: number | string | null | undefined) {
  if (!value) return null
  const parsed = typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatScheduledDate(value: number | null | undefined, timezone: string | null | undefined) {
  if (!value) return '-'
  const resolvedTimezone = timezone || DEFAULT_MARKETING_TIMEZONE
  const formatted = new Intl.DateTimeFormat(undefined, {
    timeZone: resolvedTimezone,
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
  return `${formatted} · ${timezoneLabel(resolvedTimezone)}`
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function formatPercent(value: number) {
  return new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 }).format(value)
}

function urlPathLabel(value: string) {
  if (!value) return '-'
  try {
    const url = new URL(value)
    return url.pathname === '/' ? url.hostname : url.pathname
  } catch {
    return value
  }
}

function formatMoneyMinor(value: number, currencyCode: string) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currencyCode || 'MXN',
    maximumFractionDigits: 0,
  }).format(value / 100)
}

function timezoneLabel(value: string | null | undefined) {
  return MARKETING_TIMEZONES.find((timezone) => timezone.value === value)?.label ?? value ?? 'timezone'
}

function formatIsoDate(value: unknown) {
  if (typeof value !== 'string' || !value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return formatDate(date.getTime())
}

function dateTimeLocalValue(value: number | null | undefined, timezone = DEFAULT_MARKETING_TIMEZONE) {
  if (!value) return ''
  const parts = getZonedParts(new Date(value), timezone)
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}:${pad2(parts.minute)}`
}

function dateTimeLocalToTimestamp(value: string, timezone = DEFAULT_MARKETING_TIMEZONE) {
  if (!value) return null
  const parts = parseDateTimeLocal(value)
  if (!parts) return null
  const timestamp = zonedTimeToUtc(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, timezone).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

function parseDateTimeLocal(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw] = match
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(hour) || !Number.isInteger(minute)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { year, month, day, hour, minute }
}

type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function getZonedParts(value: Date, timezone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || DEFAULT_MARKETING_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(value)

  const lookup = new Map(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(lookup.get('year')),
    month: Number(lookup.get('month')),
    day: Number(lookup.get('day')),
    hour: Number(lookup.get('hour')),
    minute: Number(lookup.get('minute')),
    second: Number(lookup.get('second')),
  }
}

function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timezone: string) {
  let utc = new Date(Date.UTC(year, month, day, hour, minute, 0, 0))

  for (let i = 0; i < 2; i += 1) {
    const parts = getZonedParts(utc, timezone)
    const actual = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0)
    const desired = Date.UTC(year, month, day, hour, minute, 0, 0)
    utc = new Date(utc.getTime() - (actual - desired))
  }

  return utc
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function positiveInteger(value: unknown, fallback: number) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number) || number <= 0) return fallback
  return Math.trunc(number)
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(number)))
}

function uniqueSlug(input: string, existing: Array<{ slug: string }>) {
  const base = slugify(input)
  const taken = new Set(existing.map((entry) => entry.slug))
  if (!taken.has(base)) return base
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${Date.now()}`
}

function uniqueKey(input: string, existing: Array<{ key: string }>) {
  const base = slugify(input)
  const taken = new Set(existing.map((entry) => entry.key))
  if (!taken.has(base)) return base
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${Date.now()}`
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'content'
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || payload.message || `Request failed: ${response.status}`)
  }
  return payload
}
