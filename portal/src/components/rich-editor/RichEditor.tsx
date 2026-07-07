import { Node, type Editor as TiptapEditor, type JSONContent } from '@tiptap/core'
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
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
  Image as ImageIcon,
  Link2,
  List,
  ListOrdered,
  ListTree,
  Paperclip,
  Quote,
} from 'lucide-react'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
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
  aliases?: string[]
  icon: ReactNode
}

type MenuPosition = {
  left: number
  top: number
  height?: number
}

export type RichEditorOwner = { type: 'document' | 'issue' | 'publication'; id: string }
export type RichEditorHandle = { focus: () => void }

type RichEditorProps = {
  owner: RichEditorOwner
  value: string
  documents: DocumentRow[]
  issues: IssueRow[]
  organizationId: string | null | undefined
  onChange: (value: string) => void
  onOpenDocument: (id: string) => void
  onOpenIssue: (id: string) => void
  onCreateChildDocument?: (parentId: string) => Promise<{ id: string; title: string } | null>
  enableUploads?: boolean
  placeholder?: string
  className?: string
  wrapperClassName?: string
  onFocus?: () => void
  onBlur?: () => void
}

const MAX_DOCUMENT_FILE_BYTES = 50 * 1024 * 1024

const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'link-document', label: 'Link document', hint: 'Search and insert a document', aliases: ['doc', 'docs', 'page', 'mention'], icon: <Link2 className="h-4 w-4" /> },
  { id: 'link-url', label: 'Link URL', hint: 'Insert an external link', aliases: ['url', 'href', 'web'], icon: <ExternalLink className="h-4 w-4" /> },
  { id: 'create-child-document', label: 'Create child document', hint: 'Create and link a child document', aliases: ['child', 'subdoc', 'new doc'], icon: <FilePlus className="h-4 w-4" /> },
  { id: 'heading1', label: 'Heading 1', hint: 'Large section title', aliases: ['h1', 'title'], icon: <Heading1 className="h-4 w-4" /> },
  { id: 'heading2', label: 'Heading 2', hint: 'Medium section title', aliases: ['h2', 'subtitle'], icon: <Heading2 className="h-4 w-4" /> },
  { id: 'heading3', label: 'Heading 3', hint: 'Small section title', aliases: ['h3'], icon: <Heading3 className="h-4 w-4" /> },
  { id: 'bullet', label: 'Bulleted list', aliases: ['ul', 'bullet', 'list', '-'], icon: <List className="h-4 w-4" /> },
  { id: 'numbered', label: 'Numbered list', aliases: ['ol', 'number', 'ordered', '1'], icon: <ListOrdered className="h-4 w-4" /> },
  { id: 'checklist', label: 'Checklist', aliases: ['todo', 'task', 'check'], icon: <CheckSquare className="h-4 w-4" /> },
  { id: 'media', label: 'Insert media...', hint: 'Upload an image', aliases: ['image', 'img', 'photo'], icon: <ImageIcon className="h-4 w-4" /> },
  { id: 'file', label: 'Attach files...', hint: 'Upload a file', aliases: ['attachment', 'attach', 'upload'], icon: <Paperclip className="h-4 w-4" /> },
  { id: 'code', label: 'Code block', aliases: ['pre', 'snippet'], icon: <Code2 className="h-4 w-4" /> },
  { id: 'collapsible', label: 'Collapsible section', aliases: ['toggle', 'details', 'accordion'], icon: <ChevronDown className="h-4 w-4" /> },
  { id: 'quote', label: 'Blockquote', aliases: ['blockquote', '>'], icon: <Quote className="h-4 w-4" /> },
]

const DocumentImage = Image.extend({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      storageKey: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-storage-key'),
        renderHTML: (attributes: { storageKey?: string | null }) => (
          attributes.storageKey ? { 'data-storage-key': attributes.storageKey } : {}
        ),
      },
    }
  },
})

const FileAttachment = Node.create({
  name: 'fileAttachment',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      storageKey: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-storage-key') ?? '',
        renderHTML: (attributes: { storageKey?: string }) => ({ 'data-storage-key': attributes.storageKey ?? '' }),
      },
      fileName: {
        default: 'file',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-file-name') ?? element.querySelector('[data-attachment-name]')?.textContent ?? 'file',
        renderHTML: (attributes: { fileName?: string }) => ({ 'data-file-name': attributes.fileName ?? 'file' }),
      },
      mimeType: {
        default: 'application/octet-stream',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-mime-type') ?? 'application/octet-stream',
        renderHTML: (attributes: { mimeType?: string }) => ({ 'data-mime-type': attributes.mimeType ?? 'application/octet-stream' }),
      },
      readUrl: {
        default: '',
        parseHTML: (element: HTMLElement) => element.querySelector('[data-attachment-download]')?.getAttribute('href') ?? '',
        renderHTML: (attributes: { readUrl?: string }) => ({ 'data-read-url': attributes.readUrl ?? '' }),
      },
      previewUrl: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-attachment-preview-url') ?? '',
        renderHTML: (attributes: { previewUrl?: string }) => (
          attributes.previewUrl ? { 'data-attachment-preview-url': attributes.previewUrl } : {}
        ),
      },
      sizeBytes: {
        default: 0,
        parseHTML: (element: HTMLElement) => Number(element.getAttribute('data-file-size') ?? 0),
        renderHTML: (attributes: { sizeBytes?: number }) => ({ 'data-file-size': String(attributes.sizeBytes ?? 0) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: '[data-attachment-kind="file"]' }]
  },

  renderHTML({ node }) {
    const attrs = node.attrs as {
      storageKey?: string | null
      fileName?: string | null
      mimeType?: string | null
      readUrl?: string | null
      previewUrl?: string | null
      sizeBytes?: number | string | null
    }
    return fileAttachmentDomSpec({
      fileName: attrs.fileName ?? 'file',
      key: attrs.storageKey ?? '',
      mimeType: attrs.mimeType ?? 'application/octet-stream',
      readUrl: attrs.readUrl ?? '',
      previewUrl: attrs.previewUrl ?? '',
      sizeBytes: Number(attrs.sizeBytes ?? 0),
    })
  },
})

