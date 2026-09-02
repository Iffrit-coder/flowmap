import type { ServerResponse } from 'node:http'
import { hashPassword } from '../../_lib/auth.js'
import sql from '../../_lib/db.js'
import { readJson, sendJson, withErrors } from '../../_lib/http.js'
import type { ApiRequest } from '../../_lib/http.js'
import { checkPassword } from '../../_lib/password.js'
import { clientIp, hit, reset as clearLimit } from '../../_lib/rateLimit.js'
import { consume } from '../../_lib/tokens.js'

const WINDOW = 60 * 60
const PER_IP = 20

export default withErrors('auth/reset', async (req: ApiRequest, res: ServerResponse) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })

  // Guessing tokens is infeasible at 32 bytes, but an unthrottled endpoint that
  // hashes a password on every call is still a free CPU sink.
  const ip = await hit({ key: `reset:ip:${clientIp(req)}`, max: PER_IP, windowSeconds: WINDOW })
  if (ip.limited) {
    res.setHeader('Retry-After', String(ip.retryAfter))
    return sendJson(res, 429, { error: 'Too many attempts. Try again later.' })
  }

  const { token, password } = await readJson<{ token?: string; password?: string }>(req)

  const userId = await consume(token ?? '', 'reset')
  if (!userId) {
    return sendJson(res, 400, { error: 'That reset link is invalid or has expired. Request a new one.' })
  }

  const rows = await sql`select email from users where id = ${userId}`
  const email = (rows[0]?.email as string | undefined) ?? ''

  const problem = await checkPassword(password ?? '', email)
  if (problem) {
    // The token is already spent, so say so rather than letting them retype into
    // a link that no longer works.
    return sendJson(res, 400, { error: `${problem} Request a new reset link and try again.` })
  }

  await sql`update users set password_hash = ${await hashPassword(password as string)} where id = ${userId}`

  // Whoever prompted the reset may be holding a stolen session. Resetting the
  // password has to end every session, not just add a new way in. The user is
  // signed out everywhere and signs in fresh.
  await sql`delete from sessions where user_id = ${userId}`
  if (email) await clearLimit(`login:email:${email}`)

  sendJson(res, 200, { ok: true })
})
