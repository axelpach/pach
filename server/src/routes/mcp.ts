import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { Request } from 'express'
import { desc, eq, ilike, inArray } from 'drizzle-orm'
import {
  agentRuns,
  mcpTokens,
  pmIssueActivity,
  pmIssueLabels,
  pmIssues,
  pmLabels,
  pmProjects,
  pmStatuses,
  pmTeams,
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

const router = Router()
const MCP_PROTOCOL_VERSION = '2024-11-05'
const ALLOW_LOCAL_MCP_NO_AUTH =
  process.env.PACH_MCP_ALLOW_LOCAL_NO_AUTH === 'true' ||
  (process.env.NODE_ENV !== 'production' && process.env.PACH_MCP_ALLOW_LOCAL_NO_AUTH !== 'false')
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
    description: 'Read a Pach issue with its team, project, status, labels, recent activity, and recent agent runs.',
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
    description: 'List recent Pach issues the caller can access, ordered by creation time descending, with compact triage metadata.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of issues to return. Defaults to 10, maximum 50.',
        },
        statusTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional status type filter, e.g. ["backlog", "unstarted", "started", "blocked", "review"].',
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
    name: 'pach.progress.report',
    description: 'Report structured agent progress for an issue/run. Pach stores it as issue activity and updates run metadata.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['issueId', 'phase'],
      properties: {
        issueId: { type: 'string' },
        runId: { type: 'string' },
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
        metadata: {
          type: 'object',
          additionalProperties: true,
        },
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
            'Ask for approval before irreversible external actions such as sending messages, publishing, or pushing PRs.',
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
      case 'pach.progress.report':
        requireMcpCapability(req, 'pach.progress.report')
        return toolResult(await reportProgress(req, args))
      default:
        return toolError(`Unknown tool: ${name}`)
    }
  } catch (error) {
    return toolError(error instanceof Error ? error.message : 'Unknown tool error')
  }
}