export const RichEditor = forwardRef<RichEditorHandle, RichEditorProps>(function RichEditor(
  {
    owner,
    value,
    documents,
    issues,
    organizationId,
    onChange,
    onOpenDocument,
    onOpenIssue,
    onCreateChildDocument,
    enableUploads = true,
    placeholder = 'Type / for commands',
    className = 'min-h-[52vh]',
    wrapperClassName = 'relative mt-7',
    onFocus,
    onBlur,
  },
  ref,
) {
  const mediaInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const linkSearchRef = useRef<HTMLInputElement | null>(null)
  const linkUrlRef = useRef<HTMLInputElement | null>(null)
  const linkLabelRef = useRef<HTMLInputElement | null>(null)
  const lastSerializedRef = useRef(value)
  const slashRangeRef = useRef<{ from: number; to: number } | null>(null)
  const linkInsertPosRef = useRef<number | null>(null)
  const mediaInsertPosRef = useRef<number | null>(null)
  const fileInsertPosRef = useRef<number | null>(null)
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
    return SLASH_COMMANDS
      .filter((command) => {
        if (command.id === 'create-child-document' && (owner.type !== 'document' || !onCreateChildDocument)) return false
        if (!enableUploads && (command.id === 'media' || command.id === 'file')) return false
        if (!q) return true
        const haystack = [command.label, command.hint, ...(command.aliases ?? [])]
          .filter(Boolean)
          .map((entry) => normalizeText(String(entry)))
        return haystack.some((entry) => entry.includes(q))
      })
      .sort((a, b) => slashCommandScore(a, q) - slashCommandScore(b, q))
  }, [enableUploads, onCreateChildDocument, owner.type, slashMenu])

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

  const editor = useEditor({
    immediatelyRender: false,
    content: markdownToHtml(value, documents, issues, organizationId),
    extensions: [
      StarterKit.configure({
        link: false,
      }),
      Link.configure({
        autolink: true,
        defaultProtocol: 'https',
        enableClickSelection: false,
        linkOnPaste: true,
        openOnClick: false,
        HTMLAttributes: {
          class: 'document-link',
        },
      }),
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
      DocumentImage.configure({ allowBase64: true }),
      FileAttachment,
      Details.configure({
        persist: true,
        openClassName: 'is-open',
        renderToggleButton: ({ element, isOpen }) => {
          element.setAttribute('aria-label', isOpen ? 'collapse section' : 'expand section')
          element.innerHTML = chevronSvg()
        },
      }),
      DetailsSummary,
      DetailsContent,
    ],
    editorProps: {
      attributes: {
        class: `doc-editor ${className} outline-none`,
      },
      handleClick: (view, pos, event) => {
        const target = event.target as HTMLElement | null
        const attachmentDelete = target?.closest('[data-attachment-delete]') as HTMLElement | null
        if (attachmentDelete) {
          event.preventDefault()
          const attachment = attachmentDelete.closest('[data-attachment-kind="file"]') as HTMLElement | null
          if (!attachment) return true
          try {
            const attachmentPos = view.posAtDOM(attachment, 0)
            const node = view.state.doc.nodeAt(attachmentPos)
            if (node) view.dispatch(view.state.tr.delete(attachmentPos, attachmentPos + node.nodeSize))
          } catch {
            const node = view.state.doc.nodeAt(pos)
            if (node) view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize))
          }
          return true
        }

        const attachmentDownload = target?.closest('[data-attachment-download]') as HTMLAnchorElement | null
        if (attachmentDownload) {
          if (attachmentDownload.href) return false
          event.preventDefault()
          return true
        }

        const anchor = target?.closest('a[href]') as HTMLAnchorElement | null
        if (anchor) {
          event.preventDefault()
          const parsed = parsePachHref(anchor.getAttribute('href') ?? '')
          if (parsed?.type === 'document') onOpenDocument(parsed.id)
          else if (parsed?.type === 'issue') onOpenIssue(parsed.id)
          else window.open(anchor.href, '_blank', 'noopener,noreferrer')
          return true
        }

        const attachment = target?.closest('[data-attachment-kind="file"]') as HTMLElement | null
        if (!attachment || !isPdfAttachment(attachment)) return false
        const previewUrl = attachmentPreviewUrl(attachment)
        if (!previewUrl) return false
        event.preventDefault()
        window.open(previewUrl, '_blank', 'noopener,noreferrer')
        return true
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && !event.shiftKey && editor && handleMarkdownEnterShortcut(editor)) {
          event.preventDefault()
          return true
        }
        if (event.key === 'Tab') {
          if (editor && handleCodeBlockTab(editor, event.shiftKey)) {
            event.preventDefault()
            return true
          }
          if (editor?.isActive('listItem')) {
            event.preventDefault()
            return event.shiftKey
              ? editor.commands.liftListItem('listItem')
              : editor.commands.sinkListItem('listItem')
          }
          if (editor?.isActive('taskItem')) {
            event.preventDefault()
            return event.shiftKey
              ? editor.commands.liftListItem('taskItem')
              : editor.commands.sinkListItem('taskItem')
          }
        }
        return false
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const next = htmlToMarkdown(currentEditor.view.dom as HTMLElement)
      if (next !== lastSerializedRef.current) {
        lastSerializedRef.current = next
        onChange(next)
      }
      detectSlashMenu(currentEditor)
      void resolveDocumentMedia(currentEditor.view.dom as HTMLElement)
    },
    onSelectionUpdate: ({ editor: currentEditor }) => {
      detectSlashMenu(currentEditor)
    },
    onFocus: () => onFocus?.(),
    onBlur: ({ editor: currentEditor }) => {
      const next = htmlToMarkdown(currentEditor.view.dom as HTMLElement)
      if (next !== lastSerializedRef.current) {
        lastSerializedRef.current = next
        onChange(next)
      }
      window.setTimeout(() => {
        const activeElement = document.activeElement
        if (activeElement && wrapperRef.current?.contains(activeElement)) return
        closeMenus()
        onBlur?.()
      }, 0)
    },
  })

  useImperativeHandle(ref, () => ({
    focus: () => {
      editor?.chain().focus('end').run()
    },
  }), [editor])

  useEffect(() => {
    if (!editor) return
    if (value === lastSerializedRef.current) {
      void resolveDocumentMedia(editor.view.dom as HTMLElement)
      return
    }
    editor.commands.setContent(markdownToHtml(value, documents, issues, organizationId), {
      emitUpdate: false,
    })
    lastSerializedRef.current = value
    closeMenus()
    void resolveDocumentMedia(editor.view.dom as HTMLElement)
  }, [documents, editor, issues, organizationId, value])

  useEffect(() => {
    if (!editor) return
    const updateSlashMenu = () => requestAnimationFrame(() => detectSlashMenu(editor))
    editor.on('transaction', updateSlashMenu)
    editor.on('selectionUpdate', updateSlashMenu)
    editor.on('focus', updateSlashMenu)
    return () => {
      editor.off('transaction', updateSlashMenu)
      editor.off('selectionUpdate', updateSlashMenu)
      editor.off('focus', updateSlashMenu)
    }
  }, [editor])

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

  function handleEditorKeyDownCapture(event: KeyboardEvent<HTMLDivElement>) {
    if (!slashMenu) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      event.stopPropagation()
      setSlashIndex((index) => (index + 1) % Math.max(slashCommands.length, 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      setSlashIndex((index) => (index - 1 + Math.max(slashCommands.length, 1)) % Math.max(slashCommands.length, 1))
      return
    }
    if (event.key === 'Enter' && slashCommands.length > 0) {
      event.preventDefault()
      event.stopPropagation()
      void applyCommand(slashCommands[slashIndex] ?? slashCommands[0])
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeMenus()
    }
  }

  function detectSlashMenu(currentEditor: TiptapEditor | null | undefined = editor) {
    if (!currentEditor || currentEditor.isActive('codeBlock')) {
      setSlashMenu(null)
      slashRangeRef.current = null
      return
    }

    const { selection } = currentEditor.state
    if (!selection.empty) {
      setSlashMenu(null)
      slashRangeRef.current = null
      return
    }

    const { $from } = selection
    if (!$from.parent.isTextblock) {
      setSlashMenu(null)
      slashRangeRef.current = null
      return
    }

    const textBefore = $from.parent.textBetween(0, $from.parentOffset, '\n', '\uFFFC')
    const slashIndexInBlock = textBefore.lastIndexOf('/')
    if (slashIndexInBlock < 0) {
      setSlashMenu(null)
      slashRangeRef.current = null
      return
    }

    const before = textBefore[slashIndexInBlock - 1]
    const query = textBefore.slice(slashIndexInBlock + 1)
    if ((before && !/\s/.test(before)) || query.includes('\n') || query.length > 40) {
      setSlashMenu(null)
      slashRangeRef.current = null
      return
    }

    const from = selection.from - (textBefore.length - slashIndexInBlock)
    const to = selection.from
    slashRangeRef.current = { from, to }
    setSlashMenu({ query, position: positionFromEditorPos(currentEditor, to) })
    setSlashIndex(0)
  }

  async function applyCommand(command: SlashCommand) {
    if (!editor) return
    const range = slashRangeRef.current
    if (!range) return
    const position = positionFromEditorPos(editor, range.to)

    if (command.id === 'link-document') {
      editor.chain().focus().deleteRange(range).run()
      linkInsertPosRef.current = range.from
      setLinkSearch({ query: '', position })
      setLinkSearchIndex(0)
      setSlashMenu(null)
      return
    }

    if (command.id === 'link-url') {
      editor.chain().focus().deleteRange(range).run()
      linkInsertPosRef.current = range.from
      setLinkUrl({ url: '', position })
      setSlashMenu(null)
      return
    }

    if (command.id === 'create-child-document') {
      editor.chain().focus().deleteRange(range).run()
      linkInsertPosRef.current = range.from
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

    if (command.id === 'media') {
      editor.chain().focus().deleteRange(range).run()
      mediaInsertPosRef.current = range.from
      setSlashMenu(null)
      requestAnimationFrame(() => mediaInputRef.current?.click())
      return
    }

    if (command.id === 'file') {
      editor.chain().focus().deleteRange(range).run()
      fileInsertPosRef.current = range.from
      setSlashMenu(null)
      requestAnimationFrame(() => fileInputRef.current?.click())
      return
    }

    const chain = editor.chain().focus().deleteRange(range)
    if (command.id === 'heading1') chain.setNode('heading', { level: 1 }).run()
    else if (command.id === 'heading2') chain.setNode('heading', { level: 2 }).run()
    else if (command.id === 'heading3') chain.setNode('heading', { level: 3 }).run()
    else if (command.id === 'bullet') chain.toggleBulletList().run()
    else if (command.id === 'numbered') chain.toggleOrderedList().run()
    else if (command.id === 'checklist') chain.toggleTaskList().run()
    else if (command.id === 'quote') chain.toggleBlockquote().run()
    else if (command.id === 'code') chain.toggleCodeBlock().run()
    else if (command.id === 'collapsible') chain.setDetails().run()

    closeMenus()
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
    if (!editor) return
    const pos = linkInsertPosRef.current ?? editor.state.selection.from
    const text = label.trim() || target.label
    const title = target.type === 'document' ? 'Open document' : target.type === 'issue' ? 'Open issue' : 'Open link'
    const content: JSONContent[] = [
      {
        type: 'text',
        text,
        marks: [{ type: 'link', attrs: { href: target.href, title, class: 'document-link' } }],
      },
      { type: 'text', text: ' ' },
    ]
    editor.chain().focus().insertContentAt(pos, content).run()
    closeMenus()
  }

  async function handleMediaFile(file: File | undefined) {
    if (!file) {
      mediaInsertPosRef.current = null
      return
    }
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
      fileInsertPosRef.current = null
      return
    }
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
        previewUrl?: string
      }
      insertFileAttachment({
        fileName: file.name,
        key: upload.key,
        mimeType: file.type || 'application/octet-stream',
        readUrl: upload.readUrl,
        previewUrl: upload.previewUrl ?? '',
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
    if (!editor) return
    const pos = mediaInsertPosRef.current ?? editor.state.selection.from
    editor.chain().focus().insertContentAt(pos, [
      { type: 'image', attrs: { src: readUrl, alt, title: alt, storageKey: key } },
      { type: 'paragraph' },
    ]).run()
    mediaInsertPosRef.current = null
  }

  function insertFileAttachment({
    fileName,
    key,
    mimeType,
    readUrl,
    previewUrl,
    sizeBytes,
  }: {
    fileName: string
    key: string
    mimeType: string
    readUrl: string
    previewUrl: string
    sizeBytes: number
  }) {
    if (!editor) return
    const pos = fileInsertPosRef.current ?? editor.state.selection.from
    editor.chain().focus().insertContentAt(pos, [
      { type: 'fileAttachment', attrs: { fileName, storageKey: key, mimeType, readUrl, previewUrl, sizeBytes } },
      { type: 'paragraph' },
    ]).run()
    fileInsertPosRef.current = null
  }

  function closeMenus() {
    setSlashMenu(null)
    setLinkSearch(null)
    setLinkUrl(null)
    setLinkLabel(null)
    slashRangeRef.current = null
    linkInsertPosRef.current = null
    mediaInsertPosRef.current = null
    fileInsertPosRef.current = null
  }

  return (
    <div
      ref={wrapperRef}
      className={wrapperClassName}
      onKeyDownCapture={handleEditorKeyDownCapture}
      onKeyUpCapture={(event) => {
        if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) return
        requestAnimationFrame(() => detectSlashMenu())
      }}
      onMouseUpCapture={() => requestAnimationFrame(() => detectSlashMenu())}
    >
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

      <EditorContent editor={editor} />

      {mediaStatus ? (
        <div className="mt-2 font-mono text-[10px] uppercase tracking-label text-fg-4">{mediaStatus}</div>
      ) : null}

      {slashMenu ? (
        <SlashCommandMenu
          commands={slashCommands}
          activeIndex={slashIndex}
          position={slashMenu.position}
          onActiveIndexChange={setSlashIndex}
          onCommand={(command) => void applyCommand(command)}
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
})

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
              {command.hint ? (
                <span className="block truncate font-mono text-[10px] uppercase tracking-label text-fg-4">{command.hint}</span>
              ) : null}
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
    const listItem = parseListLine(line)

    if (line.startsWith('```')) {
      const content: string[] = []
      index += 1
      while (index < lines.length && !lines[index].startsWith('```')) {
        content.push(lines[index])
        index += 1
      }
      html.push(`<pre><code>${escapeHtml(content.join('\n'))}</code></pre>`)
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
      html.push(`<details${open ? ' open' : ''}><summary>${inlineMarkdownToHtml(title, documents, issues, organizationId) || 'Section title'}</summary><div data-type="detailsContent">${contentMarkdown.trim() ? markdownToHtml(contentMarkdown, documents, issues, organizationId) : '<p></p>'}</div></details>`)
    } else if (/^::file\[([^\]]*)]\(([^)]+)\)\{size=(\d+)(?: type=([^}]+))?}$/.test(line)) {
      const [, fileName, src, sizeBytes, mimeType] = line.match(/^::file\[([^\]]*)]\(([^)]+)\)\{size=(\d+)(?: type=([^}]+))?}$/) ?? []
      html.push(fileAttachmentHtml(fileName ?? 'file', src ?? '', Number(sizeBytes ?? 0), mimeType ? decodeURIComponent(mimeType) : 'application/octet-stream'))
    } else if (/^!\[([^\]]*)]\(([^)]+)\)$/.test(line)) {
      const [, alt, src] = line.match(/^!\[([^\]]*)]\(([^)]+)\)$/) ?? []
      html.push(mediaMarkdownToHtml(alt ?? '', src ?? ''))
    } else if (line.startsWith('# ')) html.push(`<h1>${inlineMarkdownToHtml(line.slice(2), documents, issues, organizationId)}</h1>`)
    else if (line.startsWith('## ')) html.push(`<h2>${inlineMarkdownToHtml(line.slice(3), documents, issues, organizationId)}</h2>`)
    else if (line.startsWith('### ')) html.push(`<h3>${inlineMarkdownToHtml(line.slice(4), documents, issues, organizationId)}</h3>`)
    else if (listItem) {
      const result = listLinesToHtml(lines, index, listItem.indent, listItem.kind, documents, issues, organizationId)
      html.push(result.html)
      index = result.nextIndex
      continue
    }
    else if (line.startsWith('> ')) {
      const items: string[] = []
      while (index < lines.length && lines[index].startsWith('> ')) {
        items.push(`<p>${inlineMarkdownToHtml(lines[index].slice(2), documents, issues, organizationId) || '<br>'}</p>`)
        index += 1
      }
      html.push(`<blockquote>${items.join('')}</blockquote>`)
      continue
    }
    else if (line.trim()) html.push(`<p>${inlineMarkdownToHtml(line, documents, issues, organizationId)}</p>`)
    else html.push('<p></p>')
    index += 1
  }
  return html.length > 0 ? html.join('') : '<p></p>'
}

