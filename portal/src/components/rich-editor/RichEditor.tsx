import {
  CheckSquare,
  ChevronDown,
  Code2,
  ExternalLink,
  FilePlus,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Link2,
  List,
  ListOrdered,
  ListTree,
  Paperclip,
  Quote,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { config } from '../../config'
import { authFetch } from '../../lib/auth'
import type { Schema } from '../../zero-schema'

type DocumentRow = Schema['tables']['documents']['row']
type IssueRow = Schema['tables']['pm_issues']['row']
type LinkTarget =
  | { type: 'document'; id: string; href: string; label: string; subtitle: string }
  | { type: 'issue'; id: string; href: string; label: string; subtitle: string }
  | { type: 'url'; id: string; href: string; label: string; subtitle: string }
type CommandId =
  | 'link-document'
  | 'link-url'
  | 'create-child-document'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bullet'
  | 'numbered'
  | 'checklist'
  | 'media'
  | 'file'
  | 'code'
  | 'collapsible'
  | 'quote'

type SlashCommand = {
  id: CommandId
  label: string
  hint?: string
  icon: ReactNode
}

type MenuPosition = {
  left: number
  top: number
  height?: number
}

export type RichEditorOwner = { type: 'document' | 'issue'; id: string }

const MAX_DOCUMENT_FILE_BYTES = 50 * 1024 * 1024

const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'link-document', label: 'Link document', hint: 'Search and insert a document', icon: <Link2 className="h-4 w-4" /> },
  { id: 'link-url', label: 'Link URL', hint: 'Insert an external link', icon: <ExternalLink className="h-4 w-4" /> },
  { id: 'create-child-document', label: 'Create child document', hint: 'Create and link a child document', icon: <FilePlus className="h-4 w-4" /> },
  { id: 'heading1', label: 'Heading 1', hint: 'Large section title', icon: <Heading1 className="h-4 w-4" /> },
  { id: 'heading2', label: 'Heading 2', hint: 'Medium section title', icon: <Heading2 className="h-4 w-4" /> },
  { id: 'heading3', label: 'Heading 3', hint: 'Small section title', icon: <Heading3 className="h-4 w-4" /> },
  { id: 'bullet', label: 'Bulleted list', icon: <List className="h-4 w-4" /> },
  { id: 'numbered', label: 'Numbered list', icon: <ListOrdered className="h-4 w-4" /> },
  { id: 'checklist', label: 'Checklist', icon: <CheckSquare className="h-4 w-4" /> },
  { id: 'media', label: 'Insert media...', hint: 'Paste an image or media URL', icon: <Image className="h-4 w-4" /> },
  { id: 'file', label: 'Attach files...', hint: 'Paste a file URL', icon: <Paperclip className="h-4 w-4" /> },
  { id: 'code', label: 'Code block', icon: <Code2 className="h-4 w-4" /> },
  { id: 'collapsible', label: 'Collapsible section', icon: <ChevronDown className="h-4 w-4" /> },
  { id: 'quote', label: 'Blockquote', icon: <Quote className="h-4 w-4" /> },
]

