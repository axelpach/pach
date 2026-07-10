import { randomUUID } from 'node:crypto'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Router } from 'express'
import type { Request } from 'express'
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, type SQL } from 'drizzle-orm'
import {
  activityEvents,
  agentRunInputMedia,
  agentRunInputMediaObjects,
  agentRunProgressReports,
  designAssets,
  agentRuns,
  designSystems,
  designTemplateRuns,
  designTemplateVersions,
  designTemplates,
  documentSnapshots,
  documents,
  finAccounts,
  finCategories,
  finMovements,
  mcpTokens,
  mktContentItems,
  mktDistributionRuns,
  mktEditorialIdeas,
  mktPublicationSlots,
  mktPublications,
  organizations,
  pmIssueLabels,
  pmIssues,
  pmLabels,
  pmProjects,
  pmStatuses,
  pmTeams,
  users,
} from '../../../db/schema.js'
import { getDb } from '../db.js'
import { verifyToken, type JWTPayload } from '../lib/auth.js'
import {
  MCP_CAPABILITIES,
  generateMcpTokenSecret,
  getMcpTokenPrefix,
  hashMcpToken,
  hasMcpCapability,
  type McpAuthContext,
  type McpCapability,
} from '../lib/mcp-token.js'
import { finalizeAgentRunPullRequest } from '../lib/agent-pr-finalizer.js'
import {
  SIGNED_READ_SECONDS as AGENT_INPUT_MEDIA_SIGNED_READ_SECONDS,
  formatAgentInputMediaPrompt,
  hydrateAgentInputMediaAttachment,
} from '../lib/agent-input-media.js'
import {
  createEditorialIdea,
  fulfillPublicationSlot,
  readMarketingCadenceConfig,
} from '../services/marketing-autonomy.js'

const router = Router()
const SIGNED_READ_SECONDS = 60 * 60

let s3Client: S3Client | null = null
const MCP_PROTOCOL_VERSION = '2024-11-05'
const ALLOW_LOCAL_MCP_NO_AUTH =
  process.env.PACH_MCP_ALLOW_LOCAL_NO_AUTH === 'true' ||
  (process.env.NODE_ENV !== 'production' && process.env.PACH_MCP_ALLOW_LOCAL_NO_AUTH !== 'false')
const DOCUMENT_FORMAT_VERSION = 'pach-markdown-v1'
const DOCUMENT_FORMAT_INSTRUCTIONS = [
  'Documents use Markdown with Pach extensions. Keep output as plain document body text, not JSON, unless a tool asks for JSON arguments.',
  'Supported blocks: paragraphs, #/##/### headings, unordered lists with "- item", ordered lists with "1. item", checklist items with "- [ ] item" or "- [x] item", blockquotes with "> quote", fenced code blocks with triple backticks, images with "![alt](url)", file blocks as "::file[name](url){size=123 type=application%2Fpdf}", and collapsible sections as ":::toggle", title line, body lines, then ":::".',
  'Use source material as visible source blocks inside the document for now. Recommended source block: ":::toggle", then "Source: Title", notes/url/excerpt, then ":::" so humans and agents can inspect it.',
  'For article drafts, prefer this order: brief/context, sources, outline, draft. The final publishable body can later be copied or cleaned from the same document.',
].join(' ')
const LOCAL_MCP_USER: JWTPayload = {
  sub: 'local-mcp',
  email: 'local-mcp@pach.dev',
  name: 'Local MCP',
  canAccessUnscoped: true,
  organizationIds: [],
}

type JsonRpcId = string | number | null

type JsonRpcRequest = {
  jsonrpc?: '2.0'
  id?: JsonRpcId
  method?: string
  params?: unknown
}

type ToolDefinition = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

type ToolCallParams = {
  name?: unknown
  arguments?: unknown
}

type AuthenticatedRequest = Request & {
  user?: JWTPayload
  mcpAuth?: McpAuthContext
}

router.use(async (req: AuthenticatedRequest, res, next) => {
  const authHeader = req.headers.authorization

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const jwtUser = readJwtUser(token)

    if (jwtUser) {
      const user = jwtUser
      req.user = { ...user, organizationIds: user.organizationIds ?? [] }
      req.mcpAuth = {
        kind: 'jwt',
        subjectId: user.sub,
        actorUserId: user.sub,
        actorName: user.name ?? user.email,
        allOrganizations: false,
        canAccessUnscoped: user.canAccessUnscoped,
        organizationIds: user.organizationIds ?? [],
        capabilities: ['*'],
      }
      next()
      return
    }

    const mcpAuth = await readMcpTokenAuth(token)
    if (mcpAuth) {
      req.mcpAuth = mcpAuth
      next()
      return
    }

    res.status(401).json({ error: 'Invalid or expired MCP token' })
    return
  }

  if (ALLOW_LOCAL_MCP_NO_AUTH && isLocalRequest(req)) {
    req.user = LOCAL_MCP_USER
    req.mcpAuth = {
      kind: 'local',
      subjectId: LOCAL_MCP_USER.sub,
      actorName: LOCAL_MCP_USER.name ?? LOCAL_MCP_USER.email,
      allOrganizations: true,
      canAccessUnscoped: true,
      organizationIds: [],
      capabilities: ['*'],
    }
    next()
    return
  }

  res.status(401).json({ error: 'MCP auth required' })
})

const tools: ToolDefinition[] = [
  {
    name: 'pach.issue.get',
    description: 'Read a Pach issue with human-readable context, team, organization, project, status, assignee, labels, recent activity, and recent agent runs.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['issueId'],
      properties: {
        issueId: {
          type: 'string',
          description: 'UUID or human-readable identifier of the Pach issue to read, e.g. PAC-11.',
        },
      },
    },
  },
  {
    name: 'pach.issue.list',
    description: 'List Pach issues the caller can access, with readable filters for organization, team, project, status, assignee, labels, priority, and search.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of issues to return. Defaults to 25, maximum 100.',
        },
        search: {
          type: 'string',
          description: 'Optional case-insensitive search across identifier, title, and description.',
        },
        organizationId: {
          type: 'string',
          description: 'Optional organization UUID filter.',
        },
        organizationName: {
          type: 'string',
          description: 'Optional organization display name filter, e.g. "Pach".',
        },
        organizationProject: {
          type: 'string',
          description: 'Optional organization project key filter, e.g. "pach" or "ardia".',
        },
        teamKey: {
          type: 'string',
          description: 'Optional team key filter, e.g. "PRD" or "OPS".',
        },
        teamName: {
          type: 'string',
          description: 'Optional team name filter, e.g. "product".',
        },
        projectSlug: {
          type: 'string',
          description: 'Optional project slug filter.',
        },
        projectName: {
          type: 'string',
          description: 'Optional project name filter.',
        },
        statusIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional status UUID filters.',
        },
        statusKeys: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional status key filters, e.g. ["todo", "blocked", "done"].',
        },
        statusNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional status display name filters, e.g. ["Todo", "Done"].',
        },
        statusTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional status type filter, e.g. ["backlog", "unstarted", "started", "blocked", "review"].',
        },
        assigneeName: {
          type: 'string',
          description: 'Optional assignee name or email filter.',
        },
        labelNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional label name filters. An issue must have at least one listed label.',
        },
        priorities: {
          type: 'array',
          items: { type: 'number' },
          description: 'Optional numeric priority filters: 1 urgent, 2 high, 3 medium, 4 low, 0 none.',
        },
        activityLimit: {
          type: 'number',
          description: 'Recent activity entries per issue. Defaults to 3, maximum 10.',
        },
        runLimit: {
          type: 'number',
          description: 'Recent agent runs per issue. Defaults to 2, maximum 5.',
        },
      },
    },
  },
  {
    name: 'pach.issue.update',
    description: 'Update editable fields on a Pach issue and append an activity entry for the agent action.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['issueId'],
      properties: {
        issueId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        statusId: { type: 'string' },
        statusKey: { type: 'string', description: 'Optional status key such as in_review. Used when statusId is omitted.' },
        statusType: { type: 'string', description: 'Optional status type such as review. Used when statusId and statusKey are omitted.' },
        priority: { type: 'number' },
        estimate: { type: ['number', 'null'] },
        blockedReason: { type: ['string', 'null'] },
        activitySummary: {
          type: 'string',
          description: 'Optional human-readable summary to show in the issue activity feed.',
        },
      },
    },
  },
  {
    name: 'pach.activity.list',
    description: 'List recent Pach activity events the caller can access, with filters for organization, origin, kind, actor, source, subject type, event type, severity, and search.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'number', description: 'Maximum number of events. Defaults to 25, maximum 100.' },
        search: { type: 'string', description: 'Optional search across summary, subject label, actor, source, and event type.' },
        organizationId: { type: 'string' },
        organizationName: { type: 'string' },
        organizationProject: { type: 'string' },
        actorName: { type: 'string' },
        source: { type: 'string' },
        origin: { type: 'string', description: 'pach_work, organization_work, or organization_user_work.' },
        activityKind: { type: 'string', description: 'progress, business_signal, operational, or incident.' },
        subjectType: { type: 'string' },
        eventType: { type: 'string' },
        severity: { type: 'string' },
      },
    },
  },
  {
    name: 'pach.activity.record',
    description: 'Record a Pach activity event for an organization. Use actorName for who did it and source for the technical origin.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['eventType', 'subjectType', 'summary'],
      properties: {
        organizationId: { type: 'string' },
        organizationName: { type: 'string' },
        organizationProject: { type: 'string' },
        occurredAt: { type: 'string', description: 'Optional ISO timestamp.' },
        eventType: { type: 'string' },
        activityKind: { type: 'string', description: 'progress, business_signal, operational, or incident. Defaults to operational.' },
        origin: { type: 'string', description: 'pach_work, organization_work, or organization_user_work. Defaults to pach_work.' },
        subjectType: { type: 'string' },
        subjectId: { type: 'string' },
        subject: { type: 'string', description: 'Human-readable subject for the event. Stored as subjectLabel.' },
        subjectLabel: { type: 'string' },
        actorType: { type: 'string' },
        actorId: { type: 'string' },
        actorName: { type: 'string' },
        source: { type: 'string' },
        severity: { type: 'string' },
        summary: { type: 'string' },
        details: { type: 'object', additionalProperties: true },
        metadata: { type: 'object', additionalProperties: true },
      },
    },
  },
  {
    name: 'pach.finance.movement.list',
    description: 'List finance movements for one accessible organization, with account and category context for analysis.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        organizationId: {
          type: 'string',
          description: 'Optional organization UUID filter. Required unless the MCP token is bound to exactly one organization or another organization selector is provided.',
        },
        organizationName: {
          type: 'string',
          description: 'Optional organization display name filter.',
        },
        organizationProject: {
          type: 'string',
          description: 'Optional organization project key filter, e.g. "pach" or "ardia".',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of movements. Defaults to 100, maximum 500.',
        },
        accountId: {
          type: 'string',
          description: 'Optional account UUID filter.',
        },
        categoryId: {
          type: 'string',
          description: 'Optional category UUID filter. Use "uncategorized" to return movements without a category.',
        },
        type: {
          type: 'string',
          description: 'Optional movement type filter: income, expense, transfer, or adjustment.',
        },
        status: {
          type: 'string',
          description: 'Optional movement status filter: pending_review, reviewed, or ignored.',
        },
        currencyCode: {
          type: 'string',
          description: 'Optional currency code filter, e.g. MXN or USD.',
        },
        startDate: {
          type: 'string',
          description: 'Optional inclusive transaction date lower bound in YYYY-MM-DD format.',
        },
        endDate: {
          type: 'string',
          description: 'Optional inclusive transaction date upper bound in YYYY-MM-DD format.',
        },
        search: {
          type: 'string',
          description: 'Optional case-insensitive search across description, merchant, and counterparty.',
        },
      },
    },
  },
  {
    name: 'pach.document.list',
    description: 'List Pach documents the caller can access, with filters for organization, status, parent, and search. Returns document metadata and body previews.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of documents to return. Defaults to 25, maximum 100.',
        },
        search: {
          type: 'string',
          description: 'Optional case-insensitive search across title, slug, and body.',
        },
        organizationId: {
          type: 'string',
          description: 'Optional organization UUID filter.',
        },
        organizationName: {
          type: 'string',
          description: 'Optional organization display name filter, e.g. "Pach".',
        },
        organizationProject: {
          type: 'string',
          description: 'Optional organization project key filter, e.g. "pach" or "ardia".',
        },
        parentId: {
          type: ['string', 'null'],
          description: 'Optional parent document UUID filter. Use null with rootOnly=true to list root documents.',
        },
        rootOnly: {
          type: 'boolean',
          description: 'When true, only return documents without a parent.',
        },
        status: {
          type: 'string',
          description: 'Document status to return. Defaults to active. Use archived to list archived documents.',
        },
        includeArchived: {
          type: 'boolean',
          description: 'When true and status is omitted, return both active and archived documents.',
        },
        bodyPreviewLength: {
          type: 'number',
          description: 'Maximum body preview characters per document. Defaults to 240, maximum 2000.',
        },
      },
    },
  },
  {
    name: 'pach.document.get',
    description: 'Read a Pach document by UUID, public id, or slug, including its full body, organization, owner, parent, children, and Pach markdown format instructions.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        documentId: {
          type: 'string',
          description: 'Document UUID. Either documentId or slug is required.',
        },
        slug: {
          type: 'string',
          description: 'Document slug. Either documentId or slug is required.',
        },
        publicId: {
          type: 'string',
          description: 'Human-readable document id, e.g. ARD-DOC-1.',
        },
        organizationId: {
          type: 'string',
          description: 'Optional organization UUID filter, useful when reading by slug.',
        },
        organizationName: {
          type: 'string',
          description: 'Optional organization display name filter, useful when reading by slug.',
        },
        organizationProject: {
          type: 'string',
          description: 'Optional organization project key filter, useful when reading by slug.',
        },
        includeArchived: {
          type: 'boolean',
          description: 'When true, archived documents may be returned. Defaults to false.',
        },
      },
    },
  },
  {
    name: 'pach.document.format.get',
    description: 'Return the expected Pach document body format so an agent can write valid document content for the editor, blog, and email renderers.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: 'pach.document.create',
    description: 'Create a Pach document and its first main version. Body must use the Pach markdown format returned by pach.document.format.get.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['title'],
      properties: {
        title: { type: 'string' },
        body: { type: 'string', description: 'Pach markdown body.' },
        organizationId: { type: 'string' },
        organizationName: { type: 'string' },
        organizationProject: { type: 'string', description: 'Project key such as ardia.' },
        parentId: { type: 'string' },
        slug: { type: 'string' },
        publicId: { type: 'string', description: 'Optional human-readable id. Defaults to ORG-DOC-N.' },
        icon: { type: 'string' },
        metadata: { type: 'object', additionalProperties: true },
        runId: { type: 'string', description: 'Optional agent run id that created the draft.' },
      },
    },
  },
  {
    name: 'pach.document.update',
    description: 'Create a new version candidate for a Pach document by default. Use for agent-authored edits that humans should review. Does not change live content unless makeMain is true.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        documentId: { type: 'string' },
        publicId: { type: 'string' },
        slug: { type: 'string' },
        organizationId: { type: 'string' },
        organizationName: { type: 'string' },
        organizationProject: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string', description: 'Full replacement Pach markdown body.' },
        appendBody: { type: 'string', description: 'Pach markdown to append to the existing body.' },
        metadata: { type: 'object', additionalProperties: true },
        createSnapshot: { type: 'boolean', description: 'Defaults to true. When false, updates live content directly.' },
        makeMain: { type: 'boolean', description: 'When true, the new version is immediately made live/main. Defaults to false.' },
        snapshotStatus: { type: 'string', description: 'Deprecated compatibility field. Ignored by the version workflow.' },
        runId: { type: 'string', description: 'Optional agent run id that produced the edit.' },
      },
    },
  },
  {
    name: 'pach.document.snapshot.list',
    description: 'List saved versions for a Pach document.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        documentId: { type: 'string' },
        publicId: { type: 'string' },
        slug: { type: 'string' },
        organizationId: { type: 'string' },
        organizationName: { type: 'string' },
        organizationProject: { type: 'string' },
        limit: { type: 'number', description: 'Defaults to 20, maximum 100.' },
      },
    },
  },
  {
    name: 'pach.document.snapshot.create',
    description: 'Create a saved version from the current live document state without otherwise editing the document.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        documentId: { type: 'string' },
        publicId: { type: 'string' },
        slug: { type: 'string' },
        organizationId: { type: 'string' },
        organizationName: { type: 'string' },
        organizationProject: { type: 'string' },
        status: { type: 'string', description: 'Deprecated compatibility field. Defaults to version.' },
        runId: { type: 'string' },
        metadata: { type: 'object', additionalProperties: true },
      },
    },
  },
  {
    name: 'pach.document.snapshot.approve',
    description: 'Make a saved document version the live/main document. Compatibility alias for the old approve action.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        snapshotId: { type: 'string' },
        documentId: { type: 'string' },
        publicId: { type: 'string' },
        versionNumber: { type: 'number' },
      },
    },
  },
  {
    name: 'pach.document.snapshot.restore',
    description: 'Make a saved document version the live/main document. Compatibility alias for the old restore action.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        snapshotId: { type: 'string' },
        documentId: { type: 'string' },
        publicId: { type: 'string' },
        versionNumber: { type: 'number' },
      },
    },
  },
  {
    name: 'pach.editorial.profile.get',
    description: 'Read the effective editorial profile for an organization and optionally a marketing publication. Publication profile overrides organization profile. For newsletter/article work, prefer publication-scoped newsletterGuidelines when available.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        organizationId: { type: 'string' },
        organizationName: { type: 'string' },
        organizationProject: { type: 'string' },
        publicationId: { type: 'string' },
        publicationSlug: { type: 'string' },
      },
    },
  },
  {
    name: 'pach.editorial.profile.update',
    description: 'Update organization-level or publication-level editorial profile JSON. Use concise structured fields such as tone, audience, newsletterGuidelines, constraints, forbiddenPhrases, and exampleDocumentIds.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['profile'],
      properties: {
        organizationId: { type: 'string' },
        organizationName: { type: 'string' },
        organizationProject: { type: 'string' },
        publicationId: { type: 'string' },
        publicationSlug: { type: 'string' },
        profile: { type: 'object', additionalProperties: true },
        merge: { type: 'boolean', description: 'Defaults to true. When false, replaces the profile.' },
      },
    },
  },
  {
    name: 'pach.marketing.idea.list',
    description: 'List newsletter editorial ideas for an accessible marketing publication. Use this before drafting so already-used ideas are not repeated.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        organizationId: { type: 'string' },
        organizationName: { type: 'string' },
        organizationProject: { type: 'string' },
        publicationId: { type: 'string' },
        publicationSlug: { type: 'string' },
        statuses: { type: 'array', items: { type: 'string' }, description: 'Defaults to available and reserved.' },
        limit: { type: 'number', description: 'Defaults to 25, maximum 100.' },
      },
    },
  },
  {
    name: 'pach.marketing.idea.create',
    description: 'Create a deduped newsletter editorial idea for a publication. If the dedupe key already exists, returns the existing idea.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['publicationId', 'title'],
      properties: {
        organizationId: { type: 'string' },
        publicationId: { type: 'string' },
        title: { type: 'string' },
        angle: { type: 'string' },
        sourceNotes: { type: 'string' },
        dedupeKey: { type: 'string' },
        status: { type: 'string', description: 'Defaults to available.' },
        priority: { type: 'number' },
        runId: { type: 'string', description: 'Optional agent run id creating the idea.' },
        metadata: { type: 'object', additionalProperties: true },
      },
    },
  },
  {
    name: 'pach.marketing.slot.get',
    description: 'Read one autonomous newsletter publication slot with publication, idea, document, content item, distribution run, and available ideas.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['slotId'],
      properties: {
        slotId: { type: 'string' },
        availableIdeaLimit: { type: 'number', description: 'Defaults to 10, maximum 50.' },
      },
    },
  },
  {
    name: 'pach.marketing.slot.list',
    description: 'List autonomous newsletter slots for an accessible publication or organization.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        organizationId: { type: 'string' },
        organizationName: { type: 'string' },
        organizationProject: { type: 'string' },
        publicationId: { type: 'string' },
        publicationSlug: { type: 'string' },
        statuses: { type: 'array', items: { type: 'string' } },
        limit: { type: 'number', description: 'Defaults to 25, maximum 100.' },
      },
    },
  },
  {
    name: 'pach.marketing.slot.fulfill',
    description: 'Convert a source document into newsletter content, create or update the scheduled broadcast for a slot, link idea/document/content/run, and mark the slot scheduled. This is the safe way for editorial agents to schedule autonomous newsletters.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['slotId', 'documentId'],
      properties: {
        slotId: { type: 'string' },
        documentId: { type: 'string' },
        ideaId: { type: 'string' },
        runId: { type: 'string', description: 'Agent run id fulfilling the slot.' },
        subject: { type: 'string' },
        preheader: { type: 'string' },
        metadata: { type: 'object', additionalProperties: true },
      },
    },
  },
  {
    name: 'pach.design.template.list',
    description: 'List design templates the caller can access, including code-bundle metadata and current version ids.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        organizationId: { type: 'string' },
        organizationProject: { type: 'string' },
        type: { type: 'string', description: 'Template type, e.g. deck.' },
        limit: { type: 'number', description: 'Maximum number of templates. Defaults to 25, maximum 100.' },
      },
    },
  },
  {
    name: 'pach.design.template.get',
    description: 'Read one design template with its recent versions and queued edit runs.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        templateId: { type: 'string' },
        slug: { type: 'string' },
        designSystemId: { type: 'string', description: 'Optional selected design system. If omitted, no organization design system context is returned.' },
      },
    },
  },
  {
    name: 'pach.design.template.version.create',
    description: 'Create a new code-bundle version for a design template and make it the current version.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['templateId', 'files'],
      properties: {
        templateId: { type: 'string' },
        files: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Virtual source files keyed by path, e.g. src/Template.tsx.',
        },
        manifest: { type: 'object', additionalProperties: true },
        dependencies: {
          type: 'object',
          additionalProperties: { type: 'string' },
        },
        sourceKind: { type: 'string', description: 'react, html, or structured. Defaults to react.' },
        compiledArtifactUrl: { type: 'string' },
        previewImageUrl: { type: 'string' },
        validationStatus: { type: 'string', description: 'draft, valid, invalid, or compiled.' },
        validationErrors: { type: 'array', items: { type: 'object', additionalProperties: true } },
        runId: { type: 'string', description: 'Optional design template run id that produced this version.' },
      },
    },
  },
  {
    name: 'pach.progress.report',
    description: 'Report structured agent progress for any agent run. With runId, Pach stores run-scoped progress and updates run metadata. Without runId, issueId is required and Pach records issue activity.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['phase'],
      properties: {
        issueId: { type: 'string', description: 'Optional issue id for legacy issue activity or issue-scoped progress.' },
        runId: { type: 'string', description: 'Agent run id. Preferred for all workers, including design runs.' },
        phase: {
          type: 'string',
          description: 'Short machine-friendly phase, such as reading_issue, drafting, testing, blocked, review_ready.',
        },
        message: {
          type: 'string',
          description: 'Short human-readable progress message.',
        },
        percent: {
          type: 'number',
          description: 'Optional progress percentage from 0 to 100.',
        },
        level: {
          type: 'string',
          description: 'Optional severity level: debug, info, warn, or error.',
        },
        metadata: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
  },
  {
    name: 'pach.agent_run.input_media.list',
    description: 'List user-provided input media for an agent run and return fresh signed read URLs. Use this if an attached screenshot/file URL has expired or is inaccessible.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['runId'],
      properties: {
        runId: {
          type: 'string',
          description: 'Agent run UUID.',
        },
        messageId: {
          type: 'string',
          description: 'Optional feedback message UUID to limit results to one follow-up message.',
        },
      },
    },
  },
  {
    name: 'pach.github.pull_request.create',
    description: 'Finalize the working branch for an agent run using Pach-held GitHub credentials, then create or reuse a ready-for-review GitHub pull request.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['runId'],
      properties: {
        runId: { type: 'string', description: 'Agent run id whose prepared workspace/branch should be finalized.' },
        title: { type: 'string', description: 'Optional PR title. Defaults to the linked issue title or branch name.' },
      },
    },
  },
]

