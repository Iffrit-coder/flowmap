import type { ServerResponse } from 'node:http'
import { resolveLink, shareToken } from './_lib/access.js'
import sql from './_lib/db.js'
import { sendJson, withErrors } from './_lib/http.js'
import type { ApiRequest } from './_lib/http.js'
import { toMapDoc } from './_lib/maps.js'
import { clientIp, hit } from './_lib/rateLimit.js'

/** Opens a map from a link token alone. Someone arriving from a shared URL has
 * the token and no idea which map it belongs to, so the token is the lookup key
 * here rather than an authorization check on a known id. */
export default withErrors('shared', async (req: ApiRequest, res: ServerResponse) => {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' })

  // Unauthenticated and guessable-by-brute-force in principle, so this is the
  // endpoint that most needs a ceiling. 32-byte tokens make guessing hopeless;
  // the limit is here so trying is also expensive.
  const throttle = await hit({ key: `shared:ip:${clientIp(req)}`, max: 300, windowSeconds: 3600 })
  if (throttle.limited) {
    res.setHeader('Retry-After', String(throttle.retryAfter))
    return sendJson(res, 429, { error: 'Too many requests. Try again later.' })
  }

  const token = shareToken(req)
  if (!token) return sendJson(res, 400, { error: 'missing share token' })

  const link = await resolveLink(token)
  if (!link) return sendJson(res, 404, { error: 'That share link is invalid, expired, or has been revoked.' })

  const rows = await sql`select id, name, nodes, edges, pinned, updated_at, version from maps where id = ${link.mapId}`
  if (rows.length === 0) return sendJson(res, 404, { error: 'That map no longer exists.' })

  // The owner's identity is deliberately not included: holding a link should
  // reveal the document, not who wrote it.
  sendJson(res, 200, { ...toMapDoc(rows[0]), role: link.role })
})
