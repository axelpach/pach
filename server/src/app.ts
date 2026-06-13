import 'dotenv/config'
import { createServer } from 'node:http'
import express from 'express'
import cors from 'cors'
import zeroPushRoute from './zero/push-route.js'
import whatsappRoute, { publicWhatsAppRouter } from './routes/whatsapp.js'
import authRoute from './routes/auth.js'
import inboundRoute from './routes/inbound.js'
import linearRoute from './routes/linear.js'
import taskTriggersRoute from './routes/task-triggers.js'
import agentRoute, { attachAgentTerminalWebSocket } from './routes/agent.js'
import financeRoute from './routes/finance.js'
import mediaRoute from './routes/media.js'
import { requireAuth, requireUnscopedAccess } from './middleware/auth.js'
import { startTaskTriggerRunner } from './services/task-triggers/runner.js'

const app = express()
const PORT = process.env.PORT || 3001
const JSON_BODY_LIMIT = '75mb'

app.use(cors())
app.use(express.json({ limit: JSON_BODY_LIMIT }))

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use('/auth', authRoute)
app.use('/whatsapp', publicWhatsAppRouter)
app.use('/inbound', inboundRoute)
app.use('/zero', requireAuth, zeroPushRoute)
app.use('/whatsapp', requireAuth, whatsappRoute)
app.use('/linear', requireAuth, requireUnscopedAccess, linearRoute)
app.use('/task-triggers', requireAuth, requireUnscopedAccess, taskTriggersRoute)
app.use('/agent', requireAuth, requireUnscopedAccess, agentRoute)
app.use('/finance', requireAuth, financeRoute)
app.use('/media', requireAuth, mediaRoute)

app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (isPayloadTooLargeError(err)) {
    res.status(413).json({
      error: 'PAYLOAD_TOO_LARGE',
      message: `Upload is too large for the current import path. Try a smaller file or screenshot. Limit: ${JSON_BODY_LIMIT}.`,
    })
    return
  }
  next(err)
})

app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

const server = createServer(app)
attachAgentTerminalWebSocket(server)

server.listen(PORT, () => {
  console.log(`Pach server running on http://localhost:${PORT}`)
  startTaskTriggerRunner()
})

function isPayloadTooLargeError(error: unknown): error is { type?: string; status?: number; statusCode?: number } {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { type?: string; status?: number; statusCode?: number }
  return candidate.type === 'entity.too.large' || candidate.status === 413 || candidate.statusCode === 413
}
