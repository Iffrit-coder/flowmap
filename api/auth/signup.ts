import type { ServerResponse } from 'node:http'
import { nanoid } from 'nanoid'
import { createSession, hashPassword } from '../_lib/auth.js'
import sql from '../_lib/db.js'
import { readJson, sendJson, withErrors } from '../_lib/http.js'
import type { ApiRequest } from '../_lib/http.js'
import { checkPassword } from '../_lib/password.js'
import { clientIp, hit } from '../_lib/rateLimit.js'
import { appUrl, deliver, verifyEmail } from '../_lib/email.js'
import { issue } from '../_lib/tokens.js'
import { demoDoc } from '../../src/demoMap.js'

const WINDOW = 60 * 60
const PER_IP = 5

export default withErrors('auth/signup', async (req: ApiRequest, res: ServerResponse) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })

  const { email, password } = await readJson<{ email?: string; password?: string }>(req)
  const normalizedEmail = (email ?? '').trim().toLowerCase()

  // Also the brake on address-harvesting: this endpoint still answers "that
  // email is taken", which is only tolerable while guesses are this expensive.
  // Removing the tell entirely needs email verification, which doesn't exist yet.
  const ip = await hit({ key: `signup:ip:${clientIp(req)}`, max: PER_IP, windowSeconds: WINDOW })
  if (ip.limited) {
    res.setHeader('Retry-After', String(ip.retryAfter))
    return sendJson(res, 429, {
      error: `Too many sign-up attempts. Try again in ${Math.ceil(ip.retryAfter / 60)} minutes.`,
    })
  }

  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
    return sendJson(res, 400, { error: 'Enter a valid email.' })
  }

  const problem = await checkPassword(password ?? '', normalizedEmail)
  if (problem) return sendJson(res, 400, { error: problem })

  const existing = await sql`select id from users where email = ${normalizedEmail}`
  if (existing.length > 0) {
    return sendJson(res, 409, { error: 'An account with that email already exists.' })
  }

  const id = nanoid(12)
  const passwordHash = await hashPassword(password as string)
  await sql`insert into users (id, email, password_hash) values (${id}, ${normalizedEmail}, ${passwordHash})`

  const demo = demoDoc()
  await sql`
    insert into maps (id, user_id, name, nodes, edges, pinned)
    values (${demo.id}, ${id}, ${demo.name}, ${JSON.stringify(demo.nodes)}::jsonb, ${JSON.stringify(demo.edges)}::jsonb, false)
  `

  // Awaited, not fired and forgotten: the runtime may freeze this function the
  // moment the response ends, which would cancel an in-flight send.
  const token = await issue(id, 'verify')
  await deliver({ to: normalizedEmail, ...verifyEmail(`${appUrl()}/#/verify/${token}`) })

  await createSession(id, res)
  sendJson(res, 200, { email: normalizedEmail, emailVerified: false })
})
