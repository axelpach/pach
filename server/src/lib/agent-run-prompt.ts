import {
  buildFollowUpContinuationPrompt,
  formatAgentInputMediaPrompt,
} from './agent-input-media.js'

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

export type AgentRunSpec = {
  version: 1
  promptSource: 'server'
  workerProtocol: 'pach-agent/v1'
  agentProfile: 'engineering' | 'general' | 'editorial' | 'design_template'
  executionMode: 'code_worktree' | 'mcp'
  continuation: {
    isContinuation: boolean
    codexSessionId?: string | null
    feedbackMessageId?: string | null
  }
  repository?: {
    fullName?: string | null
    baseBranch?: string | null
    branchName?: string | null
    workspacePath?: string | null
  }
  finalization: {
    commitAndPush: boolean
    openPullRequest: boolean
    pullRequestDraft: false
  }
}

export function buildAgentRunSpec(run: AgentRunPromptRecord): AgentRunSpec {
  const executionMode = readMetadataString(run.metadata, 'executionMode')
  const codeWorktree = executionMode === 'code_worktree'
  const handler = readMetadataString(run.metadata, 'handler')
  const codexSessionId = readMetadataString(run.metadata, 'codexSessionId')
  const feedbackMessageId = readMetadataString(run.metadata, 'feedbackMessageId')
  const feedback = readMetadataString(run.metadata, 'feedback')
  const agentProfile = run.subjectType === 'design_template_run'
    ? 'design_template'
    : handler === 'editorial-mcp' ? 'editorial'
    : codeWorktree ? 'engineering' : 'general'

  return {
    version: 1,
    promptSource: 'server',
    workerProtocol: 'pach-agent/v1',
    agentProfile,
    executionMode: codeWorktree ? 'code_worktree' : 'mcp',
    continuation: {
      isContinuation: Boolean(codexSessionId || feedback || feedbackMessageId),
      codexSessionId,
      feedbackMessageId,
    },
    repository: codeWorktree
      ? {
          fullName: run.repoFullName,
          baseBranch: run.baseBranch,
          branchName: run.branchName,
          workspacePath: run.workspacePath,
        }
      : undefined,
    finalization: {
      commitAndPush: codeWorktree,
      openPullRequest: false,
      pullRequestDraft: false,
    },
  }
}

