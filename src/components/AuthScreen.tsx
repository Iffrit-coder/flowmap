import { useState } from 'react'
import * as api from '../api'
import { useAuthStore } from '../authStore'

type Mode = 'login' | 'signup' | 'forgot'

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const storeError = useAuthStore((s) => s.error)
  const login = useAuthStore((s) => s.login)
  const signup = useAuthStore((s) => s.signup)

  const error = mode === 'forgot' ? localError : storeError

  const switchTo = (next: Mode) => {
    setMode(next)
    setNotice(null)
    setLocalError(null)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      if (mode === 'forgot') {
        setLocalError(null)
        // The response is deliberately the same whether or not the address is
        // registered, so it is shown verbatim rather than interpreted.
        const { message } = await api.forgotPassword(email)
        setNotice(message)
      } else if (mode === 'login') {
        await login(email, password)
      } else {
        await signup(email, password)
      }
    } catch (err) {
      if (mode === 'forgot') setLocalError(err instanceof Error ? err.message : 'Something went wrong.')
      // login/signup errors are already surfaced via the store
    } finally {
      setSubmitting(false)
    }
  }

  const subtitle =
    mode === 'login'
      ? 'Sign in to your maps.'
      : mode === 'signup'
        ? 'Create an account to get started.'
        : "We'll email you a link to set a new password."

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>flowmap</h1>
        <p className="auth-subtitle">{subtitle}</p>
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
        {mode !== 'forgot' && (
          <label>
            Password
            <input
              type="password"
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        {mode === 'signup' && (
          <p className="auth-hint">
            At least 10 characters, and not one that's turned up in a known breach.
          </p>
        )}
        {notice && <p className="auth-notice">{notice}</p>}
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="primary" disabled={submitting}>
          {submitting
            ? 'Working…'
            : mode === 'login'
              ? 'Sign in'
              : mode === 'signup'
                ? 'Create account'
                : 'Email me a link'}
        </button>
        {mode === 'login' && (
          <button type="button" className="auth-switch" onClick={() => switchTo('forgot')}>
            Forgot your password?
          </button>
        )}
        <button
          type="button"
          className="auth-switch"
          onClick={() => switchTo(mode === 'login' ? 'signup' : 'login')}
        >
          {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}
