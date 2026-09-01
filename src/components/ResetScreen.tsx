import { useState } from 'react'
import * as api from '../api'

/** Reached from an emailed link, so it has to work while signed out — and the
 * token travels in the URL fragment, which browsers never send to the server,
 * keeping it out of access logs and Referer headers. */
export default function ResetScreen({ token }: { token: string }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError("Those passwords don't match.")
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await api.resetPassword(token, password)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1>flowmap</h1>
          <p className="auth-subtitle">
            Password changed. You've been signed out everywhere else — sign in with the new one.
          </p>
          <button type="button" className="primary" onClick={() => (window.location.hash = '')}>
            Go to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>flowmap</h1>
        <p className="auth-subtitle">Choose a new password.</p>
        <label>
          New password
          <input
            type="password"
            required
            minLength={10}
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          Confirm password
          <input
            type="password"
            required
            minLength={10}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        <p className="auth-hint">
          At least 10 characters, and not one that's turned up in a known breach.
        </p>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Set new password'}
        </button>
      </form>
    </div>
  )
}
