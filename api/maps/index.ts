import type { ServerResponse } from 'node:http'
import { nanoid } from 'nanoid'
import { getUserId } from '../_lib/auth.js'
import sql from '../_lib/db.js'
import { readJson, sendJson } from '../_lib/http.js'
import type { ApiRequest } from '../_lib/http.js'
import { toMapDoc } from '../_lib/maps.js'
import { InvalidMap, sanitizeMapInput } from '../../src/mapSchema.js'

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
    const body = await readJson<unknown>(req)
    let clean
    try {
      clean = sanitizeMapInput(body ?? {})
    } catch (err) {
      if (err instanceof InvalidMap) return sendJson(res, 400, { error: err.message })
      throw err
    }
    const id = nanoid(8)
    await sql`
      insert into maps (id, user_id, name, nodes, edges)
      values (${id}, ${userId}, ${clean.name}, ${JSON.stringify(clean.nodes)}::jsonb, ${JSON.stringify(clean.edges)}::jsonb)
    `
    const rows = await sql`select id, name, nodes, edges, pinned, updated_at from maps where id = ${id}`
    return sendJson(res, 200, toMapDoc(rows[0]))
  }

  sendJson(res, 405, { error: 'method not allowed' })
}
