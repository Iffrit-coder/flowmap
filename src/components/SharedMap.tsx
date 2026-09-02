import { useEffect, useState } from 'react'
import * as api from '../api'
import { useStore } from '../store'
import Editor from './Editor'

/** Entry point for a shared link. The token identifies the map — the recipient
 * has a URL and nothing else — so this resolves it before the editor mounts,
 * and registers it so subsequent saves carry it too. */
export default function SharedMap({ token }: { token: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [mapId, setMapId] = useState<string | null>(null)
  const loadMap = useStore((s) => s.loadMap)

  useEffect(() => {
    let cancelled = false
    api.setShareToken(token)
    api
      .openShared(token)
      .then((doc) => {
        if (cancelled) return
        loadMap(doc)
        setMapId(doc.id)
        setState('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'That link could not be opened.')
        setState('failed')
      })
    return () => {
      cancelled = true
      // Dropped on the way out so a stale token can't ride along on later
      // requests once the reader navigates elsewhere.
      api.setShareToken(null)
    }
  }, [token, loadMap])

  if (state === 'loading') {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1>flowmap</h1>
          <p className="auth-subtitle">Opening the shared map…</p>
        </div>
      </div>
    )
  }

  if (state === 'failed' || !mapId) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1>flowmap</h1>
          <p className="auth-error">{error}</p>
          <p className="auth-hint">Ask whoever sent it for a new link.</p>
        </div>
      </div>
    )
  }

  return <Editor mapId={mapId} preloaded />
}