router.get('/', (_req, res) => {
  res.json({
    ok: true,
    name: 'pach-mcp',
    protocol: MCP_PROTOCOL_VERSION,
    endpoint: '/mcp',
    auth: ALLOW_LOCAL_MCP_NO_AUTH
      ? 'Bearer token, or unauthenticated loopback request for local development'
      : 'Bearer token',
    tools: tools.map((tool) => tool.name),
  })
})

router.post('/tokens', async (req: AuthenticatedRequest, res) => {
  try {
    const auth = req.mcpAuth
    const user = req.user

    if (!auth || !user || (auth.kind !== 'jwt' && auth.kind !== 'local') || !auth.canAccessUnscoped) {
      res.status(403).json({ error: 'Only a workspace admin Pach session can create MCP tokens.' })
      return
    }

    const body = ensureObject(req.body ?? {})
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Pach MCP token'
    const capabilities = readCapabilities(body.capabilities)
    const allOrganizations = typeof body.allOrganizations === 'boolean' ? body.allOrganizations : false
    const canAccessUnscoped = typeof body.canAccessUnscoped === 'boolean' ? body.canAccessUnscoped : false
    const organizationIds = allOrganizations ? [] : readStringArray(body.organizationIds)
    const expiresDays = typeof body.expiresDays === 'number' ? body.expiresDays : null

    if (!allOrganizations && organizationIds.length === 0) {
      res.status(400).json({ error: 'Set allOrganizations=true or provide organizationIds.' })
      return
    }

    if (expiresDays != null && (!Number.isFinite(expiresDays) || expiresDays <= 0)) {
      res.status(400).json({ error: 'expiresDays must be a positive number.' })
      return
    }

    const secret = generateMcpTokenSecret()
    const now = new Date()
    const [token] = await getDb()
      .insert(mcpTokens)
      .values({
        name,
        tokenPrefix: getMcpTokenPrefix(secret),
        tokenHash: hashMcpToken(secret),
        ownerUserId: isUuid(user.sub) ? user.sub : undefined,
        allOrganizations,
        canAccessUnscoped,
        organizationIds,
        capabilities,
        expiresAt: expiresDays == null ? null : new Date(now.getTime() + expiresDays * 24 * 60 * 60 * 1000),
        metadata: {
          createdVia: '/mcp/tokens',
          createdBy: user.email,
        },
      })
      .returning({
        id: mcpTokens.id,
        name: mcpTokens.name,
        tokenPrefix: mcpTokens.tokenPrefix,
        allOrganizations: mcpTokens.allOrganizations,
        canAccessUnscoped: mcpTokens.canAccessUnscoped,
        organizationIds: mcpTokens.organizationIds,
        capabilities: mcpTokens.capabilities,
        expiresAt: mcpTokens.expiresAt,
        createdAt: mcpTokens.createdAt,
      })

    res.json({
      ok: true,
      token,
      secret,
      env: `export PACH_MCP_TOKEN="${secret}"`,
      codexConfig: {
        mcp_servers: {
          pach: {
            url: `${req.protocol}://${req.get('host')}/mcp`,
            bearer_token_env_var: 'PACH_MCP_TOKEN',
          },
        },
      },
      warning: 'Copy secret now. Only its hash is stored and it cannot be shown again.',
    })
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create MCP token',
    })
  }
})

router.post('/', async (req, res) => {
  const payload = req.body

  if (Array.isArray(payload)) {
    const responses = []
    for (const request of payload) {
      const response = await handleJsonRpcRequest(req, request)
      if (response) responses.push(response)
    }
    if (responses.length === 0) {
      res.status(204).end()
      return
    }
    res.json(responses)
    return
  }

  const response = await handleJsonRpcRequest(req, payload)
  if (!response) {
    res.status(204).end()
    return
  }
  res.json(response)
})

async function handleJsonRpcRequest(req: AuthenticatedRequest, raw: unknown) {
  if (!isObject(raw)) {
    return jsonRpcError(null, -32600, 'Invalid Request')
  }

  const request = raw as JsonRpcRequest
  const id = request.id ?? null

  if (typeof request.method !== 'string') {
    return jsonRpcError(id, -32600, 'Invalid Request')
  }

  try {
    switch (request.method) {
      case 'initialize':
        return jsonRpcResult(id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'pach-mcp',
            version: '0.1.0',
          },
          instructions: [
            'Use Pach tools to read and update Pach state for authorized work only.',
            'Report progress before and after meaningful steps so the Pach web app can show live agent status.',
            DOCUMENT_FORMAT_INSTRUCTIONS,
            'Do not send external messages, publish content, or merge pull requests. For code runs, use pach.github.pull_request.create only when the run instructions ask Pach to finalize a branch.',
          ].join(' '),
        })

      case 'notifications/initialized':
        return null

      case 'ping':
        return jsonRpcResult(id, {})

      case 'tools/list':
        return jsonRpcResult(id, { tools })

      case 'tools/call':
        return jsonRpcResult(id, await callTool(req, request.params))

      default:
        return jsonRpcError(id, -32601, `Method not found: ${request.method}`)
    }
  } catch (error) {
    return jsonRpcError(id, -32000, error instanceof Error ? error.message : 'Unknown MCP server error')
  }
}

async function callTool(req: AuthenticatedRequest, params: unknown) {
  if (!isObject(params)) {
    throw new Error('tools/call params must be an object')
  }

  const { name, arguments: args } = params as ToolCallParams
  if (typeof name !== 'string') {
    throw new Error('tools/call params.name must be a string')
  }

  try {
    switch (name) {
      case 'pach.issue.get':
        requireMcpCapability(req, 'pach.issue.read')
        return toolResult(await getIssue(req, args))
      case 'pach.issue.list':
        requireMcpCapability(req, 'pach.issue.read')
        return toolResult(await listIssues(req, args))
      case 'pach.issue.update':
        requireMcpCapability(req, 'pach.issue.write')
        return toolResult(await updateIssue(req, args))
      case 'pach.activity.list':
        requireMcpCapability(req, 'pach.activity.read')
        return toolResult(await listActivityEvents(req, args))
      case 'pach.activity.record':
        requireMcpCapability(req, 'pach.activity.write')
        return toolResult(await recordActivityEvent(req, args))
      case 'pach.finance.movement.list':
        requireMcpCapability(req, 'pach.finance.read')
        return toolResult(await listFinanceMovements(req, args))
      case 'pach.document.list':
        requireMcpCapability(req, 'pach.document.read')
        return toolResult(await listDocuments(req, args))
      case 'pach.document.get':
        requireMcpCapability(req, 'pach.document.read')
        return toolResult(await getDocument(req, args))
      case 'pach.document.format.get':
        requireMcpCapability(req, 'pach.document.read')
        return toolResult(documentFormatContract())
      case 'pach.document.create':
        requireMcpCapability(req, 'pach.document.write')
        return toolResult(await createDocument(req, args))
      case 'pach.document.update':
        requireMcpCapability(req, 'pach.document.write')
        return toolResult(await updateDocument(req, args))
      case 'pach.document.snapshot.list':
        requireMcpCapability(req, 'pach.document.read')
        return toolResult(await listDocumentSnapshots(req, args))
      case 'pach.document.snapshot.create':
        requireMcpCapability(req, 'pach.document.write')
        return toolResult(await createDocumentSnapshot(req, args))
      case 'pach.document.snapshot.approve':
        requireMcpCapability(req, 'pach.document.write')
        return toolResult(await approveDocumentSnapshot(req, args))
      case 'pach.document.snapshot.restore':
        requireMcpCapability(req, 'pach.document.write')
        return toolResult(await restoreDocumentSnapshot(req, args))
      case 'pach.editorial.profile.get':
        requireMcpCapability(req, 'pach.document.read')
        return toolResult(await getEditorialProfile(req, args))
      case 'pach.editorial.profile.update':
        requireMcpCapability(req, 'pach.document.write')
        return toolResult(await updateEditorialProfile(req, args))
      case 'pach.marketing.idea.list':
        requireMcpCapability(req, 'pach.marketing.read')
        return toolResult(await listMarketingIdeas(req, args))
      case 'pach.marketing.idea.create':
        requireMcpCapability(req, 'pach.marketing.write')
        return toolResult(await createMarketingIdea(req, args))
      case 'pach.marketing.slot.get':
        requireMcpCapability(req, 'pach.marketing.read')
        return toolResult(await getMarketingSlot(req, args))
      case 'pach.marketing.slot.list':
        requireMcpCapability(req, 'pach.marketing.read')
        return toolResult(await listMarketingSlots(req, args))
      case 'pach.marketing.slot.fulfill':
        requireMcpCapability(req, 'pach.marketing.write')
        return toolResult(await fulfillMarketingSlot(req, args))
      case 'pach.design.template.list':
        requireMcpCapability(req, 'pach.design.read')
        return toolResult(await listDesignTemplates(req, args))
      case 'pach.design.template.get':
        requireMcpCapability(req, 'pach.design.read')
        return toolResult(await getDesignTemplate(req, args))
      case 'pach.design.template.version.create':
        requireMcpCapability(req, 'pach.design.write')
        return toolResult(await createDesignTemplateVersion(req, args))
      case 'pach.progress.report':
        requireMcpCapability(req, 'pach.progress.report')
        return toolResult(await reportProgress(req, args))
      case 'pach.agent_run.input_media.list':
        requireMcpCapability(req, 'pach.issue.read')
        return toolResult(await listAgentRunInputMedia(req, args))
      case 'pach.github.pull_request.create':
        requireMcpCapability(req, 'pach.progress.report')
        return toolResult(await createGithubPullRequestForRun(req, args))
      default:
        return toolError(`Unknown tool: ${name}`)
    }
  } catch (error) {
    return toolError(error instanceof Error ? error.message : 'Unknown tool error')
  }
}

