import { useQuery, useZero } from '@rocicorp/zero/react'
import { Building2, Check, Copy, Github, GitBranch, KeyRound, Link2, Plus, RefreshCw, Settings2, Trash2, Unlink } from 'lucide-react'
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

type SettingsSection = 'api-keys' | 'repositories'

const SECTIONS: Array<{ id: SettingsSection; label: string }> = [
  { id: 'repositories', label: 'repositories' },
  { id: 'api-keys', label: 'api keys' },
]

const API_KEY_SCOPES = [
  { value: 'activity:write', label: 'activity write' },
  { value: 'marketing:write', label: 'marketing write' },
  { value: 'docs:write', label: 'docs write' },
  { value: 'analytics:write', label: 'analytics write' },
] as const

export default function SettingsPage() {
  const z = useZero<Schema, Mutators>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [organizations] = useQuery(z.query.organizations.orderBy('name', 'asc'))
  const [organizationId, setOrganizationId] = useState('')
  const [apiKeys, setApiKeys] = useState<OrganizationApiKey[]>([])
  const [githubConnections, setGithubConnections] = useState<GithubConnection[]>([])
  const [githubRepositories, setGithubRepositories] = useState<GithubRepository[]>([])
  const [organizationRepositories, setOrganizationRepositories] = useState<OrganizationRepository[]>([])
  const [loadingKeys, setLoadingKeys] = useState(false)
  const [loadingGithub, setLoadingGithub] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [connectGithubOpen, setConnectGithubOpen] = useState(false)
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
      return
    }
    void loadApiKeys(organizationId)
    void loadGithubSettings(organizationId)
  }, [organizationId])

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
            <select
              value={credentialKind}
              onChange={(event) => setCredentialKind(event.target.value)}
              className="w-full border border-edge/15 bg-rim px-3 py-2 font-mono text-sm text-fg-1 outline-none transition-colors focus:border-accent focus:shadow-glow-xs"
            >
              <option value="fine_grained_pat">fine-grained pat</option>
              <option value="classic_pat">classic pat</option>
            </select>
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
