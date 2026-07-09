import { randomUUID } from 'node:crypto'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Router, type Request } from 'express'
import { and, eq, inArray } from 'drizzle-orm'
import {
  agentRunInputMediaObjects,
  agentRunInputMedia,
  agentRuns,
  designAssets,
  documents,
  mktContentItems,
  mktDistributionRuns,
  organizations,
  pmIssues,
} from '../../../db/schema.js'
import { getDb } from '../db.js'
import type { JWTPayload } from '../lib/auth.js'

export const publicMediaRouter = Router()
const router = Router()

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_FILE_BYTES = 50 * 1024 * 1024
const SIGNED_UPLOAD_SECONDS = 5 * 60
const SIGNED_READ_SECONDS = 60 * 60

type MediaOwnerType = 'document' | 'issue'
type MediaKind = 'image' | 'file'
type AgentInputMediaKind = 'image' | 'screenshot' | 'file'
type ParsedMediaOwnerKey = {
  organizationId: string | null
  ownerType: MediaOwnerType
  ownerId: string
  mediaKind: MediaKind
}

let s3Client: S3Client | null = null

publicMediaRouter.get('/design-assets/:id/file', async (req, res) => {
  try {
    const assetId = typeof req.params.id === 'string' ? req.params.id : ''
    if (!assetId) {
      res.status(400).type('text/plain').send('Missing asset id.')
      return
    }

    const [asset] = await getDb().select().from(designAssets).where(eq(designAssets.id, assetId)).limit(1)
    if (!asset?.storageKey) {
      res.status(404).type('text/plain').send('Design asset not found.')
      return
    }

    const object = await getS3Client().send(new GetObjectCommand({
      Bucket: getBucketName(),
      Key: asset.storageKey,
    }))
    const metadata = readObject(asset.metadata)
    const mimeType = readOptionalString(metadata.mimeType) ?? object.ContentType ?? 'application/octet-stream'
    const fileName = readOptionalString(metadata.fileName) ?? asset.name

    res.setHeader('Content-Type', mimeType)
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600')
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (object.ContentLength != null) res.setHeader('Content-Length', String(object.ContentLength))
    if (object.ETag) res.setHeader('ETag', object.ETag)
    res.setHeader('Content-Disposition', `${asset.kind === 'file' ? 'attachment' : 'inline'}; filename="${sanitizeContentDispositionFileName(fileName)}"`)

    const body = object.Body as { pipe?: (destination: typeof res) => void } | undefined
    if (body?.pipe) {
      body.pipe(res)
      return
    }

    res.status(500).type('text/plain').send('Design asset body is not streamable.')
  } catch (error) {
    console.error('Design asset public read failed', error)
    res.status(500).type('text/plain').send('Could not load design asset.')
  }
})

publicMediaRouter.get('/agent-run-input/:id/file', async (req, res) => {
  try {
    const attachmentId = typeof req.params.id === 'string' ? req.params.id : ''
    if (!attachmentId) {
      res.status(400).type('text/plain').send('Missing attachment id.')
      return
    }

    const db = getDb()
    const [attachment] = await db.select().from(agentRunInputMedia).where(eq(agentRunInputMedia.id, attachmentId)).limit(1)
    if (!attachment) {
      res.status(404).type('text/plain').send('Agent input media not found.')
      return
    }

    const [mediaObject] = await db
      .select()
      .from(agentRunInputMediaObjects)
      .where(eq(agentRunInputMediaObjects.id, attachment.mediaObjectId))
      .limit(1)
    if (!mediaObject?.storageKey) {
      res.status(404).type('text/plain').send('Agent input media file not found.')
      return
    }

    const object = await getS3Client().send(new GetObjectCommand({
      Bucket: getBucketName(),
      Key: mediaObject.storageKey,
    }))
    const mimeType = mediaObject.mimeType || object.ContentType || 'application/octet-stream'
    const fileName = mediaObject.fileName || mediaObject.name || fileNameFromKey(mediaObject.storageKey)

    res.setHeader('Content-Type', mimeType)
    res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=3600')
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (object.ContentLength != null) res.setHeader('Content-Length', String(object.ContentLength))
    if (object.ETag) res.setHeader('ETag', object.ETag)
    res.setHeader('Content-Disposition', `${mediaObject.kind === 'file' ? 'attachment' : 'inline'}; filename="${sanitizeContentDispositionFileName(fileName)}"`)

    const body = object.Body as { pipe?: (destination: typeof res) => void } | undefined
    if (body?.pipe) {
      body.pipe(res)
      return
    }

    res.status(500).type('text/plain').send('Agent input media body is not streamable.')
  } catch (error) {
    console.error('Agent input media public read failed', error)
    res.status(500).type('text/plain').send('Could not load agent input media.')
  }
})