async function listIssues(req: AuthenticatedRequest, args: unknown) {
  const body = isObject(args) ? args : {}
  const limit = readPositiveInteger(body.limit, 25, 1, 100)
  const activityLimit = readPositiveInteger(body.activityLimit, 3, 0, 10)
  const runLimit = readPositiveInteger(body.runLimit, 2, 0, 5)
  const search = readOptionalString(body.search)
  const organizationIds = readStringFilters(body.organizationId, body.organizationIds)
  const organizationNames = readStringFilters(body.organizationName, body.organizationNames)
  const organizationProjects = readStringFilters(body.organizationProject, body.organizationProjects)
  const teamKeys = readStringFilters(body.teamKey, body.teamKeys)
  const teamNames = readStringFilters(body.teamName, body.teamNames)
  const projectSlugs = readStringFilters(body.projectSlug, body.projectSlugs)
  const projectNames = readStringFilters(body.projectName, body.projectNames)
  const statusIdsFilter = readStringFilters(body.statusId, body.statusIds)
  const statusKeys = readStringFilters(body.statusKey, body.statusKeys)
  const statusNames = readStringFilters(body.statusName, body.statusNames)
  const statusTypes = readStringArray(body.statusTypes)
  const assigneeFilters = readStringFilters(body.assigneeName, body.assigneeEmail, body.assignee)
  const labelNameFilters = readStringFilters(body.labelName, body.labelNames)
  const priorities = readNumberArray(body.priorities)
  const db = getDb()
  const scanLimit = Math.max(200, Math.min(1000, limit * 20))
  const rows = await db
    .select()
    .from(pmIssues)
    .orderBy(desc(pmIssues.createdAt))
    .limit(scanLimit)

  const accessibleRows = rows
    .filter((issue) => canAccessIssue(req, issue))

  const accessibleIssueIds = uniqueStrings(accessibleRows.map((issue) => issue.id))
  const accessibleTeamIds = uniqueStrings(accessibleRows.map((issue) => issue.teamId))
  const accessibleProjectIds = uniqueStrings(accessibleRows.map((issue) => issue.projectId))
  const accessibleStatusIds = uniqueStrings(accessibleRows.map((issue) => issue.statusId))
  const accessibleOrganizationIds = uniqueStrings(accessibleRows.map((issue) => issue.contextCompanyId))
  const accessibleUserIds = uniqueStrings([
    ...accessibleRows.map((issue) => issue.assigneeId),
    ...accessibleRows.map((issue) => issue.creatorId),
  ])
  const accessibleLabelLinks = accessibleIssueIds.length > 0
    ? await db.select().from(pmIssueLabels).where(inArray(pmIssueLabels.issueId, accessibleIssueIds))
    : []
  const accessibleLabelIds = uniqueStrings(accessibleLabelLinks.map((link) => link.labelId))
  const [allTeams, allProjects, allStatuses, allOrganizations, allUsers, allLabels] = await Promise.all([
    accessibleTeamIds.length > 0 ? db.select().from(pmTeams).where(inArray(pmTeams.id, accessibleTeamIds)) : Promise.resolve([]),
    accessibleProjectIds.length > 0 ? db.select().from(pmProjects).where(inArray(pmProjects.id, accessibleProjectIds)) : Promise.resolve([]),
    accessibleStatusIds.length > 0 ? db.select().from(pmStatuses).where(inArray(pmStatuses.id, accessibleStatusIds)) : Promise.resolve([]),
    accessibleOrganizationIds.length > 0 ? db.select().from(organizations).where(inArray(organizations.id, accessibleOrganizationIds)) : Promise.resolve([]),
    accessibleUserIds.length > 0 ? db.select().from(users).where(inArray(users.id, accessibleUserIds)) : Promise.resolve([]),
    accessibleLabelIds.length > 0 ? db.select().from(pmLabels).where(inArray(pmLabels.id, accessibleLabelIds)) : Promise.resolve([]),
  ])
  const teamById = new Map(allTeams.map((team) => [team.id, team]))
  const projectById = new Map(allProjects.map((project) => [project.id, project]))
  const statusById = new Map(allStatuses.map((status) => [status.id, status]))
  const organizationById = new Map(allOrganizations.map((organization) => [organization.id, organization]))
  const userById = new Map(allUsers.map((user) => [user.id, user]))
  const labelById = new Map(allLabels.map((label) => [label.id, label]))
  const labelsByIssueId = groupBy(accessibleLabelLinks, (link) => link.issueId)

  const matchedIssues = accessibleRows
    .filter((issue) => {
      const team = teamById.get(issue.teamId)
      const project = issue.projectId ? projectById.get(issue.projectId) : undefined
      const status = statusById.get(issue.statusId)
      const organization = issue.contextCompanyId ? organizationById.get(issue.contextCompanyId) : undefined
      const assignee = issue.assigneeId ? userById.get(issue.assigneeId) : undefined
      const labelNames = (labelsByIssueId.get(issue.id) ?? [])
        .map((link) => labelById.get(link.labelId)?.name)
        .filter((name): name is string => Boolean(name))

      if (search && !matchesAny(search, [issue.identifier, issue.title, issue.description])) return false
      if (organizationIds.length > 0 && !matchesStringFilter(issue.contextCompanyId, organizationIds, 'exact')) return false
      if (organizationNames.length > 0 && !matchesStringFilter(organization?.name, organizationNames)) return false
      if (organizationProjects.length > 0 && !matchesStringFilter(organization?.project, organizationProjects, 'exact')) return false
      if (teamKeys.length > 0 && !matchesStringFilter(team?.key, teamKeys, 'exact')) return false
      if (teamNames.length > 0 && !matchesStringFilter(team?.name, teamNames)) return false
      if (projectSlugs.length > 0 && !matchesStringFilter(project?.slug, projectSlugs, 'exact')) return false
      if (projectNames.length > 0 && !matchesStringFilter(project?.name, projectNames)) return false
      if (statusIdsFilter.length > 0 && !matchesStringFilter(issue.statusId, statusIdsFilter, 'exact')) return false
      if (statusKeys.length > 0 && !matchesStringFilter(status?.key, statusKeys, 'exact')) return false
      if (statusNames.length > 0 && !matchesStringFilter(status?.name, statusNames)) return false
      if (statusTypes.length > 0 && !matchesStringFilter(status?.type, statusTypes, 'exact')) return false
      if (assigneeFilters.length > 0 && !matchesAnyFilter(assigneeFilters, [assignee?.name, assignee?.email])) return false
      if (labelNameFilters.length > 0 && !labelNames.some((labelName) => matchesStringFilter(labelName, labelNameFilters))) return false
      if (priorities.length > 0 && !priorities.includes(issue.priority)) return false
      return true
    })
  const issues = matchedIssues.slice(0, limit)

  const issueIds = uniqueStrings(issues.map((issue) => issue.id))
  const selectedLabelLinks = accessibleLabelLinks.filter((link) => issueIds.includes(link.issueId))
  const activity = issueIds.length > 0 && activityLimit > 0
    ? await db
      .select()
      .from(activityEvents)
      .where(and(eq(activityEvents.subjectType, 'pm_issue'), inArray(activityEvents.subjectId, issueIds)))
      .orderBy(desc(activityEvents.createdAt))
      .limit(issueIds.length * activityLimit)
    : []
  const runs = issueIds.length > 0 && runLimit > 0
    ? await db
      .select()
      .from(agentRuns)
      .where(inArray(agentRuns.issueId, issueIds))
      .orderBy(desc(agentRuns.createdAt))
      .limit(issueIds.length * runLimit)
    : []
  const selectedLabelsByIssueId = groupBy(selectedLabelLinks, (link) => link.issueId)
  const activityByIssueId = groupLimitedBy(activity, (entry) => entry.subjectId ?? '', activityLimit)
  const runsByIssueId = groupLimitedBy(runs.filter((run) => run.issueId), (run) => run.issueId!, runLimit)

  return {
    filters: {
      limit,
      scanLimit,
      search,
      organizationIds,
      organizationNames,
      organizationProjects,
      teamKeys,
      teamNames,
      projectSlugs,
      projectNames,
      statusIds: statusIdsFilter,
      statusKeys,
      statusNames,
      statusTypes,
      assigneeFilters,
      labelNames: labelNameFilters,
      priorities,
    },
    totalMatched: matchedIssues.length,
    issues: issues.map((issue) => ({
      issue: serializeIssue(issue),
      team: serializeNullableRow(teamById.get(issue.teamId)),
      organization: issue.contextCompanyId ? serializeNullableRow(organizationById.get(issue.contextCompanyId)) : null,
      project: issue.projectId ? serializeNullableRow(projectById.get(issue.projectId)) : null,
      status: serializeNullableRow(statusById.get(issue.statusId)),
      assignee: issue.assigneeId && userById.get(issue.assigneeId) ? serializePublicUser(userById.get(issue.assigneeId)!) : null,
      creator: issue.creatorId && userById.get(issue.creatorId) ? serializePublicUser(userById.get(issue.creatorId)!) : null,
      labels: (selectedLabelsByIssueId.get(issue.id) ?? [])
        .map((link) => labelById.get(link.labelId))
        .filter((label): label is typeof pmLabels.$inferSelect => Boolean(label))
        .map(serializeRow),
      recentActivity: (activityByIssueId.get(issue.id) ?? []).map(serializeRow),
      recentAgentRuns: (runsByIssueId.get(issue.id) ?? []).map(serializeRow),
      triage: {
        statusName: statusById.get(issue.statusId)?.name ?? null,
        statusKey: statusById.get(issue.statusId)?.key ?? null,
        statusType: statusById.get(issue.statusId)?.type ?? null,
        priority: issue.priority,
        priorityLabel: priorityLabel(issue.priority),
        estimate: issue.estimate,
        dueDate: issue.dueDate ? issue.dueDate.getTime() : null,
        lastActivityAt: issue.lastActivityAt.getTime(),
        organizationName: issue.contextCompanyId ? organizationById.get(issue.contextCompanyId)?.name ?? null : null,
        teamName: teamById.get(issue.teamId)?.name ?? null,
        teamKey: teamById.get(issue.teamId)?.key ?? null,
        projectName: issue.projectId ? projectById.get(issue.projectId)?.name ?? null : null,
        assigneeName: issue.assigneeId ? displayUserName(userById.get(issue.assigneeId)) : null,
        labelNames: (selectedLabelsByIssueId.get(issue.id) ?? [])
          .map((link) => labelById.get(link.labelId)?.name)
          .filter((name): name is string => Boolean(name)),
        latestActivitySummary: activityByIssueId.get(issue.id)?.[0]?.summary ?? null,
        latestAgentRunStatus: runsByIssueId.get(issue.id)?.[0]?.status ?? null,
      },
    })),
  }
}

async function getIssue(req: AuthenticatedRequest, args: unknown) {
  const issueId = readRequiredString(args, 'issueId')
  const { issue } = await readAccessibleIssue(req, issueId)
  const db = getDb()

  const [team] = await db.select().from(pmTeams).where(eq(pmTeams.id, issue.teamId)).limit(1)
  const [project] = issue.projectId
    ? await db.select().from(pmProjects).where(eq(pmProjects.id, issue.projectId)).limit(1)
    : []
  const [status] = await db.select().from(pmStatuses).where(eq(pmStatuses.id, issue.statusId)).limit(1)
  const [organization] = issue.contextCompanyId
    ? await db.select().from(organizations).where(eq(organizations.id, issue.contextCompanyId)).limit(1)
    : []
  const [assignee] = issue.assigneeId
    ? await db.select().from(users).where(eq(users.id, issue.assigneeId)).limit(1)
    : []
  const [creator] = issue.creatorId
    ? await db.select().from(users).where(eq(users.id, issue.creatorId)).limit(1)
    : []
  const labelLinks = await db.select().from(pmIssueLabels).where(eq(pmIssueLabels.issueId, issue.id))
  const labels = labelLinks.length > 0
    ? await db
      .select()
      .from(pmLabels)
      .where(inArray(pmLabels.id, labelLinks.map((link) => link.labelId)))
    : []
  const activity = await db
    .select()
    .from(activityEvents)
    .where(and(eq(activityEvents.subjectType, 'pm_issue'), eq(activityEvents.subjectId, issue.id)))
    .orderBy(desc(activityEvents.createdAt))
    .limit(20)
  const runs = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.issueId, issue.id))
    .orderBy(desc(agentRuns.createdAt))
    .limit(5)

  return {
    issue: serializeIssue(issue),
    team: team ? serializeRow(team) : null,
    organization: organization ? serializeRow(organization) : null,
    project: project ? serializeRow(project) : null,
    status: status ? serializeRow(status) : null,
    assignee: assignee ? serializePublicUser(assignee) : null,
    creator: creator ? serializePublicUser(creator) : null,
    labels: labels.map(serializeRow),
    recentActivity: activity.map(serializeRow),
    recentAgentRuns: runs.map(serializeRow),
    context: {
      issueIdentifier: issue.identifier,
      teamKey: team?.key ?? null,
      teamName: team?.name ?? null,
      organizationName: organization?.name ?? null,
      organizationProject: organization?.project ?? null,
      projectName: project?.name ?? null,
      projectSlug: project?.slug ?? null,
      statusName: status?.name ?? null,
      statusKey: status?.key ?? null,
      statusType: status?.type ?? null,
      assigneeName: displayUserName(assignee),
      creatorName: displayUserName(creator),
      priority: issue.priority,
      priorityLabel: priorityLabel(issue.priority),
      estimate: issue.estimate,
      dueDate: issue.dueDate ? issue.dueDate.getTime() : null,
      blockedReason: issue.blockedReason,
      labelNames: labels.map((label) => label.name),
    },
  }
}

async function updateIssue(req: AuthenticatedRequest, args: unknown) {
  const issueId = readRequiredString(args, 'issueId')
  const { issue } = await readAccessibleIssue(req, issueId)
  const body = ensureObject(args)
  const now = new Date()
  const updates: Partial<typeof pmIssues.$inferInsert> = {
    lastActivityAt: now,
    updatedAt: now,
  }

  if (typeof body.title === 'string') updates.title = body.title
  if (typeof body.description === 'string') updates.description = body.description
  if (typeof body.statusId === 'string') {
    updates.statusId = body.statusId
  } else {
    const resolvedStatus = await resolveIssueStatusFromUpdate(issue, body)
    if (resolvedStatus) updates.statusId = resolvedStatus.id
  }
  if (typeof body.priority === 'number') updates.priority = body.priority
  if (typeof body.estimate === 'number' || body.estimate === null) updates.estimate = body.estimate
  if (typeof body.blockedReason === 'string' || body.blockedReason === null) updates.blockedReason = body.blockedReason

  const [updated] = await getDb()
    .update(pmIssues)
    .set(updates)
    .where(eq(pmIssues.id, issue.id))
    .returning()

  const changedFields = Object.keys(updates).filter((key) => !['lastActivityAt', 'updatedAt'].includes(key))
  await appendIssueActivity(req, {
    issueId: issue.id,
    type: 'agent_issue_update',
    summary: typeof body.activitySummary === 'string'
      ? body.activitySummary
      : changedFields.length > 0
        ? `Agent updated ${changedFields.join(', ')}`
        : 'Agent touched issue',
    metadata: {
      source: 'pach-mcp',
      changedFields,
    },
  })

  return {
    ok: true,
    issue: serializeIssue(updated),
    changedFields,
  }
}

async function resolveIssueStatusFromUpdate(issue: typeof pmIssues.$inferSelect, body: Record<string, unknown>) {
  const statusKey = readOptionalString(body.statusKey)
  const statusType = readOptionalString(body.statusType)
  if (!statusKey && !statusType) return null

  const statuses = await getDb().select().from(pmStatuses).limit(500)
  const matches = statuses
    .filter((status) => status.teamId === issue.teamId || status.teamId == null)
    .filter((status) => {
      if (statusKey && !matchesStringFilter(status.key, [statusKey], 'exact')) return false
      if (statusType && !matchesStringFilter(status.type, [statusType], 'exact')) return false
      return true
    })
    .sort((a, b) => {
      const teamDiff = Number(b.teamId === issue.teamId) - Number(a.teamId === issue.teamId)
      if (teamDiff !== 0) return teamDiff
      return a.position - b.position
    })

  if (matches.length === 0) {
    throw new Error(`Issue status not found for ${statusKey ? `key "${statusKey}"` : `type "${statusType}"`}`)
  }

  return matches[0]
}

