import type { ServerResponse } from 'node:http'
import sql from '../../_lib/db.js'
import { readJson, sendJson, withErrors } from '../../_lib/http.js'
import type { ApiRequest } from '../../_lib/http.js'
import { clientIp, hit } from '../../_lib/rateLimit.js'
import { consume } from '../../_lib/tokens.js'

export default withErrors('auth/verify', async (req: ApiRequest, res: ServerResponse) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })

  const ip = await hit({ key: `verify:ip:${clientIp(req)}`, max: 30, windowSeconds: 60 * 60 })
  if (ip.limited) {
    res.setHeader('Retry-After', String(ip.retryAfter))
    return sendJson(res, 429, { error: 'Too many attempts. Try again later.' })
  }

  const { token } = await readJson<{ token?: string }>(req)
  const userId = await consume(token ?? '', 'verify')
  if (!userId) {
    return sendJson(res, 400, { error: 'That confirmation link is invalid or has expired.' })
  }

  await sql`update users set email_verified_at = now() where id = ${userId} and email_verified_at is null`
  sendJson(res, 200, { ok: true })
})