export function buildGeneralMcpPrompt(run: AgentRunPromptRecord) {
  const feedback = readMetadataString(run.metadata, 'feedback')
  const codexSessionId = readMetadataString(run.metadata, 'codexSessionId')
  if (feedback && codexSessionId) {
    if (run.subjectType === 'design_template_run') return buildDesignTemplateFollowUpPrompt(run)
    return buildFollowUpContinuationPrompt({
      feedback,
      metadata: run.metadata,
    })
  }

  if (run.subjectType === 'design_template_run') return buildDesignTemplateMcpPrompt(run)
  if (readMetadataString(run.metadata, 'handler') === 'editorial-mcp') return buildEditorialMcpPrompt(run)

  const runSpec = buildAgentRunSpec(run)
  const parentRunId = readMetadataString(run.metadata, 'parentRunId')
  const attachments = formatAgentInputMediaPrompt(run.metadata)
  const codeWorktree = runSpec.executionMode === 'code_worktree'
  return [
    codeWorktree ? 'You are Pach engineering issue worker.' : 'You are Pach general MCP issue worker.',
    '',
    'Use Pach MCP tools for Pach state. You may call Pach MCP tools directly and repeatedly as needed.',
    codeWorktree
      ? 'For this worker, Codex is running with full local trust. Still act conservatively: do not send external messages, publish content, merge pull requests, or perform irreversible external actions. When you believe the work is successfully done, ask Pach to finalize the branch and create a ready-for-review pull request by calling pach.github.pull_request.create with this agent run id.'
      : 'For this worker, Codex is running with full local trust. Still act conservatively: do not send external messages, publish content, push code, open pull requests, or perform irreversible external actions unless the issue explicitly asks for it.',
    `Issue id: ${run.issueId}`,
    `Agent run id: ${run.id}`,
    codeWorktree && run.repoFullName ? `Repository: ${run.repoFullName}` : null,
    codeWorktree && run.baseBranch ? `Base branch: ${run.baseBranch}` : null,
    codeWorktree && run.branchName ? `Working branch: ${run.branchName}` : null,
    codeWorktree && run.workspacePath ? `Workspace path: ${run.workspacePath}` : null,
    codeWorktree ? 'PR finalization tool: pach.github.pull_request.create. Use it when the branch is ready for a pull request.' : null,
    parentRunId ? `Parent run id: ${parentRunId}` : null,
    feedback ? `User feedback: ${feedback}` : null,
    attachments,
    '',
    'Workflow:',
    feedback
      ? '1. Continue from the previous session if available, and use the user feedback above as the latest instruction.'
      : '1. Read the issue with pach.issue.get using the issue id above.',
    codeWorktree
      ? '2. Determine whether this is engineering work. If it needs repository changes, use the repository and working branch above; if it is only analysis or non-code planning, avoid unnecessary edits and say so in the final result.'
      : '2. Report progress with pach.progress.report and include the agent run id.',
    codeWorktree
      ? '3. Report progress with pach.progress.report and include the agent run id.'
      : '3. Do the requested analysis or light Pach-state work that can be done through MCP.',
    codeWorktree
      ? '4. Inspect and edit the repository in the current working directory. Run the relevant checks you can run locally.'
      : '4. Put the final result in pach.progress.report with phase "final_result".',
    codeWorktree
      ? '5. When the implementation is ready, call pach.github.pull_request.create with the agent run id to let Pach commit/push the working branch and open or update a ready-for-review pull request with server-held GitHub credentials. Then put the final result in pach.progress.report with phase "final_result", including changed files, checks run, and the PR URL/status when available.'
      : '5. If you update issue fields, use pach.issue.update and explain the change in activitySummary.',
    codeWorktree
      ? '6. Never merge a pull request. Do not use raw GitHub credentials or gh directly; Pach owns PR finalization through pach.github.pull_request.create.'
      : null,
    '',
    'Keep the final result concise and useful inside the Pach run progress stream.',
  ].filter((line): line is string => Boolean(line)).join('\n')
}