function inlineMarkdownToHtml(value: string, documents: DocumentRow[], issues: IssueRow[], organizationId: string | null | undefined) {
  const escaped = escapeHtml(value)
  return escaped
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, (_match, label: string, href: string) => {
      const parsed = parsePachHref(href)
      const title = parsed?.type === 'document' ? 'Open document' : parsed?.type === 'issue' ? 'Open issue' : 'Open link'
      return `<a href="${escapeAttribute(parsed?.href ?? href)}" title="${title}">${label}</a>`
    })
    .replace(/\[\[([^\]]+)]]/g, (_match, title: string) => {
      const entry = documents.find((doc) =>
        sameOrganization(doc.organizationId, organizationId) &&
        normalizeText(doc.title) === normalizeText(title),
      )
      if (entry) return `<a href="/docs/${entry.id}" title="Open document">${title}</a>`
      const issue = issues.find((item) =>
        sameOrganization(item.contextCompanyId, organizationId) &&
        (normalizeText(item.identifier) === normalizeText(title) || normalizeText(item.title) === normalizeText(title)),
      )
      return issue ? `<a href="/issues/${issue.id}" title="Open issue">${title}</a>` : title
    })
}

function listLinesToHtml(
  lines: string[],
  startIndex: number,
  indent: number,
  kind: 'bullet' | 'ordered' | 'task',
  documents: DocumentRow[],
  issues: IssueRow[],
  organizationId: string | null | undefined,
): { html: string; nextIndex: number } {
  const tag = kind === 'ordered' ? 'ol' : 'ul'
  const attrs = kind === 'task' ? ' data-type="taskList"' : ''
  const items: string[] = []
  let index = startIndex

  while (index < lines.length) {
    const item = parseListLine(lines[index])
    if (!item || item.indent < indent || item.kind !== kind) break

    if (item.indent > indent) {
      if (items.length === 0) break
      const nested = listLinesToHtml(lines, index, item.indent, item.kind, documents, issues, organizationId)
      items[items.length - 1] += nested.html
      index = nested.nextIndex
      continue
    }

    const content = inlineMarkdownToHtml(item.content, documents, issues, organizationId)
    if (kind === 'task') {
      items.push(`<li data-type="taskItem" data-checked="${item.checked ? 'true' : 'false'}"><p>${content || '<br>'}</p>`)
    } else {
      items.push(`<li><p>${content || '<br>'}</p>`)
    }
    index += 1

    while (index < lines.length) {
      const nested = parseListLine(lines[index])
      if (!nested || nested.indent <= indent) break
      const nestedResult = listLinesToHtml(lines, index, nested.indent, nested.kind, documents, issues, organizationId)
      items[items.length - 1] += nestedResult.html
      index = nestedResult.nextIndex
    }

    items[items.length - 1] += '</li>'
  }

  return { html: `<${tag}${attrs}>${items.join('')}</${tag}>`, nextIndex: index }
}

