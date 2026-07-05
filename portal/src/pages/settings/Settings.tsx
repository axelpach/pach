import { useQuery, useZero } from '@rocicorp/zero/react'
import { Building2, Check, Copy, Edit3, ExternalLink, Github, GitBranch, KeyRound, Link2, Linkedin, Plus, RefreshCw, Settings2, Trash2, Unlink } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Panel, StatusPill, TermInput } from '../../components/pach'
import { PachSelect, type PachSelectOption } from '../../components/PachSelect'
import { authFetch } from '../../lib/auth'
import { config } from '../../config'
import { useAuth } from '../../lib/auth'
import type { Mutators } from '../../mutators'
import type { Schema } from '../../zero-schema'

type OrganizationRow = Schema['tables']['organizations']['row']

type OrganizationApiKey = {
  id: string
  organizationId: string
  name: string
  tokenPrefix: string
  scopes: string[]
  status: string
  lastUsedAt: number | null
  revokedAt: number | null
  createdAt: number
  updatedAt: number
}

type GithubConnection = {
  id: string
  name: string
  provider: string
  providerAccountLogin: string | null
  credentialKind: string
  credentialLabel: string | null
  credentialLast4: string | null
  scopes: string[]
  status: string
  statusMessage: string | null
  lastSyncedAt: number | null
  lastUsedAt: number | null
  createdAt: number
  updatedAt: number
}

type GithubRepository = {
  id: string
  connectionId: string | null
  githubId: string | null
  owner: string
  name: string
  fullName: string
  defaultBranch: string
  htmlUrl: string | null
  isPrivate: boolean
  permissions: Record<string, unknown>
  webhook: Record<string, unknown> | null
  active: boolean
  createdAt: number
  updatedAt: number
}

