import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const FORMAT_VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'

export function encryptSecret(secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    FORMAT_VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':')
}

export function decryptSecret(encrypted: string) {
  const [version, ivRaw, authTagRaw, ciphertextRaw] = encrypted.split(':')
  if (version !== FORMAT_VERSION || !ivRaw || !authTagRaw || !ciphertextRaw) {
    throw new Error('Unsupported encrypted secret format')
  }

  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivRaw, 'base64url'))
  decipher.setAuthTag(Buffer.from(authTagRaw, 'base64url'))

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function secretLast4(secret: string) {
  return secret.slice(-4)
}

function encryptionKey() {
  const source = process.env.PACH_ENCRYPTION_KEY || process.env.SECRET_ENCRYPTION_KEY || process.env.ZERO_AUTH_SECRET
  if (!source && process.env.NODE_ENV === 'production') {
    throw new Error('PACH_ENCRYPTION_KEY or ZERO_AUTH_SECRET is required to encrypt secrets in production')
  }

  return createHash('sha256').update(source || 'pach-local-encryption-key').digest()
}
