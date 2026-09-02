import type { MapDoc } from '../../src/types.js'

export type MapRow = MapDoc & { rev: number }

export function toMapDoc(row: Record<string, unknown>): MapRow {
  return {
    version: 1,
    id: row.id as string,
    name: row.name as string,
    nodes: row.nodes as MapDoc['nodes'],
    edges: row.edges as MapDoc['edges'],
    pinned: row.pinned as boolean,
    updatedAt: new Date(row.updated_at as string).toISOString(),
    // Distinct from `version: 1`, which is the document *format*. This is the
    // row's revision counter, and it is what a write must be based on.
    rev: Number(row.version ?? 0),
  }
}
