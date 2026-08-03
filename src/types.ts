import type { Edge, Node } from '@xyflow/react'

export const STATUSES = ['not-started', 'in-progress', 'done', 'blocked'] as const
export type Status = (typeof STATUSES)[number]

export const STATUS_LABELS: Record<Status, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  done: 'Done',
  blocked: 'Blocked',
}

/** Everything a single step in the process holds. */
export type StepData = {
  title: string
  notes: string
  owner: string
  /** Minutes. 0 means "unset" — we never render a zero duration. */
  duration: number
  status: Status
}

export type StepNode = Node<StepData, 'step'>

export type EdgeData = {
  /** Shown on the connector. On a loop edge this is the repeat condition. */
  label?: string
}

export type FlowEdge = Edge<EdgeData>

/** The serialized document — this is what we save, export, and will later sync. */
export type MapDoc = {
  version: 1
  id: string
  name: string
  nodes: StepNode[]
  edges: FlowEdge[]
  updatedAt: string
}

/** The dashboard's collection of maps — everything that isn't one map's own content. */
export type Library = {
  version: 1
  maps: MapDoc[]
  pinned: string[]
}

export const emptyStep = (): StepData => ({
  title: 'New step',
  notes: '',
  owner: '',
  duration: 0,
  status: 'not-started',
})