async function listIssues(req: AuthenticatedRequest, args: unknown) {
  const body = isObject(args) ? args : {}
  const limit = readPositiveInteger(body.limit, 10, 1, 50)
  const activityLimit = readPositiveInteger(body.activityLimit, 3, 0, 10)
  const runLimit = readPositiveInteger(body.runLimit, 2, 0, 5)
  const statusTypes = readStringArray(body.statusTypes)
  const db = getDb()
  const rows = await db
    .select()
    .from(pmIssues)
    .orderBy(desc(pmIssues.createdAt))
    .limit(limit * 8)

  const accessibleRows = rows
    .filter((issue) => canAccessIssue(req, issue))

  const candidateStatusIds = uniqueStrings(accessibleRows.map((issue) => issue.statusId))
  const candidateStatuses = candidateStatusIds.length > 0
    ? await db.select().from(pmStatuses).where(inArray(pmStatuses.id, candidateStatusIds))
    : []
  const statusById = new Map(candidateStatuses.map((status) => [status.id, status]))
  const issues = accessibleRows
    .filter((issue) => statusTypes.length === 0 || statusTypes.includes(statusById.get(issue.statusId)?.type ?? ''))
    .slice(0, limit)

  const issueIds = uniqueStrings(issues.map((issue) => issue.id))
  const teamIds = uniqueStrings(issues.map((issue) => issue.teamId))
  const projectIds = uniqueStrings(issues.map((issue) => issue.projectId))
  const statusIds = uniqueStrings(issues.map((issue) => issue.statusId))
  const teams = teamIds.length > 0 ? await db.select().from(pmTeams).where(inArray(pmTeams.id, teamIds)) : []
  const projects = projectIds.length > 0 ? await db.select().from(pmProjects).where(inArray(pmProjects.id, projectIds)) : []
  const statuses = statusIds.length > 0
    ? candidateStatuses.filter((status) => statusIds.includes(status.id))
    : []
  const labelLinks = issueIds.length > 0 ? await db.select().from(pmIssueLabels).where(inArray(pmIssueLabels.issueId, issueIds)) : []
  const labelIds = uniqueStrings(labelLinks.map((link) => link.labelId))
  const labels = labelIds.length > 0 ? await db.select().from(pmLabels).where(inArray(pmLabels.id, labelIds)) : []
  const activity = issueIds.length > 0 && activityLimit > 0
    ? await db
      .select()
      .from(pmIssueActivity)
      .where(inArray(pmIssueActivity.issueId, issueIds))
      .orderBy(desc(pmIssueActivity.createdAt))
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
  const teamById = new Map(teams.map((team) => [team.id, team]))
  const projectById = new Map(projects.map((project) => [project.id, project]))
  const selectedStatusById = new Map(statuses.map((status) => [status.id, status]))
  const labelById = new Map(labels.map((label) => [label.id, label]))
  const labelsByIssueId = groupBy(labelLinks, (link) => link.issueId)
  const activityByIssueId = groupLimitedBy(activity, (entry) => entry.issueId, activityLimit)
  const runsByIssueId = groupLimitedBy(runs, (run) => run.issueId, runLimit)

  return {
    issues: issues.map((issue) => ({
      issue: serializeIssue(issue),
      team: serializeNullableRow(teamById.get(issue.teamId)),
      project: issue.projectId ? serializeNullableRow(projectById.get(issue.projectId)) : null,
      status: serializeNullableRow(selectedStatusById.get(issue.statusId)),
      labels: (labelsByIssueId.get(issue.id) ?? [])
        .map((link) => labelById.get(link.labelId))
        .filter((label): label is typeof pmLabels.$inferSelect => Boolean(label))
        .map(serializeRow),
      recentActivity: (activityByIssueId.get(issue.id) ?? []).map(serializeRow),
      recentAgentRuns: (runsByIssueId.get(issue.id) ?? []).map(serializeRow),
      triage: {
        statusType: selectedStatusById.get(issue.statusId)?.type ?? null,
        priority: issue.priority,
        estimate: issue.estimate,
        dueDate: issue.dueDate ? issue.dueDate.getTime() : null,
        lastActivityAt: issue.lastActivityAt.getTime(),
        labelNames: (labelsByIssueId.get(issue.id) ?? [])
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
  const labelLinks = await db.select().from(pmIssueLabels).where(eq(pmIssueLabels.issueId, issue.id))
  const labels = labelLinks.length > 0
    ? await db
      .select()
      .from(pmLabels)
      .where(inArray(pmLabels.id, labelLinks.map((link) => link.labelId)))
    : []
  const activity = await db
    .select()
    .from(pmIssueActivity)
    .where(eq(pmIssueActivity.issueId, issue.id))
    .orderBy(desc(pmIssueActivity.createdAt))
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
    project: project ? serializeRow(project) : null,
    status: status ? serializeRow(status) : null,
    labels: labels.map(serializeRow),
    recentActivity: activity.map(serializeRow),
    recentAgentRuns: runs.map(serializeRow),
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
  if (typeof body.statusId === 'string') updates.statusId = body.statusId
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

async function reportProgress(req: AuthenticatedRequest, args: unknown) {
  const issueId = readRequiredString(args, 'issueId')
  const phase = readRequiredString(args, 'phase')
  const body = ensureObject(args)
  const { issue } = await readAccessibleIssue(req, issueId)
  const runId = typeof body.runId === 'string' ? body.runId : null
  const message = typeof body.message === 'string' ? body.message : phase
  const percent = typeof body.percent === 'number' ? Math.max(0, Math.min(100, body.percent)) : null
  const metadata = isObject(body.metadata) ? body.metadata : {}
  const now = new Date()

  await appendIssueActivity(req, {
    issueId: issue.id,
    type: 'agent_progress',
    summary: message,
    metadata: {
      source: 'pach-mcp',
      phase,
      percent,
      runId,
      ...metadata,
    },
  })

  if (runId) {
    const [run] = await getDb().select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1)
    if (!run) throw new Error('Agent run not found')
    if (run.issueId !== issue.id) throw new Error('Agent run does not belong to this issue')

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
          },
        },
        updatedAt: now,
      })
      .where(eq(agentRuns.id, run.id))
  }

  return {
    ok: true,
    issueId: issue.id,
    runId,
    phase,
    message,
    percent,
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

function canAccessIssue(req: AuthenticatedRequest, issue: typeof pmIssues.$inferSelect) {
  const user = req.user
  const auth = req.mcpAuth
  if (!auth && !user) return false
  if (auth?.allOrganizations || user?.sub === LOCAL_MCP_USER.sub) return true

  return issue.contextCompanyId
    ? Boolean(auth?.organizationIds.includes(issue.contextCompanyId) || user?.organizationIds.includes(issue.contextCompanyId))
    : Boolean(auth?.canAccessUnscoped || user?.canAccessUnscoped)
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

  await getDb().insert(pmIssueActivity).values({
    id: randomUUID(),
    issueId: activity.issueId,
    actorId: auth?.actorUserId && isUuid(auth.actorUserId) ? auth.actorUserId : undefined,
    actorName: auth?.actorName ?? user?.name ?? user?.email ?? 'Pach agent',
    type: activity.type,
    summary: activity.summary,
    metadata: activity.metadata,
    createdAt: now,
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
