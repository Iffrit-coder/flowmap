import { nanoid } from 'nanoid'
import { createSession, hashPassword } from '../_lib/auth.js'
import sql from '../_lib/db.js'
import { readJson, sendJson } from '../_lib/http.js'
import type { ApiRequest } from '../_lib/http.js'
import { demoDoc } from '../../src/demoMap.js'
import type { ServerResponse } from 'node:http'

export default async function handler(req: ApiRequest, res: ServerResponse) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })

  const { email, password } = await readJson<{ email?: string; password?: string }>(req)
  const normalizedEmail = (email ?? '').trim().toLowerCase()
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return sendJson(res, 400, { error: 'Enter a valid email.' })
  }
  if (!password || password.length < 8) {
    return sendJson(res, 400, { error: 'Password must be at least 8 characters.' })
  }

  const existing = await sql`select id from users where email = ${normalizedEmail}`
  if (existing.length > 0) {
    return sendJson(res, 409, { error: 'An account with that email already exists.' })
  }

  const id = nanoid(12)
  const passwordHash = await hashPassword(password)
  await sql`insert into users (id, email, password_hash) values (${id}, ${normalizedEmail}, ${passwordHash})`

  const demo = demoDoc()
  await sql`
    insert into maps (id, user_id, name, nodes, edges, pinned)
    values (${demo.id}, ${id}, ${demo.name}, ${JSON.stringify(demo.nodes)}::jsonb, ${JSON.stringify(demo.edges)}::jsonb, false)
  `

  await createSession(id, res)
  sendJson(res, 200, { email: normalizedEmail })
}