export function RichEditor({
  owner,
  value,
  documents,
  issues,
  organizationId,
  onChange,
  onOpenDocument,
  onOpenIssue,
  onCreateChildDocument,
  placeholder = 'Type / for commands',
  className = 'min-h-[52vh]',
  wrapperClassName = 'relative mt-7',
  onFocus,
  onBlur,
}: {
  owner: RichEditorOwner
  value: string
  documents: DocumentRow[]
  issues: IssueRow[]
  organizationId: string | null | undefined
  onChange: (value: string) => void
  onOpenDocument: (id: string) => void
  onOpenIssue: (id: string) => void
  onCreateChildDocument?: (parentId: string) => Promise<{ id: string; title: string } | null>
  placeholder?: string
  className?: string
  wrapperClassName?: string
  onFocus?: () => void
  onBlur?: () => void
}) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const slashRangeRef = useRef<Range | null>(null)
  const linkRangeRef = useRef<Range | null>(null)
  const mediaRangeRef = useRef<Range | null>(null)
  const fileRangeRef = useRef<Range | null>(null)
  const mediaInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const linkSearchRef = useRef<HTMLInputElement | null>(null)
  const linkUrlRef = useRef<HTMLInputElement | null>(null)
  const linkLabelRef = useRef<HTMLInputElement | null>(null)
  const lastSerializedRef = useRef(value)
  const [slashMenu, setSlashMenu] = useState<{ query: string; position: MenuPosition } | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const [linkSearch, setLinkSearch] = useState<{ query: string; position: MenuPosition } | null>(null)
  const [linkSearchIndex, setLinkSearchIndex] = useState(0)
  const [linkUrl, setLinkUrl] = useState<{ url: string; position: MenuPosition } | null>(null)
  const [linkLabel, setLinkLabel] = useState<{ target: LinkTarget; label: string; position: MenuPosition } | null>(null)
  const [mediaStatus, setMediaStatus] = useState<string | null>(null)

  const slashCommands = useMemo(() => {
    if (!slashMenu) return []
    const q = normalizeText(slashMenu.query)
    return SLASH_COMMANDS.filter((command) => {
      if (command.id === 'create-child-document' && (owner.type !== 'document' || !onCreateChildDocument)) return false
      if (!q) return true
      return normalizeText(command.label).includes(q)
    })
  }, [onCreateChildDocument, owner.type, slashMenu])

  const linkTargets = useMemo<LinkTarget[]>(() => {
    if (!linkSearch) return []
    const q = normalizeText(linkSearch.query)
    const documentTargets = documents
      .filter((entry) => entry.status !== 'archived')
      .filter((entry) => sameOrganization(entry.organizationId, organizationId))
      .filter((entry) => !q || normalizeText(entry.title).includes(q) || normalizeText(entry.body).includes(q))
      .slice(0, 6)
      .map((entry) => ({
        type: 'document' as const,
        id: entry.id,
        href: `/docs/${entry.id}`,
        label: entry.title,
        subtitle: 'document',
      }))
    const issueTargets = issues
      .filter((entry) => sameOrganization(entry.contextCompanyId, organizationId))
      .filter((entry) => !q || normalizeText(entry.identifier).includes(q) || normalizeText(entry.title).includes(q))
      .slice(0, 6)
      .map((entry) => ({
        type: 'issue' as const,
        id: entry.id,
        href: `/issues/${entry.id}`,
        label: entry.identifier,
        subtitle: entry.title,
      }))

    return [...documentTargets, ...issueTargets].slice(0, 8)
  }, [documents, issues, linkSearch, organizationId])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    if (!(value === lastSerializedRef.current && editor.innerHTML.trim())) {
      editor.innerHTML = markdownToHtml(value, documents, issues, organizationId)
      lastSerializedRef.current = value
    }
    void resolveDocumentMedia(editor)
  }, [documents, issues, organizationId, value])

  useEffect(() => {
    if (!linkSearch) return
    requestAnimationFrame(() => linkSearchRef.current?.focus())
  }, [Boolean(linkSearch)])

  useEffect(() => {
    if (!linkUrl) return
    requestAnimationFrame(() => linkUrlRef.current?.focus())
  }, [Boolean(linkUrl)])

  useEffect(() => {
    setLinkSearchIndex(0)
  }, [linkSearch?.query])

  useEffect(() => {
    if (!linkLabel) return
    requestAnimationFrame(() => {
      linkLabelRef.current?.focus()
      linkLabelRef.current?.select()
    })
  }, [linkLabel?.target.type, linkLabel?.target.id])

  function commitChange() {
    const editor = editorRef.current
    if (!editor) return
    normalizeCodeBlocks(editor)
    normalizeCollapsibles(editor)
    normalizeQuotes(editor)
    removeEmptyLinks(editor)
    ensureEditorHasBlock(editor)
    const next = htmlToMarkdown(editor)
    lastSerializedRef.current = next
    onChange(next)
  }

  function handleEditorInput() {
    commitChange()
    detectSlashMenu()
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (slashMenu) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSlashIndex((index) => (index + 1) % Math.max(slashCommands.length, 1))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSlashIndex((index) => (index - 1 + Math.max(slashCommands.length, 1)) % Math.max(slashCommands.length, 1))
        return
      }
      if (event.key === 'Enter' && slashCommands.length > 0) {
        event.preventDefault()
        applyCommand(slashCommands[slashIndex] ?? slashCommands[0])
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenus()
        return
      }
    }

    const editor = editorRef.current
    if (editor && ['Backspace', 'Delete'].includes(event.key) && handleEmptyCollapsibleTitleDelete(editor)) {
      event.preventDefault()
      closeMenus()
      commitChange()
      return
    }

    if (editor && event.key === 'Tab' && handleCodeBlockTab(editor, event.shiftKey)) {
      event.preventDefault()
      commitChange()
      return
    }

    if (editor && event.key === 'Enter' && isCaretInCodeBlock(editor)) {
      event.preventDefault()
      closeMenus()
      replaceSelectedCodeText(editor, '\n')
      commitChange()
      return
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      closeMenus()
      handleEnter(editor)
      commitChange()
      return
    }

    if (event.key === 'Escape') closeMenus()
  }

  function detectSlashMenu() {
    const editor = editorRef.current
    const selection = window.getSelection()
    if (!editor || !selection || selection.rangeCount === 0 || !selection.isCollapsed) {
      setSlashMenu(null)
      return
    }

    const range = selection.getRangeAt(0)
    if (!editor.contains(range.startContainer)) {
      setSlashMenu(null)
      return
    }

    const block = closestEditableBlock(range.startContainer, editor)
    if (!block) {
      setSlashMenu(null)
      return
    }
    if (block.tagName.toLowerCase() === 'pre') {
      setSlashMenu(null)
      return
    }

    const caretOffset = textOffsetIn(block, range.startContainer, range.startOffset)
    const text = block.innerText
    const slashIndexInBlock = text.lastIndexOf('/', caretOffset)
    if (slashIndexInBlock < 0) {
      setSlashMenu(null)
      return
    }

    const before = text[slashIndexInBlock - 1]
    const query = text.slice(slashIndexInBlock + 1, caretOffset)
    if ((before && !/\s/.test(before)) || query.includes('\n') || query.length > 40) {
      setSlashMenu(null)
      return
    }

    const slashRange = rangeForTextOffsets(block, slashIndexInBlock, caretOffset)
    if (!slashRange) {
      setSlashMenu(null)
      return
    }

    slashRangeRef.current = slashRange
    setSlashMenu({ query, position: positionFromRange(slashRange) })
    setSlashIndex(0)
  }

  async function applyCommand(command: SlashCommand) {
    const editor = editorRef.current
    const slashRange = slashRangeRef.current
    if (!editor || !slashRange) return

    if (command.id === 'link-document') {
      const position = positionFromRange(slashRange)
      selectRange(slashRange)
      slashRange.deleteContents()
      const insertionRange = slashRange.cloneRange()
      insertionRange.collapse(true)
      selectRange(insertionRange)
      linkRangeRef.current = insertionRange.cloneRange()
      setLinkSearch({ query: '', position })
      setLinkSearchIndex(0)
      setSlashMenu(null)
      return
    }

    if (command.id === 'link-url') {
      const position = positionFromRange(slashRange)
      selectRange(slashRange)
      slashRange.deleteContents()
      const insertionRange = slashRange.cloneRange()
      insertionRange.collapse(true)
      selectRange(insertionRange)
      linkRangeRef.current = insertionRange.cloneRange()
      setLinkUrl({ url: '', position })
      setSlashMenu(null)
      return
    }

    if (command.id === 'create-child-document') {
      const position = positionFromRange(slashRange)
      selectRange(slashRange)
      slashRange.deleteContents()
      const insertionRange = slashRange.cloneRange()
      insertionRange.collapse(true)
      selectRange(insertionRange)
      linkRangeRef.current = insertionRange.cloneRange()
      setSlashMenu(null)
      if (owner.type !== 'document' || !onCreateChildDocument) return
      const child = await onCreateChildDocument(owner.id)
      if (!child) return
      setLinkLabel({
        target: {
          type: 'document',
          id: child.id,
          href: `/docs/${child.id}`,
          label: child.title,
          subtitle: 'new child document',
        },
        label: child.title,
        position,
      })
      return
    }

    const block = closestEditableBlock(slashRange.startContainer, editor)
    selectRange(slashRange)
    slashRange.deleteContents()

    if (command.id === 'media') {
      mediaRangeRef.current = window.getSelection()?.rangeCount ? window.getSelection()?.getRangeAt(0).cloneRange() ?? null : null
      setSlashMenu(null)
      requestAnimationFrame(() => mediaInputRef.current?.click())
      return
    }
    if (command.id === 'file') {
      fileRangeRef.current = window.getSelection()?.rangeCount ? window.getSelection()?.getRangeAt(0).cloneRange() ?? null : null
      setSlashMenu(null)
      requestAnimationFrame(() => fileInputRef.current?.click())
      return
    }

    if (command.id === 'heading1') formatBlockAndFocus(editor, 'h1', block)
    else if (command.id === 'heading2') formatBlockAndFocus(editor, 'h2', block)
    else if (command.id === 'heading3') formatBlockAndFocus(editor, 'h3', block)
    else if (command.id === 'bullet') formatListAndFocus(editor, 'ul', block)
    else if (command.id === 'numbered') formatListAndFocus(editor, 'ol', block)
    else if (command.id === 'checklist') formatChecklistAndFocus(editor, block)
    else if (command.id === 'quote') formatQuoteAndFocus(editor, block)
    else if (command.id === 'code') formatCodeBlockAndFocus(editor, block, 'Write code here')
    else if (command.id === 'collapsible') formatCollapsibleAndFocus(editor, block)

    if (
      block &&
      block.textContent?.trim() === '' &&
      !command.id.startsWith('heading') &&
      command.id !== 'bullet' &&
      command.id !== 'numbered' &&
      command.id !== 'checklist' &&
      command.id !== 'code' &&
      command.id !== 'collapsible' &&
      command.id !== 'quote'
    ) {
      placeCaretAtEnd(block)
    }
    closeMenus()
    commitChange()
  }

  function chooseLinkTarget(target: LinkTarget) {
    setLinkLabel({ target, label: target.label, position: linkSearch?.position ?? { left: 0, top: 0 } })
    setLinkSearch(null)
  }

  function chooseUrlTarget() {
    if (!linkUrl) return
    const href = normalizeUrl(linkUrl.url)
    if (!href) return
    setLinkLabel({
      target: {
        type: 'url',
        id: href,
        href,
        label: linkUrl.url.trim(),
        subtitle: 'url',
      },
      label: linkUrl.url.trim(),
      position: linkUrl.position,
    })
    setLinkUrl(null)
  }

  function insertLink(target: LinkTarget, label: string) {
    const editor = editorRef.current
    const linkRange = linkRangeRef.current
    if (!editor || !linkRange) return

    selectRange(linkRange)
    linkRange.deleteContents()

    const anchor = document.createElement('a')
    anchor.setAttribute('href', target.href)
    if (target.type === 'document') anchor.dataset.documentId = target.id
    else if (target.type === 'issue') anchor.dataset.issueId = target.id
    anchor.title = target.type === 'document' ? 'Open document' : target.type === 'issue' ? 'Open issue' : 'Open link'
    anchor.textContent = label.trim() || target.label
    anchor.className = 'document-link'
    linkRange.insertNode(anchor)

    const after = document.createTextNode('\u00A0')
    anchor.after(after)
    placeCaretAfter(after)

    closeMenus()
    commitChange()
    editor.focus()
  }

  async function handleMediaFile(file: File | undefined) {
    if (!file) {
      mediaRangeRef.current = null
      return
    }
    const editor = editorRef.current
    if (!editor) return
    if (!file.type.startsWith('image/')) {
      setMediaStatus('images only for v1')
      return
    }

    setMediaStatus('uploading image...')
    try {
      const contentBase64 = await fileToDataUrl(file)
      const uploadResponse = await authFetch(`${config.apiUrl}/media/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'image',
          ownerType: owner.type,
          ownerId: owner.id,
          documentId: owner.type === 'document' ? owner.id : undefined,
          organizationId: organizationId ?? null,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          contentBase64,
        }),
      })
      if (!uploadResponse.ok) {
        const payload = await uploadResponse.json().catch(() => null)
        throw new Error(payload?.message ?? 'Could not upload image.')
      }

      const upload = await uploadResponse.json() as {
        key: string
        readUrl: string
      }
      insertMediaImage({
        alt: file.name,
        key: upload.key,
        readUrl: upload.readUrl,
      })
      setMediaStatus(null)
    } catch (error) {
      setMediaStatus(error instanceof Error ? error.message : 'image upload failed')
    } finally {
      if (mediaInputRef.current) mediaInputRef.current.value = ''
    }
  }

  async function handleAttachmentFile(file: File | undefined) {
    if (!file) {
      fileRangeRef.current = null
      return
    }
    const editor = editorRef.current
    if (!editor) return
    if (file.size > MAX_DOCUMENT_FILE_BYTES) {
      setMediaStatus('files must be 50 MB or smaller')
      return
    }

    setMediaStatus('uploading file...')
    try {
      const contentBase64 = await fileToDataUrl(file)
      const uploadResponse = await authFetch(`${config.apiUrl}/media/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'file',
          ownerType: owner.type,
          ownerId: owner.id,
          documentId: owner.type === 'document' ? owner.id : undefined,
          organizationId: organizationId ?? null,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          contentBase64,
        }),
      })
      if (!uploadResponse.ok) {
        const payload = await uploadResponse.json().catch(() => null)
        throw new Error(payload?.message ?? 'Could not upload file.')
      }

      const upload = await uploadResponse.json() as {
        key: string
        readUrl: string
      }
      insertFileAttachment({
        fileName: file.name,
        key: upload.key,
        mimeType: file.type || 'application/octet-stream',
        readUrl: upload.readUrl,
        sizeBytes: file.size,
      })
      setMediaStatus(null)
    } catch (error) {
      setMediaStatus(error instanceof Error ? error.message : 'file upload failed')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function insertMediaImage({ alt, key, readUrl }: { alt: string; key: string; readUrl: string }) {
    const editor = editorRef.current
    if (!editor) return
    const range = mediaRangeRef.current
    if (range && editor.contains(range.startContainer)) selectRange(range)
    else placeCaretAtEnd(editor)

    const figure = createMediaFigure({ alt, key, src: readUrl })
    const paragraph = document.createElement('div')
    paragraph.innerHTML = '<br>'
    const selection = window.getSelection()
    if (selection?.rangeCount) {
      const insertionRange = selection.getRangeAt(0)
      insertionRange.insertNode(paragraph)
      insertionRange.insertNode(figure)
    } else {
      editor.append(figure, paragraph)
    }
    placeCaretAtEnd(paragraph)
    mediaRangeRef.current = null
    commitChange()
  }

  function insertFileAttachment({
    fileName,
    key,
    mimeType,
    readUrl,
    sizeBytes,
  }: {
    fileName: string
    key: string
    mimeType: string
    readUrl: string
    sizeBytes: number
  }) {
    const editor = editorRef.current
    if (!editor) return
    const range = fileRangeRef.current
    if (range && editor.contains(range.startContainer)) selectRange(range)
    else placeCaretAtEnd(editor)

    const attachment = createFileAttachment({ fileName, key, mimeType, readUrl, sizeBytes })
    const paragraph = document.createElement('div')
    paragraph.innerHTML = '<br>'
    const selection = window.getSelection()
    if (selection?.rangeCount) {
      const insertionRange = selection.getRangeAt(0)
      insertionRange.insertNode(paragraph)
      insertionRange.insertNode(attachment)
    } else {
      editor.append(attachment, paragraph)
    }
    placeCaretAtEnd(paragraph)
    fileRangeRef.current = null
    commitChange()
  }

  function closeMenus() {
    setSlashMenu(null)
    setLinkSearch(null)
    setLinkUrl(null)
    setLinkLabel(null)
    slashRangeRef.current = null
    linkRangeRef.current = null
    fileRangeRef.current = null
  }

  return (
    <div className={wrapperClassName}>
      <input
        ref={mediaInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void handleMediaFile(event.currentTarget.files?.[0])}
      />
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(event) => void handleAttachmentFile(event.currentTarget.files?.[0])}
      />
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={handleEditorInput}
        onKeyDown={handleEditorKeyDown}
        onKeyUp={(event) => {
          if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) return
          detectSlashMenu()
        }}
        onMouseUp={detectSlashMenu}
        onFocus={onFocus}
        onBlur={() => {
          commitChange()
          onBlur?.()
        }}
        onClick={(event) => {
          const collapsibleContent = (event.target as HTMLElement).closest('[data-collapsible-content]') as HTMLElement | null
          if (collapsibleContent?.dataset.empty === 'true') {
            collapsibleContent.dataset.empty = 'editing'
          }

          const collapsibleToggle = (event.target as HTMLElement).closest('[data-collapsible-toggle]') as HTMLElement | null
          if (collapsibleToggle) {
            event.preventDefault()
            const collapsible = collapsibleToggle.closest('[data-collapsible]') as HTMLElement | null
            if (!collapsible) return
            const open = collapsible.dataset.open !== 'false'
            setCollapsibleOpen(collapsible, !open)
            commitChange()
            return
          }

          const attachmentDelete = (event.target as HTMLElement).closest('[data-attachment-delete]') as HTMLElement | null
          if (attachmentDelete) {
            event.preventDefault()
            const attachment = attachmentDelete.closest('[data-attachment-kind="file"]') as HTMLElement | null
            if (!attachment) return
            const paragraph = document.createElement('div')
            paragraph.innerHTML = '<br>'
            attachment.replaceWith(paragraph)
            placeCaretAtEnd(paragraph)
            commitChange()
            return
          }

          const mediaDelete = (event.target as HTMLElement).closest('[data-media-delete]') as HTMLElement | null
          if (mediaDelete) {
            event.preventDefault()
            const figure = mediaDelete.closest('figure[data-media-kind="image"]') as HTMLElement | null
            if (!figure) return
            const paragraph = document.createElement('div')
            paragraph.innerHTML = '<br>'
            figure.replaceWith(paragraph)
            placeCaretAtEnd(paragraph)
            commitChange()
            return
          }

          const checklistToggle = (event.target as HTMLElement).closest('[data-checklist-toggle]') as HTMLElement | null
          if (checklistToggle) {
            event.preventDefault()
            const item = checklistToggle.closest('[data-checklist-item]') as HTMLElement | null
            if (!item) return
            const checked = item.dataset.checked !== 'true'
            item.dataset.checked = checked ? 'true' : 'false'
            checklistToggle.setAttribute('aria-checked', checked ? 'true' : 'false')
            commitChange()
            return
          }

          const anchor = (event.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
          if (!anchor) return
          event.preventDefault()
          if (anchor.dataset.documentId) onOpenDocument(anchor.dataset.documentId)
          else if (anchor.dataset.issueId) onOpenIssue(anchor.dataset.issueId)
          else window.open(anchor.href, '_blank', 'noopener,noreferrer')
        }}
        className={`doc-editor ${className} outline-none`}
      />

      {mediaStatus ? (
        <div className="mt-2 font-mono text-[10px] uppercase tracking-label text-fg-4">{mediaStatus}</div>
      ) : null}

      {slashMenu ? (
        <SlashCommandMenu
          commands={slashCommands}
          activeIndex={slashIndex}
          position={slashMenu.position}
          onActiveIndexChange={setSlashIndex}
          onCommand={applyCommand}
        />
      ) : null}

      {linkSearch ? (
        <DocumentLinkMenu
          query={linkSearch.query}
          position={linkSearch.position}
          targets={linkTargets}
          activeIndex={linkSearchIndex}
          inputRef={linkSearchRef}
          onChange={(query) => setLinkSearch((current) => current ? { ...current, query } : current)}
          onActiveIndexChange={setLinkSearchIndex}
          onSelect={chooseLinkTarget}
          onCancel={closeMenus}
        />
      ) : null}

      {linkUrl ? (
        <LinkUrlMenu
          url={linkUrl.url}
          position={linkUrl.position}
          inputRef={linkUrlRef}
          onChange={(url) => setLinkUrl((current) => current ? { ...current, url } : current)}
          onSubmit={chooseUrlTarget}
          onCancel={closeMenus}
        />
      ) : null}

      {linkLabel ? (
        <LinkLabelMenu
          label={linkLabel.label}
          target={linkLabel.target}
          position={linkLabel.position}
          inputRef={linkLabelRef}
          onChange={(label) => setLinkLabel((current) => current ? { ...current, label } : current)}
          onSubmit={() => insertLink(linkLabel.target, linkLabel.label)}
          onCancel={closeMenus}
        />
      ) : null}
    </div>
  )
}

