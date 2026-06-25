import { createHash, randomBytes } from 'node:crypto'

export const MCP_TOKEN_PREFIX = 'pach_mcp_'

export const MCP_CAPABILITIES = [
  'pach.issue.read',
  'pach.issue.write',
  'pach.document.read',
  'pach.document.write',
  'pach.design.read',
  'pach.design.write',
  'pach.progress.report',
  'agent.worker.heartbeat',
  'agent.run.claim',
  'agent.run.progress',
  'agent.run.complete',
] as const

export type McpCapability = typeof MCP_CAPABILITIES[number] | '*'

export type McpAuthContext = {
  kind: 'jwt' | 'local' | 'token'
  subjectId: string
  actorName: string
  actorUserId?: string
  tokenId?: string
  allOrganizations: boolean
  canAccessUnscoped: boolean
  organizationIds: string[]
  capabilities: string[]
}

export function generateMcpTokenSecret() {
  return `${MCP_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`
}

export function hashMcpToken(secret: string) {
  return createHash('sha256').update(secret).digest('hex')
}

export function getMcpTokenPrefix(secret: string) {
  return secret.slice(0, 22)
}

export function hasMcpCapability(auth: McpAuthContext, capability: McpCapability) {
  return auth.capabilities.includes('*') || auth.capabilities.includes(capability)
}
