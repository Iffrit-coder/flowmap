import type { ServerResponse } from 'node:http'
import { getUserId } from '../../_lib/auth.js'
import { hashToken, isOwner, newLinkToken } from '../../_lib/access.js'
import sql from '../../_lib/db.js'
import { readJson, sendJson, withErrors } from '../../_lib/http.js'
import type { ApiRequest } from '../../_lib/http.js'

const MAX_LINKS_PER_MAP = 20

/** The raw token is returned exactly once, at creation. After that only its
 * hash exists, so the list view can describe a link but never re-show it —
 * the same reason a password manager can't tell you an old password. */
export default withErrors('shares/links', async (req: ApiRequest, res: ServerResponse) => {
  const userId = await getUserId(req)
  if (!userId) return sendJson(res, 401, { error: 'not signed in' })

  if (req.method === 'GET') {
    const mapId = req.query?.mapId
    if (!mapId) return sendJson(res, 400, { error: 'missing mapId' })
    if (!(await isOwner(userId, mapId))) return sendJson(res, 404, { error: 'not found' })

    const rows = await sql`
      select token_hash, role, label, created_at, expires_at, revoked_at, last_used_at
        from map_links
       where map_id = ${mapId} and revoked_at is null
       order by created_at desc
    `
    return sendJson(res, 200, {
      links: rows.map((r) => ({
        // A short prefix of the hash is enough to tell two links apart in the
        // UI without being usable as a credential.
        id: (r.token_hash as string).slice(0, 16),
        role: r.role,
        label: r.label,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        lastUsedAt: r.last_used_at,
      })),
    })
  }

  if (req.method === 'POST') {
    const body = await readJson<{ mapId?: string; role?: string; label?: string; expiresInDays?: number }>(req)
    const mapId = (body.mapId ?? '').trim()
    if (!mapId) return sendJson(res, 400, { error: 'missing mapId' })
    if (!(await isOwner(userId, mapId))) return sendJson(res, 404, { error: 'not found' })

    const role = body.role === 'editor' ? 'editor' : 'viewer'
    const label = typeof body.label === 'string' ? body.label.slice(0, 120) : null

    const live = await sql`select count(*)::int as n from map_links where map_id = ${mapId} and revoked_at is null`
    if (Number(live[0].n) >= MAX_LINKS_PER_MAP) {
      return sendJson(res, 400, { error: `A map can have at most ${MAX_LINKS_PER_MAP} active links. Revoke one first.` })
    }

    const days = typeof body.expiresInDays === 'number' && body.expiresInDays > 0 ? Math.min(body.expiresInDays, 3650) : null
    const expiresAt = days === null ? null : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

    const token = newLinkToken()
    await sql`
      insert into map_links (token_hash, map_id, role, created_by, label, expires_at)
      values (${hashToken(token)}, ${mapId}, ${role}, ${userId}, ${label}, ${expiresAt})
    `
    return sendJson(res, 200, { token, id: hashToken(token).slice(0, 16), role, label, expiresAt })
  }

  if (req.method === 'DELETE') {
    const body = await readJson<{ mapId?: string; id?: string }>(req)
    const mapId = (body.mapId ?? '').trim()
    const id = (body.id ?? '').trim()
    if (!mapId || !id) return sendJson(res, 400, { error: 'missing mapId or id' })
    if (!(await isOwner(userId, mapId))) return sendJson(res, 404, { error: 'not found' })

    // Matched on the hash prefix the list view handed out, so revoking never
    // requires the raw token — which the owner no longer has either.
    const revoked = await sql`
      update map_links set revoked_at = now()
       where map_id = ${mapId} and left(token_hash, 16) = ${id} and revoked_at is null
      returning token_hash
    `
    if (revoked.length === 0) return sendJson(res, 404, { error: 'not found' })
    return sendJson(res, 200, { ok: true })
  }

  sendJson(res, 405, { error: 'method not allowed' })
})
