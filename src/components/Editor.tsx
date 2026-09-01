import { useCallback, useEffect, useMemo } from 'react'
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react'
import type { OnSelectionChangeParams } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import * as api from '../api'
import { findBackEdges } from '../graph'
import { flushSave, useStore } from '../store'
import Inspector from './Inspector'
import LoopEdge from './LoopEdge'
import StepNode from './StepNode'
import Toolbar from './Toolbar'

const nodeTypes = { step: StepNode }
const edgeTypes = { loop: LoopEdge }

function EditorCanvas({ mapId }: { mapId: string }) {
  const nodes = useStore((s) => s.nodes)
  const rawEdges = useStore((s) => s.edges)
  const onNodesChange = useStore((s) => s.onNodesChange)
  const onEdgesChange = useStore((s) => s.onEdgesChange)
  const onConnect = useStore((s) => s.onConnect)
  const addStep = useStore((s) => s.addStep)
  const select = useStore((s) => s.select)
  const selectEdge = useStore((s) => s.selectEdge)
  const loadMap = useStore((s) => s.loadMap)
  const { screenToFlowPosition, fitView } = useReactFlow()

  // The map's own content lives server-side, keyed by id, until it's opened —
  // loading it here (rather than at store-creation time) is what lets one
  // editor serve any map the dashboard links it to.
  useEffect(() => {
    let cancelled = false
    api.listMaps().catch(() => null).then((result) => {
      if (cancelled) return
      // Null means the load failed — a 401 has already routed back to sign-in,
      // and anything else should return to the dashboard rather than sit on an
      // editor with no document behind it.
      if (!result) {
        window.location.hash = ''
        return
      }
      const doc = result.maps.find((m) => m.id === mapId)
      if (!doc) {
        window.location.hash = ''
        return
      }
      loadMap(doc)
      // fitView needs the new nodes to have committed and painted first.
      requestAnimationFrame(() => fitView())
    })
    return () => {
      cancelled = true
    }
  }, [mapId, loadMap, fitView])

  useEffect(() => () => flushSave(), [])

  const backEdges = useMemo(() => findBackEdges(nodes, rawEdges), [nodes, rawEdges])

  // Loop-ness is derived, never stored: re-route the graph and the same edge
  // stops being a loop on its own.
  const edges = useMemo(
    () =>
      rawEdges.map((edge) =>
        backEdges.has(edge.id)
          ? { ...edge, type: 'loop' as const }
          : {
              ...edge,
              type: 'default' as const,
              label: edge.data?.label,
              markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
            },
      ),
    [rawEdges, backEdges],
  )

  const onSelectionChange = useCallback(
    ({ nodes: selNodes, edges: selEdges }: OnSelectionChangeParams) => {
      select(selNodes[0]?.id ?? null)
      selectEdge(selEdges[0]?.id ?? null)
    },
    [select, selectEdge],
  )

  const onDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if ((event.target as HTMLElement).closest('.react-flow__node')) return
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      addStep({ x: position.x - 90, y: position.y - 30 })
    },
    [addStep, screenToFlowPosition],
  )

  return (
    <div className="app">
      <Toolbar loopCount={backEdges.size} />
      <div className="body">
        <div className="canvas">
          <svg className="defs" aria-hidden="true">
            <defs>
              <marker
                id="loop-arrow"
                markerWidth="12"
                markerHeight="12"
                refX="9"
                refY="4"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 Z" className="loop-arrow-head" />
              </marker>
            </defs>
          </svg>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            onDoubleClick={onDoubleClick}
            zoomOnDoubleClick={false}
          >
            <Background gap={22} size={1.5} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeStrokeWidth={3} />
          </ReactFlow>
        </div>
        <Inspector />
      </div>
    </div>
  )
}

export default function Editor({ mapId }: { mapId: string }) {
  return (
    <ReactFlowProvider>
      <EditorCanvas mapId={mapId} />
    </ReactFlowProvider>
  )
}
