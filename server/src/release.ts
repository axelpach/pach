export const ZERO_SCHEMA_VERSION = 1

const RELEASE_ENV_KEYS = [
  'PACH_RELEASE_ID',
  'SOURCE_VERSION',
  'GIT_COMMIT_SHA',
  'VERCEL_GIT_COMMIT_SHA',
  'RAILWAY_GIT_COMMIT_SHA',
] as const

export function getReleaseId() {
  for (const key of RELEASE_ENV_KEYS) {
    const value = process.env[key]
    if (value) return value
  }

  return `zero-schema-${ZERO_SCHEMA_VERSION}`
}