function SlashCommandMenu({
  commands,
  activeIndex,
  position,
  onActiveIndexChange,
  onCommand,
}: {
  commands: SlashCommand[]
  activeIndex: number
  position: MenuPosition
  onActiveIndexChange: (index: number) => void
  onCommand: (command: SlashCommand) => void
}) {
  const activeOptionRef = useRef<HTMLButtonElement | null>(null)
  const [pointerMoved, setPointerMoved] = useState(false)

  useEffect(() => {
    activeOptionRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  return (
    <div
      className="fixed z-40 w-full max-w-sm overflow-y-auto border border-edge/18 bg-pit shadow-terminal-popover"
      style={{ height: position.height ?? 300, left: position.left, top: position.top }}
    >
      {commands.length === 0 ? (
        <div className="px-3 py-2 font-mono text-xs lowercase text-fg-4">no matching commands</div>
      ) : (
        commands.map((command, index) => (
          <button
            key={command.id}
            ref={index === activeIndex ? activeOptionRef : null}
            onMouseDown={(event) => {
              event.preventDefault()
              onCommand(command)
            }}
            onPointerMove={() => {
              setPointerMoved(true)
              onActiveIndexChange(index)
            }}
            className={`flex w-full items-center gap-3 px-3 py-2 text-left transition ${
              index === activeIndex
                ? 'bg-accent-fill/10 text-accent'
                : `text-fg-2 ${pointerMoved ? 'hover:bg-accent-fill/6 hover:text-fg-1' : ''}`
            }`}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center text-fg-3">{command.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-sm lowercase">{command.label}</span>
            </span>
          </button>
        ))
      )}
    </div>
  )
}

function DocumentLinkMenu({
  query,
  position,
  targets,
  activeIndex,
  inputRef,
  onChange,
  onActiveIndexChange,
  onSelect,
  onCancel,
}: {
  query: string
  position: MenuPosition
  targets: LinkTarget[]
  activeIndex: number
  inputRef: RefObject<HTMLInputElement | null>
  onChange: (query: string) => void
  onActiveIndexChange: (index: number | ((index: number) => number)) => void
  onSelect: (target: LinkTarget) => void
  onCancel: () => void
}) {
  const boundedActiveIndex = targets.length === 0 ? 0 : Math.min(activeIndex, targets.length - 1)
  const [pointerMoved, setPointerMoved] = useState(false)

  return (
    <div
      className="fixed z-40 w-full max-w-sm overflow-hidden border border-edge/18 bg-pit shadow-terminal-popover"
      style={{ left: position.left, top: position.top }}
    >
      <div className="border-b border-edge/12 px-3 py-2">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-label text-fg-4">link document</div>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              onActiveIndexChange((index) => (index + 1) % Math.max(targets.length, 1))
              return
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              onActiveIndexChange((index) => (index - 1 + Math.max(targets.length, 1)) % Math.max(targets.length, 1))
              return
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              onCancel()
              return
            }
            if (event.key === 'Enter' && targets[boundedActiveIndex]) {
              event.preventDefault()
              onSelect(targets[boundedActiveIndex])
            }
          }}
          placeholder="Search documents or issues"
          className="w-full bg-transparent font-mono text-sm text-fg-1 outline-none placeholder:text-fg-4"
        />
      </div>
      {targets.length === 0 ? (
        <div className="px-3 py-3 font-mono text-xs lowercase text-fg-4">no matching targets</div>
      ) : (
        targets.map((target, index) => (
          <button
            key={`${target.type}:${target.id}`}
            onMouseDown={(event) => {
              event.preventDefault()
              onSelect(target)
            }}
            onPointerMove={() => {
              setPointerMoved(true)
              onActiveIndexChange(index)
            }}
            className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
              index === boundedActiveIndex
                ? 'bg-accent-fill/10 text-accent'
                : `text-fg-2 ${pointerMoved ? 'hover:bg-accent-fill/6 hover:text-accent' : ''}`
            }`}
          >
            {target.type === 'document' ? (
              <FileText className="h-4 w-4 shrink-0 text-fg-4" />
            ) : (
              <ListTree className="h-4 w-4 shrink-0 text-fg-4" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-sm lowercase">{target.label}</span>
              <span className="block truncate font-mono text-[10px] uppercase tracking-label text-fg-4">{target.subtitle}</span>
            </span>
          </button>
        ))
      )}
    </div>
  )
}

function LinkUrlMenu({
  url,
  position,
  inputRef,
  onChange,
  onSubmit,
  onCancel,
}: {
  url: string
  position: MenuPosition
  inputRef: RefObject<HTMLInputElement | null>
  onChange: (url: string) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed z-40 w-full max-w-sm overflow-hidden border border-edge/18 bg-pit shadow-terminal-popover"
      style={{ left: position.left, top: position.top }}
    >
      <div className="border-b border-edge/12 px-3 py-2">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-label text-fg-4">link url</div>
        <input
          ref={inputRef}
          value={url}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onCancel()
              return
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              onSubmit()
            }
          }}
          placeholder="https://example.com"
          className="w-full bg-transparent font-mono text-sm text-fg-1 outline-none placeholder:text-fg-4"
        />
      </div>
      <div className="px-3 py-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
        enter destination first
      </div>
    </div>
  )
}

function LinkLabelMenu({
  label,
  target,
  position,
  inputRef,
  onChange,
  onSubmit,
  onCancel,
}: {
  label: string
  target: LinkTarget
  position: MenuPosition
  inputRef: RefObject<HTMLInputElement | null>
  onChange: (label: string) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed z-40 w-full max-w-sm overflow-hidden border border-edge/18 bg-pit shadow-terminal-popover"
      style={{ left: position.left, top: position.top }}
    >
      <div className="border-b border-edge/12 px-3 py-2">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-label text-fg-4">link text</div>
        <input
          ref={inputRef}
          value={label}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onCancel()
              return
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              onSubmit()
            }
          }}
          placeholder="What should the link say?"
          className="w-full bg-transparent font-mono text-sm text-fg-1 outline-none placeholder:text-fg-4"
        />
      </div>
      <div className="px-3 py-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
        points to {target.type}: {target.label}
      </div>
    </div>
  )
}

function markdownToHtml(value: string, documents: DocumentRow[], issues: IssueRow[], organizationId: string | null | undefined) {
  const lines = value.split('\n')
  const html: string[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (line.startsWith('```')) {
      const content: string[] = []
      index += 1
      while (index < lines.length && !lines[index].startsWith('```')) {
        content.push(lines[index])
        index += 1
      }
      html.push(codeBlockHtml(content.join('\n'), 'Write code here'))
    } else if (line.startsWith(':::toggle')) {
      const open = !line.includes('closed')
      const title = lines[index + 1] ?? ''
      const content: string[] = []
      index += 2
      while (index < lines.length && lines[index] !== ':::') {
        content.push(lines[index])
        index += 1
      }
      const contentMarkdown = content.join('\n')
      html.push(collapsibleHtml({
        contentEmpty: !contentMarkdown.trim(),
        contentHtml: contentMarkdown.trim() ? markdownToHtml(contentMarkdown, documents, issues, organizationId) : '<div><br></div>',
        open,
        titleHtml: inlineMarkdownToHtml(title, documents, issues, organizationId),
      }))
    } else if (/^::file\[([^\]]*)]\(([^)]+)\)\{size=(\d+)(?: type=([^}]+))?}$/.test(line)) {
      const [, fileName, src, sizeBytes, mimeType] = line.match(/^::file\[([^\]]*)]\(([^)]+)\)\{size=(\d+)(?: type=([^}]+))?}$/) ?? []
      html.push(fileAttachmentMarkdownToHtml(fileName ?? 'file', src ?? '', Number(sizeBytes ?? 0), mimeType ? decodeURIComponent(mimeType) : 'application/octet-stream'))
    } else if (/^!\[([^\]]*)]\(([^)]+)\)$/.test(line)) {
      const [, alt, src] = line.match(/^!\[([^\]]*)]\(([^)]+)\)$/) ?? []
      html.push(mediaMarkdownToHtml(alt ?? '', src ?? ''))
    } else if (line.startsWith('# ')) html.push(`<h1>${inlineMarkdownToHtml(line.slice(2), documents, issues, organizationId)}</h1>`)
    else if (line.startsWith('## ')) html.push(`<h2>${inlineMarkdownToHtml(line.slice(3), documents, issues, organizationId)}</h2>`)
    else if (line.startsWith('### ')) html.push(`<h3>${inlineMarkdownToHtml(line.slice(4), documents, issues, organizationId)}</h3>`)
    else if (line.startsWith('- [x] ')) html.push(checklistItemHtml(true, inlineMarkdownToHtml(line.slice(6), documents, issues, organizationId)))
    else if (line.startsWith('- [ ] ')) html.push(checklistItemHtml(false, inlineMarkdownToHtml(line.slice(6), documents, issues, organizationId)))
    else if (line.startsWith('- ')) {
      const items: string[] = []
      while (index < lines.length && lines[index].startsWith('- ')) {
        items.push(`<li>${inlineMarkdownToHtml(lines[index].slice(2), documents, issues, organizationId)}</li>`)
        index += 1
      }
      html.push(`<ul>${items.join('')}</ul>`)
      continue
    } else if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\d+\.\s/.test(lines[index])) {
        items.push(`<li>${inlineMarkdownToHtml(lines[index].replace(/^\d+\.\s/, ''), documents, issues, organizationId)}</li>`)
        index += 1
      }
      html.push(`<ol>${items.join('')}</ol>`)
      continue
    }
    else if (line.startsWith('> ')) {
      const items: string[] = []
      while (index < lines.length && lines[index].startsWith('> ')) {
        items.push(`<div>${inlineMarkdownToHtml(lines[index].slice(2), documents, issues, organizationId) || '<br>'}</div>`)
        index += 1
      }
      html.push(`<blockquote>${items.join('')}</blockquote>`)
      continue
    }
    else if (line.trim()) html.push(`<div>${inlineMarkdownToHtml(line, documents, issues, organizationId)}</div>`)
    else html.push('<div><br></div>')
    index += 1
  }
  return html.length > 0 ? html.join('') : '<div><br></div>'
}