async function listActivityEvents(req: AuthenticatedRequest, args: unknown) {
  const body = isObject(args) ? args : {}
  const limit = readPositiveInteger(body.limit, 25, 1, 100)
  const search = readOptionalString(body.search)
  const organizationIds = readStringFilters(body.organizationId, body.organizationIds)
  const organizationNames = readStringFilters(body.organizationName, body.organizationNames)
  const organizationProjects = readStringFilters(body.organizationProject, body.organizationProjects)
  const actorNames = readStringFilters(body.actorName, body.actorNames)
  const sources = readStringFilters(body.source, body.sources)
  const origins = readStringFilters(body.origin, body.origins)
  const activityKinds = readStringFilters(body.activityKind, body.activityKinds)
  const subjectTypes = readStringFilters(body.subjectType, body.subjectTypes)
  const eventTypes = readStringFilters(body.eventType, body.eventTypes)
  const severities = readStringFilters(body.severity, body.severities)
  const scanLimit = Math.max(200, Math.min(1000, limit * 20))
  const db = getDb()
  const rows = await db
    .select()
    .from(activityEvents)
    .orderBy(desc(activityEvents.occurredAt))
    .limit(scanLimit)

  const accessibleRows = rows.filter((event) => canAccessOrganization(req, event.organizationId))
  const accessibleOrganizationIds = uniqueStrings(accessibleRows.map((event) => event.organizationId))
  const organizationRows = accessibleOrganizationIds.length
    ? await db.select().from(organizations).where(inArray(organizations.id, accessibleOrganizationIds))
    : []
  const organizationById = new Map(organizationRows.map((organization) => [organization.id, organization]))

  const events = accessibleRows
    .filter((event) => {
      const organization = organizationById.get(event.organizationId)
      if (search && !matchesAny(search, [event.summary, event.subjectLabel, event.actorName, event.source, event.origin, event.activityKind, event.eventType])) return false
      if (organizationIds.length > 0 && !matchesStringFilter(event.organizationId, organizationIds, 'exact')) return false
      if (organizationNames.length > 0 && !matchesStringFilter(organization?.name, organizationNames)) return false
      if (organizationProjects.length > 0 && !matchesStringFilter(organization?.project, organizationProjects, 'exact')) return false
      if (actorNames.length > 0 && !matchesStringFilter(event.actorName, actorNames)) return false
      if (sources.length > 0 && !matchesStringFilter(event.source, sources, 'exact')) return false
      if (origins.length > 0 && !matchesStringFilter(event.origin, origins, 'exact')) return false
      if (activityKinds.length > 0 && !matchesStringFilter(event.activityKind, activityKinds, 'exact')) return false
      if (subjectTypes.length > 0 && !matchesStringFilter(event.subjectType, subjectTypes, 'exact')) return false
      if (eventTypes.length > 0 && !matchesStringFilter(event.eventType, eventTypes, 'exact')) return false
      if (severities.length > 0 && !matchesStringFilter(event.severity, severities, 'exact')) return false
      return true
    })
    .slice(0, limit)

  return {
    ok: true,
    count: events.length,
    events: events.map((event) => serializeActivityEvent(event, organizationById.get(event.organizationId))),
  }
}

async function recordActivityEvent(req: AuthenticatedRequest, args: unknown) {
  const body = ensureObject(args)
  const organization = await resolveOrganizationForDocumentCreate(req, body)
  if (!organization) throw new Error('Activity events require an organization. Provide organizationId, organizationName, or organizationProject.')

  const occurredAt = readOptionalDate(body.occurredAt) ?? new Date()
  const eventType = readRequiredString(body, 'eventType')
  const activityKind = normalizeActivityKind(readOptionalString(body.activityKind))
  const origin = normalizeActivityOrigin(readOptionalString(body.origin), 'pach_work')
  const subjectType = readRequiredString(body, 'subjectType')
  const subject = readOptionalString(body.subject) ?? readOptionalString(body.subjectLabel)
  const summary = readRequiredString(body, 'summary')
  const auth = req.mcpAuth
  const user = req.user
  const now = new Date()
  const [event] = await getDb().insert(activityEvents).values({
    id: randomUUID(),
    organizationId: organization.id,
    occurredAt,
    createdAt: now,
    eventType,
    activityKind,
    origin,
    subjectType,
    subjectId: readOptionalString(body.subjectId) ?? undefined,
    subjectLabel: subject ?? undefined,
    actorType: readOptionalString(body.actorType) ?? (auth?.kind === 'jwt' ? 'user' : 'agent'),
    actorId: readOptionalString(body.actorId) ?? auth?.actorUserId ?? undefined,
    actorName: readOptionalString(body.actorName) ?? auth?.actorName ?? user?.name ?? user?.email ?? 'Pach agent',
    source: readOptionalString(body.source) ?? 'pach-mcp',
    severity: normalizeActivitySeverity(readOptionalString(body.severity)),
    summary,
    details: isObject(body.details) ? body.details : {},
    metadata: {
      ...(isObject(body.metadata) ? body.metadata : {}),
      mcpSubjectId: auth?.subjectId,
      mcpAuthKind: auth?.kind,
    },
  }).returning()

  return {
    ok: true,
    event: serializeActivityEvent(event, organization),
  }
}

async function listFinanceMovements(req: AuthenticatedRequest, args: unknown) {
  const body = isObject(args) ? args : {}
  const organization = await resolveOrganizationForDocumentCreate(req, body)
  if (!organization) {
    throw new Error('Finance movement access requires one organization. Provide organizationId, organizationName, or organizationProject.')
  }

  const limit = readPositiveInteger(body.limit, 100, 1, 500)
  const accountId = readOptionalString(body.accountId)
  const categoryId = readOptionalString(body.categoryId)
  const type = readOptionalString(body.type)
  const status = readOptionalString(body.status)
  const currencyCode = readOptionalString(body.currencyCode)?.toUpperCase()
  const startDate = readOptionalDateOnly(body.startDate, 'startDate')
  const endDate = readOptionalDateOnly(body.endDate, 'endDate')
  const search = readOptionalString(body.search)

  const conditions: SQL[] = [eq(finMovements.organizationId, organization.id)]
  if (accountId) conditions.push(eq(finMovements.accountId, accountId))
  if (categoryId) {
    conditions.push(categoryId === 'uncategorized' ? isNull(finMovements.categoryId) : eq(finMovements.categoryId, categoryId))
  }
  if (type) conditions.push(eq(finMovements.type, type))
  if (status) conditions.push(eq(finMovements.status, status))
  if (currencyCode) conditions.push(eq(finMovements.currencyCode, currencyCode))
  if (startDate) conditions.push(gte(finMovements.transactionDate, startDate))
  if (endDate) conditions.push(lte(finMovements.transactionDate, endDate))
  if (search) {
    conditions.push(or(
      ilike(finMovements.description, `%${search}%`),
      ilike(finMovements.merchantName, `%${search}%`),
      ilike(finMovements.counterparty, `%${search}%`),
    )!)
  }

  const rows = await getDb()
    .select({
      movement: finMovements,
      account: finAccounts,
      category: finCategories,
    })
    .from(finMovements)
    .leftJoin(finAccounts, eq(finAccounts.id, finMovements.accountId))
    .leftJoin(finCategories, eq(finCategories.id, finMovements.categoryId))
    .where(and(...conditions))
    .orderBy(desc(finMovements.transactionDate), desc(finMovements.transactionTime), desc(finMovements.createdAt))
    .limit(limit)

  const movementRows = rows
    .filter((row) => row.account?.organizationId === organization.id)
    .filter((row) => !row.category || row.category.organizationId === organization.id)

  const movements = movementRows.map((row) => ({
    ...serializeRow(row.movement),
    organizationName: organization.name,
    organizationProject: organization.project,
    account: row.account ? {
      id: row.account.id,
      name: row.account.name,
      institutionName: row.account.institutionName,
      type: row.account.type,
      currencyCode: row.account.currencyCode,
      status: row.account.status,
    } : null,
    category: row.category ? {
      id: row.category.id,
      name: row.category.name,
      type: row.category.type,
      parentId: row.category.parentId,
      archived: row.category.archived,
    } : null,
  }))

  return {
    ok: true,
    organization: {
      id: organization.id,
      name: organization.name,
      project: organization.project,
    },
    count: movements.length,
    limit,
    filters: {
      accountId,
      categoryId,
      type,
      status,
      currencyCode,
      startDate,
      endDate,
      search,
    },
    totalsByCurrency: summarizeFinanceMovementsByCurrency(movementRows.map((row) => row.movement)),
    movements,
  }
}

async function listDocuments(req: AuthenticatedRequest, args: unknown) {
  const body = isObject(args) ? args : {}
  const limit = readPositiveInteger(body.limit, 25, 1, 100)
  const bodyPreviewLength = readPositiveInteger(body.bodyPreviewLength, 240, 0, 2000)
  const search = readOptionalString(body.search)
  const organizationIds = readStringFilters(body.organizationId, body.organizationIds)
  const organizationNames = readStringFilters(body.organizationName, body.organizationNames)
  const organizationProjects = readStringFilters(body.organizationProject, body.organizationProjects)
  const status = readOptionalString(body.status)
  const includeArchived = body.includeArchived === true
  const rootOnly = body.rootOnly === true
  const { hasParentIdFilter, parentIdFilter } = readParentIdFilter(body)
  const db = getDb()
  const scanLimit = Math.max(200, Math.min(1000, limit * 20))
  const rows = await db
    .select()
    .from(documents)
    .orderBy(desc(documents.updatedAt))
    .limit(scanLimit)

  const accessibleRows = rows.filter((document) => canAccessDocument(req, document))
  const accessibleOrganizationIds = uniqueStrings(accessibleRows.map((document) => document.organizationId))
  const accessibleOwnerIds = uniqueStrings(accessibleRows.map((document) => document.ownerId))
  const accessibleParentIds = uniqueStrings(accessibleRows.map((document) => document.parentId))
  const [allOrganizations, allOwners, allParents] = await Promise.all([
    accessibleOrganizationIds.length > 0
      ? db.select().from(organizations).where(inArray(organizations.id, accessibleOrganizationIds))
      : Promise.resolve([]),
    accessibleOwnerIds.length > 0
      ? db.select().from(users).where(inArray(users.id, accessibleOwnerIds))
      : Promise.resolve([]),
    accessibleParentIds.length > 0
      ? db.select().from(documents).where(inArray(documents.id, accessibleParentIds))
      : Promise.resolve([]),
  ])
  const organizationById = new Map(allOrganizations.map((organization) => [organization.id, organization]))
  const ownerById = new Map(allOwners.map((owner) => [owner.id, owner]))
  const parentById = new Map(allParents.filter((parent) => canAccessDocument(req, parent)).map((parent) => [parent.id, parent]))
  const childrenByParentId = groupBy(
    accessibleRows.filter((document) => document.parentId),
    (document) => document.parentId!,
  )

  const matchedDocuments = accessibleRows
    .filter((document) => {
      const organization = document.organizationId ? organizationById.get(document.organizationId) : undefined

      if (status ? document.status !== status : !includeArchived && document.status !== 'active') return false
      if (search && !matchesAny(search, [document.title, document.slug, document.body])) return false
      if (!documentMatchesOrganizationFilters(document, organization, {
        organizationIds,
        organizationNames,
        organizationProjects,
      })) return false
      if (rootOnly && document.parentId) return false
      if (hasParentIdFilter && document.parentId !== parentIdFilter) return false
      return true
    })
  const selectedDocuments = matchedDocuments.slice(0, limit)

  return {
    filters: {
      limit,
      scanLimit,
      search,
      organizationIds,
      organizationNames,
      organizationProjects,
      status: status ?? (includeArchived ? null : 'active'),
      includeArchived,
      rootOnly,
      parentId: hasParentIdFilter ? parentIdFilter : undefined,
      bodyPreviewLength,
    },
    totalMatched: matchedDocuments.length,
    documents: selectedDocuments.map((document) => ({
      document: serializeDocumentSummary(
        document,
        organizationById.get(document.organizationId ?? ''),
        document.ownerId ? ownerById.get(document.ownerId) : undefined,
        bodyPreviewLength,
      ),
      parent: document.parentId ? serializeDocumentReference(parentById.get(document.parentId)) : null,
      childCount: childrenByParentId.get(document.id)?.length ?? 0,
    })),
  }
}

async function getDocument(req: AuthenticatedRequest, args: unknown) {
  const body = ensureObject(args)
  const documentId = readOptionalString(body.documentId)
  const publicId = readOptionalString(body.publicId)
  const slug = readOptionalString(body.slug)
  if (!documentId && !publicId && !slug) throw new Error('Provide documentId, publicId, or slug')

  const organizationIds = readStringFilters(body.organizationId, body.organizationIds)
  const organizationNames = readStringFilters(body.organizationName, body.organizationNames)
  const organizationProjects = readStringFilters(body.organizationProject, body.organizationProjects)
  const includeArchived = body.includeArchived === true
  const db = getDb()
  const documentSelector = documentId ?? publicId ?? slug!
  const candidates = await db
    .select()
    .from(documents)
    .where(documentId && isUuid(documentId)
      ? eq(documents.id, documentId)
      : publicId
        ? eq(documents.publicId, documentSelector)
        : eq(documents.slug, documentSelector))
    .limit(20)

  const candidateOrganizationIds = uniqueStrings(candidates.map((document) => document.organizationId))
  const candidateOrganizations = candidateOrganizationIds.length > 0
    ? await db.select().from(organizations).where(inArray(organizations.id, candidateOrganizationIds))
    : []
  const organizationById = new Map(candidateOrganizations.map((organization) => [organization.id, organization]))
  const accessibleCandidates = candidates
    .filter((document) => canAccessDocument(req, document))
    .filter((document) => includeArchived || document.status !== 'archived')
    .filter((document) => documentMatchesOrganizationFilters(document, organizationById.get(document.organizationId ?? ''), {
      organizationIds,
      organizationNames,
      organizationProjects,
    }))

  if (accessibleCandidates.length === 0) throw new Error('Document not found')
  if (accessibleCandidates.length > 1) {
    throw new Error('Document slug is ambiguous. Provide organizationId, organizationName, or organizationProject.')
  }

  const document = accessibleCandidates[0]
  const [owner] = document.ownerId
    ? await db.select().from(users).where(eq(users.id, document.ownerId)).limit(1)
    : []
  const [parent] = document.parentId
    ? await db.select().from(documents).where(eq(documents.id, document.parentId)).limit(1)
    : []
  const children = await db
    .select()
    .from(documents)
    .where(eq(documents.parentId, document.id))
    .limit(100)
  const ancestors = await readDocumentAncestors(req, document)
  const visibleChildren = children
    .filter((child) => canAccessDocument(req, child))
    .filter((child) => includeArchived || child.status !== 'archived')
    .sort(compareDocumentsForTreeOrder)

  return {
    ok: true,
    document: serializeDocumentFull(document, organizationById.get(document.organizationId ?? ''), owner),
    parent: parent && canAccessDocument(req, parent) ? serializeDocumentReference(parent) : null,
    ancestors: ancestors.map(serializeDocumentReference),
    children: visibleChildren.map(serializeDocumentReference),
    context: {
      title: document.title,
      publicId: document.publicId,
      slug: document.slug,
      organizationName: document.organizationId ? organizationById.get(document.organizationId)?.name ?? null : null,
      organizationProject: document.organizationId ? organizationById.get(document.organizationId)?.project ?? null : null,
      ownerName: displayUserName(owner),
      parentTitle: parent && canAccessDocument(req, parent) ? parent.title : null,
      childTitles: visibleChildren.map((child) => child.title),
    },
    formatContract: documentFormatContract(),
  }
}

function documentFormatContract() {
  return {
    ok: true,
    version: DOCUMENT_FORMAT_VERSION,
    instructions: DOCUMENT_FORMAT_INSTRUCTIONS,
    examples: {
      sourceBlock: [
        ':::toggle',
        'Source: Interview with CFO',
        'URL: https://example.com',
        'Notes: useful source notes here.',
        ':::',
      ].join('\n'),
      collapsible: [
        ':::toggle',
        'Section title',
        'Hidden or secondary details.',
        ':::',
      ].join('\n'),
      checklist: ['- [ ] Confirm data point', '- [x] Draft outline'].join('\n'),
      file: '::file[one-pager.pdf](https://example.com/one-pager.pdf){size=458000 type=application%2Fpdf}',
    },
  }
}

async function createDocument(req: AuthenticatedRequest, args: unknown) {
  const body = ensureObject(args)
  const title = readRequiredString(body, 'title')
  const rawBody = typeof body.body === 'string' ? body.body : ''
  const organization = await resolveOrganizationForDocumentCreate(req, body)
  const parentId = readOptionalString(body.parentId)
  const db = getDb()
  if (parentId) {
    const [parent] = await db.select().from(documents).where(eq(documents.id, parentId)).limit(1)
    if (!parent || !canAccessDocument(req, parent)) throw new Error('Parent document not found')
    if ((parent.organizationId ?? null) !== (organization?.id ?? null)) {
      throw new Error('Parent document belongs to a different organization')
    }
  }
  const now = new Date()
  const publicId = readOptionalString(body.publicId) ?? await nextDocumentPublicId(organization)
  const slug = await uniqueDocumentSlug(readOptionalString(body.slug) ?? title, organization?.id ?? null)
  const metadata = isObject(body.metadata) ? body.metadata : {}
  const [document] = await db.insert(documents).values({
    id: randomUUID(),
    organizationId: organization?.id,
    parentId: parentId ?? undefined,
    ownerId: req.mcpAuth?.actorUserId && isUuid(req.mcpAuth.actorUserId) ? req.mcpAuth.actorUserId : undefined,
    publicId,
    title,
    slug,
    body: rawBody,
    format: 'markdown',
    status: 'active',
    metadata,
    createdAt: now,
    updatedAt: now,
  }).returning()
  const snapshot = await createSnapshotForDocument(req, document, {
    status: 'version',
    runId: readOptionalString(body.runId),
    metadata: { source: 'pach.document.create' },
  })
  await db.update(documents).set({ currentSnapshotId: snapshot.id, updatedAt: now }).where(eq(documents.id, document.id))
  const updated = { ...document, currentSnapshotId: snapshot.id, updatedAt: now }
  return {
    ok: true,
    document: serializeDocumentFull(updated, organization ?? undefined, undefined),
    snapshot: serializeDocumentSnapshot(snapshot),
    formatContract: documentFormatContract(),
  }
}

