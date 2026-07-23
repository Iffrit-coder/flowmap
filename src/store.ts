import { addEdge, applyEdgeChanges, applyNodeChanges } from '@xyflow/react'
import type { Connection, EdgeChange, NodeChange, XYPosition } from '@xyflow/react'
import { nanoid } from 'nanoid'
import { create } from 'zustand'
import { emptyStep } from './types'
import type { FlowEdge, MapDoc, StepData, StepNode } from './types'


const STORAGE_KEY = 'flowmap.doc.v1'

/**
 * Persistence is deliberately a thin layer over a plain serializable doc:
 * local storage today, a row in a database later, same shape either way.
 */
function load(): MapDoc | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const doc = JSON.parse(raw) as MapDoc
    if (doc.version !== 1 || !Array.isArray(doc.nodes)) return null
    return doc
  } catch {
    return null
  }
}

/**
 * A worked example rather than an empty canvas — a first-time visitor should be
 * able to see what a filled-in step looks like, and what a loop looks like,
 * without building one first.
 */
function starterDoc(): MapDoc {
  const steps: StepData[] = [
    { ...emptyStep(), title: 'Brief', owner: 'Client', duration: 30, status: 'done' },
    {
      ...emptyStep(),
      title: 'Draft',
      owner: 'Writer',
      duration: 120,
      status: 'done',
      notes: 'First pass. Rough is fine — the review loop is where it tightens up.',
    },
    {
      ...emptyStep(),
      title: 'Review',
      owner: 'Editor',
      duration: 45,
      status: 'in-progress',
    },
    { ...emptyStep(), title: 'Publish', owner: 'Writer', duration: 15 },
  ]
  const ids = steps.map(() => nanoid(8))

  return {
    version: 1,
    name: 'Untitled process',
    nodes: steps.map((data, i) => ({
      id: ids[i],
      type: 'step' as const,
      position: { x: 80 + i * 260, y: 200 },
      data,
    })),
    edges: [
      { id: nanoid(8), source: ids[0], target: ids[1], data: {} },
      { id: nanoid(8), source: ids[1], target: ids[2], data: {} },
      { id: nanoid(8), source: ids[2], target: ids[3], data: {} },
      {
        id: nanoid(8),
        source: ids[2],
        target: ids[1],
        sourceHandle: 'loop',
        targetHandle: 'back',
        data: { label: 'if changes requested' },
      },
    ],
    updatedAt: new Date().toISOString(),
  }
}

type State = {
  name: string
  nodes: StepNode[]
  edges: FlowEdge[]
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
  loadDoc: (doc: MapDoc) => void
  reset: () => void
}

const initial = load() ?? starterDoc()

export const useStore = create<State>((set, get) => ({
  name: initial.name,
  nodes: initial.nodes,
  edges: initial.edges,
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
    const { name, nodes, edges } = get()
    return { version: 1, name, nodes, edges, updatedAt: new Date().toISOString() }
  },

  loadDoc: (doc) =>
    set({
      name: doc.name ?? 'Untitled process',
      nodes: doc.nodes ?? [],
      edges: doc.edges ?? [],
      selectedId: null,
    }),

  reset: () => {
    const doc = starterDoc()
    set({ name: doc.name, nodes: doc.nodes, edges: doc.edges, selectedId: null })
  },
}))

/** Autosave: any change to the document lands in local storage, debounced. */
let saveTimer: ReturnType<typeof setTimeout> | undefined
useStore.subscribe((state, prev) => {
  if (
    state.nodes === prev.nodes &&
    state.edges === prev.edges &&
    state.name === prev.name
  )
    return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(useStore.getState().toDoc()))
  }, 400)
})
