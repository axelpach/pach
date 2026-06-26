import { useQuery, useZero } from '@rocicorp/zero/react'
import {
  Building2,
  Check,
  Edit3,
  ExternalLink,
  Link2,
  Mail,
  Megaphone,
  Plus,
  RefreshCw,
  Rss,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Metric, Panel, StatusPill, TermInput, TermTextarea } from '../../components/pach'
import { PachSelect, type PachSelectOption } from '../../components/PachSelect'
import { FilterButton, type ActiveFilters, type FilterFieldConfig } from '../issues/IssueFilters'
import { authFetch } from '../../lib/auth'
import { config } from '../../config'
import type { Mutators } from '../../mutators'
import type { Schema } from '../../zero-schema'

type OrganizationRow = Schema['tables']['organizations']['row']
type ContentItemRow = Schema['tables']['mkt_content_items']['row']
type PublicationRow = Schema['tables']['mkt_publications']['row']
type SenderProfileRow = Schema['tables']['mkt_sender_profiles']['row']
type AudienceMemberRow = Schema['tables']['mkt_audience_members']['row']
type AudienceSubscriptionRow = Schema['tables']['mkt_audience_subscriptions']['row']
type DistributionRunRow = Schema['tables']['mkt_distribution_runs']['row']
type CtaRow = Schema['tables']['mkt_ctas']['row']
type ContentEventRow = Schema['tables']['mkt_content_events']['row']
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

type MarketingSection = 'content' | 'newsletters' | 'broadcasts' | 'ctas' | 'analytics'

const SECTIONS: Array<{ id: MarketingSection; label: string }> = [
  { id: 'content', label: 'content' },
  { id: 'newsletters', label: 'newsletters' },
  { id: 'broadcasts', label: 'broadcasts' },
  { id: 'ctas', label: 'ctas' },
  { id: 'analytics', label: 'analytics' },
]

const CONTENT_CHANNELS = ['blog', 'newsletter'] as const