async function updateDocument(req: AuthenticatedRequest, args: unknown) {
  const body = ensureObject(args)
  const document = await readAccessibleDocumentFromArgs(req, body)
  const createVersion = body.createSnapshot !== false
  const base = createVersion ? await readLatestDocumentVersionBase(document) : documentVersionBaseFromDocument(document)
  const nextTitle = readOptionalString(body.title) ?? base.title
  const replaceBody = typeof body.body === 'string' ? body.body : null
  const appendBody = typeof body.appendBody === 'string' ? body.appendBody : null
  const nextBody = replaceBody != null
    ? replaceBody
    : appendBody != null
      ? [base.body, appendBody].filter((part) => part.trim()).join('\n\n')
      : base.body
  const documentMetadata = isObject(body.metadata) ? { ...(document.metadata ?? {}), ...body.metadata } : document.metadata
  const snapshotMetadata = isObject(body.metadata) ? body.metadata : {}
  const slug = nextTitle !== base.title ? await uniqueDocumentSlug(nextTitle, document.organizationId, document.id) : base.slug
  const now = new Date()
  let snapshot: typeof documentSnapshots.$inferSelect | null = null
  let updatedDocument = document

  if (!createVersion) {
    const [updated] = await getDb().update(documents).set({
      title: nextTitle,
      slug,
      body: nextBody,
      format: 'markdown',
      metadata: documentMetadata,
      updatedAt: now,
    }).where(eq(documents.id, document.id)).returning()
    updatedDocument = updated
  } else {
    snapshot = await createSnapshotForDocument(req, {
      ...document,
      title: nextTitle,
      slug,
      body: nextBody,
      format: 'markdown',
    }, {
      status: 'version',
      runId: readOptionalString(body.runId),
      metadata: {
        source: 'pach.document.update',
        baseSnapshotId: base.kind === 'snapshot' ? base.id : null,
        baseVersionNumber: base.kind === 'snapshot' ? base.versionNumber : null,
        ...snapshotMetadata,
      },
    })
    if (body.makeMain === true) {
      const [updated] = await getDb().update(documents).set({
        title: nextTitle,
        slug,
        body: nextBody,
        format: 'markdown',
        metadata: documentMetadata,
        currentSnapshotId: snapshot.id,
        updatedAt: now,
      }).where(eq(documents.id, document.id)).returning()
      updatedDocument = updated
    }
  }
  const [organization] = updatedDocument.organizationId
    ? await getDb().select().from(organizations).where(eq(organizations.id, updatedDocument.organizationId)).limit(1)
    : []
  return {
    ok: true,
    document: serializeDocumentFull(updatedDocument, organization, undefined),
    appliedToDocument: body.makeMain === true || !createVersion,
    version: snapshot ? serializeDocumentSnapshot(snapshot) : null,
    snapshot: snapshot ? serializeDocumentSnapshot(snapshot) : null,
    formatContract: documentFormatContract(),
  }
}

async function listDocumentSnapshots(req: AuthenticatedRequest, args: unknown) {
  const body = ensureObject(args)
  const document = await readAccessibleDocumentFromArgs(req, body)
  const limit = readPositiveInteger(body.limit, 20, 1, 100)
  const snapshots = await getDb()
    .select()
    .from(documentSnapshots)
    .where(eq(documentSnapshots.documentId, document.id))
    .orderBy(desc(documentSnapshots.versionNumber))
    .limit(limit)
  return {
    ok: true,
    document: serializeDocumentReference(document),
    snapshots: snapshots.map(serializeDocumentSnapshot),
  }
}

async function createDocumentSnapshot(req: AuthenticatedRequest, args: unknown) {
  const body = ensureObject(args)
  const document = await readAccessibleDocumentFromArgs(req, body)
  const snapshot = await createSnapshotForDocument(req, document, {
    status: readSnapshotStatus(body.status) ?? 'version',
    runId: readOptionalString(body.runId),
    metadata: isObject(body.metadata) ? body.metadata : { source: 'pach.document.snapshot.create' },
  })
  return {
    ok: true,
    document: serializeDocumentReference(document),
    version: serializeDocumentSnapshot(snapshot),
    snapshot: serializeDocumentSnapshot(snapshot),
  }
}

async function approveDocumentSnapshot(req: AuthenticatedRequest, args: unknown) {
  const { document, snapshot } = await readAccessibleSnapshotFromArgs(req, args)
  const now = new Date()
  const [updatedDocument] = await getDb().update(documents).set({
    title: snapshot.title,
    slug: snapshot.slug,
    body: snapshot.body,
    format: snapshot.format,
    currentSnapshotId: snapshot.id,
    updatedAt: now,
  }).where(eq(documents.id, document.id)).returning()
  return {
    ok: true,
    madeMain: true,
    document: serializeDocumentReference(updatedDocument),
    version: serializeDocumentSnapshot(snapshot),
    snapshot: serializeDocumentSnapshot(snapshot),
  }
}

async function restoreDocumentSnapshot(req: AuthenticatedRequest, args: unknown) {
  const { document, snapshot } = await readAccessibleSnapshotFromArgs(req, args)
  const now = new Date()
  const [updatedDocument] = await getDb().update(documents).set({
    title: snapshot.title,
    slug: snapshot.slug,
    body: snapshot.body,
    format: snapshot.format,
    currentSnapshotId: snapshot.id,
    updatedAt: now,
  }).where(eq(documents.id, document.id)).returning()
  return {
    ok: true,
    madeMain: true,
    document: serializeDocumentReference(updatedDocument),
    version: serializeDocumentSnapshot(snapshot),
    snapshot: serializeDocumentSnapshot(snapshot),
  }
}

async function getEditorialProfile(req: AuthenticatedRequest, args: unknown) {
  const { organization, publication } = await resolveEditorialProfileTarget(req, args)
  const organizationProfile = isObject(organization.editorialProfile) ? organization.editorialProfile : {}
  const publicationProfile = publication && isObject(publication.editorialProfile) ? publication.editorialProfile : {}
  return {
    ok: true,
    organization: {
      id: organization.id,
      name: organization.name,
      project: organization.project,
      editorialProfile: organizationProfile,
    },
    publication: publication ? {
      id: publication.id,
      name: publication.name,
      slug: publication.slug,
      type: publication.type,
      editorialProfile: publicationProfile,
    } : null,
    effectiveProfile: {
      ...organizationProfile,
      ...publicationProfile,
    },
  }
}

async function updateEditorialProfile(req: AuthenticatedRequest, args: unknown) {
  const body = ensureObject(args)
  const profile = ensureObject(body.profile)
  const merge = body.merge !== false
  const { organization, publication } = await resolveEditorialProfileTarget(req, body)
  const now = new Date()

  if (publication) {
    const current = isObject(publication.editorialProfile) ? publication.editorialProfile : {}
    const nextProfile = merge ? { ...current, ...profile } : profile
    const [updated] = await getDb()
      .update(mktPublications)
      .set({ editorialProfile: nextProfile, updatedAt: now })
      .where(eq(mktPublications.id, publication.id))
      .returning()
    return {
      ok: true,
      scope: 'publication',
      organization: { id: organization.id, name: organization.name, project: organization.project },
      publication: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        type: updated.type,
        editorialProfile: updated.editorialProfile ?? {},
      },
    }
  }

  const current = isObject(organization.editorialProfile) ? organization.editorialProfile : {}
  const nextProfile = merge ? { ...current, ...profile } : profile
  const [updated] = await getDb()
    .update(organizations)
    .set({ editorialProfile: nextProfile, updatedAt: now })
    .where(eq(organizations.id, organization.id))
    .returning()
  return {
    ok: true,
    scope: 'organization',
    organization: {
      id: updated.id,
      name: updated.name,
      project: updated.project,
      editorialProfile: updated.editorialProfile ?? {},
    },
  }
}

async function listMarketingIdeas(req: AuthenticatedRequest, args: unknown) {
  const body = ensureObject(args)
  const { publication } = await resolveMarketingPublicationTarget(req, body, true)
  const statuses = readStringFilters(body.status, body.statuses)
  const limit = readPositiveInteger(body.limit, 25, 1, 100)
  const rows = await getDb()
    .select()
    .from(mktEditorialIdeas)
    .where(eq(mktEditorialIdeas.publicationId, publication.id))
    .orderBy(desc(mktEditorialIdeas.priority), asc(mktEditorialIdeas.createdAt))
    .limit(500)
  const filtered = statuses.length > 0
    ? rows.filter((idea) => statuses.includes(idea.status))
    : rows.filter((idea) => ['available', 'reserved'].includes(idea.status))
  return {
    ok: true,
    publication: serializeMarketingPublication(publication),
    ideas: filtered.slice(0, limit).map(serializeMarketingIdea),
  }
}

async function createMarketingIdea(req: AuthenticatedRequest, args: unknown) {
  const body = ensureObject(args)
  const publicationId = readRequiredString(body, 'publicationId')
  const [publication] = await getDb().select().from(mktPublications).where(eq(mktPublications.id, publicationId)).limit(1)
  if (!publication || !canAccessOrganization(req, publication.organizationId)) throw new Error('Publication not found')

  const result = await createEditorialIdea({
    organizationId: publication.organizationId,
    publicationId: publication.id,
    title: readRequiredString(body, 'title'),
    angle: readOptionalString(body.angle) ?? undefined,
    sourceNotes: readOptionalString(body.sourceNotes) ?? undefined,
    dedupeKey: readOptionalString(body.dedupeKey) ?? undefined,
    status: readOptionalString(body.status) ?? undefined,
    priority: typeof body.priority === 'number' && Number.isFinite(body.priority) ? Math.trunc(body.priority) : undefined,
    agentRunId: readOptionalString(body.runId) ?? undefined,
    metadata: isObject(body.metadata) ? body.metadata : undefined,
  })

  return {
    ok: true,
    alreadyExists: result.alreadyExists,
    publication: serializeMarketingPublication(publication),
    idea: serializeMarketingIdea(result.idea),
  }
}

async function getMarketingSlot(req: AuthenticatedRequest, args: unknown) {
  const body = ensureObject(args)
  const slotId = readRequiredString(body, 'slotId')
  const [slot] = await getDb().select().from(mktPublicationSlots).where(eq(mktPublicationSlots.id, slotId)).limit(1)
  if (!slot || !canAccessOrganization(req, slot.organizationId)) throw new Error('Publication slot not found')
  return serializeMarketingSlotContext(slot, readPositiveInteger(body.availableIdeaLimit, 10, 0, 50))
}

async function listMarketingSlots(req: AuthenticatedRequest, args: unknown) {
  const body = ensureObject(args)
  const { organization, publication } = await resolveMarketingPublicationTarget(req, body, false)
  const statuses = readStringFilters(body.status, body.statuses)
  const limit = readPositiveInteger(body.limit, 25, 1, 100)
  const rows = publication
    ? await getDb()
      .select()
      .from(mktPublicationSlots)
      .where(eq(mktPublicationSlots.publicationId, publication.id))
      .orderBy(asc(mktPublicationSlots.scheduledAt))
      .limit(500)
    : organization
      ? await getDb()
        .select()
        .from(mktPublicationSlots)
        .where(eq(mktPublicationSlots.organizationId, organization.id))
        .orderBy(asc(mktPublicationSlots.scheduledAt))
        .limit(500)
      : await getDb()
        .select()
        .from(mktPublicationSlots)
        .orderBy(asc(mktPublicationSlots.scheduledAt))
        .limit(500)
  const filtered = rows
    .filter((slot) => canAccessOrganization(req, slot.organizationId))
    .filter((slot) => statuses.length === 0 || statuses.includes(slot.status))
  return {
    ok: true,
    organization: organization ? serializeMarketingOrganization(organization) : null,
    publication: publication ? serializeMarketingPublication(publication) : null,
    slots: filtered.slice(0, limit).map(serializeMarketingSlot),
  }
}

async function fulfillMarketingSlot(req: AuthenticatedRequest, args: unknown) {
  const body = ensureObject(args)
  const slotId = readRequiredString(body, 'slotId')
  const [slot] = await getDb().select().from(mktPublicationSlots).where(eq(mktPublicationSlots.id, slotId)).limit(1)
  if (!slot || !canAccessOrganization(req, slot.organizationId)) throw new Error('Publication slot not found')
  const result = await fulfillPublicationSlot({
    slotId,
    documentId: readRequiredString(body, 'documentId'),
    ideaId: readOptionalString(body.ideaId) ?? undefined,
    runId: readOptionalString(body.runId) ?? undefined,
    subject: readOptionalString(body.subject) ?? undefined,
    preheader: readOptionalString(body.preheader) ?? undefined,
    metadata: isObject(body.metadata) ? body.metadata : undefined,
  })
  return {
    ok: true,
    slot: serializeMarketingSlot(result.slot),
    publication: serializeMarketingPublication(result.publication),
    idea: result.idea ? serializeMarketingIdea(result.idea) : null,
    document: serializeDocumentReference(result.document),
    contentItem: serializeMarketingContentItem(result.contentItem),
    distributionRun: serializeMarketingDistributionRun(result.distributionRun),
  }
}

async function resolveMarketingPublicationTarget(req: AuthenticatedRequest, args: unknown, requirePublication: true): Promise<{ organization: typeof organizations.$inferSelect; publication: typeof mktPublications.$inferSelect }>
async function resolveMarketingPublicationTarget(req: AuthenticatedRequest, args: unknown, requirePublication?: false): Promise<{ organization: typeof organizations.$inferSelect | null; publication: typeof mktPublications.$inferSelect | null }>
async function resolveMarketingPublicationTarget(req: AuthenticatedRequest, args: unknown, requirePublication = false) {
  const body = ensureObject(args)
  const publicationId = readOptionalString(body.publicationId)
  const publicationSlug = readOptionalString(body.publicationSlug)
  const hasOrganizationSelector = Boolean(
    readOptionalString(body.organizationId) ||
    readOptionalString(body.organizationName) ||
    readOptionalString(body.organizationProject),
  )

  if (publicationId) {
    const [publication] = await getDb().select().from(mktPublications).where(eq(mktPublications.id, publicationId)).limit(1)
    if (!publication || !canAccessOrganization(req, publication.organizationId)) throw new Error('Publication not found')
    const [organization] = await getDb().select().from(organizations).where(eq(organizations.id, publication.organizationId)).limit(1)
    if (!organization) throw new Error('Publication organization not found')
    return { organization, publication }
  }

  const organization = hasOrganizationSelector
    ? await resolveOrganizationForDocumentCreate(req, body)
    : null

  if (publicationSlug) {
    const candidates = await getDb()
      .select()
      .from(mktPublications)
      .where(eq(mktPublications.slug, publicationSlug))
      .limit(50)
    const matches = candidates
      .filter((publication) => canAccessOrganization(req, publication.organizationId))
      .filter((publication) => !organization || publication.organizationId === organization.id)
    if (matches.length === 0) throw new Error('Publication not found')
    if (matches.length > 1) throw new Error('Publication selector is ambiguous. Provide publicationId or organizationId.')
    const [matchOrganization] = await getDb().select().from(organizations).where(eq(organizations.id, matches[0].organizationId)).limit(1)
    if (!matchOrganization) throw new Error('Publication organization not found')
    return { organization: matchOrganization, publication: matches[0] }
  }

  if (requirePublication) throw new Error('Provide publicationId or publicationSlug')
  return { organization, publication: null }
}

