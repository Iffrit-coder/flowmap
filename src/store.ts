import { addEdge, applyEdgeChanges, applyNodeChanges } from '@xyflow/react'
import type { Connection, EdgeChange, NodeChange, XYPosition } from '@xyflow/react'
import { nanoid } from 'nanoid'
import { create } from 'zustand'
import * as api from './api'
import { emptyStep } from './types'
import type { FlowEdge, MapDoc, MapRecord, Role, StepData, StepNode } from './types'

type State = {
  id: string | null
  name: string
  nodes: StepNode[]
  edges: FlowEdge[]
  pinned: boolean
  /** The row revision this state was loaded from. Every save is written against
   * it; the server refuses the write if it has moved on. */
  rev: number
  role: Role
  /** Set when a save was refused because someone else got there first. While it
   * holds a value autosave is stopped — retrying would just overwrite them once
   * the revision refreshed. */
  conflict: MapRecord | null
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
  loadMap: (doc: MapRecord) => void
  resolveConflictByReloading: () => void
  resolveConflictByOverwriting: () => void
}

/** Whether the current role may change the document. Read-only is enforced on
 * the server; this only stops the UI from offering edits that would be refused. */
export function useCanEdit(): boolean {
  return useStore((s) => s.role === 'owner' || s.role === 'editor')
}

/** The currently-open map's live editing state — one map at a time. */
export const useStore = create<State>((set, get) => ({
  id: null,
  name: '',
  nodes: [],
  edges: [],
  pinned: false,
  rev: 0,
  role: 'owner',
  conflict: null,
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
      rev: doc.rev ?? 0,
      role: doc.role ?? 'owner',
      conflict: null,
      selectedId: null,
      selectedEdgeId: null,
    }),

  /** Take theirs: the local edits since the conflict are discarded. */
  resolveConflictByReloading: () => {
    const { conflict } = get()
    if (!conflict) return
    get().loadMap(conflict)
  },

  /** Take mine: keep the local document but rebase onto their revision, so the
   * next save is accepted rather than refused again. */
  resolveConflictByOverwriting: () => {
    const { conflict } = get()
    if (!conflict) return
    set({ rev: conflict.rev, conflict: null })
    scheduleSave()
  },
}))

/**
 * Autosave writes only the fields the editor actually owns (name/nodes/edges)
 * — pinned status is set from the dashboard and just carried through here so
 * an autosave can never silently unpin a map.
 */
let saveTimer: ReturnType<typeof setTimeout> | undefined

function scheduleSave(): void {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => flushSave(), 400)
}

export function flushSave(keepalive = false): void {
  clearTimeout(saveTimer)
  const { id, name, nodes, edges, rev, role, conflict } = useStore.getState()
  if (!id) return
  // A viewer's edits would be refused by the server anyway; not sending them
  // keeps the console clean and avoids a pointless request per keystroke.
  if (role === 'viewer') return
  // Already conflicted — wait for the user to choose rather than racing them.
  if (conflict) return

  void api
    .updateMap(id, { name, nodes, edges, rev }, keepalive)
    .then((saved) => {
      // Only advance if we are still on the same map; the editor may have moved
      // on while this request was in flight.
      if (useStore.getState().id === saved.id) useStore.setState({ rev: saved.rev })
    })
    .catch((err: unknown) => {
      if (err instanceof api.ConflictError) {
        useStore.setState({ conflict: err.current })
      }
      // Anything else is transient; the next edit schedules another save.
    })
}

useStore.subscribe((state, prev) => {
  if (
    state.nodes === prev.nodes &&
    state.edges === prev.edges &&
    state.name === prev.name
  )
    return
  if (!state.id) return
  scheduleSave()
})

window.addEventListener('beforeunload', () => flushSave(true))
