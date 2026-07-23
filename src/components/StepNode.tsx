import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { formatDuration } from '../graph'
import type { StepNode as StepNodeType } from '../types'

export default function StepNode({ data, selected }: NodeProps<StepNodeType>) {
  const meta = [data.owner, formatDuration(data.duration)].filter(Boolean)

  return (
    <div
      className={`step status-${data.status}${selected ? ' selected' : ''}`}
      data-testid="step-node"
    >
      {/* Left/right carry the forward flow. Both loop handles sit on the top
          edge so a return arrow arcs over the row instead of cutting through
          the steps in between. */}
      <Handle type="target" position={Position.Left} id="in" />
      <Handle type="source" position={Position.Right} id="out" />
      <Handle
        type="target"
        position={Position.Top}
        id="back"
        className="loop-handle loop-in"
        title="Loop back into this step"
      />
      <Handle
        type="source"
        position={Position.Top}
        id="loop"
        className="loop-handle loop-out"
        title="Drag back to an earlier step to loop"
      />

      <div className="step-title">{data.title || 'Untitled step'}</div>
      {meta.length > 0 && <div className="step-meta">{meta.join(' · ')}</div>}
      {data.notes && <div className="step-notes-flag">notes</div>}
    </div>
  )
}