async function serializeMarketingSlotContext(slot: typeof mktPublicationSlots.$inferSelect, availableIdeaLimit: number) {
  const db = getDb()
  const [publication] = await db.select().from(mktPublications).where(eq(mktPublications.id, slot.publicationId)).limit(1)
  const [organization] = await db.select().from(organizations).where(eq(organizations.id, slot.organizationId)).limit(1)
  const [idea] = slot.ideaId ? await db.select().from(mktEditorialIdeas).where(eq(mktEditorialIdeas.id, slot.ideaId)).limit(1) : []
  const [document] = slot.documentId ? await db.select().from(documents).where(eq(documents.id, slot.documentId)).limit(1) : []
  const [contentItem] = slot.contentItemId ? await db.select().from(mktContentItems).where(eq(mktContentItems.id, slot.contentItemId)).limit(1) : []
  const [distributionRun] = slot.distributionRunId ? await db.select().from(mktDistributionRuns).where(eq(mktDistributionRuns.id, slot.distributionRunId)).limit(1) : []
  const availableIdeas = availableIdeaLimit > 0
    ? await db
      .select()
      .from(mktEditorialIdeas)
      .where(and(eq(mktEditorialIdeas.publicationId, slot.publicationId), eq(mktEditorialIdeas.status, 'available')))
      .orderBy(desc(mktEditorialIdeas.priority), asc(mktEditorialIdeas.createdAt))
      .limit(availableIdeaLimit)
    : []
  return {
    ok: true,
    organization: organization ? serializeMarketingOrganization(organization) : null,
    publication: publication ? {
      ...serializeMarketingPublication(publication),
      cadence: readMarketingCadenceConfig(publication.metadata),
    } : null,
    slot: serializeMarketingSlot(slot),
    idea: idea ? serializeMarketingIdea(idea) : null,
    document: document ? serializeDocumentReference(document) : null,
    contentItem: contentItem ? serializeMarketingContentItem(contentItem) : null,
    distributionRun: distributionRun ? serializeMarketingDistributionRun(distributionRun) : null,
    availableIdeas: availableIdeas.map(serializeMarketingIdea),
    workflow: {
      createDocumentTool: 'pach.document.create',
      fulfillTool: 'pach.marketing.slot.fulfill',
      note: 'Create or select an idea, create the article document, then call pach.marketing.slot.fulfill with slotId, documentId, optional ideaId, subject, preheader, and runId.',
    },
  }
}

function serializeMarketingOrganization(organization: typeof organizations.$inferSelect) {
  return {
    id: organization.id,
    name: organization.name,
    project: organization.project,
  }
}

function serializeMarketingPublication(publication: typeof mktPublications.$inferSelect) {
  return {
    id: publication.id,
    organizationId: publication.organizationId,
    name: publication.name,
    slug: publication.slug,
    type: publication.type,
    status: publication.status,
    audienceDescription: publication.audienceDescription,
    editorialProfile: publication.editorialProfile ?? {},
    metadata: publication.metadata ?? {},
  }
}

function serializeMarketingIdea(idea: typeof mktEditorialIdeas.$inferSelect) {
  return {
    id: idea.id,
    organizationId: idea.organizationId,
    publicationId: idea.publicationId,
    documentId: idea.documentId,
    contentItemId: idea.contentItemId,
    agentRunId: idea.agentRunId,
    title: idea.title,
    angle: idea.angle,
    sourceNotes: idea.sourceNotes,
    dedupeKey: idea.dedupeKey,
    status: idea.status,
    priority: idea.priority,
    reservedAt: idea.reservedAt?.getTime() ?? null,
    usedAt: idea.usedAt?.getTime() ?? null,
    metadata: idea.metadata ?? {},
    createdAt: idea.createdAt.getTime(),
    updatedAt: idea.updatedAt.getTime(),
  }
}

function serializeMarketingSlot(slot: typeof mktPublicationSlots.$inferSelect) {
  return {
    id: slot.id,
    organizationId: slot.organizationId,
    publicationId: slot.publicationId,
    ideaId: slot.ideaId,
    documentId: slot.documentId,
    contentItemId: slot.contentItemId,
    distributionRunId: slot.distributionRunId,
    agentRunId: slot.agentRunId,
    slotKey: slot.slotKey,
    status: slot.status,
    scheduledAt: slot.scheduledAt.getTime(),
    scheduledTimezone: slot.scheduledTimezone,
    lockedAt: slot.lockedAt?.getTime() ?? null,
    error: slot.error,
    metadata: slot.metadata ?? {},
    createdAt: slot.createdAt.getTime(),
    updatedAt: slot.updatedAt.getTime(),
  }
}

function serializeMarketingContentItem(item: typeof mktContentItems.$inferSelect) {
  return {
    id: item.id,
    organizationId: item.organizationId,
    sourceDocumentId: item.sourceDocumentId,
    title: item.title,
    slug: item.slug,
    excerpt: item.excerpt,
    contentKind: item.contentKind,
    supportedChannels: item.supportedChannels,
    status: item.status,
    format: item.format,
    tags: item.tags,
    metadata: item.metadata ?? {},
    createdAt: item.createdAt.getTime(),
    updatedAt: item.updatedAt.getTime(),
  }
}

function serializeMarketingDistributionRun(run: typeof mktDistributionRuns.$inferSelect) {
  return {
    id: run.id,
    organizationId: run.organizationId,
    publicationId: run.publicationId,
    contentItemId: run.contentItemId,
    channel: run.channel,
    distributionType: run.distributionType,
    name: run.name,
    subject: run.subject,
    preheader: run.preheader,
    status: run.status,
    scheduledAt: run.scheduledAt?.getTime() ?? null,
    scheduledTimezone: run.scheduledTimezone,
    startedAt: run.startedAt?.getTime() ?? null,
    completedAt: run.completedAt?.getTime() ?? null,
    error: run.error,
    metadata: run.metadata ?? {},
  }
}

async function resolveEditorialProfileTarget(req: AuthenticatedRequest, args: unknown) {
  const body = ensureObject(args)
  const publicationId = readOptionalString(body.publicationId)
  const publicationSlug = readOptionalString(body.publicationSlug)
  const hasOrganizationSelector = Boolean(
    readOptionalString(body.organizationId) ||
    readOptionalString(body.organizationName) ||
    readOptionalString(body.organizationProject),
  )

  if (publicationId && !hasOrganizationSelector) {
    const [publication] = await getDb().select().from(mktPublications).where(eq(mktPublications.id, publicationId)).limit(1)
    if (!publication || !canAccessOrganization(req, publication.organizationId)) throw new Error('Publication not found')
    const [organization] = await getDb().select().from(organizations).where(eq(organizations.id, publication.organizationId)).limit(1)
    if (!organization) throw new Error('Publication organization not found')
    return { organization, publication }
  }

  const organization = await resolveOrganizationForDocumentCreate(req, body)
  if (!organization) throw new Error('Editorial profiles require an organization')

  if (!publicationId && !publicationSlug) return { organization, publication: null }
  const candidates = await getDb()
    .select()
    .from(mktPublications)
    .where(publicationId ? eq(mktPublications.id, publicationId) : eq(mktPublications.slug, publicationSlug!))
    .limit(20)
  const publicationMatches = candidates.filter((publication) => publication.organizationId === organization.id)
  if (publicationMatches.length === 0) throw new Error('Publication not found')
  if (publicationMatches.length > 1) throw new Error('Publication selector is ambiguous. Provide publicationId.')
  return { organization, publication: publicationMatches[0] }
}

async function listDesignTemplates(req: AuthenticatedRequest, args: unknown) {
  const body = isObject(args) ? args : {}
  const limit = readPositiveInteger(body.limit, 25, 1, 100)
  const organizationId = readOptionalString(body.organizationId)
  const organizationProject = readOptionalString(body.organizationProject)
  const type = readOptionalString(body.type)
  const db = getDb()
  const [templates, orgs] = await Promise.all([
    db.select().from(designTemplates).orderBy(desc(designTemplates.updatedAt)).limit(Math.max(limit * 4, 100)),
    db.select().from(organizations),
  ])
  const organizationById = new Map(orgs.map((organization) => [organization.id, organization]))

  const rows = templates
    .filter((template) => canAccessOrganization(req, template.organizationId))
    .filter((template) => !organizationId || template.organizationId === organizationId)
    .filter((template) => !type || template.type === type)
    .filter((template) => {
      if (!organizationProject) return true
      return organizationById.get(template.organizationId)?.project === organizationProject
    })
    .slice(0, limit)

  return {
    ok: true,
    templates: rows.map((template) => serializeDesignTemplate(template, organizationById.get(template.organizationId))),
  }
}

async function getDesignTemplate(req: AuthenticatedRequest, args: unknown) {
  const body = ensureObject(args)
  const templateId = readOptionalString(body.templateId)
  const slug = readOptionalString(body.slug)
  const selectedDesignSystemId = readOptionalString(body.designSystemId)
  if (!templateId && !slug) throw new Error('Provide templateId or slug')

  const db = getDb()
  const candidates = await db
    .select()
    .from(designTemplates)
    .where(templateId ? eq(designTemplates.id, templateId) : eq(designTemplates.slug, slug!))
    .limit(20)
  const template = candidates.find((row) => canAccessOrganization(req, row.organizationId))
  if (!template) throw new Error('Design template not found')

  const [organization] = await db.select().from(organizations).where(eq(organizations.id, template.organizationId)).limit(1)
  const [versions, runs, selectedDesignSystems, assets] = await Promise.all([
    db
      .select()
      .from(designTemplateVersions)
      .where(eq(designTemplateVersions.templateId, template.id))
      .orderBy(desc(designTemplateVersions.createdAt))
      .limit(20),
    db
      .select()
      .from(designTemplateRuns)
      .where(or(eq(designTemplateRuns.templateId, template.id), eq(designTemplateRuns.templateSlug, template.slug)))
      .orderBy(desc(designTemplateRuns.createdAt))
      .limit(20),
    db
      .select()
      .from(designSystems)
      .where(selectedDesignSystemId ? eq(designSystems.id, selectedDesignSystemId) : eq(designSystems.id, '00000000-0000-0000-0000-000000000000'))
      .orderBy(desc(designSystems.updatedAt))
      .limit(1),
    db
      .select()
      .from(designAssets)
      .where(eq(designAssets.organizationId, template.organizationId))
      .orderBy(desc(designAssets.updatedAt))
      .limit(100),
  ])
  const selectedDesignSystem = selectedDesignSystems.find((system) => system.organizationId === template.organizationId)
  if (selectedDesignSystemId && !selectedDesignSystem) throw new Error('Selected design system not found for this template organization')
  const effectiveDesignSystem = selectedDesignSystem ? serializeDesignSystem(selectedDesignSystem) : null

  return {
    ok: true,
    template: serializeDesignTemplate(template, organization),
    organizationDesignSystem: effectiveDesignSystem,
    assets: assets.map((asset) => serializeDesignAsset(asset, req)),
    agentInstructions: {
      mustUseOrganizationDesignSystem: Boolean(effectiveDesignSystem),
      designSystemId: effectiveDesignSystem?.id ?? null,
      instruction: [
        effectiveDesignSystem
          ? 'Use organizationDesignSystem.markdown as the selected design system for this run. Treat it as the canonical design-system source.'
          : 'No design system was selected for this run. Do not invent hidden organization-specific design context.',
        'For deck templates, prefer one React component per slide and export const slides = [SlideOne, SlideTwo, ...]. Set manifest.dimensions or manifest.aspectRatioId so Pach can render separated, scaled slide frames.',
        'Templates render as standalone iframe documents outside the Pach app shell. Tailwind classes are supported only when manifest.styling is "tailwind"; otherwise use inline React style objects or import a local CSS file included in the template files. Do not rely on Pach CSS variables or app global CSS.',
        assets.length > 0
          ? 'Use available assets from the assets array when a logo, product image, screenshot, or uploaded visual is needed. Persist the stable asset url/stableUrl in template code; do not save temporary signedUrl values in React source. Respect each asset URL, dimensions, and metadata.'
          : 'If an asset is needed but not available, report that in progress instead of inventing a fake logo or product image.',
      ].join(' '),
      availableAspectRatios: [
        { id: 'deck-landscape', label: 'deck landscape', width: 1920, height: 1080, ratio: '16:9' },
        { id: 'deck-portrait', label: 'deck portrait', width: 1080, height: 1528, ratio: '1:1.414' },
        { id: 'mobile-story', label: 'mobile story', width: 1080, height: 1920, ratio: '9:16' },
        { id: 'square', label: 'square', width: 1080, height: 1080, ratio: '1:1' },
      ],
      preferredAspectRatio: { id: 'deck-landscape', label: 'deck landscape', width: 1920, height: 1080, ratio: '16:9' },
    },
    versions: versions.map(serializeDesignTemplateVersion),
    runs: runs.map(serializeDesignTemplateRun),
  }
}

async function createDesignTemplateVersion(req: AuthenticatedRequest, args: unknown) {
  const templateId = readRequiredString(args, 'templateId')
  const body = ensureObject(args)
  const db = getDb()
  const [template] = await db.select().from(designTemplates).where(eq(designTemplates.id, templateId)).limit(1)
  if (!template) throw new Error('Design template not found')
  if (!canAccessOrganization(req, template.organizationId)) throw new Error('Not authorized for this design template')

  const files = readStringRecord(body.files, 'files')
  const rawManifest = isObject(body.manifest) ? body.manifest : {}
  const dependencies = body.dependencies == null ? {} : readStringRecord(body.dependencies, 'dependencies')
  const validationErrors = Array.isArray(body.validationErrors)
    ? body.validationErrors.filter(isObject)
    : []
  const sourceKind = readOptionalString(body.sourceKind) ?? template.sourceKind ?? 'react'
  const manifest = sourceKind === 'react' && rawManifest.styling == null
    ? { ...rawManifest, styling: 'tailwind' }
    : rawManifest
  const validationStatus = readOptionalString(body.validationStatus) ?? (Object.keys(files).length > 0 ? 'compiled' : 'draft')
  const compiledArtifactUrl = readOptionalString(body.compiledArtifactUrl)
  const previewImageUrl = readOptionalString(body.previewImageUrl)
  const runId = readOptionalString(body.runId)
  const [latestVersion] = await db
    .select()
    .from(designTemplateVersions)
    .where(eq(designTemplateVersions.templateId, template.id))
    .orderBy(desc(designTemplateVersions.versionNumber))
    .limit(1)
  const now = new Date()
  const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1

  const [version] = await db
    .insert(designTemplateVersions)
    .values({
      id: randomUUID(),
      organizationId: template.organizationId,
      templateId: template.id,
      versionNumber: nextVersionNumber,
      schemaVersion: 1,
      sourceKind,
      files,
      manifest,
      dependencies,
      compiledArtifactUrl: compiledArtifactUrl ?? undefined,
      previewImageUrl: previewImageUrl ?? undefined,
      validationStatus,
      validationErrors,
      createdByRunId: runId ?? undefined,
      createdAt: now,
    })
    .returning()

  await db
    .update(designTemplates)
    .set({
      currentVersionId: version.id,
      sourceKind,
      updatedAt: now,
    })
    .where(eq(designTemplates.id, template.id))

  if (runId) {
    const [run] = await db
      .select()
      .from(designTemplateRuns)
      .where(or(eq(designTemplateRuns.id, runId), eq(designTemplateRuns.agentRunId, runId)))
      .limit(1)
    if (run && canAccessOrganization(req, run.organizationId)) {
      await db
        .update(designTemplateRuns)
        .set({
          status: validationStatus === 'invalid' ? 'failed' : 'completed',
          targetVersionId: version.id,
          updatedAt: now,
        })
        .where(eq(designTemplateRuns.id, run.id))
    }
  }

  return {
    ok: true,
    templateId: template.id,
    version: serializeDesignTemplateVersion(version),
  }
}

async function reportProgress(req: AuthenticatedRequest, args: unknown) {
  const body = ensureObject(args)
  const phase = readRequiredString(args, 'phase')
  const issueId = readOptionalString(body.issueId)
  const runId = readOptionalString(body.runId)
  const message = typeof body.message === 'string' ? body.message : phase
  const percent = typeof body.percent === 'number' ? Math.floor(Math.max(0, Math.min(100, body.percent))) : null
  const metadata = isObject(body.metadata) ? body.metadata : {}
  const level = readProgressLevel({ ...metadata, level: body.level })
  const now = new Date()

  if (runId) {
    const [run] = await getDb().select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1)
    if (!run) throw new Error('Agent run not found')
    if (issueId && run.issueId) {
      const { issue } = await readAccessibleIssue(req, issueId)
      if (run.issueId !== issue.id) throw new Error('Agent run does not belong to this issue')
    }

    await getDb().insert(agentRunProgressReports).values({
      id: randomUUID(),
      runId: run.id,
      issueId: run.issueId ?? undefined,
      workerId: run.workerId ?? undefined,
      phase,
      level,
      message,
      percent: percent ?? undefined,
      metadata: {
        source: 'pach-mcp',
        ...metadata,
        ...runTurnMetadata(run),
      },
      createdAt: now,
    })

    await getDb()
      .update(agentRuns)
      .set({
        statusMessage: message,
        metadata: {
          ...(run.metadata ?? {}),
          lastProgress: {
            phase,
            message,
            percent,
            reportedAt: now.toISOString(),
            ...runTurnMetadata(run),
          },
        },
        updatedAt: now,
      })
      .where(eq(agentRuns.id, run.id))
  } else if (issueId) {
    const { issue } = await readAccessibleIssue(req, issueId)
    await appendIssueActivity(req, {
      issueId: issue.id,
      type: 'agent_progress',
      summary: message,
      metadata: {
        source: 'pach-mcp',
        phase,
        level,
        percent,
        ...metadata,
      },
    })
  } else {
    throw new Error('Provide runId, or issueId for legacy issue progress')
  }

  return {
    ok: true,
    issueId: issueId ?? null,
    runId,
    phase,
    message,
    percent,
  }
}