publicMediaRouter.get('/marketing-assets', async (req, res) => {
  try {
    const key = typeof req.query.key === 'string' ? req.query.key : ''
    const parsed = parseMediaOwnerKey(key)
    if (!key || !parsed || parsed.ownerType !== 'document' || parsed.mediaKind !== 'image') {
      res.status(400).type('text/plain').send('Invalid marketing asset key.')
      return
    }

    const isPublishedImage = await canReadPublishedMarketingImage(key, parsed)
    if (!isPublishedImage) {
      res.status(404).type('text/plain').send('Marketing asset not found.')
      return
    }

    const object = await getS3Client().send(new GetObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    }))
    const mimeType = publicImageMimeType(object.ContentType, key)
    if (!mimeType) {
      res.status(415).type('text/plain').send('Marketing asset type is not supported.')
      return
    }

    res.setHeader('Content-Type', mimeType)
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600')
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (object.ContentLength != null) res.setHeader('Content-Length', String(object.ContentLength))
    if (object.ETag) res.setHeader('ETag', object.ETag)
    res.setHeader('Content-Disposition', `inline; filename="${sanitizeContentDispositionFileName(fileNameFromKey(key))}"`)

    const body = object.Body as { pipe?: (destination: typeof res) => void } | undefined
    if (body?.pipe) {
      body.pipe(res)
      return
    }

    res.status(500).type('text/plain').send('Marketing asset body is not streamable.')
  } catch (error) {
    console.error('Marketing asset public read failed', error)
    res.status(500).type('text/plain').send('Could not load marketing asset.')
  }
})

router.post('/upload', async (req, res) => {
  try {
    const user = authenticatedUser(req)
    const body = req.body ?? {}
    const documentId = typeof body.documentId === 'string' ? body.documentId : ''
    const ownerType: MediaOwnerType = body.ownerType === 'issue' ? 'issue' : 'document'
    const ownerId = typeof body.ownerId === 'string' && body.ownerId ? body.ownerId : documentId
    const organizationId = typeof body.organizationId === 'string' ? body.organizationId : null
    const fileName = typeof body.fileName === 'string' ? body.fileName : ''
    const mimeType = typeof body.mimeType === 'string' && body.mimeType.trim() ? body.mimeType : 'application/octet-stream'
    const contentBase64 = typeof body.contentBase64 === 'string' ? body.contentBase64 : ''
    const kind: MediaKind = body.kind === 'file' ? 'file' : 'image'

    if (!ownerId || !fileName || !contentBase64) {
      res.status(400).json({ error: 'VALIDATION', message: 'Missing media upload fields.' })
      return
    }
    if (kind === 'image' && !mimeType.startsWith('image/')) {
      res.status(400).json({ error: 'VALIDATION', message: 'Only images are supported for document media v1.' })
      return
    }

    const bytes = decodeBase64Payload(contentBase64)
    if (bytes.length === 0) {
      res.status(400).json({ error: 'VALIDATION', message: 'Image is empty.' })
      return
    }
    if (kind === 'image' && bytes.length > MAX_IMAGE_BYTES) {
      res.status(400).json({ error: 'VALIDATION', message: 'Images must be 10 MB or smaller.' })
      return
    }
    if (kind === 'file' && bytes.length > MAX_FILE_BYTES) {
      res.status(400).json({ error: 'VALIDATION', message: 'Files must be 50 MB or smaller.' })
      return
    }

    const owner = await getAccessibleMediaOwner(ownerType, ownerId, user)
    if (!owner) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Media owner not found.' })
      return
    }
    if ((owner.organizationId ?? null) !== (organizationId ?? null)) {
      res.status(400).json({ error: 'VALIDATION', message: 'Media owner organization mismatch.' })
      return
    }

    const key = mediaOwnerKey({
      ownerType,
      ownerId,
      fileName,
      kind,
      organizationId,
    })
    await getS3Client().send(new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: bytes,
      ContentType: mimeType,
      ContentDisposition: kind === 'file' ? `attachment; filename="${sanitizeContentDispositionFileName(fileName)}"` : undefined,
    }))

    res.status(201).json({
      key,
      readUrl: await signedReadUrl(key),
    })
  } catch (error) {
    console.error('Document media upload failed', error)
    res.status(500).json({
      error: 'MEDIA_UPLOAD_FAILED',
      message: error instanceof Error ? error.message : 'Could not upload media.',
    })
  }
})