function inlineMarkdownToHtml(value: string, documents: DocumentRow[], issues: IssueRow[], organizationId: string | null | undefined) {
  const escaped = escapeHtml(value)
  return escaped
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, (_match, label: string, href: string) => {
      const parsed = parsePachHref(href)
      const title = parsed?.type === 'document' ? 'Open document' : parsed?.type === 'issue' ? 'Open issue' : 'Open link'
      return `<a href="${escapeAttribute(parsed?.href ?? href)}" title="${title}"${parsed?.type === 'document' ? ` data-document-id="${escapeAttribute(parsed.id)}"` : ''}${parsed?.type === 'issue' ? ` data-issue-id="${escapeAttribute(parsed.id)}"` : ''}>${label}</a>`
    })
    .replace(/\[\[([^\]]+)]]/g, (_match, title: string) => {
      const entry = documents.find((doc) =>
        sameOrganization(doc.organizationId, organizationId) &&
        normalizeText(doc.title) === normalizeText(title),
      )
      if (entry) return `<a href="/docs/${entry.id}" data-document-id="${entry.id}">${title}</a>`
      const issue = issues.find((item) =>
        sameOrganization(item.contextCompanyId, organizationId) &&
        (normalizeText(item.identifier) === normalizeText(title) || normalizeText(item.title) === normalizeText(title)),
      )
      return issue ? `<a href="/issues/${issue.id}" data-issue-id="${issue.id}">${title}</a>` : title
    })
}