function parseListLine(line: string) {
  const task = line.match(/^(\s*)-\s+\[([ xX])]\s*(.*)$/)
  if (task) {
    return {
      checked: task[2].toLowerCase() === 'x',
      content: task[3] ?? '',
      indent: task[1].replace(/\t/g, '  ').length,
      kind: 'task' as const,
    }
  }
  const bullet = line.match(/^(\s*)[-*]\s+(.*)$/)
  if (bullet) {
    return {
      content: bullet[2] ?? '',
      indent: bullet[1].replace(/\t/g, '  ').length,
      kind: 'bullet' as const,
    }
  }
  const ordered = line.match(/^(\s*)\d+\.\s+(.*)$/)
  if (ordered) {
    return {
      content: ordered[2] ?? '',
      indent: ordered[1].replace(/\t/g, '  ').length,
      kind: 'ordered' as const,
    }
  }
  return null
}

function handleMarkdownEnterShortcut(editor: TiptapEditor) {
  const { selection } = editor.state
  if (!selection.empty) return false
  const { $from } = selection
  if (!$from.parent.isTextblock || editor.isActive('codeBlock')) return false

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, '\n', '\uFFFC')
  const textAfter = $from.parent.textBetween($from.parentOffset, $from.parent.content.size, '\n', '\uFFFC')
  if (textAfter.trim()) return false

  const marker = textBefore.trim()
  const from = selection.from - textBefore.length
  const chain = editor.chain().focus().deleteRange({ from, to: selection.from })
  const checkedTaskMarker = marker.toLowerCase() === '[x]' || marker.toLowerCase() === '- [x]'

  if (marker === '[ ]' || marker.toLowerCase() === '[x]') {
    const converted = chain.toggleTaskList().run()
    if (converted && checkedTaskMarker) editor.commands.updateAttributes('taskItem', { checked: true })
    return converted
  }

  if (marker === '-' || marker === '*') return chain.toggleBulletList().run()
  if (/^\d+\.$/.test(marker)) return chain.toggleOrderedList().run()
  if (marker === '- [ ]' || marker.toLowerCase() === '- [x]') {
    const converted = chain.toggleTaskList().run()
    if (converted && checkedTaskMarker) editor.commands.updateAttributes('taskItem', { checked: true })
    return converted
  }
  if (marker === '#') return chain.setNode('heading', { level: 1 }).run()
  if (marker === '##') return chain.setNode('heading', { level: 2 }).run()
  if (marker === '###') return chain.setNode('heading', { level: 3 }).run()
  if (marker === '>') return chain.toggleBlockquote().run()
  if (marker === '```') return chain.toggleCodeBlock().run()

  return false
}

