import { Router } from 'express'
import { getDb } from '../db.js'
import { importLinearWorkspace } from '../services/linear/import.js'
import { organizations, pmSavedViews } from '../../../db/schema.js'

const router = Router()

router.post('/import', async (req, res) => {
  const { dryRun, contextCompanyId, teamIds } = req.body ?? {}

  if (contextCompanyId !== undefined && typeof contextCompanyId !== 'string') {
    res.status(400).json({ error: 'contextCompanyId must be a string when provided' })
    return
  }

  if (teamIds !== undefined && (!Array.isArray(teamIds) || teamIds.some((value) => typeof value !== 'string'))) {
    res.status(400).json({ error: 'teamIds must be an array of strings when provided' })
    return
  }

  try {
    const db = getDb()
    const allCompanies = await db.select().from(organizations)
    const defaultCompany =
      allCompanies.find((company) => company.project?.trim().toLowerCase() === 'ardia') ??
      allCompanies.find((company) => company.name.trim().toLowerCase() === 'ardia') ??
      null

    if (req.user?.sub) {
      const existingViews = await db.select().from(pmSavedViews)
      const hasAllIssuesView = existingViews.some((view) => view.ownerId === req.user?.sub && view.slug === 'all-issues')

      if (!hasAllIssuesView) {
        await db.insert(pmSavedViews).values({
          id: crypto.randomUUID(),
          ownerId: req.user.sub,
          name: 'All issues',
          slug: 'all-issues',
          scope: 'personal',
          filters: {},
          display: {
            collapsedPriorities: [],
            collapsedStatuses: [],
          },
          position: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      }
    }

    const summary = await importLinearWorkspace(db, {
      dryRun: typeof dryRun === 'boolean' ? dryRun : true,
      contextCompanyId: contextCompanyId ?? defaultCompany?.id,
      teamIds,
      defaultAssigneeId: req.user?.sub,
    })

    res.json({
      ok: true,
      summary,
    })
  } catch (error) {
    console.error('Linear import failed', error)
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown Linear import error',
    })
  }
})

export default router
