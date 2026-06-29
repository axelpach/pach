export type AgentRunPromptRecord = {
  id: string
  issueId?: string | null
  subjectType?: string | null
  subjectId?: string | null
  repoFullName?: string | null
  baseBranch?: string | null
  branchName?: string | null
  workspacePath?: string | null
  metadata?: Record<string, unknown> | null
}

export function buildGeneralMcpPrompt(run: AgentRunPromptRecord) {
  if (run.subjectType === 'design_template_run') return buildDesignTemplateMcpPrompt(run)

  const feedback = readMetadataString(run.metadata, 'feedback')
  const parentRunId = readMetadataString(run.metadata, 'parentRunId')
  const attachments = formatInputMediaPrompt(run.metadata)
  const executionMode = readMetadataString(run.metadata, 'executionMode')
  const codeWorktree = executionMode === 'code_worktree'
  return [
    codeWorktree ? 'You are Pach engineering issue worker.' : 'You are Pach general MCP issue worker.',
    '',
    'Use Pach MCP tools for Pach state. You may call Pach MCP tools directly and repeatedly as needed.',
    'For this worker, Codex is running with full local trust. Still act conservatively: do not send external messages, publish content, push code, open pull requests, or perform irreversible external actions unless the issue explicitly asks for it.',
    `Issue id: ${run.issueId}`,
    `Agent run id: ${run.id}`,
    codeWorktree && run.repoFullName ? `Repository: ${run.repoFullName}` : null,
    codeWorktree && run.baseBranch ? `Base branch: ${run.baseBranch}` : null,
    codeWorktree && run.branchName ? `Working branch: ${run.branchName}` : null,
    codeWorktree && run.workspacePath ? `Workspace path: ${run.workspacePath}` : null,
    parentRunId ? `Parent run id: ${parentRunId}` : null,
    feedback ? `User feedback: ${feedback}` : null,
    attachments,
    '',
    'Workflow:',
    feedback
      ? '1. Continue from the previous session if available, and use the user feedback above as the latest instruction.'
      : '1. Read the issue with pach.issue.get using the issue id above.',
    '2. Report progress with pach.progress.report and include the agent run id.',
    codeWorktree
      ? '3. Inspect and edit the repository in the current working directory. Run the relevant checks you can run locally.'
      : '3. Do the requested analysis or light Pach-state work that can be done through MCP.',
    codeWorktree
      ? '4. Leave code changes in the working tree for Pach to push/create the draft PR. Do not push or open a PR yourself unless the issue explicitly asks for it.'
      : '4. Put the final result in pach.progress.report with phase "final_result".',
    codeWorktree
      ? '5. Put the final result in pach.progress.report with phase "final_result", including changed files and checks run.'
      : '5. If you update issue fields, use pach.issue.update and explain the change in activitySummary.',
    '',
    'Keep the final result concise and useful inside the Pach run progress stream.',
  ].filter((line): line is string => Boolean(line)).join('\n')
}

