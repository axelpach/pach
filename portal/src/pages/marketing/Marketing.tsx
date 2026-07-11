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
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
type AdPromotionRow = Schema['tables']['mkt_ad_promotions']['row']
type AdMetricSnapshotRow = Schema['tables']['mkt_ad_metric_snapshots']['row']
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

type MarketingSection = 'newsletters' | 'social' | 'whatsapp' | 'calendar' | 'analytics'
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
  const [ctas] = useQuery(z.query.mkt_ctas.orderBy('updatedAt', 'desc'))
  const [events] = useQuery(z.query.mkt_content_events.orderBy('createdAt', 'desc'))
  const [documents] = useQuery(z.query.documents.orderBy('updatedAt', 'desc'))
  const [issues] = useQuery(z.query.pm_issues.orderBy('updatedAt', 'desc'))
  const [socialChannels] = useQuery(z.query.social_channels.orderBy('displayName', 'asc'))
  const [socialPosts] = useQuery(z.query.social_posts.orderBy('updatedAt', 'desc'))
  const [socialPostTargets] = useQuery(z.query.social_post_targets.orderBy('updatedAt', 'desc'))
  const [adPromotions] = useQuery(z.query.mkt_ad_promotions.orderBy('updatedAt', 'desc'))
  const [adMetricSnapshots] = useQuery(z.query.mkt_ad_metric_snapshots.orderBy('periodEnd', 'desc'))

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
  const orgCtas = useMemo(() => byOrganization(ctas, organizationId), [ctas, organizationId])
  const orgEvents = useMemo(() => byOrganization(events, organizationId), [events, organizationId])
  const orgSocialChannels = useMemo(() => byOrganization(socialChannels, organizationId), [organizationId, socialChannels])
  const orgSocialPosts = useMemo(() => byOrganization(socialPosts, organizationId), [organizationId, socialPosts])
  const orgSocialPostTargets = useMemo(() => byOrganization(socialPostTargets, organizationId), [organizationId, socialPostTargets])
  const orgAdPromotions = useMemo(() => byOrganization(adPromotions, organizationId), [adPromotions, organizationId])
  const orgAdMetricSnapshots = useMemo(() => byOrganization(adMetricSnapshots, organizationId), [adMetricSnapshots, organizationId])
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
              socialPostTargets={orgSocialPostTargets}
              adMetricSnapshots={orgAdMetricSnapshots}
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
        <div className="overflow-auto">
          <table className="w-full min-w-[720px] text-left font-mono text-xs">
            <thead className="text-[10px] uppercase tracking-label text-fg-4">
              <tr className="border-b border-edge/12">
                <th className="pb-2 pr-3 font-normal">title</th>
                <th className="pb-2 pr-3 font-normal">channels</th>
                <th className="pb-2 pr-3 font-normal">status</th>
                <th className="pb-2 pr-3 font-normal">blog</th>
                <th className="pb-2 font-normal">updated</th>
              </tr>
            </thead>
            <tbody>
              {contentItems.map((item) => {
                const blogRun = runs.find((run) => run.contentItemId === item.id && run.channel === 'blog')
                const blogPublished = blogRun?.status === 'published'
                const blogScheduled = blogRun?.status === 'scheduled'
                const blogVisible = blogPublished && isPublicBlogContentItem(item)
                return (
                  <tr
                    key={item.id}
                    onClick={() => onSelectContent(item.id)}
                    className={`cursor-pointer border-b border-edge/8 transition hover:bg-accent-fill/4 ${
                      selectedContent?.id === item.id ? 'bg-accent-fill/8 text-accent' : 'text-fg-2'
                    }`}
                  >
                    <td className="max-w-[320px] truncate py-2.5 pr-3">{item.title}</td>
                    <td className="py-2.5 pr-3">{item.supportedChannels.join(', ')}</td>
                    <td className="py-2.5 pr-3"><StatusPill kind={statusKind(item.status)}>{item.status}</StatusPill></td>
                    <td className="py-2.5 pr-3">
                      {blogScheduled ? (
                        <StatusPill kind="warn">{formatScheduledDate(blogRun?.scheduledAt, blogRun?.scheduledTimezone)}</StatusPill>
                      ) : blogVisible ? (
                        <StatusPill>published</StatusPill>
                      ) : blogPublished ? (
                        <StatusPill kind="warn">hidden</StatusPill>
                      ) : (
                        <span className="text-fg-4">-</span>
                      )}
                    </td>
                    <td className="py-2.5 text-fg-4">{formatDate(item.updatedAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
          <div className="overflow-auto">
            <table className="w-full min-w-[820px] text-left font-mono text-xs">
              <thead className="text-[10px] uppercase tracking-label text-fg-4">
                <tr className="border-b border-edge/12">
                  <th className="pb-2 pr-3 font-normal">name</th>
                  <th className="pb-2 pr-3 font-normal">slug</th>
                  <th className="pb-2 pr-3 font-normal">sender</th>
                  <th className="pb-2 pr-3 font-normal">subscribers</th>
                  <th className="pb-2 pr-3 font-normal">status</th>
                  <th className="pb-2 font-normal">action</th>
                </tr>
              </thead>
              <tbody>
                {publications.map((publication) => {
                  const sender = senderProfiles.find((profile) => profile.id === publication.defaultSenderProfileId)
                  return (
                    <tr
                      key={publication.id}
                      className="cursor-pointer border-b border-edge/8 text-fg-2 transition hover:bg-accent-fill/4"
                      onClick={() => openPublicationEditor(publication.id)}
                    >
                      <td className="max-w-[220px] py-2.5 pr-3">
                        <div className="max-w-full truncate text-fg-1">{publication.name}</div>
                      </td>
                      <td className="py-2.5 pr-3 text-fg-4">{publication.slug}</td>
                      <td className="max-w-[220px] truncate py-2.5 pr-3">{sender?.fromEmail ?? '-'}</td>
                      <td className="py-2.5 pr-3">{subscriberCounts.get(publication.id) ?? 0}</td>
                      <td className="py-2.5 pr-3"><StatusPill kind={statusKind(publication.status)}>{publication.status}</StatusPill></td>
                      <td className="py-2.5">
                        <div className="flex gap-2">
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
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
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

          <div className="overflow-auto">
            <table className="w-full min-w-[900px] text-left font-mono text-xs">
              <thead className="text-[10px] uppercase tracking-label text-fg-4">
                <tr className="border-b border-edge/12">
                  <th className="pb-2 pr-3 font-normal">publication</th>
                  <th className="pb-2 pr-3 font-normal">name</th>
                  <th className="pb-2 pr-3 font-normal">email</th>
                  <th className="pb-2 pr-3 font-normal">company</th>
                  <th className="pb-2 pr-3 font-normal">role</th>
                  <th className="pb-2 pr-3 font-normal">whatsapp</th>
                  <th className="pb-2 pr-3 font-normal">status</th>
                  <th className="pb-2 font-normal">action</th>
                </tr>
              </thead>
              <tbody>
                {subscriberRows.map(({ subscription, member, publication }) => (
                  <tr key={subscription.id} className="border-b border-edge/8 text-fg-2">
                    <td className="py-2.5 pr-3">{publication.name}</td>
                    <td className="py-2.5 pr-3">{member.name || '-'}</td>
                    <td className="py-2.5 pr-3">{member.email}</td>
                    <td className="py-2.5 pr-3">{member.company || '-'}</td>
                    <td className="py-2.5 pr-3">{member.role || '-'}</td>
                    <td className="py-2.5 pr-3">{member.whatsappPhone || '-'}</td>
                    <td className="py-2.5 pr-3"><StatusPill kind="ok">subscribed</StatusPill></td>
                    <td className="py-2.5">
                      <button
                        className="text-fg-4 transition hover:text-amber"
                        onClick={() => void z.mutate.mkt_audience_subscriptions.update({ id: subscription.id, status: 'unsubscribed', unsubscribedAt: Date.now() })}
                      >
                        unsubscribe
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

  const guidelinesEditorTitle = guidelinesEditorKind === 'idea' ? 'idea guidelines' : 'newsletter guidelines'
  const guidelinesEditorPlaceholder = guidelinesEditorKind === 'idea'
    ? 'Write rules for what ideas the editorial agent should generate, avoid, prioritize, or revisit...'
    : 'Write publication-specific voice, structure, audience, and newsletter rules...'

  return (
    <div className="flex min-h-full flex-col bg-pit text-fg-1">
      <div className="border-b border-edge/15 bg-pit/60 px-5 py-3 backdrop-blur-sm md:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
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
              <StatusPill kind={statusKind(publication.status)}>{publication.status}</StatusPill>
            </div>
            <div className="mt-1 truncate font-mono text-xs text-fg-4">{organization?.name ?? 'organization'} / {publication.slug}</div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Metric label="subscribers" value={subscriberCount} />
            <Metric label="ideas" value={availableIdeaCount} />
            <Metric label="reserved" value={reservedIdeaCount} />
            <Metric label="scheduled" value={scheduledRunCount} />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-5 py-5 md:px-8">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <Panel title={<InfoTitle label="editorial ideas" info="Unused, reserved, and used topics the autonomous editor can draft from without repeating prior newsletter work." />}>
              <div className="overflow-auto">
                <table className="w-full min-w-[760px] text-left font-mono text-xs">
                  <thead className="text-[10px] uppercase tracking-label text-fg-4">
                    <tr className="border-b border-edge/12">
                      <th className="pb-2 pr-3 font-normal">status</th>
                      <th className="pb-2 pr-3 font-normal">title</th>
                      <th className="pb-2 pr-3 font-normal">angle</th>
                      <th className="pb-2 pr-3 font-normal">document</th>
                      <th className="pb-2 font-normal">updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ideas.slice(0, 80).map((idea) => {
                      const document = idea.documentId ? documents.find((entry) => entry.id === idea.documentId) : null
                      return (
                        <tr key={idea.id} className="border-b border-edge/8 text-fg-2">
                          <td className="py-2.5 pr-3"><StatusPill kind={statusKind(idea.status)}>{idea.status}</StatusPill></td>
                          <td className="max-w-[260px] py-2.5 pr-3">
                            <div className="truncate text-fg-1">{idea.title}</div>
                            <div className="mt-1 truncate text-[10px] text-fg-4">{idea.dedupeKey}</div>
                          </td>
                          <td className="max-w-[280px] truncate py-2.5 pr-3 text-fg-3">{idea.angle || '-'}</td>
                          <td className="py-2.5 pr-3">
                            {document ? (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-fg-3 transition hover:text-accent"
                                onClick={() => navigate(`/docs/${document.id}`)}
                              >
                                <ExternalLink className="h-3 w-3" />
                                {document.title}
                              </button>
                            ) : '-'}
                          </td>
                          <td className="py-2.5 text-fg-4">{formatDate(idea.updatedAt)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {ideas.length === 0 ? <EmptyState label="no ideas yet" /> : null}
            </Panel>

            <Panel title={<InfoTitle label="publication slots" info="Upcoming cadence windows the automation keeps filled with a draft document, content snapshot, and scheduled newsletter run." />}>
              <div className="overflow-auto">
                <table className="w-full min-w-[760px] text-left font-mono text-xs">
                  <thead className="text-[10px] uppercase tracking-label text-fg-4">
                    <tr className="border-b border-edge/12">
                      <th className="pb-2 pr-3 font-normal">time</th>
                      <th className="pb-2 pr-3 font-normal">status</th>
                      <th className="pb-2 pr-3 font-normal">idea</th>
                      <th className="pb-2 pr-3 font-normal">content</th>
                      <th className="pb-2 font-normal">run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingSlots.map((slot) => {
                      const idea = slot.ideaId ? ideas.find((entry) => entry.id === slot.ideaId) : null
                      const contentItem = slot.contentItemId ? contentItems.find((entry) => entry.id === slot.contentItemId) : null
                      const run = slot.distributionRunId ? runs.find((entry) => entry.id === slot.distributionRunId) : null
                      return (
                        <tr key={slot.id} className="border-b border-edge/8 text-fg-2">
                          <td className="py-2.5 pr-3">{formatScheduledDate(slot.scheduledAt, slot.scheduledTimezone)}</td>
                          <td className="py-2.5 pr-3"><StatusPill kind={statusKind(slot.status)}>{slot.status}</StatusPill></td>
                          <td className="max-w-[260px] truncate py-2.5 pr-3">{idea?.title ?? '-'}</td>
                          <td className="max-w-[220px] py-2.5 pr-3">
                            {contentItem ? (
                              <button
                                type="button"
                                className="truncate text-fg-3 transition hover:text-accent"
                                onClick={() => navigate(`/marketing/newsletters/content?content=${contentItem.id}`)}
                              >
                                {contentItem.title}
                              </button>
                            ) : '-'}
                          </td>
                          <td className="py-2.5 text-fg-4">{run ? run.status : '-'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {slots.length === 0 ? <EmptyState label="no slots yet" /> : null}
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

          <aside className="space-y-4">
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
        <div className="overflow-auto">
          <table className="w-full min-w-[980px] text-left font-mono text-xs">
            <thead className="text-[10px] uppercase tracking-label text-fg-4">
              <tr className="border-b border-edge/12">
                <th className="pb-2 pr-3 font-normal">name</th>
                <th className="pb-2 pr-3 font-normal">content</th>
                <th className="pb-2 pr-3 font-normal">publication</th>
                <th className="pb-2 pr-3 font-normal">status</th>
                <th className="pb-2 pr-3 font-normal">scheduled</th>
                <th className="pb-2 pr-3 font-normal">metrics</th>
                <th className="pb-2 font-normal">updated</th>
              </tr>
            </thead>
            <tbody>
              {newsletterRuns.map((run) => {
                const item = contentItems.find((entry) => entry.id === run.contentItemId)
                const publication = publications.find((entry) => entry.id === run.publicationId)
                const metrics = run.metrics as Record<string, unknown>
                return (
                  <tr
                    key={run.id}
                    className="cursor-pointer border-b border-edge/8 text-fg-2 transition hover:bg-accent-fill/4 hover:text-fg-1"
                    onClick={() => navigate(`${basePath}/${run.id}`)}
                  >
                    <td className="max-w-[260px] truncate py-2.5 pr-3">{run.name}</td>
                    <td className="max-w-[260px] truncate py-2.5 pr-3">{item?.title ?? '-'}</td>
                    <td className="py-2.5 pr-3">{publication?.name ?? '-'}</td>
                    <td className="py-2.5 pr-3"><StatusPill kind={statusKind(run.status)}>{run.status}</StatusPill></td>
                    <td className="py-2.5 pr-3 text-fg-4">{formatScheduledDate(run.scheduledAt, run.scheduledTimezone)}</td>
                    <td className="py-2.5 pr-3 text-fg-4">sent {String(metrics.sent ?? 0)} · failed {String(metrics.failed ?? 0)}</td>
                    <td className="py-2.5 text-fg-4">{formatDate(run.updatedAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
        <div className="overflow-auto">
          <table className="w-full min-w-[760px] text-left font-mono text-xs">
            <thead className="text-[10px] uppercase tracking-label text-fg-4">
              <tr className="border-b border-edge/12">
                <th className="pb-2 pr-3 font-normal">label</th>
                <th className="pb-2 pr-3 font-normal">key</th>
                <th className="pb-2 pr-3 font-normal">destination</th>
                <th className="pb-2 pr-3 font-normal">status</th>
                <th className="pb-2 font-normal">action</th>
              </tr>
            </thead>
            <tbody>
              {ctas.map((cta) => (
                <tr key={cta.id} className="border-b border-edge/8 text-fg-2">
                  <td className="py-2.5 pr-3">{cta.label}</td>
                  <td className="py-2.5 pr-3">{cta.key}</td>
                  <td className="max-w-[360px] truncate py-2.5 pr-3">
                    <a href={cta.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-fg-2 transition hover:text-accent">
                      {cta.url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                  <td className="py-2.5 pr-3"><StatusPill kind={statusKind(cta.status)}>{cta.status}</StatusPill></td>
                  <td className="py-2.5">
                    <div className="flex gap-2">
                      <Button className="px-2 py-1 text-[10px]" icon={<Edit3 className="h-3 w-3" />} onClick={() => setEditingCtaId(cta.id)}>
                        edit
                      </Button>
                      <Button kind="danger" className="px-2 py-1 text-[10px]" icon={<Trash2 className="h-3 w-3" />} onClick={() => void z.mutate.mkt_ctas.delete({ id: cta.id })}>
                        delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
  socialPostTargets,
  adMetricSnapshots,
}: {
  contentItems: ContentItemRow[]
  audienceMembers: AudienceMemberRow[]
  events: ContentEventRow[]
  subscriptions: AudienceSubscriptionRow[]
  ctas: CtaRow[]
  socialPostTargets: SocialPostTargetRow[]
  adMetricSnapshots: AdMetricSnapshotRow[]
}) {
  const adTotals = sumAdMetricSnapshots(adMetricSnapshots)
  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-8">
        <Metric label="views" value={countEvents(events, 'view')} />
        <Metric label="clicks" value={countEvents(events, 'click')} />
        <Metric label="sends" value={countEvents(events, 'send')} />
        <Metric label="replies" value={countEvents(events, 'reply')} />
        <Metric label="subscribed" value={newsletterSubscriberCount(subscriptions)} />
        <Metric label="unsubscribed" value={newsletterUnsubscriberCount(subscriptions)} />
        <Metric label="social posts" value={socialPostTargets.length} />
        <Metric label="ad views" value={formatCompactNumber(adTotals.impressions)} />
      </div>

      <Panel title="newsletter activity">
        <div className="max-h-[calc(100vh-340px)] overflow-auto">
          <table className="w-full min-w-[1040px] text-left font-mono text-xs">
            <thead className="sticky top-0 z-10 bg-pit text-[10px] uppercase tracking-label text-fg-4">
              <tr className="border-b border-edge/12">
                <th className="pb-2 pr-3 font-normal">event</th>
                <th className="pb-2 pr-3 font-normal">channel</th>
                <th className="pb-2 pr-3 font-normal">content</th>
                <th className="pb-2 pr-3 font-normal">cta</th>
                <th className="pb-2 pr-3 font-normal">subscriber</th>
                <th className="pb-2 pr-3 font-normal">source</th>
                <th className="pb-2 font-normal">time</th>
              </tr>
            </thead>
            <tbody>
              {events.slice(0, 120).map((event) => {
                const item = contentItems.find((entry) => entry.id === event.contentItemId)
                const cta = ctas.find((entry) => entry.id === event.ctaId)
                const audienceMember = audienceMembers.find((entry) => entry.id === event.audienceMemberId)
                return (
                  <tr key={event.id} className="border-b border-edge/8 text-fg-2">
                    <td className="py-2.5 pr-3"><StatusPill kind={eventKind(event.eventType)}>{event.eventType}</StatusPill></td>
                    <td className="py-2.5 pr-3">{event.channel ?? '-'}</td>
                    <td className="max-w-[280px] truncate py-2.5 pr-3">{item?.title ?? '-'}</td>
                    <td className="py-2.5 pr-3">{cta?.label ?? '-'}</td>
                    <td className="max-w-[220px] truncate py-2.5 pr-3">{audienceMember?.email ?? audienceMember?.name ?? '-'}</td>
                    <td className="py-2.5 pr-3">{event.source ?? '-'}</td>
                    <td className="py-2.5 text-fg-4">{formatDate(event.createdAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {events.length === 0 ? <EmptyState label="no events" /> : null}
      </Panel>
    </div>
  )
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

function adPromotionHeadline(promotion: AdPromotionRow) {
  const creative = readRecord(promotion.creative)
  return typeof creative.headline === 'string' ? creative.headline : ''
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