function handleCodeBlockTab(editor: TiptapEditor, shiftKey: boolean) {
  if (!editor.isActive('codeBlock')) return false

  const { state, view } = editor
  const { selection } = state
  const { $from, $to } = selection

  if ($from.parent.type.name !== 'codeBlock' || $to.parent !== $from.parent) {
    if (shiftKey) return true
    return editor.commands.insertContent('\t')
  }

  const text = $from.parent.textContent
  const parentStart = $from.start()
  const fromOffset = $from.parentOffset
  const toOffset = $to.parentOffset
  const selectionEndOffset = selection.empty ? fromOffset : Math.max(fromOffset, toOffset - 1)
  const firstLineStart = Math.max(0, text.lastIndexOf('\n', Math.max(0, fromOffset - 1)) + 1)
  const lineStarts = [firstLineStart]
  let nextLineBreak = text.indexOf('\n', firstLineStart)

  while (nextLineBreak >= 0 && nextLineBreak < selectionEndOffset) {
    lineStarts.push(nextLineBreak + 1)
    nextLineBreak = text.indexOf('\n', nextLineBreak + 1)
  }

  let tr = state.tr

  for (const offset of [...lineStarts].reverse()) {
    const pos = parentStart + offset
    if (!shiftKey) {
      tr = tr.insertText('\t', pos)
      continue
    }

    if (text.startsWith('\t', offset)) {
      tr = tr.delete(pos, pos + 1)
    } else if (text.startsWith('  ', offset)) {
      tr = tr.delete(pos, pos + 2)
    }
  }

  if (tr.docChanged) view.dispatch(tr.scrollIntoView())
  return true
}