router.post('/presign-upload', async (req, res) => {
  try {
    const user = authenticatedUser(req)
    const body = req.body ?? {}
    const documentId = typeof body.documentId === 'string' ? body.documentId : ''
    const ownerType: MediaOwnerType = body.ownerType === 'issue' ? 'issue' : 'document'
    const ownerId = typeof body.ownerId === 'string' && body.ownerId ? body.ownerId : documentId
    const organizationId = typeof body.organizationId === 'string' ? body.organizationId : null
    const fileName = typeof body.fileName === 'string' ? body.fileName : ''
    const mimeType = typeof body.mimeType === 'string' && body.mimeType.trim() ? body.mimeType : 'application/octet-stream'
    const sizeBytes = typeof body.sizeBytes === 'number' ? body.sizeBytes : 0
    const kind: MediaKind = body.kind === 'file' ? 'file' : 'image'

    if (!ownerId || !fileName || !sizeBytes) {
      res.status(400).json({ error: 'VALIDATION', message: 'Missing media upload fields.' })
      return
    }
    if (kind === 'image' && !mimeType.startsWith('image/')) {
      res.status(400).json({ error: 'VALIDATION', message: 'Only images are supported for document media v1.' })
      return
    }
    if (kind === 'image' && sizeBytes > MAX_IMAGE_BYTES) {
      res.status(400).json({ error: 'VALIDATION', message: 'Images must be 10 MB or smaller.' })
      return
    }
    if (kind === 'file' && sizeBytes > MAX_FILE_BYTES) {
      res.status(400).json({ error: 'VALIDATION', message: 'Files must be 50 MB or smaller.' })
      return
    }

    const owner = await getAccessibleMediaOwner(ownerType, ownerId, user)
    if (!owner) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Media owner not found.' })
      return
    }
    if ((owner.organizationId ?? null) !== (organizationId ?? null)) {
      res.status(400).json({ error: 'VALIDATION', message: 'Media owner organization mismatch.' })
      return
    }

    const key = mediaOwnerKey({
      ownerType,
      ownerId,
      fileName,
      kind,
      organizationId,
    })
    const uploadUrl = await getSignedUrl(
      getS3Client(),
      new PutObjectCommand({
        Bucket: getBucketName(),
        Key: key,
        ContentType: mimeType,
        ContentDisposition: kind === 'file' ? `attachment; filename="${sanitizeContentDispositionFileName(fileName)}"` : undefined,
      }),
      { expiresIn: SIGNED_UPLOAD_SECONDS },
    )
    const readUrl = await signedReadUrl(key)

    res.status(201).json({
      key,
      readUrl,
      uploadUrl,
      headers: { 'Content-Type': mimeType },
    })
  } catch (error) {
    console.error('Document media upload presign failed', error)
    res.status(500).json({
      error: 'MEDIA_UPLOAD_FAILED',
      message: error instanceof Error ? error.message : 'Could not prepare media upload.',
    })
  }
})

router.post('/presign-read', async (req, res) => {
  try {
    const user = authenticatedUser(req)
    const key = typeof req.body?.key === 'string' ? req.body.key : ''
    if (!key) {
      res.status(400).json({ error: 'VALIDATION', message: 'Missing media key.' })
      return
    }

    const parsed = parseMediaOwnerKey(key)
    if (!parsed) {
      res.status(400).json({ error: 'VALIDATION', message: 'Invalid media key.' })
      return
    }

    const owner = await getAccessibleMediaOwner(parsed.ownerType, parsed.ownerId, user)
    if (!owner || (owner.organizationId ?? null) !== (parsed.organizationId ?? null)) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Media not found.' })
      return
    }

    res.json({ readUrl: await signedReadUrl(key) })
  } catch (error) {
    console.error('Document media read presign failed', error)
    res.status(500).json({
      error: 'MEDIA_READ_FAILED',
      message: error instanceof Error ? error.message : 'Could not prepare media preview.',
    })
  }
})

