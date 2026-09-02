import type { ServerResponse } from 'node:http'
import { getUserId } from '../../_lib/auth.js'
import { isOwner } from '../../_lib/access.js'
import sql from '../../_lib/db.js'
import { readJson, sendJson, withErrors } from '../../_lib/http.js'
import type { ApiRequest } from '../../_lib/http.js'

export default withErrors('shares/grants', async (req: ApiRequest, res: ServerResponse) => {
  const userId = await getUserId(req)
  if (!userId) return sendJson(res, 401, { error: 'not signed in' })

  if (req.method === 'GET') {
    const mapId = req.query?.mapId
    if (!mapId) return sendJson(res, 400, { error: 'missing mapId' })
    if (!(await isOwner(userId, mapId))) return sendJson(res, 404, { error: 'not found' })

    const rows = await sql`
      select u.email, g.role, g.created_at
        from map_grants g join users u on u.id = g.user_id
       where g.map_id = ${mapId}
       order by g.created_at
    `
    return sendJson(res, 200, { grants: rows.map((r) => ({ email: r.email, role: r.role, createdAt: r.created_at })) })
  }

  if (req.method === 'POST') {
    const body = await readJson<{ mapId?: string; email?: string; role?: string }>(req)
    const mapId = (body.mapId ?? '').trim()
    const email = (body.email ?? '').trim().toLowerCase()
    if (!mapId || !email) return sendJson(res, 400, { error: 'missing mapId or email' })
    if (!(await isOwner(userId, mapId))) return sendJson(res, 404, { error: 'not found' })

    const target = await sql`select id from users where email = ${email}`
    if (target.length === 0) {
      // This does disclose whether an address has an account. Removing the tell
      // needs pending invites delivered by email, which needs a sending domain.
      // Until then it is stated plainly rather than hidden behind a fake success.
      return sendJson(res, 404, {
        error: 'No flowmap account uses that address. They need to sign up first, or send them a share link instead.',
      })
    }
    if (target[0].id === userId) return sendJson(res, 400, { error: 'You already own this map.' })

    const role = body.role === 'editor' ? 'editor' : 'viewer'
    await sql`
      insert into map_grants (map_id, user_id, role, granted_by)
      values (${mapId}, ${target[0].id}, ${role}, ${userId})
      on conflict (map_id, user_id) do update set role = excluded.role
    `
    return sendJson(res, 200, { email, role })
  }

  if (req.method === 'DELETE') {
    const body = await readJson<{ mapId?: string; email?: string }>(req)
    const mapId = (body.mapId ?? '').trim()
    const email = (body.email ?? '').trim().toLowerCase()
    if (!mapId || !email) return sendJson(res, 400, { error: 'missing mapId or email' })
    if (!(await isOwner(userId, mapId))) return sendJson(res, 404, { error: 'not found' })

    await sql`
      delete from map_grants
       where map_id = ${mapId}
         and user_id = (select id from users where email = ${email})
    `
    return sendJson(res, 200, { ok: true })
  }

  sendJson(res, 405, { error: 'method not allowed' })
})