async function listAgentRunInputMedia(req: AuthenticatedRequest, args: unknown) {
  const body = ensureObject(args)
  const runId = readRequiredString(body, 'runId')
  const messageId = readOptionalString(body.messageId)
  const run = await readAccessibleAgentRunForMedia(req, runId)
  const db = getDb()
  const mediaLinks = await db
    .select()
    .from(agentRunInputMedia)
    .where(messageId
      ? and(eq(agentRunInputMedia.runId, run.id), eq(agentRunInputMedia.messageId, messageId))
      : eq(agentRunInputMedia.runId, run.id))
    .orderBy(asc(agentRunInputMedia.sortOrder), asc(agentRunInputMedia.createdAt))
  const mediaObjectIds = uniqueStrings(mediaLinks.map((link) => link.mediaObjectId))
  const mediaObjects = mediaObjectIds.length > 0
    ? await db
      .select()
      .from(agentRunInputMediaObjects)
      .where(inArray(agentRunInputMediaObjects.id, mediaObjectIds))
    : []
  const mediaObjectById = new Map(mediaObjects.map((mediaObject) => [mediaObject.id, mediaObject]))
  const attachments = []
  for (const link of mediaLinks) {
    const mediaObject = mediaObjectById.get(link.mediaObjectId)
    if (!mediaObject) continue
    const hydrated = await hydrateAgentInputMediaAttachment({
      id: link.id,
      mediaObjectId: mediaObject.id,
      messageId: link.messageId ?? null,
      name: mediaObject.name,
      fileName: mediaObject.fileName,
      kind: mediaObject.kind,
      mimeType: mediaObject.mimeType,
      sizeBytes: mediaObject.sizeBytes ?? undefined,
      width: mediaObject.width ?? undefined,
      height: mediaObject.height ?? undefined,
      url: mediaObject.url ?? undefined,
      storageKey: mediaObject.storageKey,
      caption: link.caption,
      uploadedAt: link.createdAt.toISOString(),
    })
    attachments.push(hydrated)
  }

  return {
    ok: true,
    runId: run.id,
    issueId: run.issueId,
    subjectType: run.subjectType,
    subjectId: run.subjectId,
    messageId: messageId ?? null,
    expiresInSeconds: AGENT_INPUT_MEDIA_SIGNED_READ_SECONDS,
    attachments,
    promptBlock: formatAgentInputMediaPrompt({ attachments, feedbackMessageId: messageId }),
  }
}

async function createGithubPullRequestForRun(req: AuthenticatedRequest, args: unknown) {
  const body = ensureObject(args)
  const runId = readRequiredString(body, 'runId')
  const title = readOptionalString(body.title) ?? undefined

  const [run] = await getDb().select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1)
  if (!run) throw new Error('Agent run not found')
  if (run.issueId) {
    await readAccessibleIssue(req, run.issueId)
  } else if (!canAccessOrganization(req, null)) {
    throw new Error('Not authorized for this agent run')
  }

  const result = await finalizeAgentRunPullRequest({
    runId: run.id,
    title,
    activitySource: 'pach-mcp',
  })

  return {
    ok: true,
    runId: result.run.id,
    pullRequest: {
      id: result.pullRequest.id,
      number: result.pullRequest.number,
      url: result.pullRequest.url,
      title: result.pullRequest.title,
      state: result.pullRequest.state,
      isDraft: result.pullRequest.isDraft,
    },
    stdout: truncateText(result.stdout, 8_000),
    stderr: truncateText(result.stderr, 4_000),
  }
}

async function readAccessibleIssue(req: AuthenticatedRequest, issueId: string) {
  const normalizedIssueId = issueId.trim()
  if (!normalizedIssueId) throw new Error('Missing issueId')

  const [issue] = await getDb()
    .select()
    .from(pmIssues)
    .where(isUuid(normalizedIssueId) ? eq(pmIssues.id, normalizedIssueId) : ilike(pmIssues.identifier, normalizedIssueId))
    .limit(1)
  if (!issue) throw new Error('Issue not found')

  if (!canAccessIssue(req, issue)) throw new Error('Not authorized for this issue')

  return { issue }
}

async function readAccessibleAgentRunForMedia(req: AuthenticatedRequest, runId: string) {
  const normalizedRunId = runId.trim()
  if (!normalizedRunId) throw new Error('Missing runId')

  const [run] = await getDb()
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.id, normalizedRunId))
    .limit(1)
  if (!run) throw new Error('Agent run not found')

  if (run.issueId) {
    await readAccessibleIssue(req, run.issueId)
    return run
  }

  const organizationId = readMetadataString(run.metadata, 'organizationId')
  if (canAccessOrganization(req, organizationId)) return run

  throw new Error('Not authorized for this agent run')
}

function canAccessIssue(req: AuthenticatedRequest, issue: typeof pmIssues.$inferSelect) {
  const user = req.user
  const auth = req.mcpAuth
  if (!auth && !user) return false
  if (auth?.allOrganizations || user?.sub === LOCAL_MCP_USER.sub) return true

  return issue.contextCompanyId
    ? Boolean(auth?.organizationIds.includes(issue.contextCompanyId) || user?.organizationIds.includes(issue.contextCompanyId))
    : Boolean(auth?.canAccessUnscoped || user?.canAccessUnscoped)
}

function canAccessOrganization(req: AuthenticatedRequest, organizationId: string | null | undefined) {
  const user = req.user
  const auth = req.mcpAuth
  if (!auth && !user) return false
  if (auth?.allOrganizations || user?.sub === LOCAL_MCP_USER.sub) return true

  return organizationId
    ? Boolean(auth?.organizationIds.includes(organizationId) || user?.organizationIds.includes(organizationId))
    : Boolean(auth?.canAccessUnscoped || user?.canAccessUnscoped)
}

async function fallbackActivityOrganizationId() {
  const [pachOrganization] = await getDb()
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.project, 'pach'))
    .orderBy(organizations.createdAt)
    .limit(1)
  if (pachOrganization) return pachOrganization.id

  const [firstOrganization] = await getDb()
    .select({ id: organizations.id })
    .from(organizations)
    .orderBy(organizations.createdAt)
    .limit(1)
  return firstOrganization?.id ?? null
}

function canAccessDocument(req: AuthenticatedRequest, document: typeof documents.$inferSelect) {
  return canAccessOrganization(req, document.organizationId)
}

function documentMatchesOrganizationFilters(
  document: typeof documents.$inferSelect,
  organization: typeof organizations.$inferSelect | undefined,
  filters: {
    organizationIds: string[]
    organizationNames: string[]
    organizationProjects: string[]
  },
) {
  if (filters.organizationIds.length > 0 && !matchesStringFilter(document.organizationId, filters.organizationIds, 'exact')) {
    return false
  }
  if (filters.organizationNames.length > 0 && !matchesStringFilter(organization?.name, filters.organizationNames)) {
    return false
  }
  if (filters.organizationProjects.length > 0 && !matchesStringFilter(organization?.project, filters.organizationProjects, 'exact')) {
    return false
  }
  return true
}

function serializeDocumentSummary(
  document: typeof documents.$inferSelect,
  organization: typeof organizations.$inferSelect | undefined,
  owner: typeof users.$inferSelect | undefined,
  bodyPreviewLength: number,
) {
  return {
    id: document.id,
    organizationId: document.organizationId,
    organizationName: organization?.name ?? null,
    organizationProject: organization?.project ?? null,
    parentId: document.parentId,
    ownerId: document.ownerId,
    ownerName: displayUserName(owner),
    publicId: document.publicId,
    currentSnapshotId: document.currentSnapshotId,
    title: document.title,
    slug: document.slug,
    bodyPreview: truncateText(document.body, bodyPreviewLength),
    bodyLength: document.body.length,
    format: document.format,
    status: document.status,
    icon: document.icon,
    sortOrder: document.sortOrder,
    metadata: document.metadata ?? {},
    createdAt: document.createdAt.getTime(),
    updatedAt: document.updatedAt.getTime(),
  }
}

function serializeDocumentFull(
  document: typeof documents.$inferSelect,
  organization: typeof organizations.$inferSelect | undefined,
  owner: typeof users.$inferSelect | undefined,
) {
  return {
    ...serializeDocumentSummary(document, organization, owner, document.body.length),
    body: document.body,
  }
}

function serializeDocumentReference(document: typeof documents.$inferSelect | undefined) {
  if (!document) return null
  return {
    id: document.id,
    publicId: document.publicId,
    organizationId: document.organizationId,
    parentId: document.parentId,
    currentSnapshotId: document.currentSnapshotId,
    title: document.title,
    slug: document.slug,
    format: document.format,
    status: document.status,
    sortOrder: document.sortOrder,
    updatedAt: document.updatedAt.getTime(),
  }
}

function serializeDocumentSnapshot(snapshot: typeof documentSnapshots.$inferSelect) {
  return {
    id: snapshot.id,
    documentId: snapshot.documentId,
    organizationId: snapshot.organizationId,
    versionNumber: snapshot.versionNumber,
    title: snapshot.title,
    slug: snapshot.slug,
    body: snapshot.body,
    bodyLength: snapshot.body.length,
    format: snapshot.format,
    status: snapshot.status,
    createdByType: snapshot.createdByType,
    createdById: snapshot.createdById,
    agentRunId: snapshot.agentRunId,
    metadata: snapshot.metadata ?? {},
    createdAt: snapshot.createdAt.getTime(),
  }
}

async function readAccessibleDocumentFromArgs(req: AuthenticatedRequest, args: unknown) {
  const body = ensureObject(args)
  const documentId = readOptionalString(body.documentId)
  const publicId = readOptionalString(body.publicId)
  const slug = readOptionalString(body.slug)
  if (!documentId && !publicId && !slug) throw new Error('Provide documentId, publicId, or slug')

  const candidates = await getDb()
    .select()
    .from(documents)
    .where(documentId && isUuid(documentId)
      ? eq(documents.id, documentId)
      : publicId
        ? eq(documents.publicId, publicId)
        : eq(documents.slug, slug!))
    .limit(20)
  const organizationIds = uniqueStrings(candidates.map((document) => document.organizationId))
  const candidateOrganizations = organizationIds.length > 0
    ? await getDb().select().from(organizations).where(inArray(organizations.id, organizationIds))
    : []
  const organizationById = new Map(candidateOrganizations.map((organization) => [organization.id, organization]))
  const organizationFilters = {
    organizationIds: readStringFilters(body.organizationId, body.organizationIds),
    organizationNames: readStringFilters(body.organizationName, body.organizationNames),
    organizationProjects: readStringFilters(body.organizationProject, body.organizationProjects),
  }
  const accessibleCandidates = candidates
    .filter((document) => canAccessDocument(req, document))
    .filter((document) => document.status !== 'archived')
    .filter((document) => documentMatchesOrganizationFilters(document, organizationById.get(document.organizationId ?? ''), organizationFilters))

  if (accessibleCandidates.length === 0) throw new Error('Document not found')
  if (accessibleCandidates.length > 1) throw new Error('Document selector is ambiguous. Provide organizationId, organizationName, or organizationProject.')
  return accessibleCandidates[0]
}

async function readAccessibleSnapshotFromArgs(req: AuthenticatedRequest, args: unknown) {
  const body = ensureObject(args)
  const snapshotId = readOptionalString(body.snapshotId)
  const versionNumber = typeof body.versionNumber === 'number' && Number.isFinite(body.versionNumber)
    ? Math.floor(body.versionNumber)
    : null

  if (snapshotId) {
    const [snapshot] = await getDb().select().from(documentSnapshots).where(eq(documentSnapshots.id, snapshotId)).limit(1)
    if (!snapshot) throw new Error('Document snapshot not found')
    const [document] = await getDb().select().from(documents).where(eq(documents.id, snapshot.documentId)).limit(1)
    if (!document || !canAccessDocument(req, document)) throw new Error('Document snapshot not found')
    return { document, snapshot }
  }

  if (versionNumber == null) throw new Error('Provide snapshotId or versionNumber')
  const document = await readAccessibleDocumentFromArgs(req, body)
  const snapshots = await getDb()
    .select()
    .from(documentSnapshots)
    .where(eq(documentSnapshots.documentId, document.id))
    .limit(100)
  const snapshot = snapshots.find((entry) => entry.versionNumber === versionNumber)
  if (!snapshot) throw new Error('Document snapshot not found')
  return { document, snapshot }
}

async function resolveOrganizationForDocumentCreate(req: AuthenticatedRequest, body: Record<string, unknown>) {
  const organizationId = readOptionalString(body.organizationId)
  const organizationName = readOptionalString(body.organizationName)
  const organizationProject = readOptionalString(body.organizationProject)
  if (!organizationId && !organizationName && !organizationProject) {
    if (req.mcpAuth?.organizationIds.length === 1) {
      const [organization] = await getDb().select().from(organizations).where(eq(organizations.id, req.mcpAuth.organizationIds[0])).limit(1)
      if (organization && canAccessOrganization(req, organization.id)) return organization
    }
    if (canAccessOrganization(req, null)) return null
    throw new Error('Provide organizationId, organizationName, or organizationProject')
  }
  const rows = await getDb().select().from(organizations).limit(200)
  const matches = rows
    .filter((organization) => canAccessOrganization(req, organization.id))
    .filter((organization) => {
      if (organizationId && organization.id !== organizationId) return false
      if (organizationName && !matchesStringFilter(organization.name, [organizationName])) return false
      if (organizationProject && !matchesStringFilter(organization.project, [organizationProject], 'exact')) return false
      return true
    })
  if (matches.length === 0) throw new Error('Organization not found')
  if (matches.length > 1) throw new Error('Organization selector is ambiguous. Provide organizationId.')
  return matches[0]
}

async function nextDocumentPublicId(organization: typeof organizations.$inferSelect | null) {
  const prefix = documentPublicIdPrefix(organization)
  const rows = await getDb()
    .select({ publicId: documents.publicId })
    .from(documents)
    .where(organization?.id ? eq(documents.organizationId, organization.id) : isNull(documents.organizationId))
    .limit(1000)
  const max = rows.reduce((current, row) => {
    const match = (row.publicId ?? '').match(/-DOC-(\d+)$/)
    const value = match ? Number(match[1]) : 0
    return Number.isFinite(value) ? Math.max(current, value) : current
  }, 0)
  return `${prefix}-DOC-${max + 1}`
}

function documentPublicIdPrefix(organization: typeof organizations.$inferSelect | null) {
  const raw = (organization?.project ?? organization?.name ?? 'doc')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 3)
    .toUpperCase()
  return raw || 'DOC'
}

async function uniqueDocumentSlug(title: string, organizationId: string | null | undefined, ignoreId?: string) {
  const base = slugify(title)
  const rows = await getDb()
    .select({ id: documents.id, slug: documents.slug })
    .from(documents)
    .where(organizationId ? eq(documents.organizationId, organizationId) : isNull(documents.organizationId))
    .limit(1000)
  const taken = new Set(rows.filter((row) => row.id !== ignoreId).map((row) => row.slug))
  if (!taken.has(base)) return base
  let counter = 2
  while (taken.has(`${base}-${counter}`)) counter += 1
  return `${base}-${counter}`
}

async function readLatestDocumentVersionBase(document: typeof documents.$inferSelect) {
  const snapshots = await getDb()
    .select()
    .from(documentSnapshots)
    .where(eq(documentSnapshots.documentId, document.id))
    .orderBy(desc(documentSnapshots.versionNumber))
    .limit(20)
  const candidate = snapshots.find((snapshot) => snapshot.id !== document.currentSnapshotId)
  if (candidate) {
    return {
      kind: 'snapshot' as const,
      id: candidate.id,
      versionNumber: candidate.versionNumber,
      title: candidate.title,
      slug: candidate.slug,
      body: candidate.body,
      format: candidate.format,
    }
  }
  return documentVersionBaseFromDocument(document)
}

function documentVersionBaseFromDocument(document: typeof documents.$inferSelect) {
  return {
    kind: 'document' as const,
    id: document.id,
    versionNumber: null,
    title: document.title,
    slug: document.slug,
    body: document.body,
    format: document.format,
  }
}

async function createSnapshotForDocument(
  req: AuthenticatedRequest,
  document: typeof documents.$inferSelect,
  options: {
    status?: string
    runId?: string | null
    metadata?: Record<string, unknown>
  } = {},
) {
  const latest = await getDb()
    .select({ versionNumber: documentSnapshots.versionNumber })
    .from(documentSnapshots)
    .where(eq(documentSnapshots.documentId, document.id))
    .orderBy(desc(documentSnapshots.versionNumber))
    .limit(1)
  const versionNumber = (latest[0]?.versionNumber ?? 0) + 1
  const [snapshot] = await getDb().insert(documentSnapshots).values({
    id: randomUUID(),
    documentId: document.id,
    organizationId: document.organizationId ?? undefined,
    versionNumber,
    title: document.title,
    slug: document.slug,
    body: document.body,
    format: document.format,
    status: options.status ?? 'version',
    createdByType: options.runId ? 'agent' : req.mcpAuth?.kind === 'token' ? 'agent' : 'user',
    createdById: req.mcpAuth?.actorUserId && isUuid(req.mcpAuth.actorUserId) ? req.mcpAuth.actorUserId : undefined,
    agentRunId: options.runId ?? undefined,
    metadata: options.metadata ?? {},
    createdAt: new Date(),
  }).returning()
  return snapshot
}

