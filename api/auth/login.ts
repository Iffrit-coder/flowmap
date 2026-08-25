import type { ServerResponse } from 'node:http'
import { createSession, verifyPassword } from '../_lib/auth'
import sql from '../_lib/db'
import { readJson, sendJson } from '../_lib/http'
import type { ApiRequest } from '../_lib/http'

export default async function handler(req: ApiRequest, res: ServerResponse) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })

  const { email, password } = await readJson<{ email?: string; password?: string }>(req)
  const normalizedEmail = (email ?? '').trim().toLowerCase()

  const rows = await sql`select id, password_hash from users where email = ${normalizedEmail}`
  if (rows.length === 0 || !(await verifyPassword(password ?? '', rows[0].password_hash as string))) {
    return sendJson(res, 401, { error: 'Incorrect email or password.' })
  }

  await createSession(rows[0].id as string, res)
  sendJson(res, 200, { email: normalizedEmail })
}