function mediaMarkdownToHtml(alt: string, src: string) {
  if (src.startsWith('s3://')) {
    const key = src.slice('s3://'.length)
    return `<figure data-media-kind="image" data-storage-key="${escapeAttribute(key)}" contenteditable="false">${mediaDeleteButtonHtml()}<img alt="${escapeAttribute(alt)}" data-storage-key="${escapeAttribute(key)}" /><figcaption>${escapeHtml(alt || 'image')}</figcaption></figure>`
  }
  return `<figure data-media-kind="image" contenteditable="false">${mediaDeleteButtonHtml()}<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" /><figcaption>${escapeHtml(alt || 'image')}</figcaption></figure>`
}

function fileAttachmentMarkdownToHtml(fileName: string, src: string, sizeBytes: number, mimeType: string) {
  if (!src.startsWith('s3://')) return escapeHtml(fileName)
  const key = src.slice('s3://'.length)
  return fileAttachmentHtml({ fileName, key, mimeType, readUrl: '', sizeBytes })
}

function codeBlockHtml(code: string, placeholder: string) {
  const trailingBreak = code.endsWith('\n') ? '<br data-code-trailing-break="true">' : ''
  return `<pre data-placeholder="${escapeAttribute(placeholder)}">${escapeHtml(code)}${trailingBreak}</pre>`
}

function collapsibleHtml({
  contentEmpty,
  contentHtml,
  open,
  titleHtml,
}: {
  contentEmpty: boolean
  contentHtml: string
  open: boolean
  titleHtml: string
}) {
  return `<div data-collapsible="true" data-open="${open ? 'true' : 'false'}"><div data-collapsible-header="true"><button type="button" data-collapsible-toggle="true" contenteditable="false" aria-expanded="${open ? 'true' : 'false'}">${chevronSvg()}</button><span data-collapsible-title="true" data-placeholder="Section title">${titleHtml}</span></div><div data-collapsible-content="true" data-empty="${contentEmpty ? 'true' : 'false'}" data-placeholder="Add section content...">${contentHtml || '<div><br></div>'}</div></div>`
}

function mediaDeleteButtonHtml() {
  return '<button type="button" data-media-delete="true" title="delete image"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg></button>'
}

function htmlToMarkdown(editor: HTMLElement) {
  return Array.from(editor.childNodes)
    .map((node) => nodeToMarkdown(node))
    .join('\n')
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (!(node instanceof HTMLElement)) return ''

  const attachmentMarkdown = attachmentElementToMarkdown(node)
  if (attachmentMarkdown != null) return attachmentMarkdown

  const collapsibleMarkdown = collapsibleElementToMarkdown(node)
  if (collapsibleMarkdown != null) return collapsibleMarkdown

  const mediaMarkdown = mediaElementToMarkdown(node)
  if (mediaMarkdown != null) return mediaMarkdown

  const text = inlineHtmlToMarkdown(node)
  const tag = node.tagName.toLowerCase()
  if (node.dataset.checklistItem === 'true') {
    const textElement = node.querySelector('[data-checklist-text]') as HTMLElement | null
    const itemText = textElement ? inlineHtmlToMarkdown(textElement) : text.replace(/^[☑☐]\s*/, '')
    return `- [${node.dataset.checked === 'true' ? 'x' : ' '}] ${itemText}`
  }
  if (tag === 'h1') return `# ${text}`
  if (tag === 'h2') return `## ${text}`
  if (tag === 'h3') return `### ${text}`
  if (tag === 'blockquote') return quoteToMarkdown(node)
  if (tag === 'pre') return `\`\`\`\n${codeBlockText(node).trimEnd()}\n\`\`\``
  if (tag === 'ul') return Array.from(node.querySelectorAll(':scope > li')).map((li) => `- ${inlineHtmlToMarkdown(li)}`).join('\n')
  if (tag === 'ol') return Array.from(node.querySelectorAll(':scope > li')).map((li, index) => `${index + 1}. ${inlineHtmlToMarkdown(li)}`).join('\n')
  if (text.startsWith('☑ ')) return `- [x] ${text.slice(2)}`
  if (text.startsWith('☐ ')) return `- [ ] ${text.slice(2)}`
  return text
}

function inlineHtmlToMarkdown(element: HTMLElement) {
  return Array.from(element.childNodes).map((node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (!(node instanceof HTMLElement)) return ''
    const collapsibleMarkdown = collapsibleElementToMarkdown(node)
    if (collapsibleMarkdown != null) return collapsibleMarkdown
    const attachmentMarkdown = attachmentElementToMarkdown(node)
    if (attachmentMarkdown != null) return attachmentMarkdown
    const mediaMarkdown = mediaElementToMarkdown(node)
    if (mediaMarkdown != null) return mediaMarkdown
    if (node.tagName.toLowerCase() === 'a') {
      const label = node.innerText.trim()
      if (!label) return ''
      const href = node.getAttribute('href') ?? ''
      return href ? `[${label}](${href})` : label
    }
    if (node.tagName.toLowerCase() === 'br') return ''
    return inlineHtmlToMarkdown(node)
  }).join('').replace(/\u00a0/g, ' ').trimEnd()
}

function collapsibleElementToMarkdown(element: HTMLElement) {
  const collapsible = element.matches('[data-collapsible]')
    ? element
    : element.querySelector('[data-collapsible]')
  if (!(collapsible instanceof HTMLElement)) return null
  const titleElement = collapsible.querySelector('[data-collapsible-title]') as HTMLElement | null
  const title = inlineHtmlToMarkdown(titleElement ?? collapsible)
    .replace(/\n/g, ' ')
    .trim()
  const content = collapsible.querySelector('[data-collapsible-content]') as HTMLElement | null
  const contentMarkdown = content
    ? Array.from(content.childNodes).map((node) => nodeToMarkdown(node)).join('\n').trimEnd()
    : ''
  return [`:::toggle ${collapsible.dataset.open === 'false' ? 'closed' : 'open'}`, title, contentMarkdown, ':::'].join('\n')
}

function quoteToMarkdown(quote: HTMLElement) {
  const children = Array.from(quote.childNodes)
  if (!children.length) return '> '
  return children
    .map((node) => {
      if (node.nodeType === Node.TEXT_NODE) return `> ${(node.textContent ?? '').trimEnd()}`
      if (!(node instanceof HTMLElement)) return '> '
      if (node.tagName.toLowerCase() === 'br') return '> '
      return `> ${inlineHtmlToMarkdown(node)}`
    })
    .join('\n')
}

function contentHtmlToPlainText(html: string) {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = html
  return wrapper.textContent ?? ''
}

function attachmentElementToMarkdown(element: HTMLElement) {
  const attachment = element.matches('[data-attachment-kind="file"]')
    ? element
    : element.querySelector('[data-attachment-kind="file"]')
  if (!(attachment instanceof HTMLElement)) return null
  const key = attachment.dataset.storageKey
  if (!key) return ''
  const fileName = attachment.dataset.fileName || attachment.querySelector('[data-attachment-name]')?.textContent || 'file'
  const sizeBytes = Number(attachment.dataset.fileSize ?? 0)
  const mimeType = attachment.dataset.mimeType || 'application/octet-stream'
  return `::file[${escapeMarkdownLabel(fileName)}](s3://${key}){size=${Number.isFinite(sizeBytes) ? sizeBytes : 0} type=${encodeURIComponent(mimeType)}}`
}

function mediaElementToMarkdown(element: HTMLElement) {
  const figure = element.matches('figure[data-media-kind="image"]')
    ? element
    : element.querySelector('figure[data-media-kind="image"]')
  if (!(figure instanceof HTMLElement)) return null
  const image = figure.querySelector('img')
  const alt = image?.getAttribute('alt') || figure.querySelector('figcaption')?.textContent || 'image'
  const key = figure.dataset.storageKey || image?.dataset.storageKey
  const src = key ? `s3://${key}` : image?.getAttribute('src') ?? ''
  return src ? `![${escapeMarkdownLabel(alt)}](${src})` : ''
}

function createMediaFigure({ alt, key, src }: { alt: string; key: string; src: string }) {
  const figure = document.createElement('figure')
  figure.dataset.mediaKind = 'image'
  figure.dataset.storageKey = key
  figure.contentEditable = 'false'

  const image = document.createElement('img')
  image.src = src
  image.alt = alt
  image.dataset.storageKey = key

  const caption = document.createElement('figcaption')
  caption.textContent = alt || 'image'

  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.mediaDelete = 'true'
  button.title = 'delete image'
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>'

  figure.append(button, image, caption)
  return figure
}

function createFileAttachment({
  fileName,
  key,
  mimeType,
  readUrl,
  sizeBytes,
}: {
  fileName: string
  key: string
  mimeType: string
  readUrl: string
  sizeBytes: number
}) {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = fileAttachmentHtml({ fileName, key, mimeType, readUrl, sizeBytes })
  return wrapper.firstElementChild as HTMLElement
}

