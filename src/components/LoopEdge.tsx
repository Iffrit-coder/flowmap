import { BaseEdge, EdgeLabelRenderer } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'
import type { FlowEdge } from '../types'

/**
 * A return arrow. Both endpoints attach to the top of their step, so the edge
 * arcs over everything between them and reads as "go back and do it again"
 * rather than as another forward connection.
 */
export default function LoopEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
}: EdgeProps<FlowEdge>) {
  const span = Math.abs(targetX - sourceX)
  const lift = Math.min(40 + span * 0.25, 160)
  const crest = Math.min(sourceY, targetY) - lift

  const path = `M ${sourceX},${sourceY} C ${sourceX},${crest} ${targetX},${crest} ${targetX},${targetY}`
  const labelX = (sourceX + targetX) / 2
  // Peak of a symmetric cubic sits three quarters of the way to the control points.
  const labelY = (sourceY + targetY) / 2 * 0.25 + crest * 0.75

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className={`loop-edge${selected ? ' selected' : ''}`}
        markerEnd="url(#loop-arrow)"
      />
      <EdgeLabelRenderer>
        <div
          className="edge-label loop-label nodrag nopan"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          ↻ {data?.label || 'repeat'}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
