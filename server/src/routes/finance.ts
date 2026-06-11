import { Router } from 'express'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { finCategories, finImportItems, finImports } from '../../../db/schema.js'
import { getDb } from '../db.js'
import { applyFinanceImport, applyFinanceImportBatch, importFinanceMovements } from '../services/finance-import.js'

const router = Router()

const SOURCE_TYPES = new Set(['statement_csv', 'statement_pdf', 'screenshot', 'manual_csv'])
type SourceType = 'statement_csv' | 'statement_pdf' | 'screenshot' | 'manual_csv'

router.get('/categories', async (req, res) => {
  const organizationId = typeof req.query.organizationId === 'string' ? req.query.organizationId : ''

  if (!organizationId) {
    res.status(400).json({ error: 'VALIDATION', message: 'Missing organizationId.' })
    return
  }

  if (!req.user?.organizationIds.includes(organizationId)) {
    res.status(403).json({ error: 'NOT_AUTHORIZED', message: 'Not authorized for this organization.' })
    return
  }

  const db = getDb()
  const categories = await db
    .select()
    .from(finCategories)
    .where(eq(finCategories.organizationId, organizationId))
    .orderBy(asc(finCategories.position), asc(finCategories.name))

  res.json({
    categories: categories.map((category) => ({
      id: category.id,
      organizationId: category.organizationId,
      parentId: category.parentId,
      name: category.name,
      type: category.type,
      color: category.color,
      icon: category.icon,
      position: category.position,
      archived: category.archived,
      createdAt: category.createdAt.getTime(),
      updatedAt: category.updatedAt.getTime(),
    })),
  })
})

router.post('/imports', async (req, res) => {
  try {
    const body = req.body ?? {}
    const {
      organizationId,
      accountId,
      batchId,
      fileName,
      fileType,
      sourceType,
      contentBase64,
    } = body

    if (
      typeof organizationId !== 'string' ||
      typeof accountId !== 'string' ||
      (batchId != null && typeof batchId !== 'string') ||
      typeof fileName !== 'string' ||
      typeof fileType !== 'string' ||
      typeof sourceType !== 'string' ||
      typeof contentBase64 !== 'string'
    ) {
      res.status(400).json({ error: 'VALIDATION', message: 'Missing import fields.' })
      return
    }

    if (!SOURCE_TYPES.has(sourceType)) {
      res.status(400).json({ error: 'VALIDATION', message: 'Unsupported source type.' })
      return
    }

    if (!req.user?.organizationIds.includes(organizationId)) {
      res.status(403).json({ error: 'NOT_AUTHORIZED', message: 'Not authorized for this organization.' })
      return
    }

    const result = await importFinanceMovements({
      organizationId,
      accountId,
      userId: req.user.sub,
      batchId: batchId ?? null,
      fileName,
      fileType,
      sourceType: sourceType as SourceType,
      contentBase64,
    })

    if ('error' in result) {
      const status = result.error === 'NOT_FOUND' ? 404 : result.error === 'VALIDATION' ? 400 : 500
      res.status(status).json(result)
      return
    }

    res.status(201).json(result)
  } catch (error) {
    res.status(500).json({
      error: 'IMPORT_FAILED',
      message: error instanceof Error ? error.message : 'Import failed.',
    })
  }
})

router.post('/import-batches/:batchId/apply', async (req, res) => {
  try {
    const batchId = req.params.batchId
    const db = getDb()
    const batchImports = await db.select().from(finImports).where(eq(finImports.batchId, batchId))

    if (batchImports.length === 0) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Import batch not found.' })
      return
    }

    const unauthorized = batchImports.some((entry) => !req.user?.organizationIds.includes(entry.organizationId))
    if (unauthorized) {
      res.status(403).json({ error: 'NOT_AUTHORIZED', message: 'Not authorized for this organization.' })
      return
    }

    const result = await applyFinanceImportBatch(batchId)
    if ('error' in result) {
      const status = result.error === 'NOT_FOUND' ? 404 : 500
      res.status(status).json(result)
      return
    }

    res.json(result)
  } catch (error) {
    res.status(500).json({
      error: 'APPLY_FAILED',
      message: error instanceof Error ? error.message : 'Could not apply import batch.',
    })
  }
})

router.post('/imports/:id/apply', async (req, res) => {
  try {
    const importId = req.params.id
    const db = getDb()
    const [entry] = await db.select().from(finImports).where(eq(finImports.id, importId)).limit(1)

    if (!entry) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Import not found.' })
      return
    }

    if (!req.user?.organizationIds.includes(entry.organizationId)) {
      res.status(403).json({ error: 'NOT_AUTHORIZED', message: 'Not authorized for this organization.' })
      return
    }

    const result = await applyFinanceImport(importId)
    if ('error' in result) {
      const status = result.error === 'NOT_FOUND' ? 404 : 500
      res.status(status).json(result)
      return
    }

    res.json(result)
  } catch (error) {
    res.status(500).json({
      error: 'APPLY_FAILED',
      message: error instanceof Error ? error.message : 'Could not apply import.',
    })
  }
})

router.patch('/import-batches/:batchId/ignore', async (req, res) => {
  const batchId = req.params.batchId
  const db = getDb()
  const batchImports = await db.select().from(finImports).where(eq(finImports.batchId, batchId))

  if (batchImports.length === 0) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Import batch not found.' })
    return
  }

  const unauthorized = batchImports.some((entry) => !req.user?.organizationIds.includes(entry.organizationId))
  if (unauthorized) {
    res.status(403).json({ error: 'NOT_AUTHORIZED', message: 'Not authorized for this organization.' })
    return
  }

  const importIds = batchImports.map((entry) => entry.id)
  await db
    .update(finImportItems)
    .set({ status: 'ignored', errorMessage: null, updatedAt: new Date() })
    .where(and(inArray(finImportItems.importId, importIds), inArray(finImportItems.status, ['parsed', 'needs_review', 'duplicate', 'ignored', 'failed'])))

  const updated = await db
    .update(finImports)
    .set({ status: 'ignored', updatedAt: new Date() })
    .where(eq(finImports.batchId, batchId))
    .returning()

  res.json({ imports: updated })
})

router.patch('/imports/:id/ignore', async (req, res) => {
  const importId = req.params.id
  const db = getDb()
  const [entry] = await db.select().from(finImports).where(eq(finImports.id, importId)).limit(1)

  if (!entry) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Import not found.' })
    return
  }

  if (!req.user?.organizationIds.includes(entry.organizationId)) {
    res.status(403).json({ error: 'NOT_AUTHORIZED', message: 'Not authorized for this organization.' })
    return
  }

  await db
    .update(finImportItems)
    .set({ status: 'ignored', errorMessage: null, updatedAt: new Date() })
    .where(and(eq(finImportItems.importId, importId), inArray(finImportItems.status, ['parsed', 'needs_review', 'duplicate', 'ignored', 'failed'])))

  const [updated] = await db
    .update(finImports)
    .set({ status: 'ignored', updatedAt: new Date() })
    .where(eq(finImports.id, importId))
    .returning()

  res.json({ import: updated })
})

export default router