router.post('/design-assets/upload', async (req, res) => {
  try {
    const user = authenticatedUser(req)
    const body = req.body ?? {}
    const organizationId = typeof body.organizationId === 'string' ? body.organizationId : ''
    const templateId = typeof body.templateId === 'string' && body.templateId ? body.templateId : null
    const fileName = typeof body.fileName === 'string' ? body.fileName : ''
    const displayName = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : fileName
    const mimeType = typeof body.mimeType === 'string' && body.mimeType.trim() ? body.mimeType : 'application/octet-stream'
    const contentBase64 = typeof body.contentBase64 === 'string' ? body.contentBase64 : ''
    const width = typeof body.width === 'number' && Number.isFinite(body.width) ? Math.round(body.width) : null
    const height = typeof body.height === 'number' && Number.isFinite(body.height) ? Math.round(body.height) : null
    const kind = readDesignAssetKind(body.kind, mimeType)

    if (!organizationId || !fileName || !contentBase64) {
      res.status(400).json({ error: 'VALIDATION', message: 'Missing design asset upload fields.' })
      return
    }
    if (kind === 'image' && !mimeType.startsWith('image/')) {
      res.status(400).json({ error: 'VALIDATION', message: 'Only image MIME types can be uploaded as design images.' })
      return
    }

    const organization = await getAccessibleOrganization(organizationId, user)
    if (!organization) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Organization not found.' })
      return
    }

    const bytes = decodeBase64Payload(contentBase64)
    if (bytes.length === 0) {
      res.status(400).json({ error: 'VALIDATION', message: 'Asset is empty.' })
      return
    }
    if (kind === 'image' && bytes.length > MAX_IMAGE_BYTES) {
      res.status(400).json({ error: 'VALIDATION', message: 'Images must be 10 MB or smaller.' })
      return
    }
    if (kind !== 'image' && bytes.length > MAX_FILE_BYTES) {
      res.status(400).json({ error: 'VALIDATION', message: 'Files must be 50 MB or smaller.' })
      return
    }

    const key = designAssetKey({ organizationId, fileName, kind })
    const assetId = randomUUID()
    await getS3Client().send(new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: bytes,
      ContentType: mimeType,
      ContentDisposition: kind === 'file' ? `attachment; filename="${sanitizeContentDispositionFileName(fileName)}"` : undefined,
    }))

    const publicUrl = stableDesignAssetUrl(req, assetId)
    const now = new Date()
    const [asset] = await getDb()
      .insert(designAssets)
      .values({
        id: assetId,
        organizationId,
        templateId: templateId ?? undefined,
        kind,
        name: displayName,
        storageKey: key,
        url: publicUrl,
        metadata: {
          fileName,
          mimeType,
          sizeBytes: bytes.length,
          width,
          height,
          aspectRatio: width && height ? Number((width / height).toFixed(4)) : undefined,
          uploadedVia: 'design_assets_modal',
        },
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    res.status(201).json({
      asset,
      readUrl: publicUrl,
      signedReadUrl: await signedReadUrl(key),
    })
  } catch (error) {
    console.error('Design asset upload failed', error)
    res.status(500).json({
      error: 'DESIGN_ASSET_UPLOAD_FAILED',
      message: error instanceof Error ? error.message : 'Could not upload design asset.',
    })
  }
})

router.post('/design-assets/:id/read-url', async (req, res) => {
  try {
    const user = authenticatedUser(req)
    const assetId = typeof req.params.id === 'string' ? req.params.id : ''
    if (!assetId) {
      res.status(400).json({ error: 'VALIDATION', message: 'Missing asset id.' })
      return
    }

    const [asset] = await getDb().select().from(designAssets).where(eq(designAssets.id, assetId)).limit(1)
    if (!asset?.storageKey) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Design asset not found.' })
      return
    }

    const organization = await getAccessibleOrganization(asset.organizationId, user)
    if (!organization) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Design asset not found.' })
      return
    }

    res.json({
      readUrl: stableDesignAssetUrl(req, asset.id),
      stableUrl: stableDesignAssetUrl(req, asset.id),
      signedReadUrl: await signedReadUrl(asset.storageKey),
      expiresInSeconds: SIGNED_READ_SECONDS,
    })
  } catch (error) {
    console.error('Design asset read presign failed', error)
    res.status(500).json({
      error: 'DESIGN_ASSET_READ_FAILED',
      message: error instanceof Error ? error.message : 'Could not prepare design asset URL.',
    })
  }
})

