import {
  CLAUDE_HAIKU_MODEL,
  createAnthropicMessage,
  readAnthropicToolInput,
} from './anthropic.js'

export type ExecutableAgentRouteMode = 'engineering' | 'editorial' | 'general_mcp' | 'design_template'
export type AgentRouteMode = ExecutableAgentRouteMode | 'needs_clarification'
export type AgentRouteHandler = 'engineering-code-worktree' | 'editorial-mcp' | 'general-mcp' | 'design-template-mcp'
export type AgentRouteExecutionMode = 'code_worktree' | 'mcp'
export type EditorialIntent = 'newsletter_article' | 'blog_article' | 'article' | 'doc_edit' | 'copy_edit' | 'other'
export type GuidelinesPolicy = 'newsletter_guidelines_required' | 'editorial_profile_only' | 'none'
export type AgentRouteSource = 'design_tab' | 'issue_do_task' | 'document_run'

export type ExecutableAgentRoute = {
  mode: ExecutableAgentRouteMode
  handler: AgentRouteHandler
  executionMode: AgentRouteExecutionMode
  confidence: number
  editorialIntent?: EditorialIntent
  guidelinesPolicy: GuidelinesPolicy
  reason: string
  classifier: 'deterministic' | 'haiku' | 'heuristic'
}

export type NeedsClarificationAgentRoute = {
  mode: 'needs_clarification'
  confidence: number
  guidelinesPolicy: 'none'
  reason: string
  classifier: 'haiku' | 'heuristic'
  availableModes: Array<Exclude<ExecutableAgentRouteMode, 'design_template'>>
}

export type AgentRoute = ExecutableAgentRoute | NeedsClarificationAgentRoute

export type IssueRouteContext = {
  source: AgentRouteSource
  issueIdentifier: string
  title: string
  description?: string | null
  teamName?: string | null
  teamKey?: string | null
  projectName?: string | null
  projectSlug?: string | null
  organizationName?: string | null
  organizationProject?: string | null
  statusName?: string | null
  statusType?: string | null
  labelNames?: string[]
}

const AGENT_ROUTE_TOOL_NAME = 'select_agent_route'

const AGENT_ROUTE_TOOL = {
  name: AGENT_ROUTE_TOOL_NAME,
  description: 'Select the correct Pach agent run route.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      mode: {
        type: 'string',
        enum: ['engineering', 'editorial', 'general_mcp'],
        description: 'Which agent mode should execute this issue run.',
      },
      confidence: {
        type: 'number',
        description: 'Classifier confidence from 0 to 1.',
      },
      editorialIntent: {
        type: 'string',
        enum: ['newsletter_article', 'blog_article', 'article', 'doc_edit', 'copy_edit', 'other'],
        description: 'Required when mode is editorial.',
      },
      guidelinesPolicy: {
        type: 'string',
        enum: ['newsletter_guidelines_required', 'editorial_profile_only', 'none'],
        description: 'Whether the editorial worker must read the Newsletter Guidelines document.',
      },
      reason: {
        type: 'string',
        description: 'Short explanation for the route.',
      },
    },
    required: ['mode', 'confidence', 'guidelinesPolicy', 'reason'],
  },
}

export async function routeAgentRun(context: IssueRouteContext): Promise<AgentRoute> {
  if (context.source === 'design_tab') {
    return {
      mode: 'design_template',
      handler: 'design-template-mcp',
      executionMode: 'mcp',
      confidence: 1,
      guidelinesPolicy: 'none',
      reason: 'Run was created from the design tab.',
      classifier: 'deterministic',
    }
  }

  if (context.source === 'document_run') {
    return {
      mode: 'editorial',
      handler: 'editorial-mcp',
      executionMode: 'mcp',
      confidence: 0.95,
      editorialIntent: 'doc_edit',
      guidelinesPolicy: 'editorial_profile_only',
      reason: 'Run was created from a document.',
      classifier: 'deterministic',
    }
  }

  try {
    const classified = await classifyIssueRouteWithHaiku(context)
    if (classified) {
      if (classified.confidence < 0.45) {
        return needsClarificationRoute({
          confidence: classified.confidence,
          classifier: 'haiku',
          reason: `Low confidence route: ${classified.reason}`,
        })
      }
      return classified
    }
  } catch (error) {
    console.warn('[agent-router] Haiku classification failed:', error instanceof Error ? error.message : error)
  }

  return heuristicIssueRoute(context)
}

