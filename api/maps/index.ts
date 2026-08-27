import type { ServerResponse } from 'node:http'
import { nanoid } from 'nanoid'
import { getUserId } from '../_lib/auth.js'
import sql from '../_lib/db.js'
import { readJson, sendJson } from '../_lib/http.js'
import type { ApiRequest } from '../_lib/http.js'
import { toMapDoc } from '../_lib/maps.js'
import type { MapDoc } from '../../src/types.js'

export default async function handler(req: ApiRequest, res: ServerResponse) {
  const userId = await getUserId(req)
  if (!userId) return sendJson(res, 401, { error: 'not signed in' })

  if (req.method === 'GET') {
    const rows = await sql`
      select id, name, nodes, edges, pinned, updated_at from maps
      where user_id = ${userId}
      order by updated_at desc
    `
    return sendJson(res, 200, { maps: rows.map(toMapDoc) })
  }

  if (req.method === 'POST') {
    const body = await readJson<Partial<MapDoc>>(req)
    const id = nanoid(8)
    const name = body.name ?? 'Untitled process'
    const nodes = body.nodes ?? []
    const edges = body.edges ?? []
    await sql`
      insert into maps (id, user_id, name, nodes, edges)
      values (${id}, ${userId}, ${name}, ${JSON.stringify(nodes)}::jsonb, ${JSON.stringify(edges)}::jsonb)
    `
    const rows = await sql`select id, name, nodes, edges, pinned, updated_at from maps where id = ${id}`
    return sendJson(res, 200, toMapDoc(rows[0]))
  }

  sendJson(res, 405, { error: 'method not allowed' })
}