function mediaMarkdownToHtml(alt: string, src: string) {
  if (src.startsWith('s3://')) {
    const key = src.slice('s3://'.length)
    return `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" title="${escapeAttribute(alt || 'image')}" data-storage-key="${escapeAttribute(key)}" />`
  }
  return `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" title="${escapeAttribute(alt || 'image')}" />`
}

function fileAttachmentHtml(fileName: string, src: string, sizeBytes: number, mimeType: string) {
  if (!src.startsWith('s3://')) return escapeHtml(fileName)
  const key = src.slice('s3://'.length)
  return fileAttachmentHtmlFromData({ fileName, key, mimeType, readUrl: '', previewUrl: '', sizeBytes })
}

function htmlToMarkdown(editor: HTMLElement) {
  return Array.from(editor.childNodes)
    .map((node) => nodeToMarkdown(node, 0))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}

function nodeToMarkdown(node: Node, indent: number): string {
  if (node.nodeType === window.Node.TEXT_NODE) return node.textContent ?? ''
  if (!(node instanceof HTMLElement)) return ''

  const attachmentMarkdown = attachmentElementToMarkdown(node)
  if (attachmentMarkdown != null) return attachmentMarkdown

  const mediaMarkdown = mediaElementToMarkdown(node)
  if (mediaMarkdown != null) return mediaMarkdown

  const detailsMarkdown = detailsElementToMarkdown(node)
  if (detailsMarkdown != null) return detailsMarkdown

  const tag = node.tagName.toLowerCase()
  const text = inlineHtmlToMarkdown(node)

  if (tag === 'h1') return `# ${text}`
  if (tag === 'h2') return `## ${text}`
  if (tag === 'h3') return `### ${text}`
  if (tag === 'blockquote') return quoteToMarkdown(node)
  if (tag === 'pre') return `\`\`\`\n${codeBlockText(node).trimEnd()}\n\`\`\``
  if (tag === 'ul' && node.dataset.type === 'taskList') return listToMarkdown(node, indent, 'task')
  if (tag === 'ul') return listToMarkdown(node, indent, 'bullet')
  if (tag === 'ol') return listToMarkdown(node, indent, 'ordered')
  if (tag === 'p') return text
  if (tag === 'br') return ''

  return Array.from(node.childNodes).map((child) => nodeToMarkdown(child, indent)).filter(Boolean).join('\n')
}

function listToMarkdown(list: HTMLElement, indent: number, kind: 'bullet' | 'ordered' | 'task') {
  const listItems = Array.from(list.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName.toLowerCase() === 'li')
  return listItems.map((item, index) => {
    const checked = item.dataset.checked === 'true'
    const marker = kind === 'ordered' ? `${index + 1}. ` : kind === 'task' ? `- [${checked ? 'x' : ' '}] ` : '- '
    const body = listItemMainMarkdown(item)
    const nested = Array.from(item.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement && ['ul', 'ol'].includes(child.tagName.toLowerCase()))
      .map((child) => {
        const childKind = child.tagName.toLowerCase() === 'ol'
          ? 'ordered'
          : child.dataset.type === 'taskList'
            ? 'task'
            : 'bullet'
        return listToMarkdown(child, indent + 2, childKind)
      })
      .filter(Boolean)
      .join('\n')
    const line = `${' '.repeat(indent)}${marker}${body}`
    return nested ? `${line}\n${nested}` : line
  }).join('\n')
}

function listItemMainMarkdown(item: HTMLElement) {
  const chunks: string[] = []
  const isTaskItem = item.parentElement?.matches('ul[data-type="taskList"]') ?? false
  item.childNodes.forEach((child) => {
    if (child instanceof HTMLElement && ['ul', 'ol'].includes(child.tagName.toLowerCase())) return
    if (child instanceof HTMLElement && child.tagName.toLowerCase() === 'label') return
    if (child instanceof HTMLElement && child.tagName.toLowerCase() === 'div' && isTaskItem) {
      chunks.push(Array.from(child.childNodes).map((grandChild) => {
        if (grandChild instanceof HTMLElement && ['ul', 'ol'].includes(grandChild.tagName.toLowerCase())) return ''
        return grandChild instanceof HTMLElement ? inlineHtmlToMarkdown(grandChild) : grandChild.textContent ?? ''
      }).join(''))
      return
    }
    chunks.push(child instanceof HTMLElement ? inlineHtmlToMarkdown(child) : child.textContent ?? '')
  })
  return chunks.join('').replace(/\u00a0/g, ' ').trimEnd()
}

