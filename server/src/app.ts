import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import zeroPushRoute from './zero/push-route.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use('/zero', zeroPushRoute)

app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

app.listen(PORT, () => {
  console.log(`Pachi server running on http://localhost:${PORT}`)
})
