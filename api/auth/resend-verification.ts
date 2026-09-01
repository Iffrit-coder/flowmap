import type { ServerResponse } from 'node:http'
import { getUserId } from '../_lib/auth.js'
import sql from '../_lib/db.js'
import { appUrl, deliver, verifyEmail } from '../_lib/email.js'
import { sendJson, withErrors } from '../_lib/http.js'
import type { ApiRequest } from '../_lib/http.js'
import { clientIp, hit } from '../_lib/rateLimit.js'
import { issue } from '../_lib/tokens.js'

export default withErrors('auth/resend-verification', async (req: ApiRequest, res: ServerResponse) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })

  // Requires a session, so this is keyed by user rather than by address — and
  // it cannot be used to mail someone who never signed up.
  const userId = await getUserId(req)
  if (!userId) return sendJson(res, 401, { error: 'not signed in' })

  const limit = await hit({ key: `resend:user:${userId}`, max: 3, windowSeconds: 60 * 60 })
  const byIp = await hit({ key: `resend:ip:${clientIp(req)}`, max: 10, windowSeconds: 60 * 60 })
  if (limit.limited || byIp.limited) {
    const retryAfter = Math.max(limit.retryAfter, byIp.retryAfter)
    res.setHeader('Retry-After', String(retryAfter))
    return sendJson(res, 429, { error: `Try again in ${Math.ceil(retryAfter / 60)} minutes.` })
  }

  const rows = await sql`select email, email_verified_at from users where id = ${userId}`
  if (rows.length === 0) return sendJson(res, 401, { error: 'not signed in' })
  if (rows[0].email_verified_at) return sendJson(res, 200, { ok: true, alreadyVerified: true })

  const token = await issue(userId, 'verify')
  await deliver({ to: rows[0].email as string, ...verifyEmail(`${appUrl()}/#/verify/${token}`) })
  sendJson(res, 200, { ok: true })
})
