import type { ServerResponse } from 'node:http'
import { getUserId } from '../_lib/auth.js'
import sql from '../_lib/db.js'
import { readJson, sendJson } from '../_lib/http.js'
import type { ApiRequest } from '../_lib/http.js'
import { toMapDoc } from '../_lib/maps.js'
import type { MapDoc } from '../../src/types.js'

export default async function handler(req: ApiRequest, res: ServerResponse) {
  const userId = await getUserId(req)
  if (!userId) return sendJson(res, 401, { error: 'not signed in' })

  const id = req.query?.id
  if (!id) return sendJson(res, 400, { error: 'missing id' })

  const existing = await sql`select id from maps where id = ${id} and user_id = ${userId}`
  if (existing.length === 0) return sendJson(res, 404, { error: 'not found' })

  if (req.method === 'PUT') {
    const body = await readJson<Partial<MapDoc>>(req)
    await sql`
      update maps set
        name = coalesce(${body.name ?? null}, name),
        nodes = coalesce(${body.nodes ? JSON.stringify(body.nodes) : null}::jsonb, nodes),
        edges = coalesce(${body.edges ? JSON.stringify(body.edges) : null}::jsonb, edges),
        pinned = coalesce(${body.pinned ?? null}, pinned),
        updated_at = now()
      where id = ${id} and user_id = ${userId}
    `
    const rows = await sql`select id, name, nodes, edges, pinned, updated_at from maps where id = ${id}`
    return sendJson(res, 200, toMapDoc(rows[0]))
  }

  if (req.method === 'DELETE') {
    await sql`delete from maps where id = ${id} and user_id = ${userId}`
    return sendJson(res, 200, { ok: true })
  }

  sendJson(res, 405, { error: 'method not allowed' })
}