function fileAttachmentHtml({
  fileName,
  key,
  mimeType,
  readUrl,
  sizeBytes,
}: {
  fileName: string
  key: string
  mimeType: string
  readUrl: string
  sizeBytes: number
}) {
  const safeName = fileName || 'file'
  const href = readUrl ? ` href="${escapeAttribute(readUrl)}"` : ''
  return `<div data-attachment-kind="file" data-storage-key="${escapeAttribute(key)}" data-file-name="${escapeAttribute(safeName)}" data-file-size="${String(sizeBytes)}" data-mime-type="${escapeAttribute(mimeType || 'application/octet-stream')}" contenteditable="false" tabindex="0"><span data-attachment-icon="true">${fileIconSvg()}</span><span data-attachment-copy="true"><span data-attachment-name="true">${escapeHtml(safeName)}</span><span data-attachment-size="true">${formatBytes(sizeBytes)}</span></span><a data-attachment-download="true"${href} download="${escapeAttribute(safeName)}" target="_blank" rel="noreferrer" title="download file">${downloadIconSvg()}</a><button type="button" data-attachment-delete="true" title="delete file">${trashIconSvg()}</button></div>`
}

async function resolveDocumentMedia(editor: HTMLElement) {
  const images = Array.from(editor.querySelectorAll('img[data-storage-key]')) as HTMLImageElement[]
  const attachments = Array.from(editor.querySelectorAll('[data-attachment-kind="file"][data-storage-key]')) as HTMLElement[]
  await Promise.all(images.map(async (image) => {
    const key = image.dataset.storageKey
    if (!key || image.getAttribute('src')) return
    image.closest('figure')?.setAttribute('data-media-loading', 'true')
    try {
      const response = await authFetch(`${config.apiUrl}/media/presign-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      if (!response.ok) return
      const payload = await response.json() as { readUrl?: string }
      if (payload.readUrl) image.src = payload.readUrl
    } catch {
      // Leave the media placeholder visible if a preview URL cannot be fetched.
    } finally {
      image.closest('figure')?.removeAttribute('data-media-loading')
    }
  }))
  await Promise.all(attachments.map(async (attachment) => {
    const key = attachment.dataset.storageKey
    const link = attachment.querySelector('[data-attachment-download]') as HTMLAnchorElement | null
    if (!key || link?.getAttribute('href')) return
    attachment.setAttribute('data-attachment-loading', 'true')
    try {
      const response = await authFetch(`${config.apiUrl}/media/presign-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      if (!response.ok) return
      const payload = await response.json() as { readUrl?: string }
      if (payload.readUrl && link) link.href = payload.readUrl
    } catch {
      // Leave the attachment visible if a download URL cannot be fetched.
    } finally {
      attachment.removeAttribute('data-attachment-loading')
    }
  }))
}

function closestEditableBlock(node: Node, editor: HTMLElement) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement
  if (!element) return null
  const block = element.closest('h1,h2,h3,div,li,blockquote,pre')
  return block && block !== editor && editor.contains(block) ? block as HTMLElement : null
}

function textOffsetIn(root: HTMLElement, node: Node, offset: number) {
  try {
    const range = document.createRange()
    range.selectNodeContents(root)
    range.setEnd(node, offset)
    return range.toString().length
  } catch {
    let total = 0
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let current = walker.nextNode()
    while (current) {
      if (current === node) return total + offset
      total += current.textContent?.length ?? 0
      current = walker.nextNode()
    }
    return root.textContent?.length ?? 0
  }
}

function rangeForTextOffsets(root: HTMLElement, start: number, end: number) {
  const range = document.createRange()
  if ((root.textContent?.length ?? 0) === 0) {
    range.setStart(root, 0)
    range.setEnd(root, 0)
    return range
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let total = 0
  let started = false
  let current = walker.nextNode()
  while (current) {
    const length = current.textContent?.length ?? 0
    if (!started && start <= total + length) {
      range.setStart(current, Math.max(0, start - total))
      started = true
    }
    if (started && end <= total + length) {
      range.setEnd(current, Math.max(0, end - total))
      return range
    }
    total += length
    current = walker.nextNode()
  }
  if (start >= total && end >= total) {
    range.selectNodeContents(root)
    range.collapse(false)
    return range
  }
  return null
}

function positionFromRange(range: Range): MenuPosition {
  const rect = range.getBoundingClientRect()
  const viewportPadding = 12
  const gap = 8
  const preferredHeight = 300
  const availableBelow = window.innerHeight - rect.bottom - viewportPadding - gap
  const availableAbove = rect.top - viewportPadding - gap
  const shouldOpenAbove = availableBelow < preferredHeight && availableAbove > availableBelow
  const availableHeight = shouldOpenAbove ? availableAbove : availableBelow
  const height = Math.max(120, Math.min(preferredHeight, availableHeight))

  return {
    left: Math.min(Math.max(rect.left, 12), window.innerWidth - 420),
    top: shouldOpenAbove
      ? Math.max(viewportPadding, rect.top - gap - height)
      : Math.min(rect.bottom + gap, window.innerHeight - viewportPadding - height),
    height,
  }
}

function selectRange(range: Range) {
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function formatBlockAndFocus(editor: HTMLElement, tag: string, sourceBlock: HTMLElement | null) {
  editor.focus()
  const selection = window.getSelection()
  const current = selection?.rangeCount ? closestEditableBlock(selection.getRangeAt(0).startContainer, editor) : null
  let block = sourceBlock && editor.contains(sourceBlock) ? sourceBlock : current

  if (!block) {
    const heading = document.createElement(tag)
    heading.innerHTML = '<br>'
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null
    if (range) range.insertNode(heading)
    else editor.append(heading)
    placeCaretAtStart(heading)
    return
  }

  if (block.tagName.toLowerCase() !== tag) {
    const replacement = document.createElement(tag)
    while (block.firstChild) replacement.appendChild(block.firstChild)
    block.replaceWith(replacement)
    block = replacement
  }

  editor.focus()
  if (!block.textContent?.trim()) {
    block.innerHTML = '<br>'
    placeCaretAtStart(block)
  } else {
    placeCaretAtEnd(block)
  }
}

function formatQuoteAndFocus(editor: HTMLElement, sourceBlock: HTMLElement | null) {
  editor.focus()
  const selection = window.getSelection()
  const current = selection?.rangeCount ? closestEditableBlock(selection.getRangeAt(0).startContainer, editor) : null
  let block = current ?? sourceBlock
  if (!block) return

  const existingQuote = block.closest('blockquote')
  if (existingQuote instanceof HTMLElement && editor.contains(existingQuote)) {
    const line = block.closest('blockquote > div') as HTMLElement | null
    placeCaretAtEnd(line ?? existingQuote)
    return
  } else if (block.tagName.toLowerCase() !== 'blockquote') {
    const quote = document.createElement('blockquote')
    const line = document.createElement('div')
    while (block.firstChild) line.appendChild(block.firstChild)
    if (!line.textContent?.trim()) line.innerHTML = '<br>'
    quote.append(line)
    block.replaceWith(quote)
    editor.focus()
    placeCaretAtEnd(line)
    return
  }

  if (!block.textContent?.trim()) block.innerHTML = '<div><br></div>'
  editor.focus()
  placeCaretAtEnd(block)
}

function formatCodeBlockAndFocus(editor: HTMLElement, sourceBlock: HTMLElement | null, placeholder: string) {
  editor.focus()
  const selection = window.getSelection()
  const current = selection?.rangeCount ? closestEditableBlock(selection.getRangeAt(0).startContainer, editor) : null
  const block = current ?? sourceBlock
  if (!block) return

  const existingCode = block.closest('pre')
  if (existingCode instanceof HTMLElement && editor.contains(existingCode)) {
    existingCode.dataset.placeholder = placeholder
    placeCaretAtEnd(existingCode)
    return
  }

  const pre = document.createElement('pre')
  pre.dataset.placeholder = placeholder
  renderCodeBlockText(pre, block.innerText.trimEnd())
  block.replaceWith(pre)
  editor.focus()
  placeCaretAtEnd(pre)
}

function formatCollapsibleAndFocus(editor: HTMLElement, sourceBlock: HTMLElement | null) {
  editor.focus()
  const selection = window.getSelection()
  const current = selection?.rangeCount ? closestEditableBlock(selection.getRangeAt(0).startContainer, editor) : null
  const block = current ?? sourceBlock
  if (!block) return

  const collapsible = createCollapsibleElement({
    contentHtml: '<div><br></div>',
    open: true,
    title: block.innerText.trim() || 'Section title',
  })
  block.replaceWith(collapsible)
  editor.focus()
  selectCollapsibleTitle(collapsible)
}

function createCollapsibleElement({
  contentHtml,
  open,
  title,
}: {
  contentHtml: string
  open: boolean
  title: string
}) {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = collapsibleHtml({
    contentEmpty: !contentHtmlToPlainText(contentHtml).trim(),
    contentHtml,
    open,
    titleHtml: escapeHtml(title),
  })
  return wrapper.firstElementChild as HTMLElement
}

function selectCollapsibleTitle(collapsible: HTMLElement) {
  const title = collapsible.querySelector('[data-collapsible-title]') as HTMLElement | null
  if (!title) {
    placeCaretAtEnd(collapsible)
    return
  }
  const range = document.createRange()
  range.selectNodeContents(title)
  selectRange(range)
}

function placeCaretInCollapsibleContent(collapsible: HTMLElement) {
  const content = collapsible.querySelector('[data-collapsible-content]') as HTMLElement | null
  if (!content) return
  if (!content.childNodes.length) content.innerHTML = '<div><br></div>'
  if (!content.textContent?.trim()) content.dataset.empty = 'editing'
  const block = content.querySelector(':scope > h1,:scope > h2,:scope > h3,:scope > div,:scope > p,:scope > ul,:scope > ol,:scope > blockquote,:scope > pre') as HTMLElement | null
  placeCaretAtEnd(block ?? content)
}

function formatListAndFocus(editor: HTMLElement, listTag: 'ul' | 'ol', sourceBlock: HTMLElement | null) {
  editor.focus()
  const selection = window.getSelection()
  const current = selection?.rangeCount ? closestEditableBlock(selection.getRangeAt(0).startContainer, editor) : null
  const block = current ?? sourceBlock
  if (!block) return

  const existingList = block.closest('ul,ol')
  if (existingList instanceof HTMLElement && editor.contains(existingList)) {
    placeCaretAtEnd(block)
    return
  }

  const list = document.createElement(listTag)
  const item = document.createElement('li')
  while (block.firstChild) item.appendChild(block.firstChild)
  if (!item.textContent?.trim()) item.innerHTML = '<br>'
  list.appendChild(item)
  block.replaceWith(list)
  editor.focus()
  placeCaretAtEnd(item)
}

function formatChecklistAndFocus(editor: HTMLElement, sourceBlock: HTMLElement | null) {
  editor.focus()
  const selection = window.getSelection()
  const current = selection?.rangeCount ? closestEditableBlock(selection.getRangeAt(0).startContainer, editor) : null
  const block = current ?? sourceBlock
  if (!block) return

  const existingItem = block.closest('[data-checklist-item]')
  if (existingItem instanceof HTMLElement && editor.contains(existingItem)) {
    placeCaretInChecklistText(existingItem)
    return
  }

  const item = createChecklistItem(false)
  const text = checklistTextElement(item)
  while (block.firstChild) text.appendChild(block.firstChild)
  if (!text.textContent?.trim()) text.innerHTML = '<br>'
  block.replaceWith(item)
  editor.focus()
  placeCaretInChecklistText(item)
}

function placeCaretAtEnd(element: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  selectRange(range)
}

function placeCaretAtStart(element: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(true)
  selectRange(range)
}

function placeCaretAfter(node: Node) {
  const range = document.createRange()
  range.setStartAfter(node)
  range.collapse(true)
  selectRange(range)
}

function currentCodeBlock(editor: HTMLElement) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  const element = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer as HTMLElement
    : range.startContainer.parentElement
  const pre = element?.closest('pre')
  return pre instanceof HTMLElement && editor.contains(pre) ? pre : null
}

function isCaretInCodeBlock(editor: HTMLElement) {
  return Boolean(currentCodeBlock(editor))
}

function handleCodeBlockTab(editor: HTMLElement, shiftKey: boolean) {
  const pre = currentCodeBlock(editor)
  if (!pre) return false
  if (shiftKey) {
    unindentCurrentCodeLine(pre)
    return true
  }
  replaceSelectedCodeText(editor, '  ')
  return true
}

function replaceSelectedCodeText(editor: HTMLElement, text: string) {
  const pre = currentCodeBlock(editor)
  const selection = window.getSelection()
  if (!pre || !selection || selection.rangeCount === 0) return false
  const range = selection.getRangeAt(0)
  const start = textOffsetIn(pre, range.startContainer, range.startOffset)
  const end = range.collapsed ? start : textOffsetIn(pre, range.endContainer, range.endOffset)
  const code = codeBlockText(pre)
  const boundedStart = Math.max(0, Math.min(start, code.length))
  const boundedEnd = Math.max(boundedStart, Math.min(end, code.length))
  renderCodeBlockText(pre, `${code.slice(0, boundedStart)}${text}${code.slice(boundedEnd)}`)
  placeCaretAtTextOffset(pre, boundedStart + text.length)
  editor.focus()
  return true
}

function placeCaretAtTextOffset(element: HTMLElement, offset: number) {
  const text = element.textContent ?? ''
  const boundedOffset = Math.max(0, Math.min(offset, text.length))
  const range = rangeForTextOffsets(element, boundedOffset, boundedOffset)
  if (range) selectRange(range)
  else placeCaretAtEnd(element)
}

function insertTextAtSelection(text: string) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return
  const range = selection.getRangeAt(0)
  if (!range.collapsed) range.deleteContents()
  const node = document.createTextNode(text)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  selectRange(range)
}

