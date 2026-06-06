import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { config } from '../config'

interface User {
  id: string
  email: string
  name: string | null
  canAccessUnscoped: boolean
  organizationIds: string[]
}

interface AuthContextValue {
  user: User | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const TOKEN_KEY = 'pach.token'
const USER_KEY = 'pach.user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return {
      ...parsed,
      canAccessUnscoped: parsed.canAccessUnscoped ?? false,
      organizationIds: parsed.organizationIds ?? [],
    }
  })
  const [loading, setLoading] = useState(false)

  function storeSession(newToken: string, newUser: User) {
    const normalizedUser = {
      ...newUser,
      canAccessUnscoped: newUser.canAccessUnscoped ?? false,
      organizationIds: newUser.organizationIds ?? [],
    }
    localStorage.setItem(TOKEN_KEY, newToken)
    localStorage.setItem(USER_KEY, JSON.stringify(normalizedUser))
    setToken(newToken)
    setUser(normalizedUser)
  }

  async function login(email: string, password: string) {
    setLoading(true)
    try {
      const res = await fetch(`${config.apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Login failed' }))
        throw new Error(error || 'Login failed')
      }
      const { token: newToken, user: newUser } = await res.json()
      storeSession(newToken, newUser)
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
  }

  useEffect(() => {
    if (!token) return
    fetch(`${config.apiUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (res.status === 401) {
          logout()
          return
        }
        if (!res.ok) return
        const { token: refreshedToken, user: refreshedUser } = await res.json()
        if (refreshedToken && refreshedUser) storeSession(refreshedToken, refreshedUser)
      })
      .catch(() => {
        // Keep the current session if the refresh endpoint is temporarily unavailable.
      })
  }, [token])

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export async function authFetch(url: string, init: RequestInit = {}) {
  const token = localStorage.getItem(TOKEN_KEY)
  return fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
}