router.delete('/design-assets/:id', async (req, res) => {
  try {
    const user = authenticatedUser(req)
    const assetId = typeof req.params.id === 'string' ? req.params.id : ''
    if (!assetId) {
      res.status(400).json({ error: 'VALIDATION', message: 'Missing asset id.' })
      return
    }

    const [asset] = await getDb().select().from(designAssets).where(eq(designAssets.id, assetId)).limit(1)
    if (!asset) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Design asset not found.' })
      return
    }

    const organization = await getAccessibleOrganization(asset.organizationId, user)
    if (!organization) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Design asset not found.' })
      return
    }

    if (asset.storageKey) {
      await getS3Client().send(new DeleteObjectCommand({
        Bucket: getBucketName(),
        Key: asset.storageKey,
      }))
    }

    await getDb().delete(designAssets).where(eq(designAssets.id, asset.id))

    res.json({ ok: true, id: asset.id })
  } catch (error) {
    console.error('Design asset delete failed', error)
    res.status(500).json({
      error: 'DESIGN_ASSET_DELETE_FAILED',
      message: error instanceof Error ? error.message : 'Could not delete design asset.',
    })
  }
})

router.post('/agent-run-input/upload', async (req, res) => {
  try {
    const user = authenticatedUser(req)
    const body = req.body ?? {}
    const runId = typeof body.runId === 'string' ? body.runId : ''
    const messageId = typeof body.messageId === 'string' && body.messageId ? body.messageId : null
    const fileName = typeof body.fileName === 'string' ? body.fileName : ''
    const displayName = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : fileName
    const caption = typeof body.caption === 'string' && body.caption.trim() ? body.caption.trim() : null
    const mimeType = typeof body.mimeType === 'string' && body.mimeType.trim() ? body.mimeType : 'application/octet-stream'
    const contentBase64 = typeof body.contentBase64 === 'string' ? body.contentBase64 : ''
    const width = typeof body.width === 'number' && Number.isFinite(body.width) ? Math.round(body.width) : null
    const height = typeof body.height === 'number' && Number.isFinite(body.height) ? Math.round(body.height) : null
    const kind = readAgentInputMediaKind(body.kind, mimeType)

    if (!runId || !fileName || !contentBase64) {
      res.status(400).json({ error: 'VALIDATION', message: 'Missing agent input upload fields.' })
      return
    }
    if ((kind === 'image' || kind === 'screenshot') && !mimeType.startsWith('image/')) {
      res.status(400).json({ error: 'VALIDATION', message: 'Only image MIME types can be uploaded as image context.' })
      return
    }

    const run = await getAccessibleAgentRun(runId, user)
    if (!run) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Agent run not found.' })
      return
    }

    const bytes = decodeBase64Payload(contentBase64)
    if (bytes.length === 0) {
      res.status(400).json({ error: 'VALIDATION', message: 'Attachment is empty.' })
      return
    }
    if ((kind === 'image' || kind === 'screenshot') && bytes.length > MAX_IMAGE_BYTES) {
      res.status(400).json({ error: 'VALIDATION', message: 'Images must be 10 MB or smaller.' })
      return
    }
    if (kind === 'file' && bytes.length > MAX_FILE_BYTES) {
      res.status(400).json({ error: 'VALIDATION', message: 'Files must be 50 MB or smaller.' })
      return
    }

    const organizationId = run.organizationId
    const key = agentInputMediaKey({ organizationId, runId, fileName, kind })
    await getS3Client().send(new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: bytes,
      ContentType: mimeType,
      ContentDisposition: kind === 'file' ? `attachment; filename="${sanitizeContentDispositionFileName(fileName)}"` : undefined,
    }))

    const now = new Date()
    const mediaObjectId = randomUUID()
    const attachmentId = randomUUID()
    const publicUrl = publicReadUrl(key)
    const stableUrl = stableAgentInputMediaUrl(req, attachmentId)
    const db = getDb()
    const [mediaObject] = await db
      .insert(agentRunInputMediaObjects)
      .values({
        id: mediaObjectId,
        organizationId: organizationId ?? undefined,
        kind,
        name: displayName,
        fileName,
        mimeType,
        sizeBytes: bytes.length,
        width: width ?? undefined,
        height: height ?? undefined,
        storageKey: key,
        url: stableUrl,
        source: 'agent_run_upload',
        metadata: {
          caption,
          aspectRatio: width && height ? Number((width / height).toFixed(4)) : undefined,
          uploadedVia: 'agent_run_input',
          originalUrl: publicUrl,
        },
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    const [attachment] = await db
      .insert(agentRunInputMedia)
      .values({
        id: attachmentId,
        runId,
        mediaObjectId: mediaObject.id,
        messageId: messageId ?? undefined,
        issueId: run.issueId ?? undefined,
        subjectType: run.subjectType,
        subjectId: run.subjectId ?? undefined,
        role: 'input',
        caption: caption ?? undefined,
        sortOrder: run.attachmentCount,
        metadata: {
          uploadedVia: 'agent_run_input',
        },
        createdAt: now,
      })
      .returning()

    const summary = {
      id: attachment.id,
      mediaObjectId: mediaObject.id,
      name: mediaObject.name,
      fileName: mediaObject.fileName,
      kind: mediaObject.kind,
      mimeType: mediaObject.mimeType,
      sizeBytes: mediaObject.sizeBytes,
      width: mediaObject.width,
      height: mediaObject.height,
      url: mediaObject.url,
      stableUrl,
      originalUrl: publicUrl,
      storageKey: mediaObject.storageKey,
      caption: attachment.caption,
      uploadedAt: now.toISOString(),
    }

    await db
      .update(agentRuns)
      .set({
        metadata: {
          ...run.metadata,
          hasInputMedia: true,
          inputMediaCount: run.attachmentCount + 1,
          attachments: [...run.attachments, summary],
        },
        updatedAt: now,
      })
      .where(eq(agentRuns.id, runId))

    res.status(201).json({
      attachment,
      mediaObject,
      summary,
      readUrl: stableUrl,
      signedReadUrl: await signedReadUrl(key),
    })
  } catch (error) {
    console.error('Agent input media upload failed', error)
    res.status(500).json({
      error: 'AGENT_INPUT_MEDIA_UPLOAD_FAILED',
      message: error instanceof Error ? error.message : 'Could not upload agent input media.',
    })
  }
})

