import { useEffect, useRef, useState } from 'react'
import * as api from '../api'
import { useAuthStore } from '../authStore'
import { downloadDoc, downloadLibrary } from '../download'
import { findBackEdges, formatDuration, totalDuration } from '../graph'
import { filesFromDrop, readImportFiles } from '../importFiles'
import type { ImportFailure } from '../importFiles'
import { useLibraryStore } from '../libraryStore'
import type { MapDoc } from '../types'

function summarize(doc: MapDoc) {
  return {
    steps: doc.nodes.length,
    loops: findBackEdges(doc.nodes, doc.edges).size,
    duration: formatDuration(totalDuration(doc.nodes)),
  }
}

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function byRecent(a: MapDoc, b: MapDoc): number {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
}

function Card({ doc }: { doc: MapDoc }) {
  const togglePin = useLibraryStore((s) => s.togglePin)
  const deleteMap = useLibraryStore((s) => s.deleteMap)
  const duplicateMap = useLibraryStore((s) => s.duplicateMap)
  const renameMap = useLibraryStore((s) => s.renameMap)
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(doc.name)
  const summary = summarize(doc)

  const open = () => {
    window.location.hash = `#/map/${doc.id}`
  }

  const commitRename = () => {
    setEditing(false)
    const trimmed = draftName.trim()
    if (trimmed && trimmed !== doc.name) renameMap(doc.id, trimmed)
    else setDraftName(doc.name)
  }

  return (
    <div className="map-card">
      <button type="button" className="map-card-open" onClick={open} aria-label={`Open ${doc.name}`}>
        <svg viewBox="0 0 32 20" width="34" height="21" aria-hidden="true">
          <rect x="1" y="7" width="10" height="9" rx="2" fill="currentColor" opacity="0.9" />
          <rect x="21" y="7" width="10" height="9" rx="2" fill="currentColor" opacity="0.9" />
          <path d="M11 11.5h10" stroke="currentColor" strokeWidth="1.6" fill="none" />
          <path
            d="M24 7C24 1 8 1 8 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeDasharray="2.4 2"
            opacity="0.6"
          />
        </svg>
      </button>
      <div className="map-card-body">
        {editing ? (
          <input
            className="map-card-rename"
            value={draftName}
            autoFocus
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') {
                setDraftName(doc.name)
                setEditing(false)
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="map-card-name"
            onClick={open}
            onDoubleClick={() => setEditing(true)}
          >
            {doc.name || 'Untitled process'}
          </button>
        )}
        <div className="map-card-meta">
          {summary.steps} step{summary.steps === 1 ? '' : 's'}
          {summary.loops > 0 && ` · ${summary.loops} loop${summary.loops > 1 ? 's' : ''}`}
          {summary.duration && ` · ${summary.duration}`}
          {' · '}
          {relativeTime(doc.updatedAt)}
        </div>
      </div>
      <div className="map-card-actions">
        <button
          type="button"
          className={`icon-btn${doc.pinned ? ' on' : ''}`}
          title={doc.pinned ? 'Unpin' : 'Pin'}
          onClick={() => togglePin(doc.id)}
        >
          {doc.pinned ? '★ Pinned' : '☆ Pin'}
        </button>
        <button type="button" className="icon-btn" title="Rename" onClick={() => setEditing(true)}>
          Rename
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Duplicate"
          onClick={() => duplicateMap(doc.id)}
        >
          Copy
        </button>
        <button type="button" className="icon-btn" title="Export" onClick={() => downloadDoc(doc)}>
          Export
        </button>
        <button
          type="button"
          className="icon-btn danger"
          title="Delete"
          onClick={() => {
            if (confirm(`Delete "${doc.name || 'Untitled process'}"? This can't be undone.`)) {
              deleteMap(doc.id)
            }
          }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}

function plural(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

type ImportNotice = {
  imported: number
  files: number
  failures: ImportFailure[]
  error?: string
}

export default function Dashboard() {
  const maps = useLibraryStore((s) => s.maps)
  const refresh = useLibraryStore((s) => s.refresh)
  const createMap = useLibraryStore((s) => s.createMap)
  const importLibrary = useLibraryStore((s) => s.importLibrary)
  const email = useAuthStore((s) => s.email)
  const emailVerified = useAuthStore((s) => s.emailVerified)
  const logout = useAuthStore((s) => s.logout)
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const fileInput = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState<ImportNotice | null>(null)
  // dragenter/dragleave fire for every child element the pointer crosses, so a
  // depth counter is what keeps the overlay from flickering mid-drag.
  const dragDepth = useRef(0)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    refresh()
  }, [refresh])

  const matching = query.trim()
    ? maps.filter((m) => m.name.toLowerCase().includes(query.trim().toLowerCase()))
    : maps
  const pinnedMaps = matching.filter((m) => m.pinned).sort(byRecent)
  const otherMaps = matching.filter((m) => !m.pinned).sort(byRecent)

  const handleNew = async () => {
    window.location.hash = `#/map/${await createMap()}`
  }

  const handleExportAll = () => {
    downloadLibrary(maps)
  }

  const handleImportFiles = async (files: File[]) => {
    if (files.length === 0) return
    setNotice(null)
    setImporting(true)
    // Read failures are known before the request and must survive it, so that a
    // request that then fails still reports the files that were unreadable.
    let failures: ImportFailure[] = []
    try {
      const read = await readImportFiles(files)
      failures = read.failures
      if (read.maps.length === 0) {
        setNotice({ imported: 0, files: 0, failures })
        return
      }

      // Importing a single map is still a "take me to it" gesture; a batch is
      // not, so a bulk import stays on the dashboard with the results in view.
      const lone = files.length === 1 && read.maps.length === 1 && failures.length === 0
      const created = await importLibrary(read.maps)
      if (lone) {
        window.location.hash = `#/map/${created[0].id}`
        return
      }
      setNotice({ imported: created.length, files: files.length - failures.length, failures })
    } catch (err) {
      setNotice({
        imported: 0,
        files: 0,
        failures,
        error: err instanceof Error ? err.message : 'Import failed.',
      })
    } finally {
      setImporting(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    handleImportFiles(await filesFromDrop(e.dataTransfer))
  }

  return (
    <div
      className="dashboard"
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        dragDepth.current += 1
        setDragging(true)
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault()
      }}
      onDragLeave={() => {
        dragDepth.current -= 1
        if (dragDepth.current <= 0) setDragging(false)
      }}
      onDrop={handleDrop}
    >
      {dragging && (
        <div className="drop-overlay">
          <div className="drop-overlay-inner">
            <strong>Drop to import</strong>
            <span>flowmap exports, or a folder of them</span>
          </div>
        </div>
      )}
      <header className="dashboard-header">
        <h1>flowmap</h1>
        <div className="actions">
          <button type="button" onClick={() => fileInput.current?.click()} disabled={importing}>
            {importing ? 'Importing…' : 'Import'}
          </button>
          {maps.length > 0 && (
            <button type="button" onClick={handleExportAll}>
              Export all
            </button>
          )}
          <button type="button" className="primary" onClick={handleNew}>
            + New map
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          multiple
          hidden
          onChange={(e) => {
            handleImportFiles(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
      </header>

      {!emailVerified && (
        <div className="import-notice bad" role="status">
          <div className="import-notice-body">
            <strong>Confirm your email address.</strong>
            <span>
              We sent a link to {email}. Confirming it is what lets you recover this account if
              you forget your password.
            </span>
          </div>
          <button
            type="button"
            disabled={resendState === 'sending' || resendState === 'sent'}
            onClick={async () => {
              setResendState('sending')
              try {
                await api.resendVerification()
                setResendState('sent')
              } catch {
                setResendState('failed')
              }
            }}
          >
            {resendState === 'sent'
              ? 'Sent'
              : resendState === 'sending'
                ? 'Sending…'
                : resendState === 'failed'
                  ? 'Try again'
                  : 'Resend'}
          </button>
        </div>
      )}

      {notice && (
        <div
          className={`import-notice${notice.error || notice.imported === 0 ? ' bad' : ''}`}
          role="status"
        >
          <div className="import-notice-body">
            <strong>
              {notice.error
                ? notice.error
                : notice.imported > 0
                  ? `Imported ${plural(notice.imported, 'map')} from ${plural(notice.files, 'file')}.`
                  : 'Nothing imported.'}
            </strong>
            {notice.failures.length > 0 && (
              <ul className="import-notice-failures">
                {notice.failures.map((f) => (
                  <li key={f.name}>
                    <code>{f.name}</code> {f.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="dashboard-toolbar">
        <input
          type="search"
          className="search-input"
          placeholder="Search maps by name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search maps"
        />
        <div className="account">
          <span className="account-email">{email}</span>
          <button type="button" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>

      {maps.length === 0 ? (
        <div className="dashboard-empty">
          <p>No maps yet.</p>
          <button type="button" className="primary" onClick={handleNew}>
            Create your first map
          </button>
        </div>
      ) : matching.length === 0 ? (
        <div className="dashboard-empty">
          <p>No maps match "{query}".</p>
        </div>
      ) : (
        <>
          {pinnedMaps.length > 0 && (
            <section>
              <h2 className="dashboard-section-label">Pinned</h2>
              <div className="map-grid">
                {pinnedMaps.map((doc) => (
                  <Card key={doc.id} doc={doc} />
                ))}
              </div>
            </section>
          )}
          <section>
            {pinnedMaps.length > 0 && <h2 className="dashboard-section-label">All maps</h2>}
            <div className="map-grid">
              {otherMaps.map((doc) => (
                <Card key={doc.id} doc={doc} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
