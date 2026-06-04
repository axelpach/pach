import 'dotenv/config'
import { createServer } from 'node:http'
import express from 'express'
import cors from 'cors'
import zeroPushRoute from './zero/push-route.js'
import whatsappRoute, { publicWhatsAppRouter } from './routes/whatsapp.js'
import authRoute from './routes/auth.js'
import inboundRoute from './routes/inbound.js'
import linearRoute from './routes/linear.js'
import agentRoute, { attachAgentTerminalWebSocket } from './routes/agent.js'
import { requireAuth } from './middleware/auth.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use('/auth', authRoute)
app.use('/whatsapp', publicWhatsAppRouter)
app.use('/inbound', inboundRoute)
app.use('/zero', requireAuth, zeroPushRoute)
app.use('/whatsapp', requireAuth, whatsappRoute)
app.use('/linear', requireAuth, linearRoute)
app.use('/agent', requireAuth, agentRoute)

app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

const server = createServer(app)
attachAgentTerminalWebSocket(server)

server.listen(PORT, () => {
  console.log(`Pach server running on http://localhost:${PORT}`)
})