async function getAccessibleDocument(documentId: string, user: JWTPayload | undefined) {
  const db = getDb()
  const [document] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1)
  if (!document || document.status === 'archived') return null
  if (document.organizationId) {
    return user?.organizationIds.includes(document.organizationId) ? document : null
  }
  return user?.canAccessUnscoped ? document : null
}

async function getAccessibleIssue(issueId: string, user: JWTPayload | undefined) {
  const db = getDb()
  const [issue] = await db.select().from(pmIssues).where(eq(pmIssues.id, issueId)).limit(1)
  if (!issue) return null
  if (issue.contextCompanyId) {
    return user?.organizationIds.includes(issue.contextCompanyId) ? issue : null
  }
  return user?.canAccessUnscoped ? issue : null
}

async function getAccessibleOrganization(organizationId: string, user: JWTPayload | undefined) {
  const db = getDb()
  const [organization] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1)
  if (!organization) return null
  return user?.organizationIds.includes(organization.id) || user?.canAccessUnscoped ? organization : null
}

async function getAccessibleMediaOwner(ownerType: MediaOwnerType, ownerId: string, user: JWTPayload | undefined) {
  if (ownerType === 'issue') {
    const issue = await getAccessibleIssue(ownerId, user)
    return issue ? { organizationId: issue.contextCompanyId ?? null } : null
  }

  const document = await getAccessibleDocument(ownerId, user)
  return document ? { organizationId: document.organizationId ?? null } : null
}

