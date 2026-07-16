export const CLIENT_ZERO_SCHEMA_VERSION = 1

export const CLIENT_RELEASE_ID =
  import.meta.env.VITE_PACH_RELEASE_ID ||
  import.meta.env.VITE_GIT_COMMIT_SHA ||
  `zero-schema-${CLIENT_ZERO_SCHEMA_VERSION}`