function unindentCurrentCodeLine(pre: HTMLElement) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return
  const range = selection.getRangeAt(0)
  const offset = textOffsetIn(pre, range.startContainer, range.startOffset)
  const text = codeBlockText(pre)
  const lineStart = text.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
  const removable = text.slice(lineStart, lineStart + 2) === '  '
    ? 2
    : text.slice(lineStart, lineStart + 1) === '\t'
      ? 1
      : 0
  if (removable === 0) return
  renderCodeBlockText(pre, `${text.slice(0, lineStart)}${text.slice(lineStart + removable)}`)
  const nextOffset = Math.max(lineStart, offset - removable)
  placeCaretAtTextOffset(pre, nextOffset)
}

function codeBlockText(pre: HTMLElement) {
  return Array.from(pre.childNodes)
    .filter((node) => !(node instanceof HTMLBRElement && node.dataset.codeTrailingBreak === 'true'))
    .map((node) => node.textContent ?? '')
    .join('')
    .replace(/\u00a0/g, ' ')
}

function renderCodeBlockText(pre: HTMLElement, code: string) {
  pre.textContent = code
  if (code.endsWith('\n')) {
    const trailingBreak = document.createElement('br')
    trailingBreak.dataset.codeTrailingBreak = 'true'
    pre.append(trailingBreak)
  }
}

function normalizeCodeBlocks(editor: HTMLElement) {
  editor.querySelectorAll('pre').forEach((pre) => {
    const element = pre as HTMLElement
    const code = codeBlockText(element)
    const trailingBreak = element.querySelector('br[data-code-trailing-break="true"]')
    if (code.endsWith('\n')) {
      if (!trailingBreak) renderCodeBlockText(element, code)
    } else {
      trailingBreak?.remove()
    }
  })
}

function setCollapsibleOpen(collapsible: HTMLElement, open: boolean) {
  collapsible.dataset.open = open ? 'true' : 'false'
  const toggle = collapsible.querySelector('[data-collapsible-toggle]')
  toggle?.setAttribute('aria-expanded', open ? 'true' : 'false')
}

function normalizeCollapsibles(editor: HTMLElement) {
  const selection = window.getSelection()
  const selectedNode = selection?.rangeCount ? selection.getRangeAt(0).startContainer : null
  editor.querySelectorAll('[data-collapsible]').forEach((node) => {
    const collapsible = node as HTMLElement
    if (collapsible.dataset.open !== 'false') setCollapsibleOpen(collapsible, true)
    const content = collapsible.querySelector('[data-collapsible-content]') as HTMLElement | null
    if (content) {
      if (!content.childNodes.length) content.innerHTML = '<div><br></div>'
      const selectedElement = selectedNode?.nodeType === Node.ELEMENT_NODE
        ? selectedNode as HTMLElement
        : selectedNode?.parentElement
      const hasFocus = Boolean(selectedElement && content.contains(selectedElement))
      content.dataset.empty = content.textContent?.trim() ? 'false' : hasFocus ? 'editing' : 'true'
    }
  })
}

function normalizeQuotes(editor: HTMLElement) {
  editor.querySelectorAll('blockquote').forEach((node) => {
    const quote = node as HTMLElement
    if (Array.from(quote.childNodes).every((child) => child instanceof HTMLDivElement)) return
    const line = document.createElement('div')
    while (quote.firstChild) line.appendChild(quote.firstChild)
    if (!line.textContent?.trim()) line.innerHTML = '<br>'
    quote.replaceChildren(line)
  })
}

function insertParagraphAfterHeading(editor: HTMLElement | null) {
  const selection = window.getSelection()
  if (!editor || !selection || selection.rangeCount === 0) return false
  const block = closestEditableBlock(selection.getRangeAt(0).startContainer, editor)
  if (!block || !['h1', 'h2', 'h3'].includes(block.tagName.toLowerCase())) return false
  const paragraph = document.createElement('div')
  paragraph.innerHTML = '<br>'
  block.after(paragraph)
  placeCaretAtEnd(paragraph)
  return true
}

function handleEnter(editor: HTMLElement | null) {
  if (!editor) return false
  return (
    handleCollapsibleContentEnter(editor) ||
    handleCollapsibleTitleEnter(editor) ||
    handleChecklistEnter(editor) ||
    handleListEnter(editor) ||
    handleQuoteEnter(editor) ||
    insertParagraphAfterHeading(editor) ||
    insertParagraphAtCaret(editor)
  )
}

function handleQuoteEnter(editor: HTMLElement | null) {
  const selection = window.getSelection()
  if (!editor || !selection || selection.rangeCount === 0) return false
  const range = selection.getRangeAt(0)
  const block = closestEditableBlock(range.startContainer, editor)
  const quote = block?.closest('blockquote')
  if (!(quote instanceof HTMLQuoteElement) || !editor.contains(quote)) return false
  const line = block && block !== quote && quote.contains(block) ? block : null

  if (line?.textContent?.trim()) {
    const next = document.createElement('div')
    next.innerHTML = '<br>'
    line.after(next)
    placeCaretAtEnd(next)
    return true
  }

  const paragraph = document.createElement('div')
  paragraph.innerHTML = '<br>'
  quote.after(paragraph)
  if (line && quote.children.length > 1) line.remove()
  else quote.remove()
  placeCaretAtEnd(paragraph)
  return true
}

