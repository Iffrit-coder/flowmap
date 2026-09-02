import { useEffect, useState } from 'react'
import * as api from '../api'
import type { Role } from '../types'

/** Owner-only. Two ways to hand out access, deliberately kept side by side
 * because they answer different questions: a link is for "send this to whoever
 * needs it", a person is for "Bob specifically, and I want to be able to take
 * it back from Bob specifically". */
export default function ShareDialog({ mapId, onClose }: { mapId: string; onClose: () => void }) {
  const [links, setLinks] = useState<api.ShareLink[]>([])
  const [grants, setGrants] = useState<api.Grant[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // The raw token exists only in the create response — it is never stored, so
  // it can never be shown again. Held here just long enough to be copied.
  const [freshLink, setFreshLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [linkRole, setLinkRole] = useState<Role>('viewer')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('viewer')

  const refresh = () =>
    Promise.all([api.listLinks(mapId), api.listGrants(mapId)])
      .then(([l, g]) => {
        setLinks(l.links)
        setGrants(g.grants)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load sharing.'))

  useEffect(() => {
    void refresh()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId])

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const createLink = () =>
    run(async () => {
      const { token } = await api.createLink(mapId, linkRole)
      setFreshLink(`${window.location.origin}${window.location.pathname}#/shared/${token}`)
      setCopied(false)
    })

  const copy = async () => {
    if (!freshLink) return
    try {
      await navigator.clipboard.writeText(freshLink)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose} role="presentation">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Share this map"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-head">
          <h2>Share this map</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <section className="dialog-section">
          <h3>Anyone with the link</h3>
          <p className="dialog-hint">
            No account needed. Anyone holding the link gets this access until you revoke it.
          </p>
          <div className="dialog-row">
            <select value={linkRole} onChange={(e) => setLinkRole(e.target.value as Role)} aria-label="Link access level">
              <option value="viewer">Can view</option>
              <option value="editor">Can edit</option>
            </select>
            <button type="button" className="primary" onClick={createLink} disabled={busy}>
              Create link
            </button>
          </div>

          {freshLink && (
            <div className="fresh-link">
              <input readOnly value={freshLink} aria-label="Share link" onFocus={(e) => e.target.select()} />
              <button type="button" onClick={copy}>
                {copied ? 'Copied' : 'Copy'}
              </button>
              <p className="dialog-hint">
                Copy it now — for security this link is never shown again.
              </p>
            </div>
          )}

          {links.length > 0 && (
            <ul className="share-list">
              {links.map((l) => (
                <li key={l.id}>
                  <span className="share-what">
                    {l.role === 'editor' ? 'Can edit' : 'Can view'}
                    <span className="share-meta">
                      {l.lastUsedAt ? ` · last opened ${new Date(l.lastUsedAt).toLocaleDateString()}` : ' · never opened'}
                    </span>
                  </span>
                  <button type="button" onClick={() => run(() => api.revokeLink(mapId, l.id))} disabled={busy}>
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="dialog-section">
          <h3>Specific people</h3>
          <p className="dialog-hint">
            They need a flowmap account, and you can take access back from one person without
            affecting anyone else.
          </p>
          <form
            className="dialog-row"
            onSubmit={(e) => {
              e.preventDefault()
              const email = inviteEmail.trim()
              if (!email) return
              void run(async () => {
                await api.addGrant(mapId, email, inviteRole)
                setInviteEmail('')
              })
            }}
          >
            <input
              type="email"
              placeholder="their@email.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              aria-label="Email address to share with"
            />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)} aria-label="Access level">
              <option value="viewer">Can view</option>
              <option value="editor">Can edit</option>
            </select>
            <button type="submit" disabled={busy}>
              Add
            </button>
          </form>

          {grants.length > 0 && (
            <ul className="share-list">
              {grants.map((g) => (
                <li key={g.email}>
                  <span className="share-what">
                    {g.email}
                    <span className="share-meta"> · {g.role === 'editor' ? 'can edit' : 'can view'}</span>
                  </span>
                  <button type="button" onClick={() => run(() => api.removeGrant(mapId, g.email))} disabled={busy}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {error && <p className="auth-error">{error}</p>}
      </div>
    </div>
  )
}
