import { useQuery, useZero } from '@rocicorp/zero/react'
import {
  Archive,
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronRight,
  FileText,
  History,
  ListTree,
  Megaphone,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PachSelect, type PachSelectOption } from '../../components/PachSelect'
import { RichEditor } from '../../components/rich-editor/RichEditor'
import { config } from '../../config'
import { authFetch, useAuth } from '../../lib/auth'
import type { Mutators } from '../../mutators'
import type { Schema } from '../../zero-schema'

type DocumentRow = Schema['tables']['documents']['row']
type DocumentSnapshotRow = Schema['tables']['document_snapshots']['row']
type OrganizationRow = Schema['tables']['organizations']['row']
type DocumentTreeNode = {
  document: DocumentRow
  children: DocumentTreeNode[]
}

const NO_ORGANIZATION = '__none__'
const DOCS_ORGANIZATION_STORAGE_KEY = 'pach.docs.organizationFilter'

export default function Docs() {
  const z = useZero<Schema, Mutators>()
  const navigate = useNavigate()
  const { documentId } = useParams<{ documentId?: string }>()
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [organizationFilter, setOrganizationFilter] = useState<string>(() => readStoredDocsOrganizationFilter())
  const [titleDraft, setTitleDraft] = useState('')
  const [bodyDraft, setBodyDraft] = useState('')
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null)
  const [versionsFrameOpen, setVersionsFrameOpen] = useState(false)
  const [expandedDocumentIds, setExpandedDocumentIds] = useState<Set<string>>(() => new Set())
  const [archiveConfirmDocument, setArchiveConfirmDocument] = useState<DocumentRow | null>(null)
  const [marketingContentConfirmDocument, setMarketingContentConfirmDocument] = useState<DocumentRow | null>(null)
  const [creatingMarketingContent, setCreatingMarketingContent] = useState(false)
  const [marketingContentStatus, setMarketingContentStatus] = useState<{ kind: 'ok' | 'fail'; message: string } | null>(null)
  const [documentActionStatus, setDocumentActionStatus] = useState<{ kind: 'ok' | 'fail'; message: string } | null>(null)

  const [documents] = useQuery(z.query.documents.orderBy('updatedAt', 'desc'))
  const [documentSnapshots] = useQuery(z.query.document_snapshots.orderBy('createdAt', 'desc'))
  const [marketingContentItems] = useQuery(z.query.mkt_content_items.orderBy('updatedAt', 'desc'))
  const [issues] = useQuery(z.query.pm_issues.orderBy('updatedAt', 'desc'))
  const [organizations] = useQuery(z.query.organizations.orderBy('name', 'asc'))

  const accessibleOrganizationIds = useMemo(() => new Set(user?.organizationIds ?? []), [user?.organizationIds])
  const canAccessOrganization = (organizationId: string | null | undefined) =>
    organizationId ? accessibleOrganizationIds.has(organizationId) : user?.canAccessUnscoped ?? false

  const accessibleOrganizations = useMemo(
    () => organizations.filter((organization) => accessibleOrganizationIds.has(organization.id)),
    [accessibleOrganizationIds, organizations],
  )
  const organizationOptions = useMemo<PachSelectOption[]>(() => {
    const options = accessibleOrganizations.map((organization) => ({
      value: organization.id,
      label: organization.name,
    }))
    if (user?.canAccessUnscoped) options.push({ value: NO_ORGANIZATION, label: 'no organization' })
    return options
  }, [accessibleOrganizations, user?.canAccessUnscoped])

  const documentsInSelectedOrganization = useMemo(
    () =>
      documents
        .filter((entry) => entry.status !== 'archived')
        .filter((entry) => canAccessOrganization(entry.organizationId))
        .filter((entry) => documentMatchesOrganizationFilter(entry, organizationFilter))
        .sort(compareDocumentsForTree),
    [documents, organizationFilter, user?.canAccessUnscoped, accessibleOrganizationIds],
  )

  const documentTree = useMemo(() => {
    const q = search.trim().toLowerCase()
    return buildDocumentTree(documentsInSelectedOrganization, q)
  }, [documentsInSelectedOrganization, search])

  const visibleDocuments = documentsInSelectedOrganization

  const selectedDocument = useMemo(
    () =>
      documents.find((entry) =>
        entry.id === documentId &&
        entry.status !== 'archived' &&
        canAccessOrganization(entry.organizationId)
      ) ?? null,
    [documents, documentId, user?.canAccessUnscoped, accessibleOrganizationIds],
  )

  const selectedOrganization = organizationFilter && organizationFilter !== NO_ORGANIZATION
    ? organizationFor(organizationFilter, organizations)
    : selectedDocument
      ? organizationFor(selectedDocument.organizationId, organizations)
      : null
  const selectedDocumentMarketingItems = useMemo(
    () => selectedDocument ? marketingContentItems.filter((item) => item.sourceDocumentId === selectedDocument.id) : [],
    [marketingContentItems, selectedDocument?.id],
  )
  const selectedDocumentSnapshots = useMemo(
    () => selectedDocument
      ? documentSnapshots
        .filter((snapshot) => snapshot.documentId === selectedDocument.id)
        .sort((a, b) => b.versionNumber - a.versionNumber)
      : [],
    [documentSnapshots, selectedDocument?.id],
  )
  const latestSnapshot = selectedDocumentSnapshots[0] ?? null
  const mainSnapshot = selectedDocument?.currentSnapshotId
    ? selectedDocumentSnapshots.find((snapshot) => snapshot.id === selectedDocument.currentSnapshotId) ?? latestSnapshot
    : latestSnapshot
  const selectedSnapshot = selectedSnapshotId
    ? selectedDocumentSnapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? null
    : null

  useEffect(() => {
    if (organizationOptions.length === 0) return
    if (organizationFilter && organizationOptions.some((option) => option.value === organizationFilter)) return
    const ardia = accessibleOrganizations.find((organization) => organization.project === 'ardia')
    setOrganizationFilter(ardia?.id ?? organizationOptions[0]?.value ?? '')
  }, [accessibleOrganizations, organizationFilter, organizationOptions])

  useEffect(() => {
    if (!organizationFilter) return
    if (!organizationOptions.some((option) => option.value === organizationFilter)) return
    writeStoredDocsOrganizationFilter(organizationFilter)
  }, [organizationFilter, organizationOptions])

  useEffect(() => {
    if (!organizationFilter) return
    if (documentId) return
    const next = documentsInSelectedOrganization[0]
    const nextPath = next ? `/docs/${next.id}` : '/docs'
    if (next) navigate(nextPath, { replace: true })
  }, [documentId, documentsInSelectedOrganization, navigate, organizationFilter])

  useEffect(() => {
    if (!selectedDocument) {
      setTitleDraft('')
      setBodyDraft('')
      setSelectedSnapshotId(null)
      setVersionsFrameOpen(false)
      setMarketingContentStatus(null)
      setDocumentActionStatus(null)
      return
    }
    setTitleDraft(selectedDocument.title)
    setBodyDraft(selectedDocument.body)
    setSelectedSnapshotId(null)
    setVersionsFrameOpen(false)
    setMarketingContentStatus(null)
    setDocumentActionStatus(null)
    if (selectedDocument.organizationId) setOrganizationFilter(selectedDocument.organizationId)
    else if (user?.canAccessUnscoped) setOrganizationFilter(NO_ORGANIZATION)
  }, [selectedDocument?.id])

  useEffect(() => {
    if (!selectedSnapshot) return
    setTitleDraft(selectedSnapshot.title)
    setBodyDraft(selectedSnapshot.body)
    setDocumentActionStatus(null)
  }, [selectedSnapshot?.id])

  useEffect(() => {
    if (!selectedSnapshotId) return
    if (selectedDocumentSnapshots.some((snapshot) => snapshot.id === selectedSnapshotId)) return
    setSelectedSnapshotId(null)
    if (!selectedDocument) return
    setTitleDraft(selectedDocument.title)
    setBodyDraft(selectedDocument.body)
  }, [selectedDocument, selectedSnapshotId, selectedDocumentSnapshots])

  useEffect(() => {
    if (!selectedDocument) return
    const ancestors = ancestorDocumentIds(selectedDocument.id, documentsInSelectedOrganization)
    if (ancestors.length === 0) return
    setExpandedDocumentIds((current) => {
      const next = new Set(current)
      let changed = false
      ancestors.forEach((id) => {
        if (next.has(id)) return
        next.add(id)
        changed = true
      })
      return changed ? next : current
    })
  }, [documentsInSelectedOrganization, selectedDocument?.id])

  useEffect(() => {
    if (!selectedDocument) return
    if (selectedSnapshotId && !selectedSnapshot) return
    if (selectedSnapshot) {
      if (titleDraft === selectedSnapshot.title && bodyDraft === selectedSnapshot.body) return
      const timer = window.setTimeout(() => {
        void saveSnapshotVersion(selectedDocument, selectedSnapshot, titleDraft, bodyDraft)
      }, 700)
      return () => window.clearTimeout(timer)
    }
    if (titleDraft === selectedDocument.title && bodyDraft === selectedDocument.body) return
    const timer = window.setTimeout(() => {
      void saveLiveDocument(selectedDocument, titleDraft, bodyDraft)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [bodyDraft, selectedDocument, selectedSnapshot, selectedSnapshotId, titleDraft])

  async function saveLiveDocument(entry: DocumentRow, nextTitle: string, nextBody: string) {
    const cleanTitle = nextTitle.trim() || 'Untitled'
    await z.mutate.documents.update({
      id: entry.id,
      title: cleanTitle,
      slug: uniqueSlug(cleanTitle, documents, entry.organizationId, entry.id),
      body: nextBody,
      format: 'markdown',
    })
  }

  async function saveSnapshotVersion(
    entry: DocumentRow,
    snapshot: DocumentSnapshotRow,
    nextTitle: string,
    nextBody: string,
  ) {
    const cleanTitle = nextTitle.trim() || snapshot.title || 'Untitled'
    await z.mutate.document_snapshots.update({
      id: snapshot.id,
      title: cleanTitle,
      slug: uniqueSlug(cleanTitle, documents, entry.organizationId, entry.id),
      body: nextBody,
      format: 'markdown',
    })
  }

  async function createDocument(title = 'Untitled', parent?: DocumentRow) {
    const organizationId = parent
      ? parent.organizationId ?? undefined
      : organizationFilter === NO_ORGANIZATION
        ? undefined
        : organizationFilter || accessibleOrganizations[0]?.id
    if (!organizationId && !user?.canAccessUnscoped) return
    const id = crypto.randomUUID()
    await z.mutate.documents.create({
      id,
      organizationId,
      parentId: parent?.id,
      ownerId: user?.id,
      publicId: nextDocumentPublicId(organizationId ?? null, organizations, documents),
      title,
      slug: uniqueSlug(title, documents, organizationId ?? null),
      body: '',
      format: 'markdown',
    })
    if (parent) setExpandedDocumentIds((current) => new Set([...current, parent.id]))
    navigate(`/docs/${id}`)
  }

  async function createLinkedChildDocument(parentId: string) {
    const parent = documents.find((entry) => entry.id === parentId)
    if (!parent) return null
    const title = 'Untitled'
    const organizationId = parent.organizationId ?? undefined
    if (!organizationId && !user?.canAccessUnscoped) return null
    const id = crypto.randomUUID()
    await z.mutate.documents.create({
      id,
      organizationId,
      parentId: parent.id,
      ownerId: user?.id,
      publicId: nextDocumentPublicId(organizationId ?? null, organizations, documents),
      title,
      slug: uniqueSlug(title, documents, organizationId ?? null),
      body: '',
      format: 'markdown',
    })
    setExpandedDocumentIds((current) => new Set([...current, parent.id]))
    return { id, title }
  }

  function toggleDocumentExpanded(id: string) {
    setExpandedDocumentIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleOrganizationChange(nextOrganizationId: string) {
    setOrganizationFilter(nextOrganizationId)
    const next = documents
      .filter((entry) => entry.status !== 'archived')
      .filter((entry) => canAccessOrganization(entry.organizationId))
      .filter((entry) => documentMatchesOrganizationFilter(entry, nextOrganizationId))
      .sort((a, b) => b.updatedAt - a.updatedAt)[0]
    navigate(next ? `/docs/${next.id}` : '/docs')
  }

  async function archiveDocument(entry: DocumentRow) {
    await z.mutate.documents.update({ id: entry.id, status: 'archived' })
    setArchiveConfirmDocument(null)
    const next = visibleDocuments.find((document) => document.id !== entry.id)
    navigate(next ? `/docs/${next.id}` : '/docs')
  }

  async function createDocumentVersion(entry: DocumentRow) {
    try {
      setDocumentActionStatus(null)
      const snapshots = documentSnapshots.filter((snapshot) => snapshot.documentId === entry.id)
      const versionNumber = snapshots.reduce((max, snapshot) => Math.max(max, snapshot.versionNumber), 0) + 1
      const snapshotId = crypto.randomUUID()
      const sourceSnapshot = selectedSnapshot
      const cleanTitle = titleDraft.trim() || sourceSnapshot?.title || entry.title
      await z.mutate.document_snapshots.create({
        id: snapshotId,
        documentId: entry.id,
        organizationId: entry.organizationId ?? undefined,
        versionNumber,
        title: cleanTitle,
        slug: uniqueSlug(cleanTitle, documents, entry.organizationId, entry.id),
        body: bodyDraft,
        format: 'markdown',
        status: 'version',
        createdByType: 'user',
        createdById: user?.id,
        metadata: {
          source: 'docs_ui',
          baseSnapshotId: sourceSnapshot?.id ?? null,
          baseVersionNumber: sourceSnapshot?.versionNumber ?? null,
        },
      })
      setSelectedSnapshotId(snapshotId)
      setVersionsFrameOpen(true)
      setDocumentActionStatus({ kind: 'ok', message: `new version v${versionNumber} saved` })
    } catch (error) {
      setDocumentActionStatus({ kind: 'fail', message: error instanceof Error ? error.message : 'could not save version' })
    }
  }

  async function makeVersionMain(entry: DocumentRow, snapshot: DocumentSnapshotRow) {
    try {
      setDocumentActionStatus(null)
      const cleanTitle = titleDraft.trim() || snapshot.title || entry.title
      const nextSlug = uniqueSlug(cleanTitle, documents, entry.organizationId, entry.id)
      await z.mutate.document_snapshots.update({
        id: snapshot.id,
        documentId: entry.id,
        metadata: {
          ...snapshot.metadata,
          madeMainVia: 'docs_ui',
          madeMainAt: new Date().toISOString(),
        },
        applyToDocument: true,
        title: cleanTitle,
        slug: nextSlug,
        body: bodyDraft,
        format: snapshot.format,
      })
      setSelectedSnapshotId(null)
      setTitleDraft(cleanTitle)
      setBodyDraft(bodyDraft)
      setDocumentActionStatus({ kind: 'ok', message: `v${snapshot.versionNumber} is now main` })
    } catch (error) {
      setDocumentActionStatus({ kind: 'fail', message: error instanceof Error ? error.message : 'could not make version main' })
    }
  }

  async function deleteDocumentVersion(entry: DocumentRow, snapshot: DocumentSnapshotRow) {
    const isMain = isDocumentMainSnapshot(entry, snapshot, mainSnapshot)
    if (isMain) {
      setDocumentActionStatus({ kind: 'fail', message: 'main version cannot be deleted' })
      return
    }
    try {
      setDocumentActionStatus(null)
      await z.mutate.document_snapshots.delete({ id: snapshot.id })
      if (selectedSnapshotId === snapshot.id) {
        setSelectedSnapshotId(null)
        setTitleDraft(entry.title)
        setBodyDraft(entry.body)
      }
      setDocumentActionStatus({ kind: 'ok', message: `v${snapshot.versionNumber} deleted` })
    } catch (error) {
      setDocumentActionStatus({ kind: 'fail', message: error instanceof Error ? error.message : 'could not delete version' })
    }
  }

  async function createMarketingContentFromDocument(entry: DocumentRow) {
    if (!entry.organizationId) {
      setMarketingContentStatus({ kind: 'fail', message: 'document needs an organization' })
      return
    }
    const existing = marketingContentItems.find((item) => item.sourceDocumentId === entry.id)
    if (existing) {
      setMarketingContentStatus({ kind: 'ok', message: 'already marketing content' })
      navigate(`/marketing/content?content=${existing.id}`)
      return
    }
    setCreatingMarketingContent(true)
    setMarketingContentStatus(null)
    try {
      if (!selectedSnapshot && (entry.title !== titleDraft || entry.body !== bodyDraft)) {
        await saveLiveDocument(entry, titleDraft, bodyDraft)
      }
      const response = await authFetch(`${config.apiUrl}/marketing/content/from-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: entry.id,
          supportedChannels: ['blog', 'newsletter'],
        }),
      })
      const payload = await readJson(response)
      setMarketingContentStatus({
        kind: 'ok',
        message: payload.alreadyExists ? 'already marketing content' : 'content created',
      })
      navigate(`/marketing/content?content=${payload.contentItem.id}`)
    } catch (error) {
      setMarketingContentStatus({
        kind: 'fail',
        message: error instanceof Error ? error.message : 'could not create content',
      })
    } finally {
      setCreatingMarketingContent(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 bg-pit text-fg-1">
      <aside className="hidden w-[300px] shrink-0 border-r border-edge/12 bg-void/72 md:flex md:flex-col">
        <div className="border-b border-edge/12 px-4 py-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">docs</div>
              <div className="font-mono text-lg font-bold lowercase text-fg-1">documents</div>
            </div>
            <button
              onClick={() => void createDocument()}
              className="flex h-8 w-8 items-center justify-center border border-edge/24 bg-accent-fill/6 text-accent transition hover:bg-accent-fill/12"
              title="new document"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-2 font-mono text-[10px] uppercase tracking-label text-fg-4">organization</div>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-fg-4" />
            <PachSelect
              value={organizationFilter}
              onChange={handleOrganizationChange}
              options={organizationOptions}
              display={selectedOrganization?.name ?? (organizationFilter === NO_ORGANIZATION ? 'no organization' : 'organization')}
              popupWidth="200"
              triggerClassName="flex h-8 w-full items-center justify-between border border-edge/18 bg-rim pl-9 pr-2 text-left font-mono text-xs text-fg-1 outline-none transition hover:border-edge/32 hover:bg-accent-fill/4 focus-visible:border-accent focus-visible:shadow-glow-xs"
            />
          </div>

          <div className="mt-3 flex items-center gap-2 border border-edge/12 bg-pit-3 px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-fg-4" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="search docs"
              className="min-w-0 flex-1 bg-transparent font-mono text-xs text-fg-1 outline-none placeholder:text-fg-4"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
          {documentTree.length === 0 ? (
            <button
              onClick={() => void createDocument()}
              className="flex w-full items-center gap-2 border border-dashed border-edge/18 px-3 py-3 text-left font-mono text-xs lowercase text-fg-4 transition hover:border-edge/35 hover:text-accent"
            >
              <Plus className="h-3.5 w-3.5" />
              create first doc
            </button>
          ) : (
            documentTree.map((node) => (
              <DocumentTreeItem
                key={node.document.id}
                node={node}
                depth={0}
                expandedIds={expandedDocumentIds}
                selectedDocumentId={selectedDocument?.id ?? null}
                organizations={organizations}
                onToggle={toggleDocumentExpanded}
                onOpen={(id) => navigate(`/docs/${id}`)}
                onCreateChild={(parent) => void createDocument('Untitled', parent)}
                forceExpanded={Boolean(search.trim())}
              />
            ))
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto">
        {selectedDocument ? (
          <div className="mx-auto min-h-full max-w-3xl px-5 py-5 md:px-10 md:py-8">
            <div className="mb-5 flex items-center justify-between gap-3">
              <button
                onClick={() => navigate('/docs')}
                className="inline-flex items-center gap-2 font-mono text-xs lowercase text-fg-4 transition hover:text-accent md:hidden"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                docs
              </button>
              <div className="hidden min-w-0 items-center gap-2 font-mono text-[10px] uppercase tracking-label text-fg-4 md:flex">
                <ListTree className="h-3.5 w-3.5" />
                <span className="truncate">{organizationLabel(selectedDocument.organizationId, organizations)}</span>
              </div>
              {selectedDocumentMarketingItems.length > 0 ? (
                <button
                  onClick={() => navigate(`/marketing/content?content=${selectedDocumentMarketingItems[0].id}`)}
                  className="ml-auto inline-flex h-8 items-center gap-2 border border-accent/25 bg-accent-fill/6 px-2.5 font-mono text-[10px] uppercase tracking-label text-accent transition hover:bg-accent-fill/12"
                  title={`already marketing content: ${uniqueMarketingChannels(selectedDocumentMarketingItems)}`}
                >
                  <Megaphone className="h-3.5 w-3.5" />
                  already content
                </button>
              ) : (
                <button
                  onClick={() => setMarketingContentConfirmDocument(selectedDocument)}
                  disabled={creatingMarketingContent}
                  className="ml-auto inline-flex h-8 items-center gap-2 border border-edge/15 px-2.5 font-mono text-[10px] uppercase tracking-label text-fg-3 transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                  title="create marketing content"
                >
                  <Megaphone className="h-3.5 w-3.5" />
                  {creatingMarketingContent ? 'creating' : 'make content'}
                </button>
              )}
              <button
                onClick={() => selectedDocument && setArchiveConfirmDocument(selectedDocument)}
                className="flex h-8 w-8 items-center justify-center border border-edge/15 text-fg-3 transition hover:border-amber hover:text-amber"
                title="archive document"
              >
                <Archive className="h-4 w-4" />
              </button>
            </div>

            {marketingContentStatus ? (
              <div
                className={`mb-4 border px-3 py-2 font-mono text-xs ${
                  marketingContentStatus.kind === 'ok'
                    ? 'border-ok/25 bg-ok/5 text-ok'
                    : 'border-fail/25 bg-fail/5 text-fail'
                }`}
              >
                {marketingContentStatus.message}
              </div>
            ) : null}

            {documentActionStatus ? (
              <div
                className={`mb-4 border px-3 py-2 font-mono text-xs ${
                  documentActionStatus.kind === 'ok'
                    ? 'border-ok/25 bg-ok/5 text-ok'
                    : 'border-fail/25 bg-fail/5 text-fail'
                }`}
              >
                {documentActionStatus.message}
              </div>
            ) : null}

            <div className="mb-4 flex flex-wrap items-center gap-2 border-y border-edge/12 py-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
              <span className="border border-edge/14 px-2 py-1 text-fg-3">
                {selectedDocument.publicId ?? selectedDocument.slug}
              </span>
              <span className="border border-ok/28 bg-ok/5 px-2 py-1 text-ok">
                {mainSnapshot ? `main v${mainSnapshot.versionNumber}` : 'live main'}
              </span>
              {selectedSnapshot ? (
                <span className="border border-amber/28 bg-amber/5 px-2 py-1 text-amber">
                  editing v{selectedSnapshot.versionNumber} - {formatSnapshotDate(selectedSnapshot.createdAt)}
                </span>
              ) : (
                <span className="border border-edge/14 px-2 py-1 text-fg-3">editing live</span>
              )}
              <button
                type="button"
                onClick={() => setVersionsFrameOpen(true)}
                className="ml-auto inline-flex h-7 items-center gap-1.5 border border-edge/15 px-2 text-fg-3 transition hover:border-accent hover:text-accent"
                title="open versions"
              >
                <History className="h-3 w-3" />
                versions {selectedDocumentSnapshots.length}
              </button>
              <button
                type="button"
                onClick={() => void createDocumentVersion(selectedDocument)}
                className="inline-flex h-7 items-center gap-1.5 border border-edge/15 px-2 text-fg-3 transition hover:border-accent hover:text-accent"
                title="create a new version from the current view"
              >
                <Plus className="h-3 w-3" />
                new version
              </button>
            </div>

            <input
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => {
                if (!selectedDocument) return
                if (selectedSnapshot) void saveSnapshotVersion(selectedDocument, selectedSnapshot, titleDraft, bodyDraft)
                else void saveLiveDocument(selectedDocument, titleDraft, bodyDraft)
              }}
              placeholder="Untitled"
              className="w-full bg-transparent font-mono text-3xl font-bold leading-tight text-fg-1 outline-none placeholder:text-fg-4 md:text-4xl"
            />

            <RichEditor
              key={selectedSnapshot?.id ?? selectedDocument.id}
              owner={{ type: 'document', id: selectedDocument.id }}
              value={bodyDraft}
              documents={documents}
              issues={issues}
              organizationId={selectedDocument.organizationId}
              onChange={setBodyDraft}
              onOpenDocument={(id) => navigate(`/docs/${id}`)}
              onOpenIssue={(id) => navigate(`/issues/${id}`)}
              onCreateChildDocument={createLinkedChildDocument}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-5">
            <div className="max-w-sm text-center">
              <FileText className="mx-auto h-10 w-10 text-fg-4" />
              <h1 className="mt-4 font-mono text-2xl font-bold lowercase text-fg-1">documents</h1>
              <p className="mt-2 font-mono text-sm leading-relaxed text-fg-3">
                Create focused documents with slash commands and plain URL links.
              </p>
              <button
                onClick={() => void createDocument()}
                className="mt-5 inline-flex items-center gap-2 border border-edge/28 bg-accent-fill/8 px-3 py-2 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-accent-fill/14"
              >
                <Plus className="h-3.5 w-3.5" />
                new document
              </button>
            </div>
          </div>
        )}
      </main>

      {archiveConfirmDocument ? (
        <ArchiveDocumentModal
          document={archiveConfirmDocument}
          onCancel={() => setArchiveConfirmDocument(null)}
          onConfirm={() => void archiveDocument(archiveConfirmDocument)}
        />
      ) : null}

      {marketingContentConfirmDocument ? (
        <MarketingContentDocumentModal
          document={marketingContentConfirmDocument}
          loading={creatingMarketingContent}
          onCancel={() => setMarketingContentConfirmDocument(null)}
          onConfirm={() => {
            const document = marketingContentConfirmDocument
            setMarketingContentConfirmDocument(null)
            void createMarketingContentFromDocument(document)
          }}
        />
      ) : null}

      {versionsFrameOpen && selectedDocument ? (
        <DocumentVersionsFrame
          document={selectedDocument}
          snapshots={selectedDocumentSnapshots}
          mainSnapshot={mainSnapshot}
          selectedSnapshot={selectedSnapshot}
          onClose={() => setVersionsFrameOpen(false)}
          onCreateVersion={() => void createDocumentVersion(selectedDocument)}
          onOpenLive={() => {
            setSelectedSnapshotId(null)
            setTitleDraft(selectedDocument.title)
            setBodyDraft(selectedDocument.body)
          }}
          onOpenSnapshot={(snapshot) => setSelectedSnapshotId(snapshot.id)}
          onMakeMain={(snapshot) => void makeVersionMain(selectedDocument, snapshot)}
          onDelete={(snapshot) => void deleteDocumentVersion(selectedDocument, snapshot)}
        />
      ) : null}
    </div>
  )
}

function ArchiveDocumentModal({
  document,
  onCancel,
  onConfirm,
}: {
  document: DocumentRow
  onCancel: () => void
  onConfirm: () => void
}) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onCancel()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-overlay/72 px-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md border border-warn/28 bg-pit shadow-terminal-overlay"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-warn/18 px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-label text-amber">archive document</div>
          <h2 className="mt-2 font-mono text-lg font-bold lowercase text-fg-1">{document.title}</h2>
        </div>
        <div className="px-5 py-4">
          <p className="font-mono text-sm leading-relaxed text-fg-3">
            This will hide the document from the docs sidebar and search. You can restore it later from the database if needed.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-edge/12 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="border border-edge/16 px-3 py-2 font-mono text-xs uppercase tracking-label text-fg-3 transition hover:border-edge/32 hover:text-fg-1"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="border border-warn/36 bg-warn/8 px-3 py-2 font-mono text-xs uppercase tracking-label text-amber transition hover:bg-warn/14"
          >
            archive
          </button>
        </div>
      </div>
    </div>
  )
}

function MarketingContentDocumentModal({
  document,
  loading,
  onCancel,
  onConfirm,
}: {
  document: DocumentRow
  loading: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onCancel()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-overlay/72 px-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md border border-accent/28 bg-pit shadow-terminal-overlay"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-accent/18 px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-label text-accent">make content</div>
          <h2 className="mt-2 font-mono text-lg font-bold lowercase text-fg-1">{document.title}</h2>
        </div>
        <div className="px-5 py-4">
          <p className="font-mono text-sm leading-relaxed text-fg-3">
            This creates a marketing content item from the live document content. It will start with blog and newsletter channels.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-edge/12 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="border border-edge/16 px-3 py-2 font-mono text-xs uppercase tracking-label text-fg-3 transition hover:border-edge/32 hover:text-fg-1"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="border border-accent/36 bg-accent-fill/8 px-3 py-2 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-accent-fill/14 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? 'creating' : 'create content'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DocumentVersionsFrame({
  document,
  snapshots,
  mainSnapshot,
  selectedSnapshot,
  onClose,
  onCreateVersion,
  onOpenLive,
  onOpenSnapshot,
  onMakeMain,
  onDelete,
}: {
  document: DocumentRow
  snapshots: DocumentSnapshotRow[]
  mainSnapshot: DocumentSnapshotRow | null
  selectedSnapshot: DocumentSnapshotRow | null
  onClose: () => void
  onCreateVersion: () => void
  onOpenLive: () => void
  onOpenSnapshot: (snapshot: DocumentSnapshotRow) => void
  onMakeMain: (snapshot: DocumentSnapshotRow) => void
  onDelete: (snapshot: DocumentSnapshotRow) => void
}) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[900] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <aside
        className="relative h-screen min-h-screen w-[500px] max-w-full overflow-y-auto border-l border-edge/35 bg-bg-2 font-mono"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-edge/15 bg-bg-2 px-6 py-4">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-label text-fg-4">versions</div>
            <h2 className="mt-1 truncate text-base font-bold lowercase text-fg-1">{document.title}</h2>
          </div>
          <button onClick={onClose} className="p-1 text-fg-4 transition hover:text-accent" aria-label="Close versions">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] uppercase tracking-label text-fg-4">
              {snapshots.length} saved {snapshots.length === 1 ? 'version' : 'versions'}
            </div>
            <button
              type="button"
              onClick={onCreateVersion}
              className="inline-flex h-8 items-center gap-1.5 border border-edge/18 px-2.5 text-[10px] uppercase tracking-label text-fg-3 transition hover:border-accent hover:text-accent"
              title="create a new version from the current view"
            >
              <Plus className="h-3 w-3" />
              new version
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenLive}
            className={`w-full border px-4 py-3 text-left transition ${
              selectedSnapshot
                ? 'border-edge/14 text-fg-3 hover:border-accent hover:text-fg-1'
                : 'border-accent/35 bg-accent-fill/8 text-accent'
            }`}
          >
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-label">
              <span>live</span>
              <span className="border border-ok/24 bg-ok/5 px-1.5 py-0.5 text-ok">main</span>
            </div>
            <div className="mt-2 text-xs lowercase text-fg-4">current document content</div>
          </button>

          <div className="space-y-2">
            {snapshots.length === 0 ? (
              <div className="border border-dashed border-edge/18 px-4 py-8 text-center text-xs lowercase text-fg-4">
                no saved versions yet
              </div>
            ) : (
              snapshots.map((snapshot) => {
                const isMain = isDocumentMainSnapshot(document, snapshot, mainSnapshot)
                const isSelected = selectedSnapshot?.id === snapshot.id
                return (
                  <div
                    key={snapshot.id}
                    className={`border transition ${
                      isSelected
                        ? 'border-amber/35 bg-amber/6'
                        : 'border-edge/14 hover:border-edge/30'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenSnapshot(snapshot)}
                      className="w-full px-4 py-3 text-left"
                    >
                      <div className="flex min-w-0 items-center gap-2 text-[10px] uppercase tracking-label">
                        <span className={isSelected ? 'text-amber' : 'text-fg-3'}>v{snapshot.versionNumber}</span>
                        {isMain ? (
                          <span className="border border-ok/24 bg-ok/5 px-1.5 py-0.5 text-ok">main</span>
                        ) : null}
                        <span className="border border-edge/14 px-1.5 py-0.5 text-fg-4">
                          {snapshotSourceLabel(snapshot)}
                        </span>
                        <span className="ml-auto shrink-0 text-fg-4">{formatSnapshotDate(snapshot.createdAt)}</span>
                      </div>
                      <div className="mt-2 truncate text-sm lowercase text-fg-1">{snapshot.title}</div>
                    </button>

                    {isSelected ? (
                      <div className="flex flex-wrap items-center gap-2 border-t border-edge/12 px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onMakeMain(snapshot)}
                          disabled={isMain}
                          className="h-8 border border-ok/24 px-2.5 text-[10px] uppercase tracking-label text-ok transition hover:bg-ok/8 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          make main
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(snapshot)}
                          disabled={isMain}
                          className="inline-flex h-8 items-center gap-1.5 border border-fail/24 px-2.5 text-[10px] uppercase tracking-label text-fail transition hover:bg-fail/8 disabled:cursor-not-allowed disabled:opacity-35"
                          title={isMain ? 'main version cannot be deleted' : 'delete version'}
                        >
                          <Trash2 className="h-3 w-3" />
                          delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

function DocumentTreeItem({
  node,
  depth,
  expandedIds,
  selectedDocumentId,
  organizations,
  forceExpanded,
  onToggle,
  onOpen,
  onCreateChild,
}: {
  node: DocumentTreeNode
  depth: number
  expandedIds: Set<string>
  selectedDocumentId: string | null
  organizations: OrganizationRow[]
  forceExpanded: boolean
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  onCreateChild: (parent: DocumentRow) => void
}) {
  const hasChildren = node.children.length > 0
  const expanded = forceExpanded || expandedIds.has(node.document.id)
  const selected = selectedDocumentId === node.document.id
  const indent = Math.min(depth, 8) * 14

  return (
    <div className="mb-0.5">
      <div
        className={`group flex items-center gap-1 px-1.5 py-1.5 transition ${
          selected
            ? 'bg-accent-fill/8 text-accent ring-1 ring-inset ring-edge/20'
            : 'text-fg-2 hover:bg-accent-fill/4 hover:text-fg-1'
        }`}
        style={{ paddingLeft: 6 + indent }}
      >
        <button
          type="button"
          onClick={() => hasChildren ? onToggle(node.document.id) : onOpen(node.document.id)}
          className={`flex h-5 w-5 shrink-0 items-center justify-center transition ${
            hasChildren ? 'text-fg-4 hover:text-accent' : 'text-fg-4'
          }`}
          title={hasChildren ? (expanded ? 'collapse document' : 'expand document') : 'open document'}
        >
          {hasChildren ? (
            expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <FileText className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onOpen(node.document.id)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate font-mono text-xs lowercase">{node.document.title}</span>
          {depth === 0 ? (
            <span className="mt-0.5 block truncate font-mono text-[10px] uppercase tracking-label text-fg-4">
              {organizationLabel(node.document.organizationId, organizations)}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onCreateChild(node.document)
          }}
          className="flex h-5 w-5 shrink-0 items-center justify-center text-fg-4 opacity-0 transition hover:text-accent group-hover:opacity-100"
          title="new child document"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {expanded && hasChildren ? (
        <div>
          {node.children.map((child) => (
            <DocumentTreeItem
              key={child.document.id}
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              selectedDocumentId={selectedDocumentId}
              organizations={organizations}
              forceExpanded={forceExpanded}
              onToggle={onToggle}
              onOpen={onOpen}
              onCreateChild={onCreateChild}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function organizationFor(id: string | null | undefined, organizations: OrganizationRow[]) {
  return id ? organizations.find((organization) => organization.id === id) ?? null : null
}

function organizationLabel(id: string | null | undefined, organizations: OrganizationRow[]) {
  if (!id) return 'no organization'
  return organizations.find((organization) => organization.id === id)?.name ?? 'organization'
}

function documentMatchesOrganizationFilter(entry: DocumentRow, organizationFilter: string) {
  if (!organizationFilter) return true
  if (organizationFilter === NO_ORGANIZATION) return !entry.organizationId
  return entry.organizationId === organizationFilter
}

function buildDocumentTree(documents: DocumentRow[], query: string) {
  const sorted = [...documents].sort(compareDocumentsForTree)
  const nodes = new Map<string, DocumentTreeNode>()
  sorted.forEach((document) => nodes.set(document.id, { document, children: [] }))

  const roots: DocumentTreeNode[] = []
  sorted.forEach((document) => {
    const node = nodes.get(document.id)
    if (!node) return
    const parent = document.parentId ? nodes.get(document.parentId) : null
    if (parent && !createsDocumentCycle(document.id, document.parentId, nodes)) parent.children.push(node)
    else roots.push(node)
  })

  if (!query) return roots
  return roots
    .map((node) => filterDocumentTree(node, query))
    .filter((node): node is DocumentTreeNode => Boolean(node))
}

function filterDocumentTree(node: DocumentTreeNode, query: string): DocumentTreeNode | null {
  const ownMatch =
    node.document.title.toLowerCase().includes(query) ||
    node.document.body.toLowerCase().includes(query)
  const children = node.children
    .map((child) => filterDocumentTree(child, query))
    .filter((child): child is DocumentTreeNode => Boolean(child))
  return ownMatch || children.length > 0 ? { document: node.document, children } : null
}

function createsDocumentCycle(documentId: string, parentId: string, nodes: Map<string, DocumentTreeNode>) {
  let currentId: string | undefined = parentId
  const seen = new Set<string>()
  while (currentId) {
    if (currentId === documentId) return true
    if (seen.has(currentId)) return true
    seen.add(currentId)
    currentId = nodes.get(currentId)?.document.parentId
  }
  return false
}

function ancestorDocumentIds(documentId: string, documents: DocumentRow[]) {
  const byId = new Map(documents.map((document) => [document.id, document]))
  const ancestors: string[] = []
  const seen = new Set<string>()
  let current = byId.get(documentId)
  while (current?.parentId && !seen.has(current.parentId)) {
    seen.add(current.parentId)
    const parent = byId.get(current.parentId)
    if (!parent) break
    ancestors.push(parent.id)
    current = parent
  }
  return ancestors
}

function compareDocumentsForTree(a: DocumentRow, b: DocumentRow) {
  if ((a.sortOrder ?? 0) !== (b.sortOrder ?? 0)) return (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  if (a.title !== b.title) return a.title.localeCompare(b.title)
  return b.updatedAt - a.updatedAt
}

function readStoredDocsOrganizationFilter() {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(DOCS_ORGANIZATION_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeStoredDocsOrganizationFilter(value: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DOCS_ORGANIZATION_STORAGE_KEY, value)
  } catch {
    // Storage can be unavailable in private or restricted contexts.
  }
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)

  return slug || 'document'
}

function uniqueSlug(title: string, documents: DocumentRow[], organizationId?: string | null, ignoreId?: string) {
  const base = slugify(title)
  const taken = new Set(
    documents
      .filter((entry) => entry.id !== ignoreId)
      .filter((entry) => (entry.organizationId ?? null) === (organizationId ?? null))
      .map((entry) => entry.slug),
  )
  if (!taken.has(base)) return base
  let counter = 2
  while (taken.has(`${base}-${counter}`)) counter += 1
  return `${base}-${counter}`
}

function nextDocumentPublicId(organizationId: string | null, organizations: OrganizationRow[], documents: DocumentRow[]) {
  const prefix = documentPublicIdPrefix(organizationId, organizations)
  const max = documents
    .filter((entry) => (entry.organizationId ?? null) === (organizationId ?? null))
    .reduce((current, entry) => {
      const match = (entry.publicId ?? '').match(/-DOC-(\d+)$/)
      const value = match ? Number(match[1]) : 0
      return Number.isFinite(value) ? Math.max(current, value) : current
    }, 0)
  return `${prefix}-DOC-${max + 1}`
}

function documentPublicIdPrefix(organizationId: string | null, organizations: OrganizationRow[]) {
  const organization = organizationId ? organizations.find((entry) => entry.id === organizationId) : null
  const raw = (organization?.project ?? organization?.name ?? 'doc')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 3)
    .toUpperCase()
  return raw || 'DOC'
}

function uniqueMarketingChannels(items: Array<{ supportedChannels: string[] }>) {
  const channels = Array.from(new Set(items.flatMap((item) => item.supportedChannels)))
  return channels.length ? channels.join(', ') : 'content'
}

function isDocumentMainSnapshot(
  document: DocumentRow,
  snapshot: DocumentSnapshotRow,
  mainSnapshot: DocumentSnapshotRow | null,
) {
  return document.currentSnapshotId ? document.currentSnapshotId === snapshot.id : mainSnapshot?.id === snapshot.id
}

function formatSnapshotDate(value: number) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'unknown date'
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric'
  return new Intl.DateTimeFormat(undefined, options).format(date)
}

function snapshotSourceLabel(snapshot: DocumentSnapshotRow) {
  if (snapshot.createdByType === 'agent') return 'agent'
  if (snapshot.agentRunId) return 'agent'
  return 'user'
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || payload.message || `request failed: ${response.status}`)
  }
  return payload
}
