import type { ServerResponse } from 'node:http'
import sql from '../_lib/db.js'
import { appUrl, deliver, resetEmail } from '../_lib/email.js'
import { readJson, sendJson, withErrors } from '../_lib/http.js'
import type { ApiRequest } from '../_lib/http.js'
import { clientIp, hit } from '../_lib/rateLimit.js'
import { issue, pruneExpired } from '../_lib/tokens.js'

const WINDOW = 60 * 60
const PER_EMAIL = 3
const PER_IP = 10

/** The same answer regardless of what happened — address unknown, mail
 * misconfigured, send failed. Anything that varied here would turn this
 * endpoint into the address oracle that signup already is. */
const ALWAYS = { ok: true, message: 'If that address has an account, a reset link is on its way.' }

export default withErrors('auth/forgot', async (req: ApiRequest, res: ServerResponse) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })

  const { email } = await readJson<{ email?: string }>(req)
  const normalizedEmail = (email ?? '').trim().toLowerCase()

  const ip = await hit({ key: `forgot:ip:${clientIp(req)}`, max: PER_IP, windowSeconds: WINDOW })
  const perEmail = await hit({ key: `forgot:email:${normalizedEmail}`, max: PER_EMAIL, windowSeconds: WINDOW })
  if (ip.limited || perEmail.limited) {
    // Rate limiting is the one thing worth admitting to, since silently
    // dropping the request would leave someone waiting for mail that never
    // comes. It reveals nothing: the cap applies to unknown addresses too.
    const retryAfter = Math.max(ip.retryAfter, perEmail.retryAfter)
    res.setHeader('Retry-After', String(retryAfter))
    return sendJson(res, 429, {
      error: `Too many reset requests. Try again in ${Math.ceil(retryAfter / 60)} minutes.`,
    })
  }

  const rows = await sql`select id from users where email = ${normalizedEmail}`
  if (rows.length > 0) {
    const token = await issue(rows[0].id as string, 'reset')
    const link = `${appUrl()}/#/reset/${token}`
    await deliver({ to: normalizedEmail, ...resetEmail(link) })
    await pruneExpired()
  }

  sendJson(res, 200, ALWAYS)
})