async function getAccessibleAgentRun(runId: string, user: JWTPayload | undefined) {
  const db = getDb()
  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1)
  if (!run) return null

  const metadata = readObject(run.metadata)
  let organizationId = readOptionalString(metadata.organizationId)

  if (run.issueId) {
    const issue = await getAccessibleIssue(run.issueId, user)
    if (!issue) return null
    organizationId = issue.contextCompanyId ?? organizationId
  } else if (organizationId) {
    const organization = await getAccessibleOrganization(organizationId, user)
    if (!organization) return null
  } else if (!user?.canAccessUnscoped) {
    return null
  }

  return {
    ...run,
    metadata,
    organizationId: organizationId ?? null,
    attachments: readAttachmentSummaries(metadata.attachments),
    attachmentCount: readAttachmentSummaries(metadata.attachments).length,
  }
}

function authenticatedUser(req: Request) {
  return (req as Request & { user?: JWTPayload }).user
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

function storageEnvironmentPrefix() {
  if (process.env.S3_KEY_PREFIX) return sanitizePathPart(process.env.S3_KEY_PREFIX)
  const env = process.env.DOPPLER_ENVIRONMENT || process.env.APP_ENV || process.env.NODE_ENV
  return env === 'prod' || env === 'production' || process.env.RAILWAY_ENVIRONMENT ? 'prod' : 'dev'
}

function mediaOwnerKey({
  ownerType,
  ownerId,
  fileName,
  kind,
  organizationId,
}: {
  ownerType: MediaOwnerType
  ownerId: string
  fileName: string
  kind: MediaKind
  organizationId: string | null
}) {
  const scope = organizationId ? `organizations/${organizationId}` : 'unscoped'
  const folder = kind === 'file' ? 'files' : 'media'
  return [
    storageEnvironmentPrefix(),
    scope,
    ownerFolder(ownerType),
    ownerId,
    folder,
    `${randomUUID()}-${sanitizeFileName(fileName)}`,
  ].join('/')
}

function agentInputMediaKey({
  organizationId,
  runId,
  fileName,
  kind,
}: {
  organizationId: string | null
  runId: string
  fileName: string
  kind: AgentInputMediaKind
}) {
  const scope = organizationId ? `organizations/${organizationId}` : 'unscoped'
  return [
    storageEnvironmentPrefix(),
    scope,
    'agent-runs',
    runId,
    kind === 'file' ? 'files' : 'images',
    `${randomUUID()}-${sanitizeFileName(fileName)}`,
  ].join('/')
}

function designAssetKey({
  organizationId,
  fileName,
  kind,
}: {
  organizationId: string
  fileName: string
  kind: string
}) {
  return [
    storageEnvironmentPrefix(),
    'organizations',
    organizationId,
    'design-assets',
    kind === 'image' ? 'images' : 'files',
    `${randomUUID()}-${sanitizeFileName(fileName)}`,
  ].join('/')
}

function publicReadUrl(key: string) {
  const baseUrl = process.env.S3_PUBLIC_BASE_URL || process.env.AWS_S3_PUBLIC_BASE_URL
  if (baseUrl) return `${baseUrl.replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`

  return `https://${getBucketName()}.s3.${getAwsRegion()}.amazonaws.com/${key.split('/').map(encodeURIComponent).join('/')}`
}

function stableDesignAssetUrl(req: Request, assetId: string) {
  return `${requestOrigin(req)}/media/design-assets/${encodeURIComponent(assetId)}/file`
}

function stableAgentInputMediaUrl(req: Request, attachmentId: string) {
  return `${requestOrigin(req)}/media/agent-run-input/${encodeURIComponent(attachmentId)}/file`
}

function requestOrigin(req: Request) {
  const forwardedProto = req.header('x-forwarded-proto')?.split(',')[0]?.trim()
  const forwardedHost = req.header('x-forwarded-host')?.split(',')[0]?.trim()
  const proto = forwardedProto || req.protocol || 'http'
  const host = forwardedHost || req.get('host') || `localhost:${process.env.PORT || 3001}`
  return `${proto}://${host}`
}

function readDesignAssetKind(value: unknown, mimeType: string) {
  if (value === 'logo' || value === 'screenshot' || value === 'photo' || value === 'file') return value
  return mimeType.startsWith('image/') ? 'image' : 'file'
}

function readAgentInputMediaKind(value: unknown, mimeType: string): AgentInputMediaKind {
  if (value === 'screenshot' || value === 'image' || value === 'file') return value
  return mimeType.startsWith('image/') ? 'image' : 'file'
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readAttachmentSummaries(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object')) : []
}

async function canReadPublishedMarketingImage(key: string, parsed: ParsedMediaOwnerKey) {
  if (!parsed.organizationId) return false

  const contentItems = await getDb()
    .select({
      id: mktContentItems.id,
      body: mktContentItems.body,
      status: mktContentItems.status,
      supportedChannels: mktContentItems.supportedChannels,
    })
    .from(mktContentItems)
    .where(and(
      eq(mktContentItems.sourceDocumentId, parsed.ownerId),
      eq(mktContentItems.organizationId, parsed.organizationId),
    ))

  const referencedContentIds = contentItems
    .filter((item) => isPublicBlogContentItem(item) && item.body.includes(`s3://${key}`))
    .map((item) => item.id)

  if (referencedContentIds.length === 0) return false

  const [publishedRun] = await getDb()
    .select({ id: mktDistributionRuns.id })
    .from(mktDistributionRuns)
    .where(and(
      eq(mktDistributionRuns.organizationId, parsed.organizationId),
      inArray(mktDistributionRuns.contentItemId, referencedContentIds),
      eq(mktDistributionRuns.channel, 'blog'),
      eq(mktDistributionRuns.status, 'published'),
    ))
    .limit(1)

  return Boolean(publishedRun)
}

function isPublicBlogContentItem(item: Pick<typeof mktContentItems.$inferSelect, 'status' | 'supportedChannels'>) {
  return ['ready', 'published'].includes(item.status) && item.supportedChannels.includes('blog')
}

function parseMediaOwnerKey(key: string): ParsedMediaOwnerKey | null {
  const parts = key.split('/')
  const prefix = storageEnvironmentPrefix()
  if (parts[0] !== prefix) return null
  if (parts[1] === 'organizations' && isOwnerFolder(parts[3]) && ['media', 'files'].includes(parts[5])) {
    return { organizationId: parts[2], ownerType: ownerTypeFromFolder(parts[3]), ownerId: parts[4], mediaKind: mediaKindFromFolder(parts[5]) }
  }
  if (parts[1] === 'unscoped' && isOwnerFolder(parts[2]) && ['media', 'files'].includes(parts[4])) {
    return { organizationId: null, ownerType: ownerTypeFromFolder(parts[2]), ownerId: parts[3], mediaKind: mediaKindFromFolder(parts[4]) }
  }
  return null
}

function mediaKindFromFolder(folder: string): MediaKind {
  return folder === 'files' ? 'file' : 'image'
}

function publicImageMimeType(contentType: string | undefined, key: string) {
  const normalized = contentType?.split(';')[0]?.trim().toLowerCase()
  if (normalized && supportedPublicImageMimeTypes.has(normalized)) return normalized
  const inferred = imageMimeTypeFromKey(key)
  return inferred && supportedPublicImageMimeTypes.has(inferred) ? inferred : null
}

function imageMimeTypeFromKey(key: string) {
  const path = key.toLowerCase()
  if (path.endsWith('.webp')) return 'image/webp'
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
  if (path.endsWith('.gif')) return 'image/gif'
  if (path.endsWith('.avif')) return 'image/avif'
  return null
}

const supportedPublicImageMimeTypes = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

function fileNameFromKey(key: string) {
  return key.split('/').pop() || 'image'
}

function ownerFolder(ownerType: MediaOwnerType) {
  return ownerType === 'issue' ? 'issues' : 'documents'
}

function isOwnerFolder(value: string | undefined): value is 'documents' | 'issues' {
  return value === 'documents' || value === 'issues'
}

function ownerTypeFromFolder(folder: 'documents' | 'issues'): MediaOwnerType {
  return folder === 'issues' ? 'issue' : 'document'
}

function decodeBase64Payload(value: string) {
  const payload = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value
  return Buffer.from(payload, 'base64')
}

function sanitizeFileName(fileName: string) {
  const cleaned = fileName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
  return cleaned || 'file'
}

function sanitizeContentDispositionFileName(fileName: string) {
  return sanitizeFileName(fileName).replace(/"/g, '')
}

function sanitizePathPart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'dev'
}

export default router
