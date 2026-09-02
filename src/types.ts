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

/** The serialized document — this is what we save, export, and sync to the server. */
export type MapDoc = {
  version: 1
  id: string
  name: string
  nodes: StepNode[]
  edges: FlowEdge[]
  pinned: boolean
  updatedAt: string
}

/** What a requester may do with a map. `owner` is implicit in the map row;
 * the other two are granted, to an account or to whoever holds a link. */
export type Role = 'owner' | 'editor' | 'viewer'

/** A map as the server hands it back: the document, plus the row's revision
 * counter and how the requester came to be reading it.
 *
 * `rev` is deliberately not `version` — that name is already taken by the
 * document *format*, and conflating the two would make a stale-write bug very
 * hard to see. */
export type MapRecord = MapDoc & {
  rev: number
  role: Role
  ownerEmail?: string | null
}

/** A bulk export/import bundle — the whole dashboard as one file. */
export type Library = {
  version: 1
  maps: MapDoc[]
}

export const emptyStep = (): StepData => ({
  title: 'New step',
  notes: '',
  owner: '',
  duration: 0,
  status: 'not-started',
})
