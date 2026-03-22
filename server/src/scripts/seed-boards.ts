import 'dotenv/config'
import { getDb } from '../db.js'
import { crmBoards, crmBoardColumns } from '../../../db/schema.js'

async function seed() {
  const db = getDb()

  // Pipeline board
  const pipelineId = '00000000-0000-0000-0000-000000000001'
  await db.insert(crmBoards).values({
    id: pipelineId,
    name: 'Pipeline',
    slug: 'pipeline',
    entityType: 'deals',
    groupBy: 'stage',
    baseFilter: {},
  }).onConflictDoNothing()

  const pipelineCols = [
    { label: 'Prospecto', value: 'prospecto', position: 0, color: '#6B7280' },
    { label: 'Contactado', value: 'contactado', position: 1, color: '#3B82F6' },
    { label: 'Propuesta', value: 'propuesta', position: 2, color: '#F59E0B' },
    { label: 'Negociacion', value: 'negociacion', position: 3, color: '#8B5CF6' },
    { label: 'Cerrado', value: 'cerrado_ganado', position: 4, color: '#10B981' },
    { label: 'Perdido', value: 'cerrado_perdido', position: 5, color: '#EF4444' },
  ]

  for (const col of pipelineCols) {
    await db.insert(crmBoardColumns).values({
      boardId: pipelineId,
      ...col,
    }).onConflictDoNothing()
  }

  // Recovery board
  const recoveryId = '00000000-0000-0000-0000-000000000002'
  await db.insert(crmBoards).values({
    id: recoveryId,
    name: 'Recovery',
    slug: 'recovery',
    entityType: 'deals',
    groupBy: 'temperature',
    baseFilter: { temperature: ['cold', 'ghosted'] },
  }).onConflictDoNothing()

  const recoveryCols = [
    { label: 'Cold', value: 'cold', position: 0, color: '#3B82F6' },
    { label: 'Ghosted', value: 'ghosted', position: 1, color: '#6B7280' },
  ]

  for (const col of recoveryCols) {
    await db.insert(crmBoardColumns).values({
      boardId: recoveryId,
      ...col,
    }).onConflictDoNothing()
  }

  console.log('Seeded boards: Pipeline + Recovery')
  process.exit(0)
}

seed().catch(console.error)