function inlineHtmlToMarkdown(element: HTMLElement) {
  return Array.from(element.childNodes).map((node) => {
    if (node.nodeType === window.Node.TEXT_NODE) return node.textContent ?? ''
    if (!(node instanceof HTMLElement)) return ''
    const tag = node.tagName.toLowerCase()
    const attachmentMarkdown = attachmentElementToMarkdown(node)
    if (attachmentMarkdown != null) return attachmentMarkdown
    const mediaMarkdown = mediaElementToMarkdown(node)
    if (mediaMarkdown != null) return mediaMarkdown
    if (tag === 'a') {
      const label = node.innerText.trim()
      if (!label) return ''
      const href = node.getAttribute('href') ?? ''
      return href ? `[${label}](${href})` : label
    }
    if (tag === 'strong' || tag === 'b') return `**${inlineHtmlToMarkdown(node)}**`
    if (tag === 'em' || tag === 'i') return `*${inlineHtmlToMarkdown(node)}*`
    if (tag === 'code') return `\`${node.innerText}\``
    if (tag === 'br') return ''
    if (['ul', 'ol'].includes(tag)) return ''
    return inlineHtmlToMarkdown(node)
  }).join('').replace(/\u00a0/g, ' ').trimEnd()
}

function detailsElementToMarkdown(element: HTMLElement) {
  const details = element.matches('details,[data-type="details"]')
    ? element
    : null
  if (!(details instanceof HTMLElement)) return null
  const summary = details.querySelector('summary') as HTMLElement | null
  const title = summary ? inlineHtmlToMarkdown(summary).replace(/\n/g, ' ').trim() : 'Section title'
  const contentRoot = details.querySelector('[data-type="detailsContent"]') as HTMLElement | null
  const contentMarkdown = contentRoot
    ? Array.from(contentRoot.childNodes).map((node) => nodeToMarkdown(node, 0)).join('\n').trimEnd()
    : ''
  const open = details.hasAttribute('open') || details.classList.contains('is-open')
  return [`:::toggle ${open ? 'open' : 'closed'}`, title || 'Section title', contentMarkdown, ':::'].join('\n')
}

function quoteToMarkdown(quote: HTMLElement) {
  const children = Array.from(quote.childNodes)
  if (!children.length) return '> '
  return children
    .map((node) => {
      if (node.nodeType === window.Node.TEXT_NODE) return `> ${(node.textContent ?? '').trimEnd()}`
      if (!(node instanceof HTMLElement)) return '> '
      if (node.tagName.toLowerCase() === 'br') return '> '
      return `> ${inlineHtmlToMarkdown(node)}`
    })
    .join('\n')
}

function attachmentElementToMarkdown(element: HTMLElement) {
  const attachment = element.matches('[data-attachment-kind="file"]')
    ? element
    : null
  if (!(attachment instanceof HTMLElement)) return null
  const key = attachment.dataset.storageKey
  if (!key) return ''
  const fileName = attachment.dataset.fileName || attachment.querySelector('[data-attachment-name]')?.textContent || 'file'
  const sizeBytes = Number(attachment.dataset.fileSize ?? 0)
  const mimeType = attachment.dataset.mimeType || 'application/octet-stream'
  return `::file[${escapeMarkdownLabel(fileName)}](s3://${key}){size=${Number.isFinite(sizeBytes) ? sizeBytes : 0} type=${encodeURIComponent(mimeType)}}`
}

function isPdfAttachment(attachment: HTMLElement) {
  const mimeType = attachment.dataset.mimeType?.toLowerCase() ?? ''
  const fileName = attachment.dataset.fileName?.toLowerCase() ?? ''
  return isPdfFile(fileName, mimeType)
}

function attachmentPreviewUrl(attachment: HTMLElement) {
  return attachment.dataset.attachmentPreviewUrl ?? ''
}

function mediaElementToMarkdown(element: HTMLElement) {
  const image = element.matches('img') ? element as HTMLImageElement : null
  if (!(image instanceof HTMLImageElement)) return null
  const alt = image.getAttribute('alt') || image.getAttribute('title') || 'image'
  const key = image.dataset.storageKey
  const src = key ? `s3://${key}` : image.getAttribute('src') ?? ''
  return src ? `![${escapeMarkdownLabel(alt)}](${src})` : ''
}

function codeBlockText(pre: HTMLElement) {
  const code = pre.querySelector('code')
  return (code?.textContent ?? pre.textContent ?? '').replace(/\u00a0/g, ' ')
}

