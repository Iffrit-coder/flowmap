import type { ServerResponse } from 'node:http'
import { nanoid } from 'nanoid'
import { getUserId } from '../_lib/auth.js'
import sql from '../_lib/db.js'
import { readJson, sendJson } from '../_lib/http.js'
import type { ApiRequest } from '../_lib/http.js'
import type { MapDoc } from '../../src/types.js'

export default async function handler(req: ApiRequest, res: ServerResponse) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })

  const userId = await getUserId(req)
  if (!userId) return sendJson(res, 401, { error: 'not signed in' })

  const body = await readJson<{ maps?: Partial<MapDoc>[] }>(req)
  const incoming = Array.isArray(body.maps) ? body.maps : []

  const imported: MapDoc[] = []
  for (const doc of incoming) {
    const id = nanoid(8)
    const name = doc.name ?? 'Untitled process'
    const nodes = doc.nodes ?? []
    const edges = doc.edges ?? []
    const pinned = doc.pinned ?? false
    const updatedAt = new Date().toISOString()
    await sql`
      insert into maps (id, user_id, name, nodes, edges, pinned)
      values (${id}, ${userId}, ${name}, ${JSON.stringify(nodes)}::jsonb, ${JSON.stringify(edges)}::jsonb, ${pinned})
    `
    imported.push({ version: 1, id, name, nodes: nodes as MapDoc['nodes'], edges: edges as MapDoc['edges'], pinned, updatedAt })
  }

  sendJson(res, 200, { maps: imported })
}
