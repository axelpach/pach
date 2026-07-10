import { randomUUID } from 'node:crypto'
import { Router, type Request } from 'express'
import { eq } from 'drizzle-orm'
import { agentRuns, designAssets, designSystems, designTemplateRuns, designTemplates, designTemplateVersions, organizations } from '../../../db/schema.js'
import { getDb } from '../db.js'
import type { JWTPayload } from '../lib/auth.js'

const router = Router()

router.post('/templates', async (req, res) => {
  try {
    const user = authenticatedUser(req)
    const body = req.body ?? {}
    const organizationId = readRequiredString(body.organizationId, 'organizationId')
    const name = readRequiredString(body.name, 'name')
    const slug = readRequiredString(body.slug, 'slug')
    const templateId = readOptionalString(body.templateId) ?? randomUUID()
    const versionId = readOptionalString(body.versionId) ?? randomUUID()
    const type = readOptionalString(body.type) ?? 'deck'
    const sourceKind = readOptionalString(body.sourceKind) ?? 'react'
    const status = readOptionalString(body.status) ?? 'draft'
    const files = readStringRecord(body.files)
    const manifest = readRecord(body.manifest)
    const dependencies = readStringRecord(body.dependencies)
    const metadata = readRecord(body.metadata)

    if (!(await canAccessOrganization(organizationId, user))) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Organization not found.' })
      return
    }

    const now = new Date()
    const { template, version } = await getDb().transaction(async (tx) => {
      const [template] = await tx
        .insert(designTemplates)
        .values({
          id: templateId,
          organizationId,
          type,
          name,
          slug,
          status,
          sourceKind,
          currentVersionId: versionId,
          metadata,
          createdAt: now,
          updatedAt: now,
        })
        .returning()

      const [version] = await tx
        .insert(designTemplateVersions)
        .values({
          id: versionId,
          organizationId,
          templateId: template.id,
          versionNumber: 1,
          schemaVersion: 1,
          sourceKind,
          files,
          manifest,
          dependencies,
          validationStatus: 'compiled',
          validationErrors: [],
          createdAt: now,
        })
        .returning()

      return { template, version }
    })

    res.status(201).json({
      template: serializeDesignTemplate(template),
      version: serializeDesignTemplateVersion(version),
    })
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: 'VALIDATION', message: error.message })
      return
    }
    console.error('Design template create failed', error)
    res.status(500).json({
      error: 'DESIGN_TEMPLATE_CREATE_FAILED',
      message: error instanceof Error ? error.message : 'Could not create design template.',
    })
  }
})

router.delete('/templates/:templateId', async (req, res) => {
  try {
    const user = authenticatedUser(req)
    const templateId = req.params.templateId
    const [template] = await getDb().select().from(designTemplates).where(eq(designTemplates.id, templateId)).limit(1)

    if (!template || !(await canAccessOrganization(template.organizationId, user))) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Design template not found.' })
      return
    }

    await getDb().transaction(async (tx) => {
      await tx
        .update(designAssets)
        .set({ templateId: null, updatedAt: new Date() })
        .where(eq(designAssets.templateId, template.id))
      await tx
        .update(designTemplateRuns)
        .set({ templateId: null, updatedAt: new Date() })
        .where(eq(designTemplateRuns.templateId, template.id))
      await tx.delete(designTemplateVersions).where(eq(designTemplateVersions.templateId, template.id))
      await tx.delete(designTemplates).where(eq(designTemplates.id, template.id))
    })

    res.json({ ok: true, templateId: template.id })
  } catch (error) {
    console.error('Design template delete failed', error)
    res.status(500).json({
      error: 'DESIGN_TEMPLATE_DELETE_FAILED',
      message: error instanceof Error ? error.message : 'Could not delete design template.',
    })
  }
})