function buildEditorialMcpPrompt(run: AgentRunPromptRecord) {
  const runSpec = buildAgentRunSpec(run)
  const feedback = readMetadataString(run.metadata, 'feedback')
  const parentRunId = readMetadataString(run.metadata, 'parentRunId')
  const attachments = formatAgentInputMediaPrompt(run.metadata)
  const editorialWorkflow = readMetadataString(run.metadata, 'editorialWorkflow')
  const editorialIntent = readMetadataString(run.metadata, 'editorialIntent')
  const guidelinesPolicy = readMetadataString(run.metadata, 'guidelinesPolicy') ?? 'none'
  const routeReason = readMetadataString(run.metadata, 'routeReason')

  if (editorialWorkflow === 'newsletter_idea_backlog') return buildNewsletterIdeaBacklogPrompt(run)
  if (editorialWorkflow === 'newsletter_slot_fulfillment') return buildNewsletterSlotFulfillmentPrompt(run)

  return [
    'You are Pach editorial MCP issue worker.',
    '',
    'Use Pach MCP tools for Pach state. You may call Pach MCP tools directly and repeatedly as needed.',
    'For this worker, Codex is running with full local trust. Still act conservatively: do not send external messages, publish content, create marketing broadcasts, or perform irreversible external actions unless the issue explicitly asks and the available Pach tool is clearly safe.',
    `Issue id: ${run.issueId}`,
    `Agent run id: ${run.id}`,
    parentRunId ? `Parent run id: ${parentRunId}` : null,
    feedback ? `User feedback: ${feedback}` : null,
    editorialIntent ? `Editorial intent: ${editorialIntent}` : null,
    `Guidelines policy: ${guidelinesPolicy}`,
    routeReason ? `Routing reason: ${routeReason}` : null,
    attachments,
    '',
    'Workflow:',
    feedback
      ? '1. Continue from the previous session if available, and use the user feedback above as the latest instruction.'
      : '1. Read the issue with pach.issue.get using the issue id above.',
    '2. Report progress with pach.progress.report and include the agent run id.',
    '3. Read pach.document.format.get before writing document body content. Also read pach.editorial.profile.get for the issue organization when the issue has an organization. If the issue names a newsletter/publication, pass publicationSlug or publicationId so publication-level guidance overrides the organization profile.',
    guidelinesPolicy === 'newsletter_guidelines_required'
      ? '4. Before drafting, use pach.editorial.profile.get to read the relevant marketing publication editorial profile. Use effectiveProfile.newsletterGuidelines when present. If the issue names a publication but the selector is ambiguous or no publication-level newsletterGuidelines are available, report phase "blocked" and explain what publication guidance is missing instead of drafting. Do not search Docs for Newsletter Guidelines.'
      : '4. Do not search Docs for Newsletter Guidelines. Use pach.editorial.profile.get only when the issue or feedback explicitly asks for newsletter/article/blog-post guidelines.',
    '5. Create or update a Pach document as the review artifact. For new article/newsletter/blog drafts, use pach.document.create. For edits to an existing referenced document, use pach.document.update with the default version workflow unless the issue explicitly asks to update live content.',
    '6. For article/newsletter/blog drafts, use Pach markdown and keep a useful review structure: brief/context, sources if any, outline if useful, then the draft body. Preserve visible source blocks for source material when relevant.',
    '7. When the draft/edit is ready for human review, update the issue with pach.issue.update: append a Markdown review link like "[Review draft: Title](/docs/DOCUMENT_ID)" to the issue description, set statusKey to "in_review", and include a clear activitySummary.',
    '8. Put the final result in pach.progress.report with phase "final_result". Include the document title, /docs link, whether publication newsletterGuidelines were used, and anything the reviewer should check.',
    '',
    'Keep the final result concise and useful inside the Pach run progress stream.',
    `Run spec profile: ${runSpec.agentProfile}`,
  ].filter((line): line is string => Boolean(line)).join('\n')
}

function buildNewsletterIdeaBacklogPrompt(run: AgentRunPromptRecord) {
  const publicationId = readMetadataString(run.metadata, 'publicationId')
  const publicationSlug = readMetadataString(run.metadata, 'publicationSlug')
  const neededIdeas = readMetadataNumber(run.metadata, 'neededIdeas') ?? 4
  const minIdeaBacklog = readMetadataNumber(run.metadata, 'minIdeaBacklog') ?? neededIdeas

  return [
    'You are Pach autonomous newsletter editorial worker.',
    '',
    'Use Pach MCP tools for Pach state. You may call Pach MCP tools directly and repeatedly as needed.',
    'This run creates editorial ideas only. Do not create documents, content items, broadcasts, or external publications.',
    `Agent run id: ${run.id}`,
    publicationId ? `Publication id: ${publicationId}` : null,
    publicationSlug ? `Publication slug: ${publicationSlug}` : null,
    `Needed ideas: ${neededIdeas}`,
    `Target available backlog: ${minIdeaBacklog}`,
    '',
    'Workflow:',
    '1. Report progress with pach.progress.report using this run id.',
    '2. Read pach.editorial.profile.get for the publication. Use effectiveProfile.ideaGuidelines when present, and otherwise match the newsletter guidelines.',
    '3. Read pach.marketing.idea.list for the publication. Avoid repeating available, reserved, used, or rejected ideas.',
    `4. Create at least ${neededIdeas} distinct ideas with pach.marketing.idea.create. Use useful titles, concrete angles, sourceNotes when relevant, and stable dedupeKey values.`,
    '5. Put the final result in pach.progress.report with phase "final_result", including the ideas created and any duplicates skipped.',
    '',
    'Keep the final result concise and useful inside the Pach activity stream.',
  ].filter((line): line is string => Boolean(line)).join('\n')
}

