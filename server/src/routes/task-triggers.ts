import { Router } from 'express'
import { runDueTaskTriggers } from '../services/task-triggers/runner.js'

const router = Router()

router.post('/run-due', async (_req, res) => {
  try {
    const summary = await runDueTaskTriggers()
    res.json({ ok: true, summary })
  } catch (error) {
    console.error('Task trigger run-due error:', error)
    res.status(500).json({ error: 'Failed to run due task triggers' })
  }
})

export default router