router.post('/runs/:agentRunId/follow-up', async (req, res) => {
  try {
    const user = authenticatedUser(req)
    const parentAgentRunId = req.params.agentRunId
    const body = req.body ?? {}
    const feedback = readRequiredString(body.feedback, 'feedback')
    const pendingInputMediaCount = readOptionalCount(body.pendingInputMediaCount)
    const selectedDesignSystemId = readNullableString(body.designSystemId)
    const outputSpec = readRecord(body.outputSpec)
    const now = new Date()
    const db = getDb()

    const [parentRun] = await db.select().from(agentRuns).where(eq(agentRuns.id, parentAgentRunId)).limit(1)
    if (!parentRun || parentRun.subjectType !== 'design_template_run') {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Design run not found.' })
      return
    }

    const parentMetadata = readRecord(parentRun.metadata)
    const parentDesignRunId = parentRun.subjectId ?? readOptionalString(parentMetadata.designTemplateRunId)
    if (!parentDesignRunId) {
      res.status(400).json({ error: 'VALIDATION', message: 'Parent run is missing design template run context.' })
      return
    }

    const [parentDesignRun] = await db
      .select()
      .from(designTemplateRuns)
      .where(eq(designTemplateRuns.id, parentDesignRunId))
      .limit(1)

    if (!parentDesignRun || !(await canAccessOrganization(parentDesignRun.organizationId, user))) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Design run not found.' })
      return
    }

    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, parentDesignRun.organizationId))
      .limit(1)

    if (!organization) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Organization not found.' })
      return
    }

    if (selectedDesignSystemId) {
      const [designSystem] = await db
        .select({ id: designSystems.id, organizationId: designSystems.organizationId })
        .from(designSystems)
        .where(eq(designSystems.id, selectedDesignSystemId))
        .limit(1)
      if (!designSystem || designSystem.organizationId !== parentDesignRun.organizationId) {
        res.status(400).json({ error: 'VALIDATION', message: 'Selected design system does not belong to this organization.' })
        return
      }
    }

    const [template] = parentDesignRun.templateId
      ? await db.select().from(designTemplates).where(eq(designTemplates.id, parentDesignRun.templateId)).limit(1)
      : []
    const designRunId = randomUUID()
    const agentRunId = randomUUID()
    const templateSlug = parentDesignRun.templateSlug ?? template?.slug ?? readOptionalString(parentMetadata.designTemplateSlug) ?? 'design-template'
    const sourceVersionId = parentDesignRun.targetVersionId ?? template?.currentVersionId ?? parentDesignRun.sourceVersionId
    const previousDesignSystemId = readOptionalString(parentMetadata.designSystemId)
    const codexSessionId = readRunCodexSessionId(parentRun.metadata)
    const branchName = `design/${templateSlug}-${agentRunId.slice(0, 8)}`
    const status = pendingInputMediaCount > 0 ? 'reserved' : 'queued'
    const statusMessage = pendingInputMediaCount > 0
      ? 'uploading input media'
      : parentRun.workerId ? 'queued for same design agent worker' : 'queued for design agent worker'

    const [agentRun] = await db.insert(agentRuns).values({
      id: agentRunId,
      parentRunId: parentRun.id,
      subjectType: 'design_template_run',
      subjectId: designRunId,
      workerId: parentRun.workerId ?? undefined,
      projectKey: parentRun.projectKey,
      repoFullName: parentRun.repoFullName,
      baseBranch: parentRun.baseBranch,
      branchName,
      status,
      statusMessage,
      metadata: {
        executionClass: 'general',
        handler: 'design-template-mcp',
        requiredCapabilities: ['codex.local', 'pach-mcp'],
        queuedVia: 'design_template_follow_up',
        designTemplateRunId: designRunId,
        designTemplateId: parentDesignRun.templateId,
        designTemplateSlug: templateSlug,
        designTemplateTitle: template?.name ?? readOptionalString(parentMetadata.designTemplateTitle),
        organizationId: organization.id,
        organizationName: organization.name,
        organizationProject: organization.project,
        sourceVersionId,
        prompt: feedback,
        feedback,
        parentRunId: parentRun.id,
        codexSessionId,
        designSystemId: selectedDesignSystemId ?? undefined,
        designSystemChanged: (selectedDesignSystemId ?? null) !== (previousDesignSystemId ?? null),
        outputSpec,
        pendingInputMediaCount,
      },
      createdAt: now,
      updatedAt: now,
    }).returning()

    const [designRun] = await db.insert(designTemplateRuns).values({
      id: designRunId,
      organizationId: parentDesignRun.organizationId,
      templateId: parentDesignRun.templateId ?? undefined,
      designSystemId: selectedDesignSystemId ?? undefined,
      agentRunId,
      templateSlug,
      prompt: feedback,
      status,
      statusMessage,
      sourceVersionId: sourceVersionId ?? undefined,
      outputSpec,
      metadata: {
        templateTitle: template?.name ?? readOptionalString(parentMetadata.designTemplateTitle),
        sourceKind: template?.sourceKind ?? readOptionalString(parentMetadata.sourceKind),
        agentRunId,
        parentRunId: parentRun.id,
        codexSessionId,
        designSystemId: selectedDesignSystemId ?? null,
        outputSpec,
      },
      createdAt: now,
      updatedAt: now,
    }).returning()

    res.status(201).json({
      ok: true,
      run: serializeAgentRun(agentRun),
      designRun: serializeDesignTemplateRun(designRun),
    })
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: 'VALIDATION', message: error.message })
      return
    }
    console.error('Design run follow-up failed', error)
    res.status(500).json({
      error: 'DESIGN_RUN_FOLLOW_UP_FAILED',
      message: error instanceof Error ? error.message : 'Could not queue design follow-up.',
    })
  }
})