async function resolveDocumentMedia(editor: HTMLElement) {
  const images = Array.from(editor.querySelectorAll('img[data-storage-key]')) as HTMLImageElement[]
  const attachments = Array.from(editor.querySelectorAll('[data-attachment-kind="file"][data-storage-key]')) as HTMLElement[]
  await Promise.all(images.map(async (image) => {
    const key = image.dataset.storageKey
    const src = image.getAttribute('src') ?? ''
    if (!key || (src && !src.startsWith('s3://'))) return
    image.setAttribute('data-media-loading', 'true')
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
      image.removeAttribute('data-media-loading')
    }
  }))
  await Promise.all(attachments.map(async (attachment) => {
    const key = attachment.dataset.storageKey
    const link = attachment.querySelector('[data-attachment-download]') as HTMLAnchorElement | null
    if (!key || (link?.getAttribute('href') && (!isPdfAttachment(attachment) || attachment.dataset.attachmentPreviewUrl))) return
    attachment.setAttribute('data-attachment-loading', 'true')
    try {
      const response = await authFetch(`${config.apiUrl}/media/presign-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          mimeType: attachment.dataset.mimeType || 'application/octet-stream',
          preview: isPdfAttachment(attachment) ? 'inline' : undefined,
        }),
      })
      if (!response.ok) return
      const payload = await response.json() as { readUrl?: string; previewUrl?: string }
      if (payload.readUrl && link) link.href = payload.readUrl
      if (payload.previewUrl) attachment.dataset.attachmentPreviewUrl = payload.previewUrl
    } catch {
      // Leave the attachment visible if a download URL cannot be fetched.
    } finally {
      attachment.removeAttribute('data-attachment-loading')
    }
  }))
}

function positionFromEditorPos(editor: TiptapEditor, pos: number): MenuPosition {
  const coords = editor.view.coordsAtPos(pos)
  const viewportPadding = 12
  const gap = 8
  const preferredHeight = 300
  const availableBelow = window.innerHeight - coords.bottom - viewportPadding - gap
  const availableAbove = coords.top - viewportPadding - gap
  const shouldOpenAbove = availableBelow < preferredHeight && availableAbove > availableBelow
  const availableHeight = shouldOpenAbove ? availableAbove : availableBelow
  const height = Math.max(120, Math.min(preferredHeight, availableHeight))

  return {
    left: Math.min(Math.max(coords.left, 12), Math.max(12, window.innerWidth - 420)),
    top: shouldOpenAbove
      ? Math.max(viewportPadding, coords.top - gap - height)
      : Math.min(coords.bottom + gap, window.innerHeight - viewportPadding - height),
    height,
  }
}

function slashCommandScore(command: SlashCommand, query: string) {
  if (!query) return 0
  const entries = [command.label, ...(command.aliases ?? [])].map((entry) => normalizeText(entry))
  if (entries.some((entry) => entry === query)) return 0
  if (entries.some((entry) => entry.startsWith(query))) return 1
  return 2
}

function fileAttachmentDomSpec({
  fileName,
  key,
  mimeType,
  readUrl,
  previewUrl,
  sizeBytes,
}: {
  fileName: string
  key: string
  mimeType: string
  readUrl: string
  previewUrl: string
  sizeBytes: number
}) {
  const safeName = fileName || 'file'
  const linkAttrs = readUrl
    ? { href: readUrl, download: safeName, target: '_blank', rel: 'noreferrer', title: 'download file', 'data-attachment-download': 'true' }
    : { download: safeName, title: 'download file', 'data-attachment-download': 'true' }
  const isPdf = isPdfFile(safeName, mimeType)
  return [
    'div',
    {
      'data-attachment-kind': 'file',
      'data-storage-key': key,
      'data-file-name': safeName,
      'data-file-size': String(sizeBytes),
      'data-mime-type': mimeType || 'application/octet-stream',
      ...(isPdf ? { 'data-attachment-openable': 'true' } : {}),
      ...(previewUrl ? { 'data-attachment-preview-url': previewUrl } : {}),
      contenteditable: 'false',
      tabindex: '0',
    },
    ['span', { 'data-attachment-icon': 'true' }, fileIconDomSpec()],
    ['span', { 'data-attachment-copy': 'true' },
      ['span', { 'data-attachment-name': 'true' }, safeName],
      ['span', { 'data-attachment-size': 'true' }, formatBytes(sizeBytes)],
    ],
    ['a', linkAttrs, downloadIconDomSpec()],
    ['button', { type: 'button', 'data-attachment-delete': 'true', title: 'delete file' }, trashIconDomSpec()],
  ]
}

function fileAttachmentHtmlFromData({
  fileName,
  key,
  mimeType,
  readUrl,
  previewUrl,
  sizeBytes,
}: {
  fileName: string
  key: string
  mimeType: string
  readUrl: string
  previewUrl: string
  sizeBytes: number
}) {
  const safeName = fileName || 'file'
  const href = readUrl ? ` href="${escapeAttribute(readUrl)}"` : ''
  const openable = isPdfFile(safeName, mimeType) ? ' data-attachment-openable="true"' : ''
  const preview = previewUrl ? ` data-attachment-preview-url="${escapeAttribute(previewUrl)}"` : ''
  return `<div data-attachment-kind="file" data-storage-key="${escapeAttribute(key)}" data-file-name="${escapeAttribute(safeName)}" data-file-size="${String(sizeBytes)}" data-mime-type="${escapeAttribute(mimeType || 'application/octet-stream')}"${openable}${preview} contenteditable="false" tabindex="0"><span data-attachment-icon="true">${fileIconSvg()}</span><span data-attachment-copy="true"><span data-attachment-name="true">${escapeHtml(safeName)}</span><span data-attachment-size="true">${formatBytes(sizeBytes)}</span></span><a data-attachment-download="true"${href} download="${escapeAttribute(safeName)}" target="_blank" rel="noreferrer" title="download file">${downloadIconSvg()}</a><button type="button" data-attachment-delete="true" title="delete file">${trashIconSvg()}</button></div>`
}

function isPdfFile(fileName: string, mimeType: string) {
  return mimeType.toLowerCase() === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')
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

function fileIconDomSpec() {
  return [
    'svg',
    { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    ['path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }],
    ['path', { d: 'M14 2v6h6' }],
  ]
}

function downloadIconDomSpec() {
  return [
    'svg',
    { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    ['path', { d: 'M12 3v12' }],
    ['path', { d: 'm7 10 5 5 5-5' }],
    ['path', { d: 'M5 21h14' }],
  ]
}

function trashIconDomSpec() {
  return [
    'svg',
    { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    ['path', { d: 'M3 6h18' }],
    ['path', { d: 'M8 6V4h8v2' }],
    ['path', { d: 'M19 6l-1 14H6L5 6' }],
    ['path', { d: 'M10 11v5' }],
    ['path', { d: 'M14 11v5' }],
  ]
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
