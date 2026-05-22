import { eq } from 'drizzle-orm'
import type { InferSelectModel } from 'drizzle-orm'
import type { getDb } from '../../db.js'
import {
  pmIssueActivity,
  pmIssueLabels,
  pmIssues,
  pmLabels,
  pmProjects,
  pmStatuses,
  pmTeams,
  users,
} from '../../../../db/schema.js'

type Db = ReturnType<typeof getDb>

type ImportOptions = {
  dryRun?: boolean
  contextCompanyId?: string
  teamIds?: string[]
  defaultAssigneeId?: string
}

type ImportSummary = {
  dryRun: boolean
  linear: {
    teams: number
    projects: number
    labels: number
    issues: number
  }
  imported: {
    teams: { created: number; updated: number }
    statuses: { created: number; updated: number }
    projects: { created: number; updated: number }
    labels: { created: number; updated: number }
    issues: { created: number; updated: number }
    issueLabels: { created: number }
    activity: { created: number }
  }
}

type LinearConnection<T> = {
  nodes: T[]
  pageInfo: {
    hasNextPage: boolean
    endCursor: null | string
  }
}

type LinearTeam = {
  id: string
  key: string
  name: string
  color?: null | string
  states: LinearConnection<LinearState>
}

type LinearState = {
  id: string
  name: string
  type?: null | string
  color?: null | string
  position?: null | number
}

type LinearProject = {
  id: string
  name: string
  description?: null | string
  slugId?: null | string
  icon?: null | string
  color?: null | string
  targetDate?: null | string
  state?: null | string
  teams: LinearConnection<Pick<LinearTeam, 'id'>>
}

type LinearLabel = {
  id: string
  name: string
  color?: null | string
  description?: null | string
  team?: null | {
    id: string
  }
}

type LinearIssue = {
  id: string
  identifier: string
  title: string
  description?: null | string
  priority: number
  estimate?: null | number
  createdAt: string
  updatedAt: string
  startedAt?: null | string
  completedAt?: null | string
  canceledAt?: null | string
  dueDate?: null | string
  team: Pick<LinearTeam, 'id' | 'key' | 'name'>
  state: Pick<LinearState, 'id' | 'name' | 'type' | 'color' | 'position'>
  project?: null | Pick<LinearProject, 'id'>
  assignee?: null | {
    id: string
    name?: null | string
    email?: null | string
  }
  labels: LinearConnection<Pick<LinearLabel, 'id' | 'name'>>
}

type TeamRow = InferSelectModel<typeof pmTeams>
type StatusRow = InferSelectModel<typeof pmStatuses>
type ProjectRow = InferSelectModel<typeof pmProjects>
type LabelRow = InferSelectModel<typeof pmLabels>
type IssueRow = InferSelectModel<typeof pmIssues>
type UserRow = InferSelectModel<typeof users>

const CANONICAL_STATUSES = [
  { key: 'todo', name: 'Todo', type: 'unstarted', color: '#94a3b8', position: 0 },
  { key: 'in_progress', name: 'In Progress', type: 'started', color: '#fbbf24', position: 1 },
  { key: 'blocked', name: 'Blocked', type: 'blocked', color: '#f87171', position: 2 },
  { key: 'canceled', name: 'Canceled', type: 'canceled', color: '#6b7280', position: 3 },
  { key: 'done', name: 'Done', type: 'completed', color: '#4ade80', position: 4 },
] as const

const LINEAR_API_URL = process.env.LINEAR_API_URL || 'https://api.linear.app/graphql'

function requireLinearApiKey() {
  const apiKey = process.env.LINEAR_API_KEY
  if (!apiKey) throw new Error('LINEAR_API_KEY is not configured')
  return apiKey
}

async function linearRequest<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: requireLinearApiKey(),
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    throw new Error(`Linear API request failed with ${response.status}: ${await response.text()}`)
  }

  const payload = await response.json() as { data?: T; errors?: Array<{ message?: string }> }
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((entry) => entry.message || 'Unknown Linear error').join('; '))
  }
  if (!payload.data) {
    throw new Error('Linear API returned no data')
  }
  return payload.data
}