type OrganizationRepository = {
  id: string
  organizationId: string
  repositoryId: string
  role: string
  isDefault: boolean
  active: boolean
  metadata: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

type SocialConnectionRow = Schema['tables']['social_connections']['row']
type SocialChannelRow = Schema['tables']['social_channels']['row']
type SocialChannelConnectionRow = Schema['tables']['social_channel_connections']['row']

type SocialProviderApp = {
  id: string
  organizationId: string
  provider: string
  purpose: string
  name: string
  clientId: string
  hasClientSecret: boolean
  clientSecretLast4: string | null
  redirectUri: string
  scopesRequested: string[]
  status: string
  statusMessage: string | null
  metadata: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

type SocialSettingsDefaults = {
  linkedinRedirectUri: string
  organizationScopes: string[]
  memberScopes: string[]
}

type ProviderAppFormPayload = {
  name: string
  purpose: string
  clientId: string
  clientSecret?: string
  redirectUri: string
  scopesRequested: string[]
  status: string
}

type SettingsSection = 'api-keys' | 'repositories' | 'social'

const SECTIONS: Array<{ id: SettingsSection; label: string }> = [
  { id: 'repositories', label: 'repositories' },
  { id: 'social', label: 'social' },
  { id: 'api-keys', label: 'api keys' },
]

const API_KEY_SCOPES = [
  { value: 'activity:write', label: 'activity write' },
  { value: 'marketing:write', label: 'marketing write' },
  { value: 'docs:write', label: 'docs write' },
  { value: 'analytics:write', label: 'analytics write' },
] as const

const GITHUB_CREDENTIAL_KIND_OPTIONS: PachSelectOption[] = [
  { value: 'fine_grained_pat', label: 'fine-grained pat' },
  { value: 'classic_pat', label: 'classic pat' },
]

const LINKEDIN_CHANNEL_KIND_OPTIONS: PachSelectOption[] = [
  { value: 'organization', label: 'organization page' },
  { value: 'member', label: 'member profile' },
]

const LINKEDIN_PROVIDER_PURPOSE_OPTIONS: PachSelectOption[] = [
  { value: 'organization_publishing', label: 'organization publishing' },
  { value: 'member_sharing', label: 'member sharing' },
]

const LINKEDIN_PROVIDER_STATUS_OPTIONS: PachSelectOption[] = [
  { value: 'pending_approval', label: 'community access pending' },
  { value: 'ready', label: 'ready' },
  { value: 'needs_secret', label: 'needs secret' },
  { value: 'needs_reconnect', label: 'needs reconnect' },
]

const SOCIAL_HELP = {
  developerApp: 'The LinkedIn developer app is the API client: client ID, encrypted secret, redirect URI, scopes, and approval status.',
  linkedinPage: 'A LinkedIn page is the publishable destination in Pach, such as the Ardia company page or a member profile.',
  connectLinkedin: 'Connect LinkedIn starts OAuth. A real user signs in and grants Pach permission to publish through an approved developer app.',
}

export default function SettingsPage() {
  const z = useZero<Schema, Mutators>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [organizations] = useQuery(z.query.organizations.orderBy('name', 'asc'))
  const [socialConnections] = useQuery(z.query.social_connections.orderBy('createdAt', 'desc'))
  const [socialChannels] = useQuery(z.query.social_channels.orderBy('displayName', 'asc'))
  const [socialChannelConnections] = useQuery(z.query.social_channel_connections.orderBy('createdAt', 'desc'))
  const [organizationId, setOrganizationId] = useState('')
  const [apiKeys, setApiKeys] = useState<OrganizationApiKey[]>([])
  const [githubConnections, setGithubConnections] = useState<GithubConnection[]>([])
  const [githubRepositories, setGithubRepositories] = useState<GithubRepository[]>([])
  const [organizationRepositories, setOrganizationRepositories] = useState<OrganizationRepository[]>([])
  const [socialProviderApps, setSocialProviderApps] = useState<SocialProviderApp[]>([])
  const [socialSettingsDefaults, setSocialSettingsDefaults] = useState<SocialSettingsDefaults | null>(null)
  const [loadingKeys, setLoadingKeys] = useState(false)
  const [loadingGithub, setLoadingGithub] = useState(false)
  const [loadingSocial, setLoadingSocial] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [connectGithubOpen, setConnectGithubOpen] = useState(false)
  const [createLinkedInChannelOpen, setCreateLinkedInChannelOpen] = useState(false)
  const [providerAppModal, setProviderAppModal] = useState<SocialProviderApp | 'new' | null>(null)
  const [generatedSecret, setGeneratedSecret] = useState('')
  const [message, setMessage] = useState('')

  const accessibleIds = useMemo(() => new Set(user?.organizationIds ?? []), [user?.organizationIds])
  const accessibleOrganizations = useMemo(
    () => organizations.filter((organization) => user?.canAccessUnscoped || accessibleIds.has(organization.id)),
    [accessibleIds, organizations, user?.canAccessUnscoped],
  )
  const organization = accessibleOrganizations.find((entry) => entry.id === organizationId) ?? null
  const section = sectionFromPath(location.pathname)
  const organizationOptions = useMemo<PachSelectOption[]>(
    () => accessibleOrganizations.map((entry) => ({ value: entry.id, label: entry.name })),
    [accessibleOrganizations],
  )
  const organizationSocialConnections = useMemo(
    () => socialConnections.filter((connection) => connection.organizationId === organizationId),
    [organizationId, socialConnections],
  )
  const organizationSocialChannels = useMemo(
    () => socialChannels.filter((channel) => channel.organizationId === organizationId),
    [organizationId, socialChannels],
  )
  const organizationSocialChannelConnections = useMemo(
    () => socialChannelConnections.filter((link) => link.organizationId === organizationId),
    [organizationId, socialChannelConnections],
  )

  useEffect(() => {
    if (section) return
    navigate('/settings/repositories', { replace: true })
  }, [navigate, section])

  useEffect(() => {
    if (organizationId && accessibleOrganizations.some((entry) => entry.id === organizationId)) return
    const ardia = accessibleOrganizations.find((entry) => entry.project === 'ardia')
    setOrganizationId(ardia?.id ?? accessibleOrganizations[0]?.id ?? '')
  }, [accessibleOrganizations, organizationId])

  useEffect(() => {
    if (!organizationId) {
      setApiKeys([])
      setGithubConnections([])
      setGithubRepositories([])
      setOrganizationRepositories([])
      setSocialProviderApps([])
      setSocialSettingsDefaults(null)
      return
    }
    void loadApiKeys(organizationId)
    void loadGithubSettings(organizationId)
    void loadSocialSettings(organizationId)
  }, [organizationId])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const linkedinStatus = params.get('linkedin')
    if (!linkedinStatus) return

    if (linkedinStatus === 'connected') {
      const pages = Number(params.get('pages') ?? '0')
      flash(pages > 0 ? `linkedin connected · ${pages} page${pages === 1 ? '' : 's'} synced` : 'linkedin connected')
      if (organizationId) void loadSocialSettings(organizationId)
    } else if (linkedinStatus === 'failed') {
      flash(params.get('message') || 'linkedin connection failed')
    }
    navigate('/settings/social', { replace: true })
  }, [location.search, navigate, organizationId])

  async function loadApiKeys(nextOrganizationId = organizationId) {
    if (!nextOrganizationId) return
    setLoadingKeys(true)
    try {
      const response = await authFetch(`${config.apiUrl}/api-keys?organizationId=${encodeURIComponent(nextOrganizationId)}`)
      const payload = await readJson(response)
      setApiKeys(Array.isArray(payload.apiKeys) ? payload.apiKeys : [])
    } catch (error) {
      console.error('API key load failed', error)
      flash('api keys could not be loaded')
    } finally {
      setLoadingKeys(false)
    }
  }

  async function loadGithubSettings(nextOrganizationId = organizationId) {
    if (!nextOrganizationId) return
    setLoadingGithub(true)
    try {
      const response = await authFetch(`${config.apiUrl}/github/settings?organizationId=${encodeURIComponent(nextOrganizationId)}`)
      const payload = await readJson(response)
      setGithubConnections(Array.isArray(payload.connections) ? payload.connections : [])
      setGithubRepositories(Array.isArray(payload.repositories) ? payload.repositories : [])
      setOrganizationRepositories(Array.isArray(payload.organizationRepositories) ? payload.organizationRepositories : [])
    } catch (error) {
      console.error('GitHub settings load failed', error)
      flash('github settings could not be loaded')
    } finally {
      setLoadingGithub(false)
    }
  }

  async function loadSocialSettings(nextOrganizationId = organizationId) {
    if (!nextOrganizationId) return
    setLoadingSocial(true)
    try {
      const response = await authFetch(`${config.apiUrl}/social/settings?organizationId=${encodeURIComponent(nextOrganizationId)}`)
      const payload = await readJson(response)
      setSocialProviderApps(Array.isArray(payload.providerApps) ? payload.providerApps : [])
      setSocialSettingsDefaults(payload.defaults ?? null)
    } catch (error) {
      console.error('Social settings load failed', error)
      flash('social settings could not be loaded')
    } finally {
      setLoadingSocial(false)
    }
  }

  async function createApiKey({ name, scopes }: { name: string; scopes: string[] }) {
    if (!organizationId) return
    const response = await authFetch(`${config.apiUrl}/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId, name, scopes }),
    })
    const payload = await readJson(response)
    setGeneratedSecret(payload.secret)
    setCreateModalOpen(false)
    await loadApiKeys()
    flash('api key created')
  }

  async function revokeApiKey(apiKey: OrganizationApiKey) {
    const response = await authFetch(`${config.apiUrl}/api-keys/${apiKey.id}`, { method: 'DELETE' })
    await readJson(response)
    await loadApiKeys()
    flash('api key revoked')
  }

  async function connectGithub(payload: { name: string; token: string; credentialKind: string }) {
    if (!organizationId) return
    const response = await authFetch(`${config.apiUrl}/github/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId, ...payload }),
    })
    await readJson(response)
    setConnectGithubOpen(false)
    await loadGithubSettings()
    flash('github connection synced')
  }

  async function syncGithubConnection(connection: GithubConnection) {
    const response = await authFetch(`${config.apiUrl}/github/connections/${connection.id}/sync`, {
      method: 'POST',
    })
    await readJson(response)
    await loadGithubSettings()
    flash('github repositories synced')
  }

  async function linkGithubRepository(repository: GithubRepository, isDefault = false) {
    if (!organizationId) return
    const response = await authFetch(`${config.apiUrl}/github/organization-repositories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId,
        repositoryId: repository.id,
        role: 'primary',
        isDefault,
      }),
    })
    const payload = await readJson(response)
    await loadGithubSettings()
    const webhookStatus = readWebhookStatus(payload.webhook)
    flash(webhookStatus === 'active' ? 'repository linked · webhook active' : 'repository linked · webhook pending')
  }

  async function unlinkGithubRepository(link: OrganizationRepository) {
    const response = await authFetch(`${config.apiUrl}/github/organization-repositories/${link.id}`, {
      method: 'DELETE',
    })
    await readJson(response)
    await loadGithubSettings()
    flash('repository unlinked')
  }

  async function createLinkedInChannel(payload: { displayName: string; externalId: string; url: string; handle: string; kind: string }) {
    if (!organizationId) return
    const channelId = crypto.randomUUID()
    const activeConnection = organizationSocialConnections.find((connection) => connection.provider === 'linkedin' && connection.status === 'active')
    await z.mutate.social_channels.create({
      id: channelId,
      organizationId,
      provider: 'linkedin',
      kind: payload.kind,
      displayName: payload.displayName,
      externalId: normalizeLinkedInExternalId(payload.externalId),
      url: payload.url || null,
      handle: payload.handle || null,
      metadata: {
        createdVia: 'settings',
        oauthStatus: 'pending',
      },
    })
    if (activeConnection) {
      await z.mutate.social_channel_connections.create({
        id: crypto.randomUUID(),
        organizationId,
        channelId,
        connectionId: activeConnection.id,
        capabilities: ['read_social', 'publish_post'],
        metadata: {
          createdVia: 'settings',
          linkedManually: true,
        },
      })
    }
    setCreateLinkedInChannelOpen(false)
    flash(activeConnection ? 'linkedin channel registered and linked' : 'linkedin channel registered')
  }

  async function deleteSocialChannel(channel: SocialChannelRow) {
    await z.mutate.social_channels.delete({ id: channel.id })
    flash('social channel removed')
  }

  async function saveProviderApp(payload: ProviderAppFormPayload, existing?: SocialProviderApp | null) {
    if (!organizationId) return
    const response = await authFetch(
      existing ? `${config.apiUrl}/social/provider-apps/${existing.id}` : `${config.apiUrl}/social/provider-apps`,
      {
        method: existing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          provider: 'linkedin',
          ...payload,
        }),
      },
    )
    await readJson(response)
    setProviderAppModal(null)
    await loadSocialSettings()
    flash(existing ? 'linkedin app updated' : 'linkedin app saved')
  }

  async function archiveProviderApp(providerApp: SocialProviderApp) {
    const response = await authFetch(`${config.apiUrl}/social/provider-apps/${providerApp.id}`, { method: 'DELETE' })
    await readJson(response)
    await loadSocialSettings()
    flash('linkedin app archived')
  }

  async function connectLinkedIn() {
    if (!organizationId) return
    const providerApp = pickLinkedInOAuthProviderApp(socialProviderApps)
    if (!providerApp) {
      const linkedinApp = socialProviderApps.find((app) => app.provider === 'linkedin')
      flash(linkedinApp ? 'linkedin community access is not ready yet' : 'add a linkedin developer app with a client secret first')
      return
    }

    try {
      const returnTo = `${window.location.origin}/settings/social`
      const response = await authFetch(
        `${config.apiUrl}/social/linkedin/oauth/start?organizationId=${encodeURIComponent(organizationId)}&providerAppId=${encodeURIComponent(providerApp.id)}&returnTo=${encodeURIComponent(returnTo)}`,
      )
      const payload = await readJson(response)
      if (typeof payload.authorizationUrl !== 'string' || !payload.authorizationUrl) {
        throw new Error('LinkedIn authorization URL was not returned.')
      }
      window.location.assign(payload.authorizationUrl)
    } catch (error) {
      console.error('LinkedIn connect failed', error)
      flash(error instanceof Error ? error.message : 'linkedin connection failed')
    }
  }

  async function copySecret(secret: string) {
    await navigator.clipboard.writeText(secret)
    flash('api key copied')
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
            <Settings2 className="h-3.5 w-3.5 text-accent" />
            settings
          </div>
          <div className="mt-1 font-mono text-lg font-bold lowercase text-fg-1">system</div>
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
            <SettingsSidebarButton
              key={entry.id}
              active={section === entry.id}
              label={entry.label}
              onClick={() => navigate(`/settings/${entry.id}`)}
            />
          ))}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto px-5 py-5 md:px-8">
        <div className="mb-5 md:hidden">
          <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">organization</div>
          <div className="mt-2 max-w-[320px]">
            <PachSelect
              value={organizationId}
              onChange={setOrganizationId}
              options={organizationOptions}
              display={organization?.name ?? 'organization'}
            />
          </div>
        </div>

        {message ? (
          <div className="mb-4 border border-ok/25 bg-ok/5 px-3 py-2 font-mono text-xs text-ok">{message}</div>
        ) : null}

        {generatedSecret ? (
          <Panel title="new api key" className="mb-4 border-accent/35 bg-accent-fill/5">
            <div className="font-mono text-xs text-fg-2">
              Store this value as <span className="text-accent">PACH_API_KEY</span> in the connected app. It will not be shown again.
            </div>
            <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
              <code className="min-w-0 flex-1 overflow-auto border border-edge/15 bg-void px-3 py-2 font-mono text-xs text-fg-1">
                {generatedSecret}
              </code>
              <Button icon={<Copy className="h-3.5 w-3.5" />} onClick={() => void copySecret(generatedSecret)}>
                copy
              </Button>
              <Button onClick={() => setGeneratedSecret('')}>done</Button>
            </div>
          </Panel>
        ) : null}

        {section === 'repositories' ? (
          <RepositoriesSection
            connections={githubConnections}
            repositories={githubRepositories}
            organizationRepositories={organizationRepositories}
            loading={loadingGithub}
            organization={organization}
            onConnect={() => setConnectGithubOpen(true)}
            onSync={(connection) => void syncGithubConnection(connection)}
            onLink={(repository, isDefault) => void linkGithubRepository(repository, isDefault)}
            onUnlink={(link) => void unlinkGithubRepository(link)}
          />
        ) : null}

        {section === 'social' ? (
          <SocialSection
            organization={organization}
            providerApps={socialProviderApps}
            defaults={socialSettingsDefaults}
            loadingProviderApps={loadingSocial}
            connections={organizationSocialConnections}
            channels={organizationSocialChannels}
            channelConnections={organizationSocialChannelConnections}
            onConnect={() => void connectLinkedIn()}
            onCreateProviderApp={() => setProviderAppModal('new')}
            onEditProviderApp={(providerApp) => setProviderAppModal(providerApp)}
            onArchiveProviderApp={(providerApp) => void archiveProviderApp(providerApp)}
            onCreateChannel={() => setCreateLinkedInChannelOpen(true)}
            onDeleteChannel={(channel) => void deleteSocialChannel(channel)}
          />
        ) : null}

        {section === 'api-keys' ? (
          <ApiKeysSection
            apiKeys={apiKeys}
            loading={loadingKeys}
            organization={organization}
            onCreate={() => setCreateModalOpen(true)}
            onRevoke={(apiKey) => void revokeApiKey(apiKey)}
          />
        ) : null}
      </main>

      {createModalOpen ? (
        <CreateApiKeyModal
          organization={organization}
          onClose={() => setCreateModalOpen(false)}
          onSubmit={(payload) => void createApiKey(payload)}
        />
      ) : null}

      {connectGithubOpen ? (
        <ConnectGithubModal
          organization={organization}
          onClose={() => setConnectGithubOpen(false)}
          onSubmit={(payload) => void connectGithub(payload)}
        />
      ) : null}

      {createLinkedInChannelOpen ? (
        <CreateLinkedInChannelModal
          organization={organization}
          onClose={() => setCreateLinkedInChannelOpen(false)}
          onSubmit={(payload) => void createLinkedInChannel(payload)}
        />
      ) : null}

      {providerAppModal ? (
        <LinkedInProviderAppModal
          organization={organization}
          providerApp={providerAppModal === 'new' ? null : providerAppModal}
          defaults={socialSettingsDefaults}
          onClose={() => setProviderAppModal(null)}
          onSubmit={(payload) => void saveProviderApp(payload, providerAppModal === 'new' ? null : providerAppModal)}
        />
      ) : null}
    </div>
  )
}

function RepositoriesSection({
  connections,
  repositories,
  organizationRepositories,
  loading,
  organization,
  onConnect,
  onSync,
  onLink,
  onUnlink,
}: {
  connections: GithubConnection[]
  repositories: GithubRepository[]
  organizationRepositories: OrganizationRepository[]
  loading: boolean
  organization: OrganizationRow | null
  onConnect: () => void
  onSync: (connection: GithubConnection) => void
  onLink: (repository: GithubRepository, isDefault: boolean) => void
  onUnlink: (link: OrganizationRepository) => void
}) {
  const activeLinks = organizationRepositories.filter((link) => link.active)
  const linkByRepositoryId = new Map(activeLinks.map((link) => [link.repositoryId, link]))
  const connectionById = new Map(connections.map((connection) => [connection.id, connection]))

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-edge/15 pb-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">connections</div>
          <h1 className="mt-1 font-mono text-2xl font-bold lowercase text-fg-1">repositories</h1>
        </div>
        <Button kind="primary" icon={<Github className="h-3.5 w-3.5" />} onClick={onConnect} disabled={!organization}>
          connect github
        </Button>
      </div>

      <Panel title="github connections">
        <div className="mb-4 border border-edge/12 bg-rim px-3 py-2 font-mono text-xs text-fg-3">
          Paste a GitHub token once, sync accessible repositories, then link the repos this organization should use for development work.
        </div>

        {connections.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2">
            {connections.map((connection) => (
              <div key={connection.id} className="border border-edge/12 bg-rim px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm text-fg-1">{connection.name}</div>
                    <div className="mt-1 font-mono text-[11px] text-fg-4">
                      {connection.providerAccountLogin ?? 'github'} · token ending {connection.credentialLast4 ?? '----'}
                    </div>
                  </div>
                  <StatusPill kind={connection.status === 'active' ? 'ok' : 'idle'}>{connection.status}</StatusPill>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="font-mono text-[11px] text-fg-4">synced {formatDate(connection.lastSyncedAt)}</div>
                  <Button
                    className="px-2 py-1 text-[10px]"
                    icon={<RefreshCw className="h-3 w-3" />}
                    onClick={() => onSync(connection)}
                  >
                    sync
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-edge/15 py-8 text-center font-mono text-sm text-fg-4">
            {loading ? 'loading github connections' : 'no github connections'}
          </div>
        )}
      </Panel>

      <Panel title="organization repositories">
        <div className="overflow-auto">
          <table className="w-full min-w-[900px] text-left font-mono text-xs">
            <thead className="text-[10px] uppercase tracking-label text-fg-4">
              <tr className="border-b border-edge/12">
                <th className="pb-2 pr-3 font-normal">repository</th>
                <th className="pb-2 pr-3 font-normal">connection</th>
                <th className="pb-2 pr-3 font-normal">branch</th>
                <th className="pb-2 pr-3 font-normal">visibility</th>
                <th className="pb-2 pr-3 font-normal">status</th>
                <th className="pb-2 font-normal">action</th>
              </tr>
            </thead>
            <tbody>
              {repositories.map((repository) => {
                const link = linkByRepositoryId.get(repository.id)
                const connection = repository.connectionId ? connectionById.get(repository.connectionId) : null
                return (
                  <tr key={repository.id} className="border-b border-edge/8 text-fg-2">
                    <td className="max-w-[260px] py-2.5 pr-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <Github className="h-3.5 w-3.5 shrink-0 text-fg-4" />
                        <span className="truncate text-fg-1">{repository.fullName}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-fg-4">{connection?.providerAccountLogin ?? '-'}</td>
                    <td className="py-2.5 pr-3">
                      <span className="inline-flex items-center gap-1.5 text-fg-3">
                        <GitBranch className="h-3 w-3" />
                        {repository.defaultBranch}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-fg-4">{repository.isPrivate ? 'private' : 'public'}</td>
                    <td className="py-2.5 pr-3">
                      {link ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusPill kind={link.isDefault ? 'ok' : 'idle'}>{link.isDefault ? 'default' : 'linked'}</StatusPill>
                          <RepositoryWebhookPill repository={repository} />
                        </div>
                      ) : (
                        <StatusPill kind="idle">not linked</StatusPill>
                      )}
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        {link ? (
                          <>
                            {!link.isDefault ? (
                              <Button
                                className="px-2 py-1 text-[10px]"
                                icon={<Check className="h-3 w-3" />}
                                onClick={() => onLink(repository, true)}
                              >
                                default
                              </Button>
                            ) : null}
                            <Button
                              kind="danger"
                              className="px-2 py-1 text-[10px]"
                              icon={<Unlink className="h-3 w-3" />}
                              onClick={() => onUnlink(link)}
                            >
                              unlink
                            </Button>
                          </>
                        ) : (
                          <Button
                            className="px-2 py-1 text-[10px]"
                            icon={<Link2 className="h-3 w-3" />}
                            onClick={() => onLink(repository, activeLinks.length === 0)}
                          >
                            link
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {repositories.length === 0 ? (
          <div className="border border-dashed border-edge/15 py-8 text-center font-mono text-sm text-fg-4">
            {loading ? 'loading repositories' : connections.length ? 'no repositories synced yet' : 'connect github to sync repositories'}
          </div>
        ) : null}
      </Panel>
    </div>
  )
}

function SocialSection({
  organization,
  providerApps,
  defaults,
  loadingProviderApps,
  connections,
  channels,
  channelConnections,
  onConnect,
  onCreateProviderApp,
  onEditProviderApp,
  onArchiveProviderApp,
  onCreateChannel,
  onDeleteChannel,
}: {
  organization: OrganizationRow | null
  providerApps: SocialProviderApp[]
  defaults: SocialSettingsDefaults | null
  loadingProviderApps: boolean
  connections: SocialConnectionRow[]
  channels: SocialChannelRow[]
  channelConnections: SocialChannelConnectionRow[]
  onConnect: () => void
  onCreateProviderApp: () => void
  onEditProviderApp: (providerApp: SocialProviderApp) => void
  onArchiveProviderApp: (providerApp: SocialProviderApp) => void
  onCreateChannel: () => void
  onDeleteChannel: (channel: SocialChannelRow) => void
}) {
  const linkedinConnections = connections.filter((connection) => connection.provider === 'linkedin')
  const linkedinChannels = channels.filter((channel) => channel.provider === 'linkedin')
  const linkedinProviderApps = providerApps.filter((providerApp) => providerApp.provider === 'linkedin')
  const linkedinProviderApp = pickLinkedInOAuthProviderApp(linkedinProviderApps)
  const firstLinkedinProviderApp = linkedinProviderApps[0] ?? null
  const activeLinkedinConnections = linkedinConnections.filter((connection) => connection.status === 'active')
  const linkedinRedirectUri = firstLinkedinProviderApp?.redirectUri ?? defaults?.linkedinRedirectUri ?? ''
  const linkedinRedirectUriLabel = firstLinkedinProviderApp ? 'active redirect uri' : 'default redirect uri'
  const connectionsById = new Map(linkedinConnections.map((connection) => [connection.id, connection]))
  const channelLinksByChannelId = new Map<string, SocialChannelConnectionRow[]>()

  for (const link of channelConnections) {
    const current = channelLinksByChannelId.get(link.channelId) ?? []
    current.push(link)
    channelLinksByChannelId.set(link.channelId, current)
  }

  const readyLinkedinChannels = linkedinChannels.filter((channel) => (
    (channelLinksByChannelId.get(channel.id) ?? []).some((link) => link.status === 'active')
  ))
  const linkedinSetup = linkedinSetupState({
    providerApps: linkedinProviderApps,
    usableProviderApp: linkedinProviderApp,
    activeConnections: activeLinkedinConnections,
    readyChannels: readyLinkedinChannels,
  })
  const primaryAction = linkedinPrimaryAction({
    setup: linkedinSetup,
    firstProviderApp: firstLinkedinProviderApp,
    onCreateProviderApp,
    onEditProviderApp,
    onConnect,
    onCreateChannel,
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-edge/15 pb-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">integrations</div>
          <h1 className="mt-1 font-mono text-2xl font-bold lowercase text-fg-1">social</h1>
        </div>
      </div>

      <Panel className="border-accent/25 bg-accent-fill/3">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex h-8 w-8 items-center justify-center border border-accent/35 bg-accent-fill/8 text-accent">
                <Linkedin className="h-4 w-4" />
              </div>
              <div>
                <div className="font-mono text-base font-bold lowercase text-fg-1">linkedin</div>
                <div className="mt-0.5 font-mono text-[10px] uppercase tracking-label text-fg-4">organization publishing</div>
              </div>
              <StatusPill kind={linkedinSetup.kind}>{linkedinSetup.label}</StatusPill>
            </div>

            <div className="mt-4 overflow-hidden border border-edge/15 bg-rim divide-y divide-edge/12 md:grid md:grid-cols-3 md:divide-x md:divide-y-0">
              <LinkedInSetupStep
                label="developer app"
                value={firstLinkedinProviderApp ? providerAppStatusLabel(firstLinkedinProviderApp.status) : 'not configured'}
                done={Boolean(linkedinProviderApp)}
                warning={Boolean(firstLinkedinProviderApp && !linkedinProviderApp)}
                help={SOCIAL_HELP.developerApp}
              />
              <LinkedInSetupStep
                label="account connection"
                value={activeLinkedinConnections.length ? `${activeLinkedinConnections.length} active` : 'not connected'}
                done={activeLinkedinConnections.length > 0}
                help={SOCIAL_HELP.connectLinkedin}
              />
              <LinkedInSetupStep
                label="destinations"
                value={readyLinkedinChannels.length ? `${readyLinkedinChannels.length} ready` : linkedinChannels.length ? 'needs connection' : 'none'}
                done={readyLinkedinChannels.length > 0}
                warning={linkedinChannels.length > 0 && readyLinkedinChannels.length === 0}
                help={SOCIAL_HELP.linkedinPage}
              />
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
            <Button
              kind="primary"
              icon={primaryAction.icon}
              onClick={primaryAction.onClick}
              disabled={!organization}
            >
              {primaryAction.label}
            </Button>
            {linkedinSetup.stage === 'ready' ? (
              <Button icon={<Linkedin className="h-3.5 w-3.5" />} onClick={onConnect} disabled={!organization}>
                connect another
              </Button>
            ) : null}
          </div>
        </div>
      </Panel>

      <Panel
        title={<PanelTitleWithHelp label="linkedin developer apps" help={SOCIAL_HELP.developerApp} />}
        right={
          <Button className="px-2 py-1 text-[10px]" icon={<Plus className="h-3 w-3" />} onClick={onCreateProviderApp} disabled={!organization}>
            add
          </Button>
        }
      >
        {linkedinProviderApps.length > 0 ? (
          <div className="overflow-auto">
            <table className="w-full min-w-[980px] text-left font-mono text-xs">
              <thead className="text-[10px] uppercase tracking-label text-fg-4">
                <tr className="border-b border-edge/12">
                  <th className="pb-2 pr-3 font-normal">app</th>
                  <th className="pb-2 pr-3 font-normal">purpose</th>
                  <th className="pb-2 pr-3 font-normal">client id</th>
                  <th className="pb-2 pr-3 font-normal">secret</th>
                  <th className="pb-2 pr-3 font-normal">redirect</th>
                  <th className="pb-2 pr-3 font-normal">status</th>
                  <th className="pb-2 font-normal">action</th>
                </tr>
              </thead>
              <tbody>
                {linkedinProviderApps.map((providerApp) => (
                  <tr key={providerApp.id} className="border-b border-edge/8 text-fg-2">
                    <td className="max-w-[180px] truncate py-2.5 pr-3 text-fg-1">{providerApp.name}</td>
                    <td className="py-2.5 pr-3 text-fg-4">{providerApp.purpose.replace(/_/g, ' ')}</td>
                    <td className="max-w-[180px] truncate py-2.5 pr-3 text-fg-4">{providerApp.clientId}</td>
                    <td className="py-2.5 pr-3">
                      {providerApp.hasClientSecret ? (
                        <span className="text-fg-3">configured · {providerApp.clientSecretLast4 ?? '••••'}</span>
                      ) : (
                        <span className="text-amber">missing</span>
                      )}
                    </td>
                    <td className="max-w-[260px] truncate py-2.5 pr-3 text-fg-4" title={providerApp.redirectUri}>{providerApp.redirectUri}</td>
                    <td className="py-2.5 pr-3">
                      <StatusPill kind={providerAppStatusKind(providerApp.status)}>{providerAppStatusLabel(providerApp.status)}</StatusPill>
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <Button className="px-2 py-1 text-[10px]" icon={<Edit3 className="h-3 w-3" />} onClick={() => onEditProviderApp(providerApp)}>
                          edit
                        </Button>
                        <Button kind="danger" className="px-2 py-1 text-[10px]" icon={<Trash2 className="h-3 w-3" />} onClick={() => onArchiveProviderApp(providerApp)}>
                          archive
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="border border-dashed border-edge/15 py-8 text-center font-mono text-sm text-fg-4">
            {loadingProviderApps ? 'loading linkedin apps' : 'no linkedin developer apps'}
          </div>
        )}
        {linkedinRedirectUri ? (
          <div className="mt-3 flex flex-col gap-2 border border-edge/12 bg-rim px-3 py-2 font-mono text-xs text-fg-3 md:flex-row md:items-center">
            <span className="text-fg-4">{linkedinRedirectUriLabel}</span>
            <code className="min-w-0 flex-1 truncate text-fg-1">{linkedinRedirectUri}</code>
            <Button className="px-2 py-1 text-[10px]" icon={<Copy className="h-3 w-3" />} onClick={() => void navigator.clipboard.writeText(linkedinRedirectUri)}>
              copy
            </Button>
          </div>
        ) : null}
      </Panel>

      <Panel
        title={<PanelTitleWithHelp label="linkedin connections" help={SOCIAL_HELP.connectLinkedin} />}
        right={
          <Button className="px-2 py-1 text-[10px]" icon={<Linkedin className="h-3 w-3" />} onClick={onConnect} disabled={!organization || !linkedinProviderApp}>
            connect
          </Button>
        }
      >
        {linkedinConnections.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2">
            {linkedinConnections.map((connection) => (
              <div key={connection.id} className="border border-edge/12 bg-rim px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm text-fg-1">{connection.providerAccountName ?? 'LinkedIn account'}</div>
                    <div className="mt-1 font-mono text-[11px] text-fg-4">
                      {connection.credentialKind} · {connection.scopes.join(', ') || 'no scopes'}
                    </div>
                  </div>
                  <StatusPill kind={connection.status === 'active' ? 'ok' : 'warn'}>{connection.status}</StatusPill>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="font-mono text-[11px] text-fg-4">expires {formatDate(connection.tokenExpiresAt)}</div>
                  {connection.providerAccountUrl ? (
                    <a
                      href={connection.providerAccountUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-label text-accent hover:text-fg-1"
                    >
                      open <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-edge/15 py-8 text-center font-mono text-sm text-fg-4">
            no linkedin accounts connected
          </div>
        )}
      </Panel>

      <Panel
        title={<PanelTitleWithHelp label="linkedin channels" help={SOCIAL_HELP.linkedinPage} />}
        right={
          <Button className="px-2 py-1 text-[10px]" icon={<Plus className="h-3 w-3" />} onClick={onCreateChannel} disabled={!organization}>
            add
          </Button>
        }
      >
        <div className="overflow-auto">
          <table className="w-full min-w-[860px] text-left font-mono text-xs">
            <thead className="text-[10px] uppercase tracking-label text-fg-4">
              <tr className="border-b border-edge/12">
                <th className="pb-2 pr-3 font-normal">destination</th>
                <th className="pb-2 pr-3 font-normal">type</th>
                <th className="pb-2 pr-3 font-normal">external id</th>
                <th className="pb-2 pr-3 font-normal">publishing</th>
                <th className="pb-2 pr-3 font-normal">status</th>
                <th className="pb-2 font-normal">action</th>
              </tr>
            </thead>
            <tbody>
              {linkedinChannels.map((channel) => {
                const links = channelLinksByChannelId.get(channel.id) ?? []
                const activeLinks = links.filter((link) => link.status === 'active')
                const connectionNames = activeLinks
                  .map((link) => connectionsById.get(link.connectionId)?.providerAccountName ?? 'LinkedIn account')
                  .join(', ')
                return (
                  <tr key={channel.id} className="border-b border-edge/8 text-fg-2">
                    <td className="max-w-[220px] py-2.5 pr-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <Linkedin className="h-3.5 w-3.5 shrink-0 text-accent" />
                        <span className="truncate text-fg-1">{channel.displayName}</span>
                      </div>
                      {channel.url ? (
                        <a href={channel.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[11px] text-fg-4 hover:text-accent">
                          {channel.url}
                        </a>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3 text-fg-4">{channel.kind}</td>
                    <td className="max-w-[220px] truncate py-2.5 pr-3 text-fg-4">{channel.externalId}</td>
                    <td className="py-2.5 pr-3">{connectionNames || <span className="text-fg-4">not connected</span>}</td>
                    <td className="py-2.5 pr-3">
                      <StatusPill kind={activeLinks.length > 0 ? 'ok' : channel.status === 'active' ? 'warn' : 'idle'}>
                        {activeLinks.length > 0 ? 'ready' : channel.status}
                      </StatusPill>
                    </td>
                    <td className="py-2.5">
                      <Button
                        kind="danger"
                        className="px-2 py-1 text-[10px]"
                        icon={<Trash2 className="h-3 w-3" />}
                        onClick={() => onDeleteChannel(channel)}
                      >
                        remove
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {linkedinChannels.length === 0 ? (
          <div className="border border-dashed border-edge/15 py-8 text-center font-mono text-sm text-fg-4">
            no linkedin channels
          </div>
        ) : null}
      </Panel>
    </div>
  )
}

type LinkedInSetupStage = 'app' | 'app_status' | 'connect' | 'destination' | 'ready'

type LinkedInSetupState = {
  stage: LinkedInSetupStage
  label: string
  kind: 'ok' | 'warn' | 'fail' | 'info' | 'idle'
}

function LinkedInSetupStep({
  label,
  value,
  done,
  warning = false,
  help,
}: {
  label: string
  value: string
  done: boolean
  warning?: boolean
  help: string
}) {
  const kind = done ? 'ok' : warning ? 'warn' : 'idle'
  return (
    <HelpTooltip label={help} block>
      <div
        className={`flex min-h-[88px] w-full flex-col px-3 py-2.5 ${
          done
            ? 'bg-ok/4'
            : warning
              ? 'bg-warn/4'
              : 'bg-transparent'
        }`}
      >
        <div>
          <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">{label}</div>
          <div className="mt-2">
            <StatusPill kind={kind}>{done ? 'done' : warning ? 'attention' : 'pending'}</StatusPill>
          </div>
        </div>
        <div className="mt-auto truncate pt-3 font-mono text-xs text-fg-2">{value}</div>
      </div>
    </HelpTooltip>
  )
}

function linkedinSetupState({
  providerApps,
  usableProviderApp,
  activeConnections,
  readyChannels,
}: {
  providerApps: SocialProviderApp[]
  usableProviderApp: SocialProviderApp | null
  activeConnections: SocialConnectionRow[]
  readyChannels: SocialChannelRow[]
}): LinkedInSetupState {
  if (providerApps.length === 0) return { stage: 'app', label: 'setup needed', kind: 'idle' }
  if (!usableProviderApp) {
    const firstStatus = providerApps[0]?.status
    return {
      stage: 'app_status',
      label: firstStatus === 'pending_approval' ? 'community access pending' : 'app attention',
      kind: 'warn',
    }
  }
  if (activeConnections.length === 0) return { stage: 'connect', label: 'connect account', kind: 'info' }
  if (readyChannels.length === 0) return { stage: 'destination', label: 'add destination', kind: 'warn' }
  return { stage: 'ready', label: 'ready', kind: 'ok' }
}

function linkedinPrimaryAction({
  setup,
  firstProviderApp,
  onCreateProviderApp,
  onEditProviderApp,
  onConnect,
  onCreateChannel,
}: {
  setup: LinkedInSetupState
  firstProviderApp: SocialProviderApp | null
  onCreateProviderApp: () => void
  onEditProviderApp: (providerApp: SocialProviderApp) => void
  onConnect: () => void
  onCreateChannel: () => void
}) {
  if (setup.stage === 'app') {
    return { label: 'configure app', icon: <KeyRound className="h-3.5 w-3.5" />, onClick: onCreateProviderApp }
  }
  if (setup.stage === 'app_status') {
    return {
      label: firstProviderApp?.status === 'pending_approval' ? 'review access' : 'update app',
      icon: <KeyRound className="h-3.5 w-3.5" />,
      onClick: () => firstProviderApp ? onEditProviderApp(firstProviderApp) : onCreateProviderApp(),
    }
  }
  if (setup.stage === 'connect') {
    return { label: 'connect linkedin', icon: <Linkedin className="h-3.5 w-3.5" />, onClick: onConnect }
  }
  return { label: 'add destination', icon: <Plus className="h-3.5 w-3.5" />, onClick: onCreateChannel }
}

function ApiKeysSection({
  apiKeys,
  loading,
  organization,
  onCreate,
  onRevoke,
}: {
  apiKeys: OrganizationApiKey[]
  loading: boolean
  organization: OrganizationRow | null
  onCreate: () => void
  onRevoke: (apiKey: OrganizationApiKey) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-edge/15 pb-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">connections</div>
          <h1 className="mt-1 font-mono text-2xl font-bold lowercase text-fg-1">api keys</h1>
        </div>
        <Button kind="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={onCreate} disabled={!organization}>
          api key
        </Button>
      </div>

      <Panel title="organization api keys">
        <div className="mb-4 border border-edge/12 bg-rim px-3 py-2 font-mono text-xs text-fg-3">
          Connected apps should call Pach from their own server with <span className="text-fg-1">PACH_API_KEY</span>. Never expose this key through public browser env vars.
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[860px] text-left font-mono text-xs">
            <thead className="text-[10px] uppercase tracking-label text-fg-4">
              <tr className="border-b border-edge/12">
                <th className="pb-2 pr-3 font-normal">name</th>
                <th className="pb-2 pr-3 font-normal">prefix</th>
                <th className="pb-2 pr-3 font-normal">scopes</th>
                <th className="pb-2 pr-3 font-normal">status</th>
                <th className="pb-2 pr-3 font-normal">last used</th>
                <th className="pb-2 pr-3 font-normal">created</th>
                <th className="pb-2 font-normal">action</th>
              </tr>
            </thead>
            <tbody>
              {apiKeys.map((apiKey) => (
                <tr key={apiKey.id} className="border-b border-edge/8 text-fg-2">
                  <td className="max-w-[220px] truncate py-2.5 pr-3">{apiKey.name}</td>
                  <td className="py-2.5 pr-3 text-fg-4">{apiKey.tokenPrefix}...</td>
                  <td className="py-2.5 pr-3">{apiKey.scopes.join(', ') || '-'}</td>
                  <td className="py-2.5 pr-3">
                    <StatusPill kind={apiKey.status === 'active' ? 'ok' : 'idle'}>{apiKey.status}</StatusPill>
                  </td>
                  <td className="py-2.5 pr-3 text-fg-4">{formatDate(apiKey.lastUsedAt)}</td>
                  <td className="py-2.5 pr-3 text-fg-4">{formatDate(apiKey.createdAt)}</td>
                  <td className="py-2.5">
                    <Button
                      kind="danger"
                      className="px-2 py-1 text-[10px]"
                      icon={<Trash2 className="h-3 w-3" />}
                      onClick={() => onRevoke(apiKey)}
                      disabled={apiKey.status !== 'active'}
                    >
                      revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {apiKeys.length === 0 ? (
          <div className="border border-dashed border-edge/15 py-8 text-center font-mono text-sm text-fg-4">
            {loading ? 'loading api keys' : 'no api keys'}
          </div>
        ) : null}
      </Panel>
    </div>
  )
}

function CreateApiKeyModal({
  organization,
  onClose,
  onSubmit,
}: {
  organization: OrganizationRow | null
  onClose: () => void
  onSubmit: (payload: { name: string; scopes: string[] }) => void
}) {
  const [name, setName] = useState(() => organization?.project === 'ardia' ? 'Ardia website' : 'Connected app')
  const [scopes, setScopes] = useState<string[]>(['activity:write'])

  function toggleScope(scope: string) {
    setScopes((current) => current.includes(scope) ? current.filter((entry) => entry !== scope) : [...current, scope])
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-overlay/70 px-4 pt-[10vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl border border-edge/20 bg-pit-2 shadow-terminal-overlay"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-edge/12 px-5 py-3">
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="inline-flex items-center gap-1.5 border border-edge/25 bg-accent-fill/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-accent">
              settings
            </span>
            <span className="text-fg-4">›</span>
            <span className="text-fg-2 lowercase">api key</span>
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
          <h2 className="font-mono text-2xl font-bold lowercase text-fg-1">new api key</h2>
        </div>

        <div className="space-y-4 px-5 py-5">
          <label className="block">
            <FieldLabel>name</FieldLabel>
            <TermInput autoFocus value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          <div>
            <FieldLabel>scopes</FieldLabel>
            <div className="grid gap-2 md:grid-cols-2">
              {API_KEY_SCOPES.map((scope) => {
                const selected = scopes.includes(scope.value)
                return (
                  <button
                    key={scope.value}
                    type="button"
                    onClick={() => toggleScope(scope.value)}
                    className={`flex items-center justify-between border px-3 py-2 text-left font-mono text-xs transition ${
                      selected
                        ? 'border-accent/50 bg-accent-fill/10 text-accent'
                        : 'border-edge/12 bg-rim text-fg-3 hover:border-edge/30 hover:text-fg-1'
                    }`}
                  >
                    {scope.label}
                    {selected ? <Check className="h-3.5 w-3.5" /> : null}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="border border-edge/12 bg-rim px-3 py-2 font-mono text-xs text-fg-3">
            This secret will be shown once. Store it in the connected app as <span className="text-fg-1">PACH_API_KEY</span>.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-edge/12 px-5 py-3">
          <Button onClick={onClose}>cancel</Button>
          <Button
            kind="primary"
            icon={<KeyRound className="h-3.5 w-3.5" />}
            onClick={() => onSubmit({ name: name.trim(), scopes })}
            disabled={!name.trim() || scopes.length === 0}
          >
            generate
          </Button>
        </div>
      </div>
    </div>
  )
}

function ConnectGithubModal({
  organization,
  onClose,
  onSubmit,
}: {
  organization: OrganizationRow | null
  onClose: () => void
  onSubmit: (payload: { name: string; token: string; credentialKind: string }) => void
}) {
  const [name, setName] = useState(() => organization ? `${organization.name} GitHub` : 'GitHub connection')
  const [token, setToken] = useState('')
  const [credentialKind, setCredentialKind] = useState('fine_grained_pat')

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-overlay/70 px-4 pt-[10vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl border border-edge/20 bg-pit-2 shadow-terminal-overlay"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-edge/12 px-5 py-3">
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="inline-flex items-center gap-1.5 border border-edge/25 bg-accent-fill/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-accent">
              settings
            </span>
            <span className="text-fg-4">›</span>
            <span className="text-fg-2 lowercase">github</span>
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
          <h2 className="font-mono text-2xl font-bold lowercase text-fg-1">connect github</h2>
        </div>

        <div className="space-y-4 px-5 py-5">
          <label className="block">
            <FieldLabel>name</FieldLabel>
            <TermInput autoFocus value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          <label className="block">
            <FieldLabel>token</FieldLabel>
            <TermInput
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="github_pat_..."
              spellCheck={false}
            />
          </label>

          <label className="block">
            <FieldLabel>credential kind</FieldLabel>
            <PachSelect
              variant="field"
              value={credentialKind}
              onChange={setCredentialKind}
              options={GITHUB_CREDENTIAL_KIND_OPTIONS}
              display={optionLabel(GITHUB_CREDENTIAL_KIND_OPTIONS, credentialKind)}
            />
          </label>

          <div className="border border-edge/12 bg-rim px-3 py-2 font-mono text-xs text-fg-3">
            Use a token with repository metadata, contents, pull requests, and webhooks access for the repos the agent should work in. Pach stores it encrypted at rest.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-edge/12 px-5 py-3">
          <Button onClick={onClose}>cancel</Button>
          <Button
            kind="primary"
            icon={<Github className="h-3.5 w-3.5" />}
            onClick={() => onSubmit({ name: name.trim(), token: token.trim(), credentialKind })}
            disabled={!name.trim() || !token.trim()}
          >
            connect
          </Button>
        </div>
      </div>
    </div>
  )
}

function CreateLinkedInChannelModal({
  organization,
  onClose,
  onSubmit,
}: {
  organization: OrganizationRow | null
  onClose: () => void
  onSubmit: (payload: { displayName: string; externalId: string; url: string; handle: string; kind: string }) => void
}) {
  const [displayName, setDisplayName] = useState(() => organization ? `${organization.name} LinkedIn Page` : 'LinkedIn Page')
  const [externalId, setExternalId] = useState('')
  const [url, setUrl] = useState('')
  const [handle, setHandle] = useState('')
  const [kind, setKind] = useState('organization')

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-overlay/70 px-4 pt-[10vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl border border-edge/20 bg-pit-2 shadow-terminal-overlay"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-edge/12 px-5 py-3">
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="inline-flex items-center gap-1.5 border border-edge/25 bg-accent-fill/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-accent">
              settings
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
          <h2 className="font-mono text-2xl font-bold lowercase text-fg-1">
            <HelpTooltip label={SOCIAL_HELP.linkedinPage}>linkedin page</HelpTooltip>
          </h2>
        </div>

        <div className="space-y-4 px-5 py-5">
          <label className="block">
            <FieldLabel>display name</FieldLabel>
            <TermInput autoFocus value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>

          <label className="block">
            <FieldLabel>external id</FieldLabel>
            <TermInput
              value={externalId}
              onChange={(event) => setExternalId(event.target.value)}
              placeholder="urn:li:organization:123456"
              spellCheck={false}
            />
          </label>

          <label className="block">
            <FieldLabel>url</FieldLabel>
            <TermInput
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.linkedin.com/company/..."
              spellCheck={false}
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <FieldLabel>handle</FieldLabel>
              <TermInput value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="@ardia" spellCheck={false} />
            </label>

            <label className="block">
              <FieldLabel>type</FieldLabel>
              <PachSelect
                variant="field"
                value={kind}
                onChange={setKind}
                options={LINKEDIN_CHANNEL_KIND_OPTIONS}
                display={optionLabel(LINKEDIN_CHANNEL_KIND_OPTIONS, kind)}
              />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-edge/12 px-5 py-3">
          <Button onClick={onClose}>cancel</Button>
          <Button
            kind="primary"
            icon={<Linkedin className="h-3.5 w-3.5" />}
            onClick={() => onSubmit({ displayName: displayName.trim(), externalId: externalId.trim(), url: url.trim(), handle: handle.trim(), kind })}
            disabled={!displayName.trim() || !externalId.trim()}
          >
            register
          </Button>
        </div>
      </div>
    </div>
  )
}

function LinkedInProviderAppModal({
  organization,
  providerApp,
  defaults,
  onClose,
  onSubmit,
}: {
  organization: OrganizationRow | null
  providerApp: SocialProviderApp | null
  defaults: SocialSettingsDefaults | null
  onClose: () => void
  onSubmit: (payload: ProviderAppFormPayload) => void
}) {
  const defaultPurpose = providerApp?.purpose ?? 'organization_publishing'
  const defaultScopes = providerApp?.scopesRequested?.length
    ? providerApp.scopesRequested
    : defaultPurpose === 'member_sharing'
      ? defaults?.memberScopes ?? ['w_member_social']
      : defaults?.organizationScopes ?? ['w_organization_social', 'r_organization_social']
  const [name, setName] = useState(() => providerApp?.name ?? (organization ? `${organization.name} Page Publisher` : 'LinkedIn Page Publisher'))
  const [purpose, setPurpose] = useState(defaultPurpose)
  const [clientId, setClientId] = useState(providerApp?.clientId ?? '')
  const [clientSecret, setClientSecret] = useState('')
  const [redirectUri, setRedirectUri] = useState(providerApp?.redirectUri ?? defaults?.linkedinRedirectUri ?? '')
  const [scopes, setScopes] = useState(defaultScopes.join(', '))
  const [status, setStatus] = useState(providerApp?.status ?? 'pending_approval')
  const parsedScopes = parseScopesDraft(scopes)

  useEffect(() => {
    if (providerApp || scopes.trim()) return
    setScopes((purpose === 'member_sharing' ? defaults?.memberScopes ?? ['w_member_social'] : defaults?.organizationScopes ?? ['w_organization_social', 'r_organization_social']).join(', '))
  }, [defaults, providerApp, purpose, scopes])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-overlay/70 px-4 pt-[7vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl border border-edge/20 bg-pit-2 shadow-terminal-overlay"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-edge/12 px-5 py-3">
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="inline-flex items-center gap-1.5 border border-edge/25 bg-accent-fill/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-accent">
              settings
            </span>
            <span className="text-fg-4">›</span>
            <span className="text-fg-2 lowercase">linkedin app</span>
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
          <h2 className="font-mono text-2xl font-bold lowercase text-fg-1">
            <HelpTooltip label={SOCIAL_HELP.developerApp}>
              {providerApp ? 'edit developer app' : 'add developer app'}
            </HelpTooltip>
          </h2>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <FieldLabel>name</FieldLabel>
              <TermInput autoFocus value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="block">
              <FieldLabel>purpose</FieldLabel>
              <PachSelect
                variant="field"
                value={purpose}
                onChange={(next) => {
                  setPurpose(next)
                  if (!providerApp) setScopes((next === 'member_sharing' ? defaults?.memberScopes ?? ['w_member_social'] : defaults?.organizationScopes ?? ['w_organization_social', 'r_organization_social']).join(', '))
                }}
                options={LINKEDIN_PROVIDER_PURPOSE_OPTIONS}
                display={optionLabel(LINKEDIN_PROVIDER_PURPOSE_OPTIONS, purpose)}
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <FieldLabel>client id</FieldLabel>
              <TermInput value={clientId} onChange={(event) => setClientId(event.target.value)} spellCheck={false} />
            </label>
            <label className="block">
              <FieldLabel>{providerApp?.hasClientSecret ? 'rotate secret' : 'client secret'}</FieldLabel>
              <TermInput
                type="password"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                placeholder={providerApp?.hasClientSecret ? 'leave blank to keep existing' : ''}
                spellCheck={false}
              />
            </label>
          </div>

          <label className="block">
            <FieldLabel>redirect uri</FieldLabel>
            <div className="flex gap-2">
              <TermInput value={redirectUri} onChange={(event) => setRedirectUri(event.target.value)} spellCheck={false} />
              <Button className="px-2" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => void navigator.clipboard.writeText(redirectUri)} disabled={!redirectUri}>
                copy
              </Button>
            </div>
          </label>

          <label className="block">
            <FieldLabel>scopes</FieldLabel>
            <TermInput value={scopes} onChange={(event) => setScopes(event.target.value)} spellCheck={false} />
          </label>

          <label className="block">
            <FieldLabel>status</FieldLabel>
            <PachSelect
              variant="field"
              value={status}
              onChange={setStatus}
              options={LINKEDIN_PROVIDER_STATUS_OPTIONS}
              display={optionLabel(LINKEDIN_PROVIDER_STATUS_OPTIONS, status)}
            />
          </label>

          <div className="border border-edge/12 bg-rim px-3 py-2 font-mono text-xs text-fg-3">
            Pach stores the client secret encrypted at rest and only sends the redirect URI, app status, and non-secret metadata back to the portal.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-edge/12 px-5 py-3">
          <Button onClick={onClose}>cancel</Button>
          <Button
            kind="primary"
            icon={<KeyRound className="h-3.5 w-3.5" />}
            onClick={() => onSubmit({
              name: name.trim(),
              purpose,
              clientId: clientId.trim(),
              ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
              redirectUri: redirectUri.trim(),
              scopesRequested: parsedScopes,
              status,
            })}
            disabled={!name.trim() || !clientId.trim() || !redirectUri.trim() || parsedScopes.length === 0}
          >
            save
          </Button>
        </div>
      </div>
    </div>
  )
}

function SettingsSidebarButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
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
    </button>
  )
}

function sectionFromPath(pathname: string): SettingsSection | null {
  const segment = pathname.split('/')[2]
  return SECTIONS.some((section) => section.id === segment) ? segment as SettingsSection : null
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 font-mono text-[10px] uppercase tracking-label text-fg-4">{children}</div>
}

function PanelTitleWithHelp({ label, help }: { label: string; help: string }) {
  return (
    <HelpTooltip label={help}>
      <span>{label}</span>
    </HelpTooltip>
  )
}

function HelpTooltip({
  label,
  children,
  align = 'left',
  block = false,
}: {
  label: string
  children: ReactNode
  align?: 'left' | 'right'
  block?: boolean
}) {
  return (
    <span
      aria-label={label}
      className={`group/help-tooltip relative ${block ? 'flex h-full min-w-0' : 'inline-flex'}`}
    >
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none invisible absolute top-[calc(100%+8px)] z-[1200] w-72 border border-edge/25 bg-pit px-3 py-2 font-mono text-[11px] normal-case leading-4 tracking-normal text-fg-2 opacity-0 shadow-terminal-popover transition group-hover/help-tooltip:visible group-hover/help-tooltip:opacity-100 group-focus-within/help-tooltip:visible group-focus-within/help-tooltip:opacity-100 ${
          align === 'right' ? 'right-0' : 'left-0'
        }`}
      >
        {label}
      </span>
    </span>
  )
}