async function canAccessOrganization(organizationId: string, user: JWTPayload | undefined) {
  const [organization] = await getDb().select().from(organizations).where(eq(organizations.id, organizationId)).limit(1)
  if (!organization) return false
  return user?.canAccessUnscoped || user?.organizationIds.includes(organization.id) || false
}

function authenticatedUser(req: Request) {
  return (req as Request & { user?: JWTPayload }).user
}

function readRequiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError(`${field} is required.`)
  return value.trim()
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readNullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readOptionalCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0
}

function readRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readStringRecord(value: unknown): Record<string, string> {
  const record = readRecord(value)
  return Object.fromEntries(Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

function serializeDesignTemplate(template: typeof designTemplates.$inferSelect) {
  return {
    id: template.id,
    organizationId: template.organizationId,
    type: template.type,
    name: template.name,
    slug: template.slug,
    status: template.status,
    sourceKind: template.sourceKind,
    currentVersionId: template.currentVersionId,
    metadata: template.metadata ?? {},
    createdAt: template.createdAt.getTime(),
    updatedAt: template.updatedAt.getTime(),
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
    createdAt: version.createdAt.getTime(),
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
    createdAt: run.createdAt.getTime(),
    updatedAt: run.updatedAt.getTime(),
  }
}

function serializeAgentRun(run: typeof agentRuns.$inferSelect) {
  return {
    id: run.id,
    parentRunId: run.parentRunId,
    subjectType: run.subjectType,
    subjectId: run.subjectId,
    workerId: run.workerId,
    status: run.status,
    statusMessage: run.statusMessage,
    metadata: run.metadata ?? {},
    createdAt: run.createdAt.getTime(),
    updatedAt: run.updatedAt.getTime(),
  }
}

function readRunCodexSessionId(metadata: unknown) {
  const record = readRecord(metadata)
  const topLevel = readOptionalString(record.codexSessionId)
  if (topLevel) return topLevel

  const completion = readRecord(record.completion)
  return readOptionalString(completion.codexSessionId) ?? null
}

class ValidationError extends Error {}

export default router
