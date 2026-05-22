import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import zeroPushRoute from './zero/push-route.js'
import whatsappRoute, { publicWhatsAppRouter } from './routes/whatsapp.js'
import authRoute from './routes/auth.js'
import linearRoute from './routes/linear.js'
import { requireAuth } from './middleware/auth.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use('/auth', authRoute)
app.use('/whatsapp', publicWhatsAppRouter)
app.use('/zero', requireAuth, zeroPushRoute)
app.use('/whatsapp', requireAuth, whatsappRoute)
app.use('/linear', requireAuth, linearRoute)

app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

app.listen(PORT, () => {
  console.log(`Pach server running on http://localhost:${PORT}`)
})
