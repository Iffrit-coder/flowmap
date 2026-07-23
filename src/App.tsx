import { useCallback, useMemo } from 'react'
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

import Inspector from './components/Inspector'
import LoopEdge from './components/LoopEdge'
import StepNode from './components/StepNode'
import Toolbar from './components/Toolbar'
import { findBackEdges } from './graph'
import { useStore } from './store'
import './styles.css'

const nodeTypes = { step: StepNode }
const edgeTypes = { loop: LoopEdge }

function Canvas() {
  const nodes = useStore((s) => s.nodes)
  const rawEdges = useStore((s) => s.edges)
  const onNodesChange = useStore((s) => s.onNodesChange)
  const onEdgesChange = useStore((s) => s.onEdgesChange)
  const onConnect = useStore((s) => s.onConnect)
  const addStep = useStore((s) => s.addStep)
  const select = useStore((s) => s.select)
  const selectEdge = useStore((s) => s.selectEdge)
  const { screenToFlowPosition } = useReactFlow()

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
            fitView
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

export default function App() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  )
}
