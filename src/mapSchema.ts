import { STATUSES } from './types.js'
import type { FlowEdge, MapDoc, Status, StepNode } from './types.js'

/** Ceilings chosen to be far above any real process map while still bounding
 * what one account can push into the database. A map that trips these is a
 * mistake or an attack, not a diagram someone drew. */
export const LIMITS = {
  name: 200,
  nodes: 2000,
  edges: 4000,
  title: 500,
  notes: 20_000,
  owner: 200,
  id: 64,
  duration: 1_000_000,
  coord: 10_000_000,
} as const

/** The handles a step exposes. An edge referring to anything else did not come
 * from this app, and `findBackEdges` reads these to decide what is a loop. */
const HANDLES = new Set(['in', 'out', 'back', 'loop'])

export class InvalidMap extends Error {}

function str(value: unknown, max: number, field: string): string {
  if (typeof value !== 'string') throw new InvalidMap(`${field} must be a string`)
  if (value.length > max) throw new InvalidMap(`${field} is longer than ${max} characters`)
  return value
}

function optionalStr(value: unknown, max: number, field: string): string {
  return value === undefined || value === null ? '' : str(value, max, field)
}

function num(value: unknown, max: number, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidMap(`${field} must be a finite number`)
  }
  return Math.min(Math.max(value, -max), max)
}

function arr(value: unknown, max: number, field: string): unknown[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new InvalidMap(`${field} must be an array`)
  if (value.length > max) throw new InvalidMap(`${field} has more than ${max} entries`)
  return value
}

function obj(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidMap(`${field} must be an object`)
  }
  return value as Record<string, unknown>
}

function handle(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined
  const h = str(value, LIMITS.id, field)
  if (!HANDLES.has(h)) throw new InvalidMap(`${field} is not a known handle`)
  return h
}

function sanitizeNode(input: unknown, i: number): StepNode {
  const n = obj(input, `nodes[${i}]`)
  const data = obj(n.data ?? {}, `nodes[${i}].data`)
  const position = obj(n.position ?? {}, `nodes[${i}].position`)
  const status = data.status
  if (typeof status !== 'string' || !(STATUSES as readonly string[]).includes(status)) {
    throw new InvalidMap(`nodes[${i}].data.status is not a known status`)
  }

  // Rebuilt field by field rather than spread: React Flow recomputes the rest
  // (measured size, selection, drag state), and anything else in the input is
  // by definition not ours to store.
  return {
    id: str(n.id, LIMITS.id, `nodes[${i}].id`),
    type: 'step',
    position: {
      x: num(position.x ?? 0, LIMITS.coord, `nodes[${i}].position.x`),
      y: num(position.y ?? 0, LIMITS.coord, `nodes[${i}].position.y`),
    },
    data: {
      title: optionalStr(data.title, LIMITS.title, `nodes[${i}].data.title`),
      notes: optionalStr(data.notes, LIMITS.notes, `nodes[${i}].data.notes`),
      owner: optionalStr(data.owner, LIMITS.owner, `nodes[${i}].data.owner`),
      duration: Math.max(0, num(data.duration ?? 0, LIMITS.duration, `nodes[${i}].data.duration`)),
      status: status as Status,
    },
  } as StepNode
}

function sanitizeEdge(input: unknown, i: number, nodeIds: Set<string>): FlowEdge {
  const e = obj(input, `edges[${i}]`)
  const data = obj(e.data ?? {}, `edges[${i}].data`)
  const source = str(e.source, LIMITS.id, `edges[${i}].source`)
  const target = str(e.target, LIMITS.id, `edges[${i}].target`)

  // A dangling edge would render as an invisible connector to nowhere, so it is
  // rejected here rather than stored and puzzled over later.
  if (!nodeIds.has(source)) throw new InvalidMap(`edges[${i}].source is not a step in this map`)
  if (!nodeIds.has(target)) throw new InvalidMap(`edges[${i}].target is not a step in this map`)

  const edge: FlowEdge = {
    id: str(e.id, LIMITS.id, `edges[${i}].id`),
    source,
    target,
    data: { label: optionalStr(data.label, LIMITS.title, `edges[${i}].data.label`) },
  }
  // `type` is deliberately not carried over: the editor derives 'loop' from the
  // graph on every render, so a stored type could only ever contradict it.
  const sourceHandle = handle(e.sourceHandle, `edges[${i}].sourceHandle`)
  const targetHandle = handle(e.targetHandle, `edges[${i}].targetHandle`)
  if (sourceHandle) edge.sourceHandle = sourceHandle
  if (targetHandle) edge.targetHandle = targetHandle
  return edge
}

/** Validates and rebuilds the parts of a map a client is allowed to write.
 * Throws `InvalidMap` with a specific field path so a bad import can say which
 * map and which field, rather than failing as an opaque 400. */
export function sanitizeMapInput(input: unknown): Pick<MapDoc, 'name' | 'nodes' | 'edges' | 'pinned'> {
  const doc = obj(input, 'map')
  const name = doc.name === undefined ? 'Untitled process' : str(doc.name, LIMITS.name, 'name')
  const nodes = arr(doc.nodes, LIMITS.nodes, 'nodes').map(sanitizeNode)

  const nodeIds = new Set(nodes.map((n) => n.id))
  if (nodeIds.size !== nodes.length) throw new InvalidMap('two steps share an id')

  const edges = arr(doc.edges, LIMITS.edges, 'edges').map((e, i) => sanitizeEdge(e, i, nodeIds))

  return {
    name: name.trim() || 'Untitled process',
    nodes,
    edges,
    pinned: typeof doc.pinned === 'boolean' ? doc.pinned : false,
  }
}