export function routeAgentModeOverride(mode: string, context?: IssueRouteContext): ExecutableAgentRoute | null {
  if (mode === 'engineering') {
    return routeForMode({
      mode,
      confidence: 1,
      guidelinesPolicy: 'none',
      reason: 'Mode selected by user.',
      classifier: 'deterministic',
    })
  }

  if (mode === 'editorial') {
    const text = context ? routeContextText(context) : ''
    const publishableArticle = text ? isPublishableArticleRequest(text) : false
    return routeForMode({
      mode,
      confidence: 1,
      editorialIntent: publishableArticle ? editorialIntentFromText(text) : 'other',
      guidelinesPolicy: publishableArticle ? 'newsletter_guidelines_required' : 'editorial_profile_only',
      reason: 'Mode selected by user.',
      classifier: 'deterministic',
    })
  }

  if (mode === 'general_mcp') {
    return routeForMode({
      mode,
      confidence: 1,
      guidelinesPolicy: 'none',
      reason: 'Mode selected by user.',
      classifier: 'deterministic',
    })
  }

  return null
}

async function classifyIssueRouteWithHaiku(context: IssueRouteContext): Promise<ExecutableAgentRoute | null> {
  const payload = await createAnthropicMessage({
    model: CLAUDE_HAIKU_MODEL,
    max_tokens: 800,
    temperature: 0,
    system: [
      'You route Pach issue agent runs. Return exactly one tool call.',
      'Choose engineering when the issue likely requires source-code, configuration, database migration, UI, backend, tests, or pull-request work.',
      'Choose editorial when the issue asks to write, draft, edit, rewrite, summarize, or prepare copy/documents/articles/blog/newsletter content.',
      'Choose general_mcp when the work can be done through Pach state/MCP without code changes and is not primarily editorial drafting.',
      'Newsletter Guidelines are required only when the issue specifically asks for a newsletter, blog post, article, or publishable post draft/edit. Do not require them for generic document edits, grammar fixes, or short copy polishing.',
      'If unsure between engineering and non-code work, choose general_mcp with lower confidence.',
      'Never choose design_template for issue runs.',
    ].join(' '),
    tools: [AGENT_ROUTE_TOOL],
    tool_choice: { type: 'tool', name: AGENT_ROUTE_TOOL_NAME },
    messages: [
      {
        role: 'user',
        content: formatIssueRoutePrompt(context),
      },
    ],
  })

  return normalizeRoute(readAnthropicToolInput(payload, AGENT_ROUTE_TOOL_NAME), 'haiku')
}

function heuristicIssueRoute(context: IssueRouteContext): AgentRoute {
  const text = routeContextText(context)
  const publishableArticle = isPublishableArticleRequest(text)
  const editorial = publishableArticle || hasAny(text, [
    'write',
    'draft',
    'edit',
    'rewrite',
    'copy',
    'document',
    'doc',
    'redact',
    'redactar',
    'escribir',
    'editar',
    'contenido',
    'copywriting',
  ])
  const engineering = hasAny(text, [
    'implement',
    'fix',
    'bug',
    'code',
    'api',
    'endpoint',
    'backend',
    'frontend',
    'component',
    'database',
    'migration',
    'schema',
    'tests',
    'deploy',
    'repo',
    'repository',
    'typescript',
    'react',
    'server',
    'portal',
    'implementar',
    'arreglar',
  ])

  if (editorial && !engineering) {
    return routeForMode({
      mode: 'editorial',
      confidence: publishableArticle ? 0.82 : 0.72,
      editorialIntent: publishableArticle ? editorialIntentFromText(text) : 'doc_edit',
      guidelinesPolicy: publishableArticle ? 'newsletter_guidelines_required' : 'editorial_profile_only',
      reason: publishableArticle
        ? 'Issue appears to request a publishable newsletter/blog/article draft.'
        : 'Issue appears to request editorial document or copy work.',
      classifier: 'heuristic',
    })
  }

  if (engineering) {
    return routeForMode({
      mode: 'engineering',
      confidence: 0.72,
      guidelinesPolicy: 'none',
      reason: 'Issue appears to require repository changes.',
      classifier: 'heuristic',
    })
  }

  return needsClarificationRoute({
    confidence: 0.34,
    reason: 'Issue does not clearly match engineering, editorial, or general MCP work.',
    classifier: 'heuristic',
  })
}

function routeContextText(context: IssueRouteContext) {
  return normalizeText([
    context.title,
    context.description,
    context.teamName,
    context.teamKey,
    context.projectName,
    context.projectSlug,
    context.organizationName,
    context.organizationProject,
    ...(context.labelNames ?? []),
  ].filter(Boolean).join(' '))
}

