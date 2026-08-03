import { useReactFlow } from '@xyflow/react'
import { downloadDoc } from '../download'
import { formatDuration, totalDuration } from '../graph'
import { flushSave, useStore } from '../store'

export default function Toolbar({ loopCount }: { loopCount: number }) {
  const name = useStore((s) => s.name)
  const rename = useStore((s) => s.rename)
  const nodes = useStore((s) => s.nodes)
  const toDoc = useStore((s) => s.toDoc)
  const addStep = useStore((s) => s.addStep)
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

  return (
    <header className="toolbar">
      <button type="button" className="back-btn" onClick={goToLibrary} title="Back to your maps">
        ←
      </button>

      <input
        className="doc-name"
        value={name}
        onChange={(e) => rename(e.target.value)}
        aria-label="Process name"
      />

      <div className="stats">
        <span>{nodes.length} step{nodes.length === 1 ? '' : 's'}</span>
        {loopCount > 0 && <span>{loopCount} loop{loopCount > 1 ? 's' : ''}</span>}
        {total && <span>{total} total</span>}
      </div>

      <div className="actions">
        <button type="button" className="primary" onClick={addAtCenter}>
          + Step
        </button>
        <button type="button" onClick={() => downloadDoc(toDoc())}>
          Export
        </button>
      </div>
    </header>
  )
}