async function paginateLinear<T>(
  key: string,
  nodeSelection: string,
  extraArgs = '',
  pageSize = 100,
): Promise<T[]> {
  const all: T[] = []
  let after: null | string = null

  for (;;) {
    const query = `
      query PaginatedLinearQuery($first: Int!, $after: String) {
        ${key}(first: $first, after: $after${extraArgs ? `, ${extraArgs}` : ''}) {
          nodes {
            ${nodeSelection}
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `

    const data = await linearRequest<Record<string, LinearConnection<T>>>(query, { first: pageSize, after })
    const connection = data[key]
    all.push(...connection.nodes)

    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break
    after = connection.pageInfo.endCursor
  }

  return all
}

async function fetchLinearSnapshot(teamIds?: string[]) {
  const teamRows = await paginateLinear<Omit<LinearTeam, 'states'>>(
    'teams',
    `
      id
      key
      name
      color
    `,
  )

  const allowedTeamIds = teamIds?.length ? new Set(teamIds) : null
  const filteredTeamRows = allowedTeamIds
    ? teamRows.filter((team) => allowedTeamIds.has(team.id))
    : teamRows

  const filteredTeams = await Promise.all(filteredTeamRows.map(async (team) => {
    const data = await linearRequest<{ team: { states: LinearConnection<LinearState> } }>(
      `
        query LinearTeamStates($id: String!) {
          team(id: $id) {
            states(first: 100) {
              nodes {
                id
                name
                type
                color
                position
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `,
      { id: team.id },
    )

    return {
      ...team,
      states: data.team.states,
    }
  }))

  const projects = await paginateLinear<LinearProject>(
    'projects',
    `
      id
      name
      description
      slugId
      icon
      color
      targetDate
      state
      teams(first: 20) {
        nodes {
          id
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    `,
  )

  const labels = await paginateLinear<LinearLabel>(
    'issueLabels',
    `
      id
      name
      color
      description
      team {
        id
      }
    `,
  )

  const issues = await paginateLinear<LinearIssue>(
    'issues',
    `
      id
      identifier
      title
      description
      priority
      estimate
      createdAt
      updatedAt
      startedAt
      completedAt
      canceledAt
      dueDate
      team {
        id
        key
        name
      }
      state {
        id
        name
        type
        color
        position
      }
      project {
        id
      }
      assignee {
        id
        name
        email
      }
      labels(first: 20) {
        nodes {
          id
          name
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    `,
    'orderBy: updatedAt',
    25,
  )

  const teamIdSet = new Set(filteredTeams.map((team) => team.id))

  return {
    teams: filteredTeams,
    projects: projects.filter((project) =>
      project.teams.nodes.some((team) => teamIdSet.has(team.id)),
    ),
    labels: labels.filter((label) => !label.team || teamIdSet.has(label.team.id)),
    issues: issues.filter((issue) => teamIdSet.has(issue.team.id)),
  }
}

function normalizeProjectStatus(state?: null | string) {
  const value = state?.toLowerCase() ?? ''
  if (value.includes('complete') || value.includes('done') || value.includes('cancel')) return 'completed'
  if (value.includes('archive')) return 'archived'
  return 'active'
}

function normalizeStateType(state: Pick<LinearState, 'name' | 'type'>) {
  const rawType = state.type?.toLowerCase() ?? ''
  const name = state.name.toLowerCase()
  if (name.includes('block')) return 'blocked'
  if (rawType === 'backlog') return 'backlog'
  if (rawType === 'unstarted') return 'unstarted'
  if (rawType === 'started') return 'started'
  if (rawType === 'completed') return 'completed'
  if (rawType === 'canceled') return 'canceled'
  if (rawType === 'duplicate') return 'canceled'
  return 'unstarted'
}

function normalizeLinearStatusKey(state: Pick<LinearState, 'name' | 'type'>) {
  const stateType = normalizeStateType(state)
  if (stateType === 'blocked') return 'blocked'
  if (stateType === 'started') return 'in_progress'
  if (stateType === 'completed') return 'done'
  if (stateType === 'canceled') return 'canceled'
  return 'todo'
}