function isPublishableArticleRequest(text: string) {
  return hasAny(text, [
    'newsletter',
    'news letter',
    'blog post',
    'blogpost',
    'blog',
    'article',
    'articulo',
    'artículo',
    'boletin',
    'boletín',
    'post',
  ])
}

function normalizeRoute(value: unknown, classifier: ExecutableAgentRoute['classifier']): ExecutableAgentRoute | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const mode = readEnum(raw.mode, ['engineering', 'editorial', 'general_mcp'])
  if (!mode) return null

  const confidence = typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
    ? Math.max(0, Math.min(1, raw.confidence))
    : 0.5
  const editorialIntent = readEnum(raw.editorialIntent, ['newsletter_article', 'blog_article', 'article', 'doc_edit', 'copy_edit', 'other'])
  const guidelinesPolicy = readEnum(raw.guidelinesPolicy, ['newsletter_guidelines_required', 'editorial_profile_only', 'none']) ?? 'none'
  const reason = typeof raw.reason === 'string' && raw.reason.trim()
    ? raw.reason.trim().slice(0, 500)
    : 'Classified by agent route model.'

  return routeForMode({
    mode,
    confidence,
    editorialIntent: editorialIntent ?? undefined,
    guidelinesPolicy: mode === 'editorial' ? guidelinesPolicy : 'none',
    reason,
    classifier,
  })
}

function routeForMode(input: {
  mode: 'engineering' | 'editorial' | 'general_mcp'
  confidence: number
  editorialIntent?: EditorialIntent
  guidelinesPolicy: GuidelinesPolicy
  reason: string
  classifier: ExecutableAgentRoute['classifier']
}): ExecutableAgentRoute {
  if (input.mode === 'engineering') {
    return {
      ...input,
      mode: 'engineering',
      handler: 'engineering-code-worktree',
      executionMode: 'code_worktree',
      guidelinesPolicy: 'none',
    }
  }

  if (input.mode === 'editorial') {
    return {
      ...input,
      mode: 'editorial',
      handler: 'editorial-mcp',
      executionMode: 'mcp',
      editorialIntent: input.editorialIntent ?? 'other',
    }
  }

  return {
    ...input,
    mode: 'general_mcp',
    handler: 'general-mcp',
    executionMode: 'mcp',
    guidelinesPolicy: 'none',
  }
}

function needsClarificationRoute(input: {
  confidence: number
  classifier: NeedsClarificationAgentRoute['classifier']
  reason: string
}): NeedsClarificationAgentRoute {
  return {
    mode: 'needs_clarification',
    confidence: input.confidence,
    guidelinesPolicy: 'none',
    reason: input.reason,
    classifier: input.classifier,
    availableModes: ['engineering', 'editorial', 'general_mcp'],
  }
}

function formatIssueRoutePrompt(context: IssueRouteContext) {
  return [
    `Source: ${context.source}`,
    `Issue: ${context.issueIdentifier}`,
    `Title: ${context.title}`,
    context.description ? `Description:\n${context.description.slice(0, 4000)}` : 'Description: ',
    context.organizationName || context.organizationProject
      ? `Organization: ${context.organizationName ?? 'unknown'} (${context.organizationProject ?? 'no project key'})`
      : null,
    context.teamName || context.teamKey ? `Team: ${context.teamName ?? 'unknown'} (${context.teamKey ?? 'no key'})` : null,
    context.projectName || context.projectSlug ? `Project: ${context.projectName ?? 'unknown'} (${context.projectSlug ?? 'no slug'})` : null,
    context.statusName || context.statusType ? `Status: ${context.statusName ?? 'unknown'} (${context.statusType ?? 'unknown type'})` : null,
    (context.labelNames ?? []).length > 0 ? `Labels: ${(context.labelNames ?? []).join(', ')}` : null,
  ].filter((line): line is string => Boolean(line)).join('\n\n')
}

function editorialIntentFromText(text: string): EditorialIntent {
  if (hasAny(text, ['newsletter', 'news letter', 'boletin', 'boletín'])) return 'newsletter_article'
  if (hasAny(text, ['blog post', 'blogpost', 'blog'])) return 'blog_article'
  if (hasAny(text, ['article', 'articulo', 'artículo', 'post'])) return 'article'
  return 'other'
}

function hasAny(text: string, needles: string[]) {
  return needles.some((needle) => {
    const normalizedNeedle = normalizeText(needle)
    if (/^[a-z0-9]+$/.test(normalizedNeedle)) {
      return new RegExp(`\\b${escapeRegExp(normalizedNeedle)}\\b`).test(text)
    }
    return text.includes(normalizedNeedle)
  })
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : null
}