function readSnapshotStatus(value: unknown): string | null {
  if (value === 'version' || value === 'draft' || value === 'approved') return value
  if (value == null) return null
  throw new Error('snapshot status must be version')
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return slug || 'document'
}

async function readDocumentAncestors(req: AuthenticatedRequest, document: typeof documents.$inferSelect) {
  const ancestors: Array<typeof documents.$inferSelect> = []
  let parentId = document.parentId

  for (let depth = 0; parentId && depth < 20; depth += 1) {
    const [parent] = await getDb().select().from(documents).where(eq(documents.id, parentId)).limit(1)
    if (!parent || !canAccessDocument(req, parent)) break
    ancestors.unshift(parent)
    parentId = parent.parentId
  }

  return ancestors
}

function readParentIdFilter(body: Record<string, unknown>) {
  const hasParentIdFilter = Object.prototype.hasOwnProperty.call(body, 'parentId')
  if (!hasParentIdFilter) return { hasParentIdFilter, parentIdFilter: undefined }
  if (body.parentId === null) return { hasParentIdFilter, parentIdFilter: null }
  if (typeof body.parentId === 'string' && body.parentId.trim()) {
    return { hasParentIdFilter, parentIdFilter: body.parentId.trim() }
  }
  throw new Error('parentId must be a string or null')
}

function compareDocumentsForTreeOrder(a: typeof documents.$inferSelect, b: typeof documents.$inferSelect) {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  return a.title.localeCompare(b.title)
}

function truncateText(value: string, maxLength: number) {
  if (maxLength <= 0) return ''
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`
}

function serializeDesignTemplate(
  template: typeof designTemplates.$inferSelect,
  organization?: typeof organizations.$inferSelect,
) {
  return {
    id: template.id,
    organizationId: template.organizationId,
    organizationName: organization?.name ?? null,
    organizationProject: organization?.project ?? null,
    type: template.type,
    name: template.name,
    slug: template.slug,
    status: template.status,
    sourceKind: template.sourceKind,
    currentVersionId: template.currentVersionId,
    metadata: template.metadata ?? {},
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  }
}

function serializeDesignSystem(system: typeof designSystems.$inferSelect) {
  return {
    id: system.id,
    organizationId: system.organizationId,
    name: system.name,
    slug: system.slug,
    markdown: system.markdown ?? '',
    tokens: system.tokens ?? {},
    assets: system.assets ?? {},
    metadata: system.metadata ?? {},
    createdAt: system.createdAt.toISOString(),
    updatedAt: system.updatedAt.toISOString(),
  }
}

function serializeDesignTemplateVersion(version: typeof designTemplateVersions.$inferSelect) {
  return {
    id: version.id,
    organizationId: version.organizationId,
    templateId: version.templateId,
    versionNumber: version.versionNumber,
    schemaVersion: version.schemaVersion,
    sourceKind: version.sourceKind,
    files: version.files ?? {},
    manifest: version.manifest ?? {},
    dependencies: version.dependencies ?? {},
    compiledArtifactUrl: version.compiledArtifactUrl,
    previewImageUrl: version.previewImageUrl,
    validationStatus: version.validationStatus,
    validationErrors: version.validationErrors ?? [],
    createdByRunId: version.createdByRunId,
    createdAt: version.createdAt.toISOString(),
  }
}

function serializeDesignTemplateRun(run: typeof designTemplateRuns.$inferSelect) {
  return {
    id: run.id,
    organizationId: run.organizationId,
    templateId: run.templateId,
    designSystemId: run.designSystemId,
    agentRunId: run.agentRunId,
    templateSlug: run.templateSlug,
    prompt: run.prompt,
    status: run.status,
    statusMessage: run.statusMessage,
    sourceVersionId: run.sourceVersionId,
    targetVersionId: run.targetVersionId,
    outputSpec: run.outputSpec ?? {},
    metadata: run.metadata ?? {},
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  }
}

function serializeDesignAsset(asset: typeof designAssets.$inferSelect, req: Request) {
  const stableUrl = asset.storageKey ? stableDesignAssetUrl(req, asset.id) : asset.url
  return {
    id: asset.id,
    organizationId: asset.organizationId,
    templateId: asset.templateId,
    kind: asset.kind,
    name: asset.name,
    storageKey: asset.storageKey,
    url: stableUrl,
    stableUrl,
    originalUrl: asset.url,
    expiresInSeconds: null,
    metadata: asset.metadata ?? {},
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  }
}

function stableDesignAssetUrl(req: Request, assetId: string) {
  return `${requestOrigin(req)}/media/design-assets/${encodeURIComponent(assetId)}/file`
}

function requestOrigin(req: Request) {
  const forwardedProto = req.header('x-forwarded-proto')?.split(',')[0]?.trim()
  const forwardedHost = req.header('x-forwarded-host')?.split(',')[0]?.trim()
  const proto = forwardedProto || req.protocol || 'http'
  const host = forwardedHost || req.get('host') || `localhost:${process.env.PORT || 3001}`
  return `${proto}://${host}`
}

function signedReadUrl(key: string) {
  return getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    }),
    { expiresIn: SIGNED_READ_SECONDS },
  )
}

function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: getAwsRegion(),
    })
  }
  return s3Client
}

function getBucketName() {
  const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET
  if (!bucket) throw new Error('Missing S3_BUCKET env var.')
  return bucket
}

function getAwsRegion() {
  return process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1'
}

async function appendIssueActivity(
  req: AuthenticatedRequest,
  activity: {
    issueId: string
    type: string
    summary: string
    metadata?: Record<string, unknown>
  },
) {
  const now = new Date()
  const auth = req.mcpAuth
  const user = req.user

  const [issue] = await getDb().select().from(pmIssues).where(eq(pmIssues.id, activity.issueId)).limit(1)
  if (!issue) throw new Error('Issue not found')
  if (!canAccessIssue(req, issue)) throw new Error('Not authorized for this issue')

  const organizationId = issue.contextCompanyId ?? await fallbackActivityOrganizationId()
  if (!organizationId) throw new Error('No organization available for issue activity')

  await getDb().insert(activityEvents).values({
    id: randomUUID(),
    organizationId,
    occurredAt: now,
    createdAt: now,
    eventType: activity.type,
    activityKind: issueActivityKind(activity.type, activity.metadata),
    origin: 'pach_work',
    subjectType: 'pm_issue',
    subjectId: issue.id,
    subjectLabel: issue.identifier,
    actorType: auth?.actorUserId ? 'user' : 'agent',
    actorId: auth?.actorUserId && isUuid(auth.actorUserId) ? auth.actorUserId : undefined,
    actorName: auth?.actorName ?? user?.name ?? user?.email ?? 'Pach agent',
    source: readMetadataString(activity.metadata, 'source') ?? 'pach-mcp',
    severity: activity.type === 'agent_run_failed' || readMetadataString(activity.metadata, 'level') === 'error'
      ? 'error'
      : readMetadataString(activity.metadata, 'level') === 'warn' || readMetadataString(activity.metadata, 'level') === 'warning'
        ? 'warning'
        : readMetadataString(activity.metadata, 'level') === 'debug'
          ? 'debug'
          : 'info',
    summary: activity.summary,
    details: {},
    metadata: activity.metadata ?? {},
  })

  await getDb()
    .update(pmIssues)
    .set({ lastActivityAt: now, updatedAt: now })
    .where(eq(pmIssues.id, activity.issueId))
}

function toolResult(value: unknown) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2),
      },
    ],
  }
}

function toolError(message: string) {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: message,
      },
    ],
  }
}

function jsonRpcResult(id: JsonRpcId, result: unknown) {
  return {
    jsonrpc: '2.0',
    id,
    result,
  }
}

function jsonRpcError(id: JsonRpcId, code: number, message: string) {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
    },
  }
}

function readRequiredString(args: unknown, key: string) {
  const body = ensureObject(args)
  const value = body[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required string argument: ${key}`)
  }
  return value
}

function readPositiveInteger(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readOptionalDate(value: unknown) {
  if (value == null || value === '') return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date
  }
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date
  }
  throw new Error('Date value must be an ISO timestamp or millisecond timestamp')
}

function readOptionalDateOnly(value: unknown, field: string) {
  const raw = readOptionalString(value)
  if (!raw) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`${field} must be in YYYY-MM-DD format`)
  const date = new Date(`${raw}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    throw new Error(`${field} must be a valid calendar date`)
  }
  return raw
}

function readStringFilters(...values: unknown[]) {
  return values.flatMap((value) => {
    if (typeof value === 'string' && value.trim()) return [value.trim()]
    return readStringArray(value).map((item) => item.trim()).filter(Boolean)
  })
}

function readNumberArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item)).map((item) => Math.floor(item))
    : []
}

function readStringRecord(value: unknown, field: string) {
  if (!isObject(value)) throw new Error(`${field} must be an object`)
  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') throw new Error(`${field}.${key} must be a string`)
    result[key] = entry
  }
  return result
}

function matchesAny(needle: string, values: Array<string | null | undefined>) {
  return values.some((value) => matchesStringFilter(value, [needle]))
}

function matchesAnyFilter(filters: string[], values: Array<string | null | undefined>) {
  return values.some((value) => matchesStringFilter(value, filters))
}

function matchesStringFilter(value: string | null | undefined, filters: string[], mode: 'contains' | 'exact' = 'contains') {
  if (!value) return false
  const normalizedValue = normalizeForFilter(value)
  return filters.some((filter) => {
    const normalizedFilter = normalizeForFilter(filter)
    return mode === 'exact' ? normalizedValue === normalizedFilter : normalizedValue.includes(normalizedFilter)
  })
}

function normalizeForFilter(value: string) {
  return value.trim().toLowerCase()
}

function readProgressLevel(metadata: Record<string, unknown>) {
  const level = metadata.level
  return level === 'debug' || level === 'info' || level === 'warn' || level === 'error' ? level : 'info'
}

function normalizeActivitySeverity(value: string | null) {
  if (!value) return 'info'
  const normalized = value.toLowerCase()
  return normalized === 'warn' ? 'warning' : normalized
}

function normalizeActivityKind(value: string | null) {
  if (!value) return 'operational'
  const normalized = value.toLowerCase()
  if (normalized === 'signal') return 'business_signal'
  if (['progress', 'business_signal', 'operational', 'incident'].includes(normalized)) return normalized
  throw new Error('activityKind must be one of progress, business_signal, operational, or incident.')
}

function normalizeActivityOrigin(value: string | null, fallback: 'pach_work' | 'organization_work' | 'organization_user_work') {
  if (!value) return fallback
  const normalized = value.toLowerCase()
  if (normalized === 'pach_work' || normalized === 'organization_work' || normalized === 'organization_user_work') return normalized
  throw new Error('origin must be pach_work, organization_work, or organization_user_work.')
}

function issueActivityKind(type: string, metadata?: Record<string, unknown>) {
  if (type === 'completed') return 'progress'
  if (type === 'agent_run_failed' || readMetadataString(metadata, 'level') === 'error') return 'incident'
  return 'operational'
}

function readMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== 'object') return null
  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readMetadataNumber(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== 'object') return null
  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function runTurnMetadata(run: typeof agentRuns.$inferSelect) {
  const feedbackMessageId = readMetadataString(run.metadata, 'feedbackMessageId')
  const followUpCount = readMetadataNumber(run.metadata, 'followUpCount')
  return {
    ...(feedbackMessageId ? { feedbackMessageId } : {}),
    ...(followUpCount !== null ? { followUpCount } : {}),
  }
}

function ensureObject(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new Error('Tool arguments must be an object')
  return value
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readJwtUser(token: string) {
  try {
    const user = verifyToken(token)
    return { ...user, organizationIds: user.organizationIds ?? [] }
  } catch {
    return null
  }
}

async function readMcpTokenAuth(token: string): Promise<McpAuthContext | null> {
  const [stored] = await getDb()
    .select()
    .from(mcpTokens)
    .where(eq(mcpTokens.tokenHash, hashMcpToken(token)))
    .limit(1)

  if (!stored) return null
  if (stored.revokedAt) return null
  if (stored.expiresAt && stored.expiresAt.getTime() <= Date.now()) return null

  await getDb()
    .update(mcpTokens)
    .set({
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(mcpTokens.id, stored.id))

  return {
    kind: 'token',
    subjectId: stored.id,
    actorUserId: stored.ownerUserId ?? undefined,
    actorName: `MCP token: ${stored.name}`,
    tokenId: stored.id,
    allOrganizations: stored.allOrganizations,
    canAccessUnscoped: stored.canAccessUnscoped,
    organizationIds: readStringArray(stored.organizationIds),
    capabilities: readStringArray(stored.capabilities),
  }
}

function requireMcpCapability(req: AuthenticatedRequest, capability: McpCapability) {
  const auth = req.mcpAuth
  if (!auth) throw new Error('Not authenticated')
  if (!hasMcpCapability(auth, capability)) {
    throw new Error(`MCP token is missing capability: ${capability}`)
  }
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function readCapabilities(value: unknown) {
  if (value === 'all') return ['*']
  const capabilities = readStringArray(value)
  return capabilities.length > 0 ? capabilities : [...MCP_CAPABILITIES]
}

function isLocalRequest(req: Request) {
  const address = req.socket.remoteAddress
  return address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1' ||
    address === undefined
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function serializeIssue(issue: typeof pmIssues.$inferSelect) {
  return serializeRow(issue)
}

function serializeRow<T extends Record<string, unknown>>(row: T) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date ? value.getTime() : value,
    ]),
  )
}

function serializeNullableRow<T extends Record<string, unknown>>(row: T | undefined) {
  return row ? serializeRow(row) : null
}

function summarizeFinanceMovementsByCurrency(
  movements: Array<{ currencyCode: unknown, amountMinor: unknown, type: unknown, status: unknown }>,
) {
  const byCurrency = new Map<string, {
    currencyCode: string
    incomeMinor: number
    expenseMinor: number
    transferMinor: number
    adjustmentMinor: number
    netMinor: number
    movementCount: number
    pendingReviewCount: number
  }>()

  for (const movement of movements) {
    if (typeof movement.currencyCode !== 'string' || typeof movement.amountMinor !== 'number') continue
    const current = byCurrency.get(movement.currencyCode) ?? {
      currencyCode: movement.currencyCode,
      incomeMinor: 0,
      expenseMinor: 0,
      transferMinor: 0,
      adjustmentMinor: 0,
      netMinor: 0,
      movementCount: 0,
      pendingReviewCount: 0,
    }
    current.netMinor += movement.amountMinor
    current.movementCount += 1
    if (movement.status === 'pending_review') current.pendingReviewCount += 1
    if (movement.type === 'income') current.incomeMinor += movement.amountMinor
    if (movement.type === 'expense') current.expenseMinor += movement.amountMinor
    if (movement.type === 'transfer') current.transferMinor += movement.amountMinor
    if (movement.type === 'adjustment') current.adjustmentMinor += movement.amountMinor
    byCurrency.set(movement.currencyCode, current)
  }

  return [...byCurrency.values()]
}

function serializePublicUser(user: typeof users.$inferSelect) {
  const { passwordHash: _passwordHash, ...publicUser } = user
  return serializeRow(publicUser)
}

function serializeActivityEvent(event: typeof activityEvents.$inferSelect, organization?: typeof organizations.$inferSelect) {
  return {
    id: event.id,
    organizationId: event.organizationId,
    organizationName: organization?.name ?? null,
    organizationProject: organization?.project ?? null,
    occurredAt: event.occurredAt.toISOString(),
    createdAt: event.createdAt.toISOString(),
    eventType: event.eventType,
    activityKind: event.activityKind,
    origin: event.origin,
    subjectType: event.subjectType,
    subjectId: event.subjectId,
    subject: event.subjectLabel,
    subjectLabel: event.subjectLabel,
    actorType: event.actorType,
    actorId: event.actorId,
    actorName: event.actorName,
    source: event.source,
    severity: event.severity,
    summary: event.summary,
    details: event.details ?? {},
    metadata: event.metadata ?? {},
  }
}

function displayUserName(user: typeof users.$inferSelect | undefined) {
  if (!user) return null
  return user.name ?? user.email
}

function priorityLabel(priority: number) {
  switch (priority) {
    case 1:
      return 'urgent'
    case 2:
      return 'high'
    case 3:
      return 'medium'
    case 4:
      return 'low'
    default:
      return 'none'
  }
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0)))
}

function groupBy<T>(values: T[], keyFor: (value: T) => string) {
  const grouped = new Map<string, T[]>()
  for (const value of values) {
    const key = keyFor(value)
    grouped.set(key, [...(grouped.get(key) ?? []), value])
  }
  return grouped
}

function groupLimitedBy<T>(values: T[], keyFor: (value: T) => string, limit: number) {
  const grouped = new Map<string, T[]>()
  for (const value of values) {
    const key = keyFor(value)
    const group = grouped.get(key) ?? []
    if (group.length < limit) grouped.set(key, [...group, value])
  }
  return grouped
}

export default router
