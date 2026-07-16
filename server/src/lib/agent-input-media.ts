import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const SIGNED_READ_SECONDS = 60 * 60

let s3Client: S3Client | null = null

export type AgentInputMediaAttachment = {
  id?: string
  mediaObjectId?: string
  messageId?: string | null
  name: string
  fileName?: string
  kind: string
  mimeType?: string
  sizeBytes?: number
  width?: number
  height?: number
  url?: string
  readUrl?: string
  signedReadUrl?: string
  storageKey?: string
  caption?: string | null
  uploadedAt?: string
  expiresInSeconds?: number | null
}

export function formatAgentInputMediaPrompt(
  metadata: unknown,
  options: { includeInstruction?: boolean } = {},
) {
  const includeInstruction = options.includeInstruction ?? true
  const attachments = readAgentInputMediaAttachments(metadata)
    .map((attachment, index) => formatInputMediaAttachment(attachment, index))
    .filter(Boolean)

  if (!attachments.length) return null

  return [
    'Attached context media:',
    ...attachments,
    includeInstruction ? '' : null,
    includeInstruction
      ? 'Use these attachments as user-provided context. For images/screenshots, inspect the URL directly when useful; preserve exact visual details the user is pointing at. If a URL expires or returns access denied, call pach.agent_run.input_media.list with the agent run id to refresh it.'
      : null,
  ].filter((line): line is string => line !== null).join('\n')
}

export function buildFollowUpContinuationPrompt({
  feedback,
  metadata,
}: {
  feedback: string
  metadata: unknown
}) {
  const attachments = formatAgentInputMediaPrompt(metadata, { includeInstruction: false })
  return [
    'Return pach.progress.report message content in Markdown. Use concise Markdown for progress updates and a useful Markdown summary for phase "final_result".',
    '',
    feedback.trim(),
    attachments,
  ].filter((line): line is string => Boolean(line)).join('\n\n')
}

export async function hydrateAgentInputMediaMetadata(metadata: unknown) {
  const base = readObject(metadata)
  const attachments = readAgentInputMediaAttachments(base, { scopeToFeedbackMessage: false })
  if (!attachments.length) return base

  const hydrated = await Promise.all(attachments.map(hydrateAgentInputMediaAttachment))
  return {
    ...base,
    attachments: hydrated,
  }
}

export async function hydrateAgentInputMediaAttachment(attachment: AgentInputMediaAttachment) {
  const storageKey = readOptionalString(attachment.storageKey)
  const signedReadUrl = storageKey
    ? await signedReadUrlForStorageKey(storageKey).catch(() => null)
    : null
  const readableUrl = signedReadUrl ??
    readOptionalString(attachment.signedReadUrl) ??
    readOptionalString(attachment.readUrl) ??
    readOptionalString(attachment.url)

  return {
    ...attachment,
    url: readableUrl ?? attachment.url,
    readUrl: readableUrl ?? attachment.readUrl,
    signedReadUrl: signedReadUrl ?? attachment.signedReadUrl,
    expiresInSeconds: signedReadUrl ? SIGNED_READ_SECONDS : attachment.expiresInSeconds ?? null,
  }
}

export function readAgentInputMediaAttachments(
  metadata: unknown,
  options: { scopeToFeedbackMessage?: boolean } = {},
) {
  const scopeToFeedbackMessage = options.scopeToFeedbackMessage ?? true
  const metadataObject = readObject(metadata)
  const attachments = readMetadataArray(metadataObject, 'attachments')
    .map(normalizeAttachment)
    .filter((attachment): attachment is AgentInputMediaAttachment => Boolean(attachment))
  const feedbackMessageId = scopeToFeedbackMessage
    ? readOptionalString(metadataObject.feedbackMessageId)
    : null

  if (!feedbackMessageId) return attachments

  const scoped = attachments.filter((attachment) => attachment.messageId === feedbackMessageId)
  return scoped.length > 0 ? scoped : attachments
}

export async function signedReadUrlForStorageKey(key: string) {
  return getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    }),
    { expiresIn: SIGNED_READ_SECONDS },
  )
}

export { SIGNED_READ_SECONDS }

function normalizeAttachment(value: Record<string, unknown>): AgentInputMediaAttachment | null {
  const name = readOptionalString(value.name) ?? readOptionalString(value.fileName)
  const url = readOptionalString(value.url) ?? readOptionalString(value.readUrl) ?? readOptionalString(value.signedReadUrl)
  const storageKey = readOptionalString(value.storageKey)
  if (!name || (!url && !storageKey)) return null

  return {
    id: readOptionalString(value.id) ?? undefined,
    mediaObjectId: readOptionalString(value.mediaObjectId) ?? undefined,
    messageId: readOptionalString(value.messageId),
    name,
    fileName: readOptionalString(value.fileName) ?? undefined,
    kind: readOptionalString(value.kind) ?? 'file',
    mimeType: readOptionalString(value.mimeType) ?? undefined,
    sizeBytes: readOptionalNumber(value.sizeBytes) ?? undefined,
    width: readOptionalNumber(value.width) ?? undefined,
    height: readOptionalNumber(value.height) ?? undefined,
    url: url ?? undefined,
    readUrl: readOptionalString(value.readUrl) ?? undefined,
    signedReadUrl: readOptionalString(value.signedReadUrl) ?? undefined,
    storageKey: storageKey ?? undefined,
    caption: readOptionalString(value.caption),
    uploadedAt: readOptionalString(value.uploadedAt) ?? undefined,
    expiresInSeconds: readOptionalNumber(value.expiresInSeconds) ?? null,
  }
}

function formatInputMediaAttachment(value: AgentInputMediaAttachment, index: number) {
  const url = readOptionalString(value.signedReadUrl) ??
    readOptionalString(value.readUrl) ??
    readOptionalString(value.url)
  if (!url) return null

  const dimensions = value.width && value.height ? `${value.width}x${value.height}` : null
  const details = [
    value.kind,
    value.mimeType,
    dimensions,
    value.caption ? `caption: ${value.caption}` : null,
  ].filter(Boolean).join(', ')

  return `- ${index + 1}. ${value.name}${details ? ` (${details})` : ''}: ${url}`
}

function readMetadataArray(metadata: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = metadata[key]
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : []
}

function readObject(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: getAwsRegion(),
      endpoint: process.env.S3_ENDPOINT || process.env.AWS_S3_ENDPOINT,
      forcePathStyle: readBooleanEnv(process.env.S3_FORCE_PATH_STYLE ?? process.env.AWS_S3_FORCE_PATH_STYLE),
      credentials: getAwsCredentials(),
    })
  }
  return s3Client
}

function getAwsRegion() {
  return process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1'
}

function getBucketName() {
  const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET
  if (!bucket) throw new Error('Missing S3_BUCKET or AWS_S3_BUCKET')
  return bucket
}

function getAwsCredentials() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  if (!accessKeyId || !secretAccessKey) return undefined
  return {
    accessKeyId,
    secretAccessKey,
  }
}

function readBooleanEnv(value: string | undefined) {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}
