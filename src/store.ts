import { addEdge, applyEdgeChanges, applyNodeChanges } from '@xyflow/react'
import type { Connection, EdgeChange, NodeChange, XYPosition } from '@xyflow/react'
import { nanoid } from 'nanoid'
import { create } from 'zustand'
import * as api from './api'
import { emptyStep } from './types'
import type { FlowEdge, MapDoc, StepData, StepNode } from './types'

type State = {
  id: string | null
  name: string
  nodes: StepNode[]
  edges: FlowEdge[]
  pinned: boolean
  selectedId: string | null
  selectedEdgeId: string | null
  onNodesChange: (changes: NodeChange<StepNode>[]) => void
  onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => void
  onConnect: (connection: Connection) => void
  addStep: (position: XYPosition) => string
  updateStep: (id: string, patch: Partial<StepData>) => void
  updateEdgeLabel: (id: string, label: string) => void
  deleteStep: (id: string) => void
  select: (id: string | null) => void
  selectEdge: (id: string | null) => void
  rename: (name: string) => void
  toDoc: () => MapDoc
  loadMap: (doc: MapDoc) => void
}

/** The currently-open map's live editing state — one map at a time. */
export const useStore = create<State>((set, get) => ({
  id: null,
  name: '',
  nodes: [],
  edges: [],
  pinned: false,
  selectedId: null,
  selectedEdgeId: null,

  onNodesChange: (changes) =>
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) })),

  onEdgesChange: (changes) =>
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),

  onConnect: (connection) =>
    set((s) => ({
      edges: addEdge({ ...connection, id: nanoid(8), data: {} }, s.edges),
    })),

  addStep: (position) => {
    const id = nanoid(8)
    set((s) => ({
      nodes: [...s.nodes, { id, type: 'step', position, data: emptyStep() }],
      selectedId: id,
    }))
    return id
  },

  updateStep: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
    })),

  updateEdgeLabel: (id, label) =>
    set((s) => ({
      edges: s.edges.map((e) =>
        e.id === id ? { ...e, data: { ...e.data, label } } : e,
      ),
    })),

  deleteStep: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  select: (id) => set({ selectedId: id }),

  selectEdge: (id) => set({ selectedEdgeId: id }),

  rename: (name) => set({ name }),

  toDoc: () => {
    const { id, name, nodes, edges, pinned } = get()
    return { version: 1, id: id ?? nanoid(8), name, nodes, edges, pinned, updatedAt: new Date().toISOString() }
  },

  loadMap: (doc) =>
    set({
      id: doc.id,
      name: doc.name ?? 'Untitled process',
      nodes: doc.nodes ?? [],
      edges: doc.edges ?? [],
      pinned: doc.pinned ?? false,
      selectedId: null,
      selectedEdgeId: null,
    }),
}))

/**
 * Autosave writes only the fields the editor actually owns (name/nodes/edges)
 * — pinned status is set from the dashboard and just carried through here so
 * an autosave can never silently unpin a map.
 */
let saveTimer: ReturnType<typeof setTimeout> | undefined

export function flushSave(keepalive = false): void {
  clearTimeout(saveTimer)
  const { id, name, nodes, edges } = useStore.getState()
  if (!id) return
  void api.updateMap(id, { name, nodes, edges }, keepalive)
}

useStore.subscribe((state, prev) => {
  if (
    state.nodes === prev.nodes &&
    state.edges === prev.edges &&
    state.name === prev.name
  )
    return
  if (!state.id) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => flushSave(), 400)
})

window.addEventListener('beforeunload', () => flushSave(true))
