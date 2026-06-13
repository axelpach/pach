import { randomUUID } from 'node:crypto'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Router, type Request } from 'express'
import { eq } from 'drizzle-orm'
import { documents, pmIssues } from '../../../db/schema.js'
import { getDb } from '../db.js'
import type { JWTPayload } from '../lib/auth.js'

const router = Router()

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_FILE_BYTES = 50 * 1024 * 1024
const SIGNED_UPLOAD_SECONDS = 5 * 60
const SIGNED_READ_SECONDS = 60 * 60

type MediaOwnerType = 'document' | 'issue'
type MediaKind = 'image' | 'file'

let s3Client: S3Client | null = null

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

async function getAccessibleMediaOwner(ownerType: MediaOwnerType, ownerId: string, user: JWTPayload | undefined) {
  if (ownerType === 'issue') {
    const issue = await getAccessibleIssue(ownerId, user)
    return issue ? { organizationId: issue.contextCompanyId ?? null } : null
  }

  const document = await getAccessibleDocument(ownerId, user)
  return document ? { organizationId: document.organizationId ?? null } : null
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

function parseMediaOwnerKey(key: string) {
  const parts = key.split('/')
  const prefix = storageEnvironmentPrefix()
  if (parts[0] !== prefix) return null
  if (parts[1] === 'organizations' && isOwnerFolder(parts[3]) && ['media', 'files'].includes(parts[5])) {
    return { organizationId: parts[2], ownerType: ownerTypeFromFolder(parts[3]), ownerId: parts[4] }
  }
  if (parts[1] === 'unscoped' && isOwnerFolder(parts[2]) && ['media', 'files'].includes(parts[4])) {
    return { organizationId: null, ownerType: ownerTypeFromFolder(parts[2]), ownerId: parts[3] }
  }
  return null
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
