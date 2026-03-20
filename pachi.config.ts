export interface ProjectConfig {
  /** Absolute local path to the project's source code */
  local: string
  /** GitHub repo (org/repo) for cloud mode */
  github?: string
  /** Branch to track */
  branch?: string
  /** Pachi-specific context directory (relative to pachi root) */
  contextDir: string
  /** Tools this project uses */
  tools: string[]
}

export const projects: Record<string, ProjectConfig> = {
  ardia: {
    local: '~/Desktop/Developer/ardia',
    github: 'axelpach/ardia', // update with your actual repo
    branch: 'main',
    contextDir: './projects/ardia',
    tools: ['decks', 'crm'],
  },
}

export const config = {
  databaseUrl: process.env.DATABASE_URL || 'postgres://pachi:pachi@localhost:5435/pachi',
  portal: {
    port: 5174,
  },
} as const