function handleEmptyCollapsibleTitleDelete(editor: HTMLElement) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return false
  const range = selection.getRangeAt(0)
  const element = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer as HTMLElement
    : range.startContainer.parentElement
  const title = element?.closest('[data-collapsible-title]')
  if (!(title instanceof HTMLElement) || !editor.contains(title)) return false
  if (title.textContent?.trim()) return false

  const collapsible = title.closest('[data-collapsible]') as HTMLElement | null
  if (!collapsible) return false
  const paragraph = document.createElement('div')
  paragraph.innerHTML = '<br>'
  collapsible.replaceWith(paragraph)
  placeCaretAtEnd(paragraph)
  return true
}

function handleCollapsibleContentEnter(editor: HTMLElement | null) {
  const selection = window.getSelection()
  if (!editor || !selection || selection.rangeCount === 0) return false
  const range = selection.getRangeAt(0)
  const element = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer as HTMLElement
    : range.startContainer.parentElement
  const content = element?.closest('[data-collapsible-content]')
  if (!(content instanceof HTMLElement) || !editor.contains(content)) return false
  const collapsible = content.closest('[data-collapsible]') as HTMLElement | null
  if (!collapsible) return false

  const block = closestEditableBlock(range.startContainer, editor)
  const contentBlock = block && content.contains(block) && block !== content ? block : null
  if (contentBlock?.textContent?.trim()) {
    const next = document.createElement('div')
    next.innerHTML = '<br>'
    contentBlock.after(next)
    content.dataset.empty = 'false'
    placeCaretAtEnd(next)
    return true
  }

  if (contentBlock && content.children.length > 1) contentBlock.remove()
  if (!content.textContent?.trim() && !content.querySelector('img,a,figure,[data-attachment-kind]')) {
    content.innerHTML = '<div><br></div>'
    content.dataset.empty = 'true'
  }
  const paragraph = document.createElement('div')
  paragraph.innerHTML = '<br>'
  collapsible.after(paragraph)
  placeCaretAtEnd(paragraph)
  return true
}

function handleCollapsibleTitleEnter(editor: HTMLElement | null) {
  const selection = window.getSelection()
  if (!editor || !selection || selection.rangeCount === 0) return false
  const range = selection.getRangeAt(0)
  const element = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer as HTMLElement
    : range.startContainer.parentElement
  const title = element?.closest('[data-collapsible-title]')
  if (!(title instanceof HTMLElement) || !editor.contains(title)) return false
  const collapsible = title.closest('[data-collapsible]') as HTMLElement | null
  if (!collapsible) return false
  setCollapsibleOpen(collapsible, true)
  placeCaretInCollapsibleContent(collapsible)
  return true
}

function insertParagraphAtCaret(editor: HTMLElement) {
  const selection = window.getSelection()
  const paragraph = document.createElement('div')
  paragraph.innerHTML = '<br>'

  if (!selection || selection.rangeCount === 0) {
    editor.append(paragraph)
    placeCaretAtEnd(paragraph)
    return true
  }

  const range = selection.getRangeAt(0)
  if (!editor.contains(range.startContainer)) {
    editor.append(paragraph)
    placeCaretAtEnd(paragraph)
    return true
  }

  if (!range.collapsed) range.deleteContents()
  const block = closestEditableBlock(range.startContainer, editor)
  if (!block) {
    editor.append(paragraph)
    placeCaretAtEnd(paragraph)
    return true
  }

  const afterRange = document.createRange()
  afterRange.setStart(range.startContainer, range.startOffset)
  afterRange.setEnd(block, block.childNodes.length)
  const afterContent = afterRange.extractContents()
  if (afterContent.textContent?.trim() || afterContent.querySelector?.('a,img')) {
    paragraph.replaceChildren(afterContent)
  }
  if (!block.textContent?.trim() && !block.querySelector('a,img,br')) block.innerHTML = '<br>'
  block.after(paragraph)
  placeCaretAtEnd(paragraph)
  return true
}

function handleChecklistEnter(editor: HTMLElement | null) {
  const selection = window.getSelection()
  if (!editor || !selection || selection.rangeCount === 0) return false
  const range = selection.getRangeAt(0)
  const element = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer as HTMLElement
    : range.startContainer.parentElement
  const item = element?.closest('[data-checklist-item]')
  if (!(item instanceof HTMLElement) || !editor.contains(item)) return false

  const text = checklistTextElement(item)
  if (text.textContent?.trim()) {
    const next = createChecklistItem(false)
    item.after(next)
    placeCaretInChecklistText(next)
    return true
  }

  const paragraph = document.createElement('div')
  paragraph.innerHTML = '<br>'
  item.after(paragraph)
  item.remove()
  placeCaretAtEnd(paragraph)
  return true
}

function handleListEnter(editor: HTMLElement | null) {
  const selection = window.getSelection()
  if (!editor || !selection || selection.rangeCount === 0) return false
  const range = selection.getRangeAt(0)
  const element = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer as HTMLElement
    : range.startContainer.parentElement
  const item = element?.closest('li')
  if (!(item instanceof HTMLLIElement) || !editor.contains(item)) return false
  const list = item.parentElement
  if (!(list instanceof HTMLUListElement || list instanceof HTMLOListElement)) return false

  if (item.textContent?.trim()) {
    const next = document.createElement('li')
    next.innerHTML = '<br>'
    item.after(next)
    placeCaretAtEnd(next)
    return true
  }

  const paragraph = document.createElement('div')
  paragraph.innerHTML = '<br>'
  list.after(paragraph)
  item.remove()
  if (list.children.length === 0) list.remove()
  placeCaretAtEnd(paragraph)
  return true
}

function createChecklistItem(checked: boolean) {
  const item = document.createElement('div')
  item.dataset.checklistItem = 'true'
  item.dataset.checked = checked ? 'true' : 'false'

  const toggle = document.createElement('span')
  toggle.dataset.checklistToggle = 'true'
  toggle.contentEditable = 'false'
  toggle.setAttribute('role', 'checkbox')
  toggle.setAttribute('aria-checked', checked ? 'true' : 'false')

  const text = document.createElement('span')
  text.dataset.checklistText = 'true'
  text.innerHTML = '<br>'

  item.append(toggle, text)
  return item
}

function checklistItemHtml(checked: boolean, contentHtml: string) {
  return `<div data-checklist-item="true" data-checked="${checked ? 'true' : 'false'}"><span data-checklist-toggle="true" contenteditable="false" role="checkbox" aria-checked="${checked ? 'true' : 'false'}"></span><span data-checklist-text="true">${contentHtml || '<br>'}</span></div>`
}

function checklistTextElement(item: HTMLElement) {
  let text = item.querySelector('[data-checklist-text]') as HTMLElement | null
  if (!text) {
    text = document.createElement('span')
    text.dataset.checklistText = 'true'
    text.innerHTML = '<br>'
    item.append(text)
  }
  return text
}

function placeCaretInChecklistText(item: HTMLElement) {
  const text = checklistTextElement(item)
  placeCaretAtEnd(text)
}

function removeEmptyLinks(editor: HTMLElement) {
  editor.querySelectorAll('a').forEach((anchor) => {
    if (anchor.textContent?.trim()) return
    anchor.remove()
  })
}

function ensureEditorHasBlock(editor: HTMLElement) {
  if (editor.textContent?.trim() || editor.querySelector('img,a,br')) return
  editor.innerHTML = '<div><br></div>'
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, '&#096;')
}

function escapeMarkdownLabel(value: string) {
  return value.replace(/[\]\n\r]/g, ' ')
}

function fileIconSvg() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>'
}

function downloadIconSvg() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>'
}

function trashIconSvg() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>'
}

function chevronSvg() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>'
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const decimals = unitIndex === 0 || value >= 10 ? 0 : 1
  return `${value.toFixed(decimals)} ${units[unitIndex]}`
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsDataURL(file)
  })
}

function normalizeUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^(https?:\/\/|mailto:|tel:|\/)/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function parsePachHref(href: string): { type: 'document' | 'issue'; id: string; href: string } | null {
  const normalizedHref = href.trim()
  if (!normalizedHref) return null
  let pathname = normalizedHref
  if (/^https?:\/\//i.test(normalizedHref)) {
    try {
      const url = new URL(normalizedHref)
      if (typeof window !== 'undefined' && url.origin !== window.location.origin) return null
      pathname = url.pathname
    } catch {
      return null
    }
  }
  const documentId = pathname.match(/^\/docs\/([a-z0-9-]+)$/i)?.[1]
  if (documentId) return { type: 'document', id: documentId, href: `/docs/${documentId}` }
  const issueId = pathname.match(/^\/issues\/([a-z0-9-]+)$/i)?.[1]
  if (issueId) return { type: 'issue', id: issueId, href: `/issues/${issueId}` }
  return null
}

function sameOrganization(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? null) === (b ?? null)
}

function normalizeText(value: string) {
  return value.trim().toLowerCase()
}