export default function Marketing() {
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
  const [ctas] = useQuery(z.query.mkt_ctas.orderBy('updatedAt', 'desc'))
  const [events] = useQuery(z.query.mkt_content_events.orderBy('createdAt', 'desc'))

  const section = sectionFromPath(location.pathname)
  const [organizationId, setOrganizationId] = useState('')
  const [selectedContentId, setSelectedContentId] = useState('')
  const [selectedPublicationId, setSelectedPublicationId] = useState('')
  const [message, setMessage] = useState('')

  const organization = organizations.find((entry) => entry.id === organizationId) ?? null
  const orgContentItems = useMemo(() => byOrganization(contentItems, organizationId), [contentItems, organizationId])
  const orgPublications = useMemo(() => byOrganization(publications, organizationId), [publications, organizationId])
  const orgSenderProfiles = useMemo(() => byOrganization(senderProfiles, organizationId), [senderProfiles, organizationId])
  const orgMembers = useMemo(() => byOrganization(audienceMembers, organizationId), [audienceMembers, organizationId])
  const orgSubscriptions = useMemo(() => byOrganization(subscriptions, organizationId), [subscriptions, organizationId])
  const orgRuns = useMemo(() => byOrganization(distributionRuns, organizationId), [distributionRuns, organizationId])
  const orgCtas = useMemo(() => byOrganization(ctas, organizationId), [ctas, organizationId])
  const orgEvents = useMemo(() => byOrganization(events, organizationId), [events, organizationId])
  const selectedContent = orgContentItems.find((item) => item.id === selectedContentId) ?? null
  const selectedPublication = orgPublications.find((item) => item.id === selectedPublicationId) ?? orgPublications[0] ?? null
  const contentItemIdFromUrl = new URLSearchParams(location.search).get('content')
  const broadcastRunIdFromUrl = broadcastRunIdFromPath(location.pathname)
  const isBroadcastDetail = section === 'broadcasts' && Boolean(broadcastRunIdFromUrl)

  const organizationOptions = useMemo<PachSelectOption[]>(
    () => organizations.map((entry) => ({ value: entry.id, label: entry.name })),
    [organizations],
  )

  useEffect(() => {
    if (section) return
    navigate('/marketing/content', { replace: true })
  }, [navigate, section])

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

  return (
    <div className="flex h-full min-h-0 bg-pit text-fg-1">
      <aside className="hidden shrink-0 flex-col border-r border-edge/12 bg-pit/60 px-2 py-4 backdrop-blur-sm md:flex md:w-[200px]">
        <div className="mb-2 px-4 pb-3">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
            <Megaphone className="h-3.5 w-3.5 text-accent" />
            marketing
          </div>
          <div className="mt-1 font-mono text-lg font-bold lowercase text-fg-1">inbound</div>
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
          {SECTIONS.map((entry) => (
            <MarketingSidebarButton
              key={entry.id}
              active={section === entry.id}
              label={entry.label}
              onClick={() => navigate(`/marketing/${entry.id}`)}
            />
          ))}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto">
        {!isBroadcastDetail ? (
          <div className="border-b border-edge/12 px-5 py-4 md:px-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="md:hidden">
                <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">organization</div>
                <div className="mt-2 w-full max-w-[320px]">
                  <div className="relative">
                    <Building2 className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-fg-4" />
                    <PachSelect
                      value={organizationId}
                      onChange={setOrganizationId}
                      options={organizationOptions}
                      display={organization?.name ?? 'organization'}
                      triggerClassName="flex h-9 w-full items-center justify-between border border-edge/18 bg-rim pl-9 pr-3 text-left font-mono text-xs text-fg-1 outline-none transition hover:border-edge/32 hover:bg-accent-fill/4"
                    />
                  </div>
                </div>
              </div>
              {section !== 'analytics' ? (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:min-w-[520px]">
                  <Metric label="content" value={orgContentItems.length} />
                  <Metric label="subscribers" value={newsletterSubscriberCount(orgSubscriptions)} />
                  <Metric label="runs" value={orgRuns.length} />
                  <Metric label="conversations" value={countEvents(orgEvents, 'reply')} />
                </div>
              ) : null}
            </div>
            {message ? (
              <div className="mt-3 border border-ok/25 bg-ok/5 px-3 py-2 font-mono text-xs text-ok">{message}</div>
            ) : null}
          </div>
        ) : message ? (
          <div className="pointer-events-none fixed right-5 top-16 z-50 border border-ok/25 bg-pit px-3 py-2 font-mono text-xs text-ok shadow-terminal-popover">
            {message}
          </div>
        ) : null}

        <div className={isBroadcastDetail ? 'min-h-full' : 'px-5 py-5 md:px-8'}>
          {section === 'content' ? (
            <ContentSection
              z={z}
              contentItems={orgContentItems}
              ctas={orgCtas}
              runs={orgRuns}
              selectedContent={selectedContent}
              onSelectContent={setSelectedContentId}
              onFlash={flash}
            />
          ) : null}
          {section === 'newsletters' ? (
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
              onCreateSenderProfile={createSenderProfile}
              onFlash={flash}
            />
          ) : null}
          {section === 'broadcasts' ? (
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
              onSelectPublication={setSelectedPublicationId}
              onFlash={flash}
            />
          ) : null}
          {section === 'ctas' ? (
            <CtasSection z={z} organizationId={organizationId} ctas={orgCtas} onFlash={flash} />
          ) : null}
          {section === 'analytics' ? (
            <AnalyticsSection
              contentItems={orgContentItems}
              audienceMembers={orgMembers}
              events={orgEvents}
              subscriptions={orgSubscriptions}
              ctas={orgCtas}
            />
          ) : null}
        </div>
      </main>
    </div>
  )
}