function buildNewsletterSlotFulfillmentPrompt(run: AgentRunPromptRecord) {
  const slotId = readMetadataString(run.metadata, 'slotId') ?? run.subjectId ?? ''
  const publicationId = readMetadataString(run.metadata, 'publicationId')
  const publicationSlug = readMetadataString(run.metadata, 'publicationSlug')
  const ideaId = readMetadataString(run.metadata, 'ideaId')
  const scheduledAt = readMetadataString(run.metadata, 'scheduledAt')
  const scheduledTimezone = readMetadataString(run.metadata, 'scheduledTimezone')

  return [
    'You are Pach autonomous newsletter editorial worker.',
    '',
    'Use Pach MCP tools for Pach state. You may call Pach MCP tools directly and repeatedly as needed.',
    'This run is allowed to schedule a newsletter only by calling pach.marketing.slot.fulfill. Do not send the newsletter now and do not use raw database writes.',
    `Agent run id: ${run.id}`,
    slotId ? `Publication slot id: ${slotId}` : null,
    publicationId ? `Publication id: ${publicationId}` : null,
    publicationSlug ? `Publication slug: ${publicationSlug}` : null,
    ideaId ? `Reserved idea id: ${ideaId}` : null,
    scheduledAt ? `Scheduled at: ${scheduledAt}` : null,
    scheduledTimezone ? `Scheduled timezone: ${scheduledTimezone}` : null,
    '',
    'Workflow:',
    '1. Report progress with pach.progress.report using this run id.',
    '2. Read pach.marketing.slot.get for the slot. Use its linked idea if present; otherwise list/create an idea with pach.marketing.idea.list and pach.marketing.idea.create.',
    '3. Read pach.document.format.get and pach.editorial.profile.get for the publication. Use effectiveProfile.newsletterGuidelines when present.',
    '4. Create one publishable article document with pach.document.create. Set metadata with source "newsletter_autonomy", publicationSlotId, editorialIdeaId when present, and agentRunId.',
    '5. Call pach.marketing.slot.fulfill with slotId, documentId, ideaId when present, runId, subject, and preheader. This snapshots the document into marketing content and schedules the broadcast.',
    '6. Put the final result in pach.progress.report with phase "final_result", including the document id/link, content item id, distribution run id, scheduled time, and whether guidelines were used.',
    '',
    'The article should be ready to send without human approval, but keep the document cleanly editable because Axel may still revise and resnapshot before the scheduled send.',
  ].filter((line): line is string => Boolean(line)).join('\n')
}

function buildDesignTemplateMcpPrompt(run: AgentRunPromptRecord) {
  const prompt = readMetadataString(run.metadata, 'prompt')
  const templateSlug = readMetadataString(run.metadata, 'designTemplateSlug')
  const templateId = readMetadataString(run.metadata, 'designTemplateId')
  const organizationProject = readMetadataString(run.metadata, 'organizationProject')
  const designSystemId = readMetadataString(run.metadata, 'designSystemId')
  const designTemplateRunId = readMetadataString(run.metadata, 'designTemplateRunId') ?? run.subjectId ?? undefined
  const attachments = formatAgentInputMediaPrompt(run.metadata)
  const outputSpec = formatOutputSpec(run.metadata)
  return [
    'You are Pach design template MCP worker.',
    '',
    'Use Pach MCP tools for Pach state. You may call Pach MCP tools directly and repeatedly as needed.',
    'For this worker, Codex is running with full local trust. Still act conservatively: do not send external messages, publish content, push code, open pull requests, or perform irreversible external actions unless the prompt explicitly asks for it.',
    `Agent run id: ${run.id}`,
    designTemplateRunId ? `Design template run id: ${designTemplateRunId}` : null,
    templateId ? `Template id: ${templateId}` : null,
    templateSlug ? `Template slug: ${templateSlug}` : null,
    designSystemId ? `Selected design system id: ${designSystemId}` : 'Selected design system id: none',
    organizationProject ? `Organization project: ${organizationProject}` : null,
    prompt ? `User prompt: ${prompt}` : null,
    outputSpec,
    attachments,
    '',
    'Workflow:',
    designSystemId
      ? '1. Read the template with pach.design.template.get using the template id or slug above and pass the selected designSystemId. Use organizationDesignSystem.markdown as the selected design-system context.'
      : '1. Read the template with pach.design.template.get using the template id or slug above. Do not pass a designSystemId and do not invent organization-specific design-system context.',
    '2. Respect the selected output settings above, including dimensions/aspect ratio and requested slide count.',
    '3. Report progress with pach.progress.report and include the agent run id.',
    '4. Edit or create the template source files requested by the user. Prefer React source with manifest.entry set to src/Template.tsx. For deck templates, export one React component per slide and export const slides = [CoverSlide, ...] so Pach can preview them as separated, scaled slide frames.',
    'Styling rule: design templates render as standalone iframe documents, not inside the Pach portal. Tailwind classes are supported only when manifest.styling is "tailwind"; otherwise use inline React style objects or import a local CSS file from the template files. Do not rely on Pach CSS variables or app global CSS.',
    '5. Create a new template version with pach.design.template.version.create. Pass the full files object, manifest.entry, manifest.dimensions or manifest.aspectRatioId, dependencies for any third-party package imports, and the agent run id as runId.',
    '6. Put the final result in pach.progress.report with phase "final_result".',
    '',
    'Keep the final result concise and useful inside the Pach design chat.',
  ].filter((line): line is string => Boolean(line)).join('\n')
}

