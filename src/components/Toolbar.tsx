import { useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import { formatDuration, totalDuration } from '../graph'
import { useStore } from '../store'
import type { MapDoc } from '../types'

export default function Toolbar({ loopCount }: { loopCount: number }) {
  const name = useStore((s) => s.name)
  const rename = useStore((s) => s.rename)
  const nodes = useStore((s) => s.nodes)
  const toDoc = useStore((s) => s.toDoc)
  const loadDoc = useStore((s) => s.loadDoc)
  const reset = useStore((s) => s.reset)
  const addStep = useStore((s) => s.addStep)
  const fileInput = useRef<HTMLInputElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  const addAtCenter = () => {
    const { innerWidth, innerHeight } = window
    const at = screenToFlowPosition({ x: innerWidth / 2, y: innerHeight / 2 })
    addStep({ x: at.x - 95, y: at.y - 30 })
  }

  const exportDoc = () => {
    const doc = toDoc()
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${doc.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'process'}.flowmap.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importDoc = async (file: File) => {
    try {
      const doc = JSON.parse(await file.text()) as MapDoc
      if (doc.version !== 1 || !Array.isArray(doc.nodes)) throw new Error('bad file')
      loadDoc(doc)
    } catch {
      alert("That file isn't a flowmap export.")
    }
  }

  const total = formatDuration(totalDuration(nodes))

  return (
    <header className="toolbar">
      <input
        className="doc-name"
        value={name}
        onChange={(e) => rename(e.target.value)}
        aria-label="Process name"
      />

      <div className="stats">
        <span>{nodes.length} steps</span>
        {loopCount > 0 && <span>{loopCount} loop{loopCount > 1 ? 's' : ''}</span>}
        {total && <span>{total} total</span>}
      </div>

      <div className="actions">
        <button type="button" className="primary" onClick={addAtCenter}>
          + Step
        </button>
        <button type="button" onClick={exportDoc}>
          Export
        </button>
        <button type="button" onClick={() => fileInput.current?.click()}>
          Import
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm('Replace the current map with a fresh starter?')) reset()
          }}
        >
          New
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) importDoc(file)
            e.target.value = ''
          }}
        />
      </div>
    </header>
  )
}
