import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { mcpTokens, users } from '../../../db/schema.js'
import { getConnection, getDb } from '../db.js'
import {
  MCP_CAPABILITIES,
  generateMcpTokenSecret,
  getMcpTokenPrefix,
  hashMcpToken,
} from '../lib/mcp-token.js'

type Options = {
  name: string
  ownerEmail?: string
  allOrganizations: boolean
  canAccessUnscoped: boolean
  capabilities: string[]
  expiresDays?: number
}

const options = readOptions(process.argv.slice(2))
const db = getDb()
const owner = options.ownerEmail
  ? (await db.select().from(users).where(eq(users.email, options.ownerEmail)).limit(1))[0]
  : null

if (options.ownerEmail && !owner) {
  console.error(`Owner user not found: ${options.ownerEmail}`)
  process.exit(1)
}

const secret = generateMcpTokenSecret()
const expiresAt = options.expiresDays == null
  ? null
  : new Date(Date.now() + options.expiresDays * 24 * 60 * 60 * 1000)

const [token] = await db
  .insert(mcpTokens)
  .values({
    name: options.name,
    tokenPrefix: getMcpTokenPrefix(secret),
    tokenHash: hashMcpToken(secret),
    ownerUserId: owner?.id,
    allOrganizations: options.allOrganizations,
    canAccessUnscoped: options.canAccessUnscoped,
    organizationIds: [],
    capabilities: options.capabilities,
    expiresAt,
    metadata: {
      createdBy: 'create-mcp-token.ts',
    },
  })
  .returning({
    id: mcpTokens.id,
    name: mcpTokens.name,
    tokenPrefix: mcpTokens.tokenPrefix,
    allOrganizations: mcpTokens.allOrganizations,
    canAccessUnscoped: mcpTokens.canAccessUnscoped,
    capabilities: mcpTokens.capabilities,
    expiresAt: mcpTokens.expiresAt,
  })

console.log('Created MCP token:')
console.log(JSON.stringify(token, null, 2))
console.log('')
console.log('Copy this secret now. It is not stored in the database:')
console.log(secret)
console.log('')
console.log('Codex env:')
console.log(`export PACH_MCP_TOKEN="${secret}"`)

await getConnection().end()

function readOptions(args: string[]): Options {
  const [name, ...flags] = args
  if (!name) {
    printUsage()
    process.exit(1)
  }

  let ownerEmail: string | undefined
  let allOrganizations = false
  let canAccessUnscoped = false
  let capabilities: string[] = [...MCP_CAPABILITIES]
  let expiresDays: number | undefined

  for (let i = 0; i < flags.length; i += 1) {
    const flag = flags[i]
    const next = flags[i + 1]

    if (flag === '--owner') {
      if (!next) throw new Error('--owner requires an email')
      ownerEmail = next
      i += 1
      continue
    }

    if (flag === '--all-orgs') {
      allOrganizations = true
      continue
    }

    if (flag === '--unscoped') {
      canAccessUnscoped = true
      continue
    }

    if (flag === '--capabilities') {
      if (!next) throw new Error('--capabilities requires all or a comma-separated list')
      capabilities = next === 'all' ? ['*'] : next.split(',').map((entry) => entry.trim()).filter(Boolean)
      i += 1
      continue
    }

    if (flag === '--expires-days') {
      if (!next) throw new Error('--expires-days requires a number')
      expiresDays = Number(next)
      if (!Number.isFinite(expiresDays) || expiresDays <= 0) throw new Error('--expires-days must be a positive number')
      i += 1
      continue
    }

    throw new Error(`Unknown option: ${flag}`)
  }

  return {
    name,
    ownerEmail,
    allOrganizations,
    canAccessUnscoped,
    capabilities,
    expiresDays,
  }
}

function printUsage() {
  console.error([
    'Usage:',
    '  tsx src/scripts/create-mcp-token.ts <name> [options]',
    '',
    'Options:',
    '  --owner <email>             Associate token activity with a Pach user',
    '  --all-orgs                  Allow access to all organizations',
    '  --unscoped                  Allow access to workspace-level/unscoped issues',
    '  --capabilities <all|list>   Use all or comma-separated capabilities',
    '  --expires-days <days>       Optional expiration in days',
    '',
    'Example:',
    '  tsx src/scripts/create-mcp-token.ts "Axel Codex" --all-orgs --unscoped --capabilities all',
  ].join('\n'))
}
