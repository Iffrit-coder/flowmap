import type { MapDoc } from '../../src/types.js'

export function toMapDoc(row: Record<string, unknown>): MapDoc {
  return {
    version: 1,
    id: row.id as string,
    name: row.name as string,
    nodes: row.nodes as MapDoc['nodes'],
    edges: row.edges as MapDoc['edges'],
    pinned: row.pinned as boolean,
    updatedAt: new Date(row.updated_at as string).toISOString(),
  }
}
