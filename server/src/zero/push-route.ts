import { Router } from 'express'
import { PushProcessor, zeroPostgresJS } from '@rocicorp/zero/pg'
import { schema } from '../../schema.js'
import { getConnection } from '../db.js'
import { createServerMutators } from './mutators.js'

const router = Router()

router.post('/push', async (req, res) => {
  try {
    const connection = getConnection()
    const zql = zeroPostgresJS(schema, connection)
    const pushProcessor = new PushProcessor(zql)
    const mutators = createServerMutators()

    const result = await pushProcessor.process(
      mutators,
      new URL(req.url, `http://${req.headers.host}`).searchParams,
      req.body
    )

    res.json(result)
  } catch (error) {
    console.error('Zero push error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
