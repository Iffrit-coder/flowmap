import { useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import * as api from '../api'
import { downloadDoc } from '../download'
import { formatDuration, totalDuration } from '../graph'
import { flushSave, useCanEdit, useStore } from '../store'
import ShareDialog from './ShareDialog'

export default function Toolbar({ loopCount }: { loopCount: number }) {
  const id = useStore((s) => s.id)
  const name = useStore((s) => s.name)
  const rename = useStore((s) => s.rename)
  const nodes = useStore((s) => s.nodes)
  const toDoc = useStore((s) => s.toDoc)
  const addStep = useStore((s) => s.addStep)
  const role = useStore((s) => s.role)
  const canEdit = useCanEdit()
  const [sharing, setSharing] = useState(false)
  const { screenToFlowPosition } = useReactFlow()

  const addAtCenter = () => {
    const { innerWidth, innerHeight } = window
    const at = screenToFlowPosition({ x: innerWidth / 2, y: innerHeight / 2 })
    addStep({ x: at.x - 95, y: at.y - 30 })
  }

  const goToLibrary = () => {
    flushSave()
    window.location.hash = ''
  }

  const total = formatDuration(totalDuration(nodes))
  // Someone who arrived by link has no dashboard to go back to.
  const arrivedByLink = api.getShareToken() !== null

  return (
    <header className="toolbar">
      {!arrivedByLink && (
        <button type="button" className="back-btn" onClick={goToLibrary} title="Back to your maps">
          ←
        </button>
      )}

      <input
        className="doc-name"
        value={name}
        onChange={(e) => rename(e.target.value)}
        aria-label="Process name"
        readOnly={!canEdit}
      />

      <div className="stats">
        <span>{nodes.length} step{nodes.length === 1 ? '' : 's'}</span>
        {loopCount > 0 && <span>{loopCount} loop{loopCount > 1 ? 's' : ''}</span>}
        {total && <span>{total} total</span>}
      </div>

      <div className="actions">
        {role === 'viewer' && <span className="role-badge">View only</span>}
        {role === 'editor' && <span className="role-badge editor">Shared with you</span>}
        {canEdit && (
          <button type="button" className="primary" onClick={addAtCenter}>
            + Step
          </button>
        )}
        {/* Only an owner can hand out access, and only when signed in as one —
            a link holder has no share list to manage. */}
        {role === 'owner' && id && (
          <button type="button" onClick={() => setSharing(true)}>
            Share
          </button>
        )}
        <button type="button" onClick={() => downloadDoc(toDoc())}>
          Export
        </button>
      </div>

      {sharing && id && <ShareDialog mapId={id} onClose={() => setSharing(false)} />}
    </header>
  )
}