function buildDesignTemplateMcpPrompt(run: AgentRunPromptRecord) {
  const prompt = readMetadataString(run.metadata, 'prompt')
  const templateSlug = readMetadataString(run.metadata, 'designTemplateSlug')
  const templateId = readMetadataString(run.metadata, 'designTemplateId')
  const organizationProject = readMetadataString(run.metadata, 'organizationProject')
  const designTemplateRunId = readMetadataString(run.metadata, 'designTemplateRunId') ?? run.subjectId ?? undefined
  const attachments = formatInputMediaPrompt(run.metadata)
  return [
    'You are Pach design template MCP worker.',
    '',
    'Use Pach MCP tools for Pach state. You may call Pach MCP tools directly and repeatedly as needed.',
    'For this worker, Codex is running with full local trust. Still act conservatively: do not send external messages, publish content, push code, open pull requests, or perform irreversible external actions unless the prompt explicitly asks for it.',
    `Agent run id: ${run.id}`,
    designTemplateRunId ? `Design template run id: ${designTemplateRunId}` : null,
    templateId ? `Template id: ${templateId}` : null,
    templateSlug ? `Template slug: ${templateSlug}` : null,
    organizationProject ? `Organization project: ${organizationProject}` : null,
    organizationProject ? `If deeper source context is needed, read the related project repo at /home/pach/workspaces/repos/axelpach/${organizationProject} when that path exists.` : null,
    prompt ? `User prompt: ${prompt}` : null,
    attachments,
    '',
    'Workflow:',
    '1. Read the template with pach.design.template.get using the template id or slug above.',
    '2. Follow agentInstructions.mustUseOrganizationDesignSystem from the template response as a hard constraint. Inspect organizationDesignSystem.tokens, organizationDesignSystem.assets, and organizationDesignSystem.metadata before designing.',
    '3. Report progress with pach.progress.report and include the agent run id.',
    '4. Edit or create the template source files requested by the user. Prefer React source with manifest.entry set to src/Template.tsx. For deck templates, export one React component per slide and export const slides = [CoverSlide, ...] so Pach can preview them as separated, scaled slide frames.',
    organizationProject === 'ardia' ? 'Ardia-specific hard contract: use the Pach legacy ardia-one-pager as the composition skeleton for the whole slide. Keep the one-pager margins, top brand row, right metadata, dot/mono eyebrow, Inter Tight 200 title scale, one inline Instrument Serif italic vermilion phrase, short body, hairline rows, transparent framed modules, footer hairline, and subtle off-canvas vermilion glow. Use exact legacy proportions: on 1080x1528, side padding 64px, top brand row y=56px, hero y about 200px, title 64px/1.0 Inter Tight 200, body 19px/1.55 max 780px, hairline rows y about 575px, module y about 865px, footer pinned to bottom; scale proportionally for other aspect ratios. Charts, KPIs, tables, WhatsApp mocks, product surfaces, buyer-landing data panels, and Universo aBanza checklist modules are allowed, but they must inherit that skeleton instead of replacing the slide composition. Use organizationDesignSystem.metadata.requiredDesignContract as a QA checklist before saving. Do not drift into generic executive decks, generic SaaS cards, blue/purple gradients, neon/glass/bokeh panels, large serif primary titles, fake square logos, opaque red panels, or one long scrolling document.' : null,
    'Styling rule: design templates render as standalone iframe documents, not inside the Pach portal. Tailwind classes are supported only when manifest.styling is "tailwind"; otherwise use inline React style objects or import a local CSS file from the template files. Do not rely on Pach CSS variables or app global CSS.',
    '5. Create a new template version with pach.design.template.version.create. Pass the full files object, manifest.entry, manifest.dimensions or manifest.aspectRatioId, dependencies for any third-party package imports, and the agent run id as runId.',
    '6. Put the final result in pach.progress.report with phase "final_result".',
    '',
    'Keep the final result concise and useful inside the Pach design chat.',
  ].filter((line): line is string => Boolean(line)).join('\n')
}

function readMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== 'object') return null
  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function formatInputMediaPrompt(metadata: unknown) {
  const attachments = readMetadataArray(metadata, 'attachments')
    .map((attachment, index) => formatInputMediaAttachment(attachment, index))
    .filter(Boolean)

  if (!attachments.length) return null

  return [
    'Attached context media:',
    ...attachments,
    '',
    'Use these attachments as user-provided context. For images/screenshots, inspect the URL directly when useful; preserve exact visual details the user is pointing at.',
  ].join('\n')
}

function formatInputMediaAttachment(value: Record<string, unknown>, index: number) {
  const name = readObjectString(value.name) ?? readObjectString(value.fileName) ?? `attachment ${index + 1}`
  const url = readObjectString(value.url)
  if (!url) return null

  const kind = readObjectString(value.kind) ?? 'file'
  const mimeType = readObjectString(value.mimeType)
  const caption = readObjectString(value.caption)
  const width = typeof value.width === 'number' ? value.width : null
  const height = typeof value.height === 'number' ? value.height : null
  const dimensions = width && height ? `${width}x${height}` : null
  const details = [
    kind,
    mimeType,
    dimensions,
    caption ? `caption: ${caption}` : null,
  ].filter(Boolean).join(', ')

  return `- ${index + 1}. ${name}${details ? ` (${details})` : ''}: ${url}`
}

function readMetadataArray(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== 'object') return []
  const value = (metadata as Record<string, unknown>)[key]
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)))
    : []
}

function readObjectString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