function ContentSection({
  z,
  contentItems,
  ctas,
  runs,
  selectedContent,
  onSelectContent,
  onFlash,
}: {
  z: ReturnType<typeof useZero<Schema, Mutators>>
  contentItems: ContentItemRow[]
  ctas: CtaRow[]
  runs: DistributionRunRow[]
  selectedContent: ContentItemRow | null
  onSelectContent: (id: string) => void
  onFlash: (message: string) => void
}) {
  const [publishing, setPublishing] = useState(false)

  const ctaOptions = useMemo<PachSelectOption[]>(
    () => [{ value: '', label: 'no cta' }, ...ctas.map((cta) => ({ value: cta.id, label: cta.label }))],
    [ctas],
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
                      {blogVisible ? (
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
            <div className="flex flex-wrap gap-2 pt-2">
              <Button icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void snapshotContent(selectedContent)} disabled={!selectedContent.sourceDocumentId}>
                snapshot
              </Button>
              <Button kind="primary" icon={<Rss className="h-3.5 w-3.5" />} onClick={() => void publishBlog(selectedContent)} disabled={publishing || !selectedContent.supportedChannels.includes('blog')}>
                publish blog
              </Button>
            </div>
            <div className="border border-edge/12 bg-rim px-3 py-2 font-mono text-[11px] text-fg-3">
              /public/organizations/:project/marketing/posts/{selectedContent.slug}
            </div>
          </div>
        </MarketingAppFrame>
      ) : null}
    </>
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
  onCreateSenderProfile: () => Promise<void>
  onFlash: (message: string) => void
}) {
  const [tab, setTab] = useState<'publications' | 'subscribers'>('publications')
  const [editingPublicationId, setEditingPublicationId] = useState('')
  const [publicationModalOpen, setPublicationModalOpen] = useState(false)
  const [subscriberModalOpen, setSubscriberModalOpen] = useState(false)
  const [publicationDraft, setPublicationDraft] = useState({ name: '', slug: '', defaultSenderProfileId: '' })
  const [publicationSlugTouched, setPublicationSlugTouched] = useState(false)
  const [subscriberDraft, setSubscriberDraft] = useState({ publicationId: '', name: '', email: '', company: '', role: '', whatsappPhone: '' })
  const [subscriberFilters, setSubscriberFilters] = useState<ActiveFilters>({})

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
    if (!editingPublicationId || publications.some((publication) => publication.id === editingPublicationId)) return
    setEditingPublicationId('')
  }, [editingPublicationId, publications])

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
      })
      onSelectPublication(id)
      setEditingPublicationId(id)
      setPublicationModalOpen(false)
      onFlash('publication created')
    } catch (error) {
      console.error('Publication create failed', error)
      onFlash('publication could not be created')
    }
  }

  function showSubscribers(publicationId: string) {
    setSubscriberFilters({ publication: [publicationId] })
    setTab('subscribers')
  }

  function openPublicationEditor(publicationId: string) {
    onSelectPublication(publicationId)
    setEditingPublicationId(publicationId)
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
        <div className="flex gap-0">
          <MarketingTabButton active={tab === 'publications'} onClick={() => setTab('publications')}>
            publications
          </MarketingTabButton>
          <MarketingTabButton active={tab === 'subscribers'} onClick={() => setTab('subscribers')}>
            subscribers
          </MarketingTabButton>
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
        <Panel title="publications">
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
                    <tr key={publication.id} className="border-b border-edge/8 text-fg-2 transition hover:bg-accent-fill/4">
                      <td className="max-w-[220px] truncate py-2.5 pr-3">{publication.name}</td>
                      <td className="py-2.5 pr-3 text-fg-4">{publication.slug}</td>
                      <td className="max-w-[220px] truncate py-2.5 pr-3">{sender?.fromEmail ?? '-'}</td>
                      <td className="py-2.5 pr-3">{subscriberCounts.get(publication.id) ?? 0}</td>
                      <td className="py-2.5 pr-3"><StatusPill kind={statusKind(publication.status)}>{publication.status}</StatusPill></td>
                      <td className="py-2.5">
                        <div className="flex gap-2">
                          <Button className="px-2 py-1 text-[10px]" icon={<Users className="h-3 w-3" />} onClick={() => showSubscribers(publication.id)}>
                            subscribers
                          </Button>
                          <Button className="px-2 py-1 text-[10px]" icon={<Edit3 className="h-3 w-3" />} onClick={() => openPublicationEditor(publication.id)}>
                            edit
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
        <Panel title="subscribers">
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
  onSelectPublication: (id: string) => void
  onFlash: (message: string) => void
}) {
  const navigate = useNavigate()
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [runDraft, setRunDraft] = useState({ publicationId: '', contentItemId: '', senderProfileId: '', subject: '', preheader: '' })
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
    })
    setCreateModalOpen(true)
  }

  async function createRunFromModal() {
    if (!runDraft.publicationId || !runDraft.contentItemId) return
    const item = contentItems.find((entry) => entry.id === runDraft.contentItemId)
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
      status: 'draft',
      recipientFilter: { publicationId: runDraft.publicationId },
    })
    onSelectPublication(runDraft.publicationId)
    setCreateModalOpen(false)
    setRunDraft({ publicationId: '', contentItemId: '', senderProfileId: '', subject: '', preheader: '' })
    onFlash('broadcast created')
    navigate(`/marketing/broadcasts/${id}`)
  }

  async function deleteRun(run: DistributionRunRow) {
    if (run.status !== 'draft') return
    await z.mutate.mkt_distribution_runs.delete({ id: run.id })
    navigate('/marketing/broadcasts')
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
          <Button onClick={() => navigate('/marketing/broadcasts')}>back to broadcasts</Button>
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
        onBack={() => navigate('/marketing/broadcasts')}
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
          <table className="w-full min-w-[880px] text-left font-mono text-xs">
            <thead className="text-[10px] uppercase tracking-label text-fg-4">
              <tr className="border-b border-edge/12">
                <th className="pb-2 pr-3 font-normal">name</th>
                <th className="pb-2 pr-3 font-normal">content</th>
                <th className="pb-2 pr-3 font-normal">publication</th>
                <th className="pb-2 pr-3 font-normal">status</th>
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
                    onClick={() => navigate(`/marketing/broadcasts/${run.id}`)}
                  >
                    <td className="max-w-[260px] truncate py-2.5 pr-3">{run.name}</td>
                    <td className="max-w-[260px] truncate py-2.5 pr-3">{item?.title ?? '-'}</td>
                    <td className="py-2.5 pr-3">{publication?.name ?? '-'}</td>
                    <td className="py-2.5 pr-3"><StatusPill kind={statusKind(run.status)}>{run.status}</StatusPill></td>
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

  useEffect(() => {
    setPreview(null)
    setRenderError('')
    setPreviewMode('desktop')
    void renderPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.id])

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

        <div className="border-b border-edge/12 px-4 py-4">
            <FieldLabel>send controls</FieldLabel>
            <div className="flex flex-wrap gap-2">
              <Button icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void renderPreview()} disabled={rendering || !item || !sender}>
                render
              </Button>
              <Button icon={<Mail className="h-3.5 w-3.5" />} onClick={() => onSend(true)} disabled={sending || !preview}>
                test
              </Button>
              <Button kind="primary" icon={<Send className="h-3.5 w-3.5" />} onClick={() => onSend(false)} disabled={sending || !preview}>
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
}: {
  contentItems: ContentItemRow[]
  audienceMembers: AudienceMemberRow[]
  events: ContentEventRow[]
  subscriptions: AudienceSubscriptionRow[]
  ctas: CtaRow[]
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-6">
        <Metric label="views" value={countEvents(events, 'view')} />
        <Metric label="clicks" value={countEvents(events, 'click')} />
        <Metric label="sends" value={countEvents(events, 'send')} />
        <Metric label="replies" value={countEvents(events, 'reply')} />
        <Metric label="subscribed" value={newsletterSubscriberCount(subscriptions)} />
        <Metric label="unsubscribed" value={newsletterUnsubscriberCount(subscriptions)} />
      </div>

      <Panel title="activity">
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
  compact = false,
}: {
  value: string
  onCommit: (next: string) => void | Promise<void>
  label?: string
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
}: {
  value: string
  onCommit: (next: string) => void | Promise<void>
  label?: string
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
      <TermTextarea rows={4} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => void commit()} />
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
  return SECTIONS.some((entry) => entry.id === part) ? part as MarketingSection : null
}

function broadcastRunIdFromPath(pathname: string) {
  const parts = pathname.split('/')
  return parts[2] === 'broadcasts' && parts[3] ? decodeURIComponent(parts[3]) : ''
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
