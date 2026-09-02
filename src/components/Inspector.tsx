import { STATUSES, STATUS_LABELS } from '../types'
import type { Status } from '../types'
import { useCanEdit, useStore } from '../store'

export default function Inspector() {
  const selectedId = useStore((s) => s.selectedId)
  const node = useStore((s) => s.nodes.find((n) => n.id === s.selectedId))
  const edge = useStore((s) => s.edges.find((e) => e.id === s.selectedEdgeId))
  const updateStep = useStore((s) => s.updateStep)
  const updateEdgeLabel = useStore((s) => s.updateEdgeLabel)
  const deleteStep = useStore((s) => s.deleteStep)
  const canEdit = useCanEdit()

  if (edge && !selectedId) {
    return (
      <aside className="inspector">
        <h2>Connection</h2>
        <label>
          Label
          <input
            value={edge.data?.label ?? ''}
            placeholder="e.g. if changes requested"
            onChange={(e) => updateEdgeLabel(edge.id, e.target.value)}
          />
        </label>
        <p className="hint">
          On a return arrow this is the repeat condition. Press Delete to remove
          the connection.
        </p>
      </aside>
    )
  }

  if (!node) {
    return (
      <aside className="inspector empty">
        <h2>Nothing selected</h2>
        <ul className="hint-list">
          {/* The editing hints describe gestures a viewer cannot perform, so
              they'd read as broken rather than helpful. */}
          {canEdit ? (
            <>
              <li>Double-click the canvas to add a step.</li>
              <li>Drag right edge → left edge to connect two steps.</li>
              <li>
                Drag from a step's <strong>top</strong> dot back to an earlier step
                to create a loop.
              </li>
              <li>Select a step to edit its details here.</li>
            </>
          ) : (
            <>
              <li>Select a step to see its owner, duration, and notes.</li>
              <li>Dashed arcs curving backwards are loops — the process repeating.</li>
              <li>You have view-only access to this map.</li>
            </>
          )}
        </ul>
      </aside>
    )
  }

  const set = (patch: Parameters<typeof updateStep>[1]) => updateStep(node.id, patch)

  return (
    <aside className="inspector">
      <h2>Step</h2>

      <label>
        Title
        <input
          value={node.data.title}
          onChange={(e) => set({ title: e.target.value })}
          autoFocus
        />
      </label>

      <label>
        Status
        <div className="status-row">
          {STATUSES.map((status: Status) => (
            <button
              disabled={!canEdit}
              key={status}
              type="button"
              className={`chip status-${status}${
                node.data.status === status ? ' on' : ''
              }`}
              onClick={() => set({ status })}
            >
              {STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      </label>

      <div className="row">
        <label>
          Owner
          <input
            value={node.data.owner}
            placeholder="who does it"
            onChange={(e) => set({ owner: e.target.value })}
          />
        </label>
        <label>
          Duration (min)
          <input
            type="number"
            min={0}
            value={node.data.duration || ''}
            placeholder="0"
            onChange={(e) => set({ duration: Number(e.target.value) || 0 })}
          />
        </label>
      </div>

      <label className="grow">
        Notes
        <textarea
          value={node.data.notes}
          placeholder="What actually happens in this step…"
          onChange={(e) => set({ notes: e.target.value })}
        />
      </label>

      <button
        type="button"
        className="danger"
        disabled={!canEdit}
        onClick={() => deleteStep(node.id)}
      >
        Delete step
      </button>
    </aside>
  )
}
