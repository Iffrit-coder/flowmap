import { useState } from 'react'
import { useAuthStore } from '../authStore'

export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const error = useAuthStore((s) => s.error)
  const login = useAuthStore((s) => s.login)
  const signup = useAuthStore((s) => s.signup)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      if (mode === 'login') await login(email, password)
      else await signup(email, password)
    } catch {
      // error is already surfaced via the store
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>flowmap</h1>
        <p className="auth-subtitle">
          {mode === 'login' ? 'Sign in to your maps.' : 'Create an account to get started.'}
        </p>
        <label>
          Email
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="primary" disabled={submitting}>
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        <button
          type="button"
          className="auth-switch"
          onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
        >
          {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}