function RepositoryWebhookPill({ repository }: { repository: GithubRepository }) {
  const status = readWebhookStatus(repository.webhook)
  const message = readWebhookMessage(repository.webhook)
  const label =
    status === 'active'
      ? 'webhook'
      : status === 'error'
        ? 'webhook error'
        : status === 'not_configured'
          ? 'webhook config'
          : 'webhook pending'
  const kind = status === 'active' ? 'ok' : status === 'error' || status === 'not_configured' ? 'warn' : 'idle'

  return (
    <span title={message ?? label}>
      <StatusPill kind={kind}>{label}</StatusPill>
    </span>
  )
}

function readWebhookStatus(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const status = (value as Record<string, unknown>).status
  return typeof status === 'string' ? status : null
}

function readWebhookMessage(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const message = (value as Record<string, unknown>).message
  return typeof message === 'string' && message.trim() ? message.trim() : null
}

function providerAppStatusKind(status: string): 'ok' | 'warn' | 'info' | 'idle' {
  if (status === 'ready') return 'ok'
  if (status === 'pending_approval') return 'info'
  if (status === 'needs_secret' || status === 'needs_reconnect') return 'warn'
  return 'idle'
}

function providerAppStatusLabel(status: string) {
  if (status === 'pending_approval') return 'community access pending'
  return status.replace(/_/g, ' ')
}

function parseScopesDraft(value: string) {
  return Array.from(new Set(value.split(/[,\s]+/).map((entry) => entry.trim()).filter(Boolean)))
}

function optionLabel(options: PachSelectOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value.replace(/_/g, ' ')
}

function pickLinkedInOAuthProviderApp(providerApps: SocialProviderApp[]) {
  const candidates = providerApps.filter((providerApp) => (
    providerApp.provider === 'linkedin' &&
    providerApp.hasClientSecret &&
    providerApp.status === 'ready'
  ))
  return (
    candidates.find((providerApp) => providerApp.purpose === 'organization_publishing' && providerApp.status === 'ready') ??
    candidates.find((providerApp) => providerApp.purpose === 'organization_publishing') ??
    candidates[0] ??
    null
  )
}

function normalizeLinkedInExternalId(value: string) {
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return `urn:li:organization:${trimmed}`
  return trimmed
}

function formatDate(value: number | null | undefined) {
  if (!value) return '-'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || payload.message || `Request failed: ${response.status}`)
  }
  return payload
}
