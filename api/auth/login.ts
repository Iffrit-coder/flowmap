import type { ServerResponse } from 'node:http'
import { createSession, verifyPassword } from '../_lib/auth.js'
import sql from '../_lib/db.js'
import { readJson, sendJson, withErrors } from '../_lib/http.js'
import type { ApiRequest } from '../_lib/http.js'
import { clientIp, hit, reset } from '../_lib/rateLimit.js'

const WINDOW = 15 * 60
// Per-email is the account-takeover defence; per-IP catches the same attacker
// spraying one password across many accounts, which per-email would never see.
const PER_EMAIL = 10
const PER_IP = 30

/** A scrypt verification against a throwaway hash, so a login for an address
 * with no account costs the same as one for an address with an account.
 * Without it, response time alone reveals which emails are registered. */
const DECOY_HASH =
  '00000000000000000000000000000000:' +
  '0'.repeat(128)

export default withErrors('auth/login', async (req: ApiRequest, res: ServerResponse) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })

  const { email, password } = await readJson<{ email?: string; password?: string }>(req)
  const normalizedEmail = (email ?? '').trim().toLowerCase()
  const emailKey = `login:email:${normalizedEmail}`

  const ip = await hit({ key: `login:ip:${clientIp(req)}`, max: PER_IP, windowSeconds: WINDOW })
  const perEmail = await hit({ key: emailKey, max: PER_EMAIL, windowSeconds: WINDOW })
  if (ip.limited || perEmail.limited) {
    const retryAfter = Math.max(ip.retryAfter, perEmail.retryAfter)
    res.setHeader('Retry-After', String(retryAfter))
    return sendJson(res, 429, {
      error: `Too many sign-in attempts. Try again in ${Math.ceil(retryAfter / 60)} minutes.`,
    })
  }

  const rows = await sql`select id, password_hash, email_verified_at from users where email = ${normalizedEmail}`
  const stored = (rows[0]?.password_hash as string | undefined) ?? DECOY_HASH
  const ok = await verifyPassword(password ?? '', stored)

  if (rows.length === 0 || !ok) {
    return sendJson(res, 401, { error: 'Incorrect email or password.' })
  }

  // Off by default. Turning it on before email actually sends would lock every
  // account out, so it is opt-in once RESEND_API_KEY is set and confirmed working.
  if (process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === 'true' && !rows[0].email_verified_at) {
    return sendJson(res, 403, {
      error: 'Confirm your email address before signing in. Check your inbox for the link.',
    })
  }

  await reset(emailKey)
  await createSession(rows[0].id as string, res)
  sendJson(res, 200, { email: normalizedEmail, emailVerified: rows[0].email_verified_at !== null })
})
