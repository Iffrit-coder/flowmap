import type { ServerResponse } from 'node:http'
import { nanoid } from 'nanoid'
import { getUserId } from '../_lib/auth.js'
import sql from '../_lib/db.js'
import { readJson, sendJson, withErrors } from '../_lib/http.js'
import type { ApiRequest } from '../_lib/http.js'
import { toMapDoc } from '../_lib/maps.js'
import { InvalidMap, sanitizeMapInput } from '../../src/mapSchema.js'

export default withErrors('maps/index', async (req: ApiRequest, res: ServerResponse) => {
  const userId = await getUserId(req)
  if (!userId) return sendJson(res, 401, { error: 'not signed in' })

  if (req.method === 'GET') {
    // Owned and shared arrive as one list with a role on each, so the dashboard
    // can group them without a second round trip. `owner_email` is null for
    // maps you own — the dashboard only needs it to say whose map a shared one is.
    const rows = await sql`
      select m.id, m.name, m.nodes, m.edges, m.pinned, m.updated_at, m.version,
             'owner' as role, null as owner_email
        from maps m
       where m.user_id = ${userId}
      union all
      select m.id, m.name, m.nodes, m.edges, m.pinned, m.updated_at, m.version,
             g.role, u.email as owner_email
        from map_grants g
        join maps m on m.id = g.map_id
        join users u on u.id = m.user_id
       where g.user_id = ${userId}
       order by updated_at desc
    `
    return sendJson(res, 200, {
      maps: rows.map((row) => ({
        ...toMapDoc(row),
        role: row.role,
        ownerEmail: row.owner_email,
      })),
    })
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
    const rows = await sql`select id, name, nodes, edges, pinned, updated_at, version from maps where id = ${id}`
    return sendJson(res, 200, { ...toMapDoc(rows[0]), role: 'owner' })
  }

  sendJson(res, 405, { error: 'method not allowed' })
})
