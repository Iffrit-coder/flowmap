import { useEffect, useRef, useState } from 'react'
import * as api from '../api'
import { useAuthStore } from '../authStore'

export default function VerifyScreen({ token }: { token: string }) {
  const [state, setState] = useState<'working' | 'ok' | 'failed'>('working')
  const [error, setError] = useState<string | null>(null)
  const markVerified = useAuthStore((s) => s.markVerified)
  // Tokens are single-use, so React's development double-invoke would spend the
  // token on the first call and report the second as invalid.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    api
      .verifyEmail(token)
      .then(() => {
        markVerified()
        setState('ok')
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
        setState('failed')
      })
  }, [token, markVerified])

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>flowmap</h1>
        {state === 'working' && <p className="auth-subtitle">Confirming your email…</p>}
        {state === 'ok' && <p className="auth-subtitle">Email confirmed. You're all set.</p>}
        {state === 'failed' && <p className="auth-error">{error}</p>}
        {state !== 'working' && (
          <button type="button" className="primary" onClick={() => (window.location.hash = '')}>
            Continue
          </button>
        )}
      </div>
    </div>
  )
}
