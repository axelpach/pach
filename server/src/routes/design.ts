import { randomUUID } from 'node:crypto'
import { Router, type Request } from 'express'
import { eq } from 'drizzle-orm'
import { designTemplates, designTemplateVersions, organizations } from '../../../db/schema.js'
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
    const files = readRecord(body.files)
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

function readRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readStringRecord(value: unknown) {
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

class ValidationError extends Error {}

export default router
