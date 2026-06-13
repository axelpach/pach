import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { GlyphRain, Scanlines } from '../components/pach'

const HOME_PATH = '/issues'

export default function Login() {
  const { login, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await login(email, password)
      navigate(HOME_PATH, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    }
  }

  return (
    <div className="relative flex flex-col h-screen bg-pit text-fg-1 overflow-hidden font-mono">
      <GlyphRain density={20} opacity={0.06} />
      <Scanlines opacity={0.4} />
      <div className="relative z-10 flex flex-1 items-center justify-center">
        <form
          onSubmit={onSubmit}
          className="w-[360px] border border-edge/15 bg-void px-6 py-7"
        >
          <div className="mb-5">
            <div className="text-base font-bold text-accent glow tracking-wide">
              p@ch_
            </div>
            <div className="text-[9px] uppercase tracking-label text-fg-4 mt-1">
              // operator authentication
            </div>
          </div>

          <label className="block text-[9px] uppercase tracking-label text-fg-4 mb-1">
            $ email
          </label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-pit border border-edge/15 px-3 py-2 text-sm text-fg-1 focus:outline-none focus:border-accent mb-4"
            required
          />

          <label className="block text-[9px] uppercase tracking-label text-fg-4 mb-1">
            $ passphrase
          </label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-pit border border-edge/15 px-3 py-2 text-sm text-fg-1 focus:outline-none focus:border-accent mb-5"
            required
          />

          {error && (
            <div className="mb-3 text-[10px] uppercase tracking-label text-fail">
              // {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full border border-accent bg-accent-fill/3 text-accent py-2 text-xs uppercase tracking-wide-2 hover:bg-accent-fill/8 disabled:opacity-50"
          >
            {loading ? '// authenticating...' : '> connect'}
          </button>
        </form>
      </div>
    </div>
  )
}