function parseDate(value?: null | string) {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function normalizeIdentifierNumber(identifier: string) {
  const match = identifier.match(/-(\d+)$/)
  return match ? Number(match[1]) : 0
}

export async function importLinearWorkspace(db: Db, options: ImportOptions = {}): Promise<ImportSummary> {
  requireLinearApiKey()

  const { dryRun = false, contextCompanyId, teamIds, defaultAssigneeId } = options
  const snapshot = await fetchLinearSnapshot(teamIds)

  const existingTeams = await db.select().from(pmTeams)
  const existingStatuses = await db.select().from(pmStatuses)
  const existingProjects = await db.select().from(pmProjects)
  const existingLabels = await db.select().from(pmLabels)
  const existingIssues = await db.select().from(pmIssues)
  const existingIssueLabels = await db.select().from(pmIssueLabels)
  const existingUsers = await db.select().from(users)

  const teamByKey = new Map(existingTeams.map((team) => [team.key.toUpperCase(), team]))
  const statusByKey = new Map(existingStatuses.filter((status) => !status.teamId).map((status) => [status.key, status]))
  const projectBySlug = new Map(existingProjects.map((project) => [project.slug, project]))
  const labelByTeamAndName = new Map(existingLabels.map((label) => [`${label.teamId ?? 'workspace'}:${label.name.toLowerCase()}`, label]))
  const issueByIdentifier = new Map(existingIssues.map((issue) => [issue.identifier, issue]))
  const issueLabelKeySet = new Set(existingIssueLabels.map((entry) => `${entry.issueId}:${entry.labelId}`))
  const userByEmail = new Map(existingUsers.filter((user) => user.email).map((user) => [user.email.toLowerCase(), user]))

  const linearTeamIdToLocalTeam = new Map<string, TeamRow>()
  const canonicalStatusByKey = new Map<string, StatusRow>()
  const linearProjectIdToLocalProject = new Map<string, ProjectRow>()
  const linearLabelIdToLocalLabel = new Map<string, LabelRow>()
  const linearIssueIdToLocalIssue = new Map<string, IssueRow>()

  const summary: ImportSummary = {
    dryRun,
    linear: {
      teams: snapshot.teams.length,
      projects: snapshot.projects.length,
      labels: snapshot.labels.length,
      issues: snapshot.issues.length,
    },
    imported: {
      teams: { created: 0, updated: 0 },
      statuses: { created: 0, updated: 0 },
      projects: { created: 0, updated: 0 },
      labels: { created: 0, updated: 0 },
      issues: { created: 0, updated: 0 },
      issueLabels: { created: 0 },
      activity: { created: 0 },
    },
  }

  let nextTeamPosition = existingTeams.reduce((max, team) => Math.max(max, team.position), -1) + 1

  for (const linearTeam of snapshot.teams) {
    const existing = teamByKey.get(linearTeam.key.toUpperCase())
    if (existing) {
      summary.imported.teams.updated += 1
      const updatedTeam: TeamRow = {
        ...existing,
        name: linearTeam.name,
        color: linearTeam.color ?? existing.color,
        updatedAt: new Date(),
      }
      linearTeamIdToLocalTeam.set(linearTeam.id, updatedTeam)
      if (!dryRun) {
        await db.update(pmTeams).set({
          name: linearTeam.name,
          color: linearTeam.color ?? existing.color,
          updatedAt: new Date(),
        }).where(eq(pmTeams.id, existing.id))
      }
    } else {
      summary.imported.teams.created += 1
      const createdTeam: TeamRow = {
        id: crypto.randomUUID(),
        companyId: undefined,
        key: linearTeam.key.toUpperCase(),
        name: linearTeam.name,
        description: 'Imported from Linear',
        color: linearTeam.color ?? undefined,
        icon: undefined,
        position: nextTeamPosition++,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      linearTeamIdToLocalTeam.set(linearTeam.id, createdTeam)
      if (!dryRun) {
        await db.insert(pmTeams).values(createdTeam)
      }
    }
  }

  for (const definition of CANONICAL_STATUSES) {
    const existing = statusByKey.get(definition.key)
    if (existing) {
      summary.imported.statuses.updated += 1
      const updatedStatus: StatusRow = {
        ...existing,
        companyId: undefined,
        teamId: undefined,
        name: definition.name,
        key: definition.key,
        type: definition.type,
        description: 'Workspace status',
        color: definition.color,
        position: definition.position,
        updatedAt: new Date(),
      }
      canonicalStatusByKey.set(definition.key, updatedStatus)
      if (!dryRun) {
        await db.update(pmStatuses).set({
          companyId: undefined,
          teamId: undefined,
          name: definition.name,
          key: definition.key,
          type: definition.type,
          description: 'Workspace status',
          color: definition.color,
          position: definition.position,
          updatedAt: new Date(),
        }).where(eq(pmStatuses.id, existing.id))
      }
    } else {
      summary.imported.statuses.created += 1
      const createdStatus: StatusRow = {
        id: crypto.randomUUID(),
        companyId: undefined,
        teamId: undefined,
        key: definition.key,
        name: definition.name,
        type: definition.type,
        description: 'Workspace status',
        color: definition.color,
        position: definition.position,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      canonicalStatusByKey.set(definition.key, createdStatus)
      if (!dryRun) {
        await db.insert(pmStatuses).values(createdStatus)
      }
    }
  }

  for (const linearProject of snapshot.projects) {
    const localTeam = linearProject.teams.nodes[0] ? linearTeamIdToLocalTeam.get(linearProject.teams.nodes[0].id) : undefined
    const slug = `linear-${linearProject.id}`
    const existing = projectBySlug.get(slug)
    const targetDate = parseDate(linearProject.targetDate)
    const nextStatus = normalizeProjectStatus(linearProject.state)

    if (existing) {
      summary.imported.projects.updated += 1
      const updatedProject: ProjectRow = {
        ...existing,
        teamId: localTeam?.id ?? existing.teamId,
        name: linearProject.name,
        slug,
        description: linearProject.description ?? existing.description,
        color: linearProject.color ?? existing.color,
        icon: linearProject.icon ?? existing.icon,
        status: nextStatus,
        targetDate,
        updatedAt: new Date(),
      }
      linearProjectIdToLocalProject.set(linearProject.id, updatedProject)
      if (!dryRun) {
        await db.update(pmProjects).set({
          teamId: localTeam?.id ?? existing.teamId,
          name: linearProject.name,
          slug,
          description: linearProject.description ?? existing.description,
          color: linearProject.color ?? existing.color,
          icon: linearProject.icon ?? existing.icon,
          status: nextStatus,
          targetDate,
          updatedAt: new Date(),
        }).where(eq(pmProjects.id, existing.id))
      }
    } else {
      summary.imported.projects.created += 1
      const createdProject: ProjectRow = {
        id: crypto.randomUUID(),
        companyId: undefined,
        teamId: localTeam?.id,
        name: linearProject.name,
        slug,
        description: linearProject.description ?? 'Imported from Linear',
        color: linearProject.color ?? undefined,
        icon: linearProject.icon ?? undefined,
        status: nextStatus,
        targetDate,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      linearProjectIdToLocalProject.set(linearProject.id, createdProject)
      if (!dryRun) {
        await db.insert(pmProjects).values(createdProject)
      }
    }
  }

  for (const linearLabel of snapshot.labels) {
    const localTeam = linearLabel.team ? linearTeamIdToLocalTeam.get(linearLabel.team.id) : undefined
    const labelKey = `${localTeam?.id ?? 'workspace'}:${linearLabel.name.toLowerCase()}`
    const existing = labelByTeamAndName.get(labelKey)

    if (existing) {
      summary.imported.labels.updated += 1
      const updatedLabel: LabelRow = {
        ...existing,
        teamId: localTeam?.id,
        name: linearLabel.name,
        color: linearLabel.color ?? existing.color,
        description: linearLabel.description ?? existing.description,
        updatedAt: new Date(),
      }
      linearLabelIdToLocalLabel.set(linearLabel.id, updatedLabel)
      if (!dryRun) {
        await db.update(pmLabels).set({
          teamId: localTeam?.id,
          name: linearLabel.name,
          color: linearLabel.color ?? existing.color,
          description: linearLabel.description ?? existing.description,
          updatedAt: new Date(),
        }).where(eq(pmLabels.id, existing.id))
      }
    } else {
      summary.imported.labels.created += 1
      const createdLabel: LabelRow = {
        id: crypto.randomUUID(),
        companyId: undefined,
        teamId: localTeam?.id,
        name: linearLabel.name,
        color: linearLabel.color ?? undefined,
        description: linearLabel.description ?? 'Imported from Linear',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      linearLabelIdToLocalLabel.set(linearLabel.id, createdLabel)
      if (!dryRun) {
        await db.insert(pmLabels).values(createdLabel)
      }
    }
  }

  for (const linearIssue of snapshot.issues) {
    const localTeam = linearTeamIdToLocalTeam.get(linearIssue.team.id)
    const localStatus = canonicalStatusByKey.get(normalizeLinearStatusKey(linearIssue.state))
    if (!localTeam || !localStatus) continue

    const localProject = linearIssue.project ? linearProjectIdToLocalProject.get(linearIssue.project.id) : undefined
    const assignee = linearIssue.assignee?.email ? userByEmail.get(linearIssue.assignee.email.toLowerCase()) : undefined
    const existing = issueByIdentifier.get(linearIssue.identifier)
    const resolvedAssigneeId = existing?.assigneeId ?? defaultAssigneeId ?? assignee?.id
    const issueNumber = normalizeIdentifierNumber(linearIssue.identifier)
    const createdAt = parseDate(linearIssue.createdAt) ?? new Date()
    const updatedAt = parseDate(linearIssue.updatedAt) ?? new Date()
    const startedAt = parseDate(linearIssue.startedAt)
    const completedAt = parseDate(linearIssue.completedAt)
    const canceledAt = parseDate(linearIssue.canceledAt)
    const dueDate = parseDate(linearIssue.dueDate)

    if (existing) {
      summary.imported.issues.updated += 1
      const updatedIssue: IssueRow = {
        ...existing,
        contextCompanyId,
        teamId: localTeam.id,
        projectId: localProject?.id,
        statusId: localStatus.id,
        assigneeId: resolvedAssigneeId,
        identifier: linearIssue.identifier,
        number: issueNumber,
        title: linearIssue.title,
        description: linearIssue.description ?? undefined,
        priority: linearIssue.priority ?? existing.priority,
        estimate: linearIssue.estimate ?? undefined,
        dueDate,
        startedAt,
        completedAt,
        canceledAt,
        lastActivityAt: updatedAt,
        updatedAt,
      }
      linearIssueIdToLocalIssue.set(linearIssue.id, updatedIssue)
      if (!dryRun) {
        await db.update(pmIssues).set({
          contextCompanyId,
          teamId: localTeam.id,
          projectId: localProject?.id,
          statusId: localStatus.id,
          assigneeId: resolvedAssigneeId,
          identifier: linearIssue.identifier,
          number: issueNumber,
          title: linearIssue.title,
          description: linearIssue.description ?? undefined,
          priority: linearIssue.priority ?? existing.priority,
          estimate: linearIssue.estimate ?? undefined,
          dueDate,
          startedAt,
          completedAt,
          canceledAt,
          lastActivityAt: updatedAt,
          updatedAt,
        }).where(eq(pmIssues.id, existing.id))
      }
    } else {
      summary.imported.issues.created += 1
      const createdIssue: IssueRow = {
        id: crypto.randomUUID(),
        contextCompanyId,
        teamId: localTeam.id,
        projectId: localProject?.id,
        statusId: localStatus.id,
        assigneeId: resolvedAssigneeId,
        creatorId: assignee?.id,
        identifier: linearIssue.identifier,
        number: issueNumber,
        title: linearIssue.title,
        description: linearIssue.description ?? undefined,
        priority: linearIssue.priority ?? 0,
        estimate: linearIssue.estimate ?? undefined,
        sortOrder: issueNumber,
        dueDate,
        startedAt,
        completedAt,
        canceledAt,
        blockedReason: undefined,
        lastActivityAt: updatedAt,
        createdAt,
        updatedAt,
      }
      linearIssueIdToLocalIssue.set(linearIssue.id, createdIssue)
      if (!dryRun) {
        await db.insert(pmIssues).values(createdIssue)
        await db.insert(pmIssueActivity).values({
          id: crypto.randomUUID(),
          issueId: createdIssue.id,
          actorId: undefined,
          actorName: 'Linear Import',
          type: 'imported',
          summary: `Imported from Linear issue ${linearIssue.identifier}`,
          metadata: { linearIssueId: linearIssue.id },
          createdAt: updatedAt,
        })
        summary.imported.activity.created += 1
      }
    }
  }

  for (const linearIssue of snapshot.issues) {
    const localIssue = linearIssueIdToLocalIssue.get(linearIssue.id) ?? issueByIdentifier.get(linearIssue.identifier)
    if (!localIssue) continue

    for (const linearLabel of linearIssue.labels.nodes) {
      const localLabel = linearLabelIdToLocalLabel.get(linearLabel.id)
      if (!localLabel) continue

      const relationKey = `${localIssue.id}:${localLabel.id}`
      if (issueLabelKeySet.has(relationKey)) continue

      summary.imported.issueLabels.created += 1
      issueLabelKeySet.add(relationKey)
      if (!dryRun) {
        await db.insert(pmIssueLabels).values({
          id: crypto.randomUUID(),
          issueId: localIssue.id,
          labelId: localLabel.id,
          createdAt: new Date(),
        })
      }
    }
  }

  return summary
}
