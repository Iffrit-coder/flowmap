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
  if (incoming.length === 0) return sendJson(res, 200, { maps: [] })

  // Fresh ids on the way in, so re-importing a file — or importing someone
  // else's export — never collides with what's already on the dashboard.
  const imported: MapDoc[] = incoming.map((doc) => ({
    version: 1,
    id: nanoid(8),
    name: doc.name ?? 'Untitled process',
    nodes: (doc.nodes ?? []) as MapDoc['nodes'],
    edges: (doc.edges ?? []) as MapDoc['edges'],
    pinned: doc.pinned ?? false,
    updatedAt: new Date().toISOString(),
  }))

  // One round trip for the whole batch, and all-or-nothing: a bulk import that
  // half-lands would leave the user hand-reconciling which maps made it.
  await sql.transaction(
    imported.map(
      (m) => sql`
        insert into maps (id, user_id, name, nodes, edges, pinned)
        values (${m.id}, ${userId}, ${m.name}, ${JSON.stringify(m.nodes)}::jsonb, ${JSON.stringify(m.edges)}::jsonb, ${m.pinned})
      `,
    ),
  )

  sendJson(res, 200, { maps: imported })
}