function buildDesignTemplateFollowUpPrompt(run: AgentRunPromptRecord) {
  const feedback = readMetadataString(run.metadata, 'feedback')
  const attachments = formatAgentInputMediaPrompt(run.metadata, { includeInstruction: false })
  const outputSpec = formatOutputSpec(run.metadata)
  const designSystemChanged = readMetadataBoolean(run.metadata, 'designSystemChanged')
  const designSystemId = readMetadataString(run.metadata, 'designSystemId')
  const designTemplateRunId = readMetadataString(run.metadata, 'designTemplateRunId') ?? run.subjectId ?? undefined

  return [
    [
      `Agent run id for this follow-up: ${run.id}`,
      designTemplateRunId ? `Design template run id for this follow-up: ${designTemplateRunId}` : null,
    ].filter((line): line is string => Boolean(line)).join('\n'),
    feedback?.trim(),
    outputSpec,
    designSystemChanged
      ? designSystemId
        ? `Selected design system changed for this turn: ${designSystemId}. Fetch it only if needed.`
        : 'Selected design system changed for this turn: none. Continue without organization-specific design-system context.'
      : null,
    attachments,
  ].filter((line): line is string => Boolean(line)).join('\n\n')
}

function formatOutputSpec(metadata: unknown) {
  const outputSpec = readMetadataRecord(metadata, 'outputSpec')
  if (!outputSpec) return null
  const aspectRatioId = readRecordString(outputSpec, 'aspectRatioId')
  const label = readRecordString(outputSpec, 'label')
  const width = readRecordNumber(outputSpec, 'width')
  const height = readRecordNumber(outputSpec, 'height')
  const slideCount = readRecordNumber(outputSpec, 'slideCount')
  const dimensions = width && height ? `${width}x${height}` : null
  const details = [
    aspectRatioId || label ? `- Aspect ratio: ${label ?? aspectRatioId}${aspectRatioId && label ? ` (${aspectRatioId})` : ''}` : null,
    dimensions ? `- Dimensions: ${dimensions}` : null,
    slideCount ? `- Slides: ${slideCount}` : null,
  ].filter((line): line is string => Boolean(line))

  if (details.length === 0) return null

  return [
    'Selected output settings:',
    ...details,
  ].join('\n')
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

function readMetadataBoolean(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== 'object') return false
  return (metadata as Record<string, unknown>)[key] === true
}

function readMetadataRecord(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== 'object') return null
  const value = (metadata as Record<string, unknown>)[key]
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readRecordString(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readRecordNumber(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
