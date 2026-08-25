import type { ServerResponse } from 'node:http'
import sql from '../_lib/db'
import { clearSessionCookie, readSessionToken, sendJson } from '../_lib/http'
import type { ApiRequest } from '../_lib/http'

export default async function handler(req: ApiRequest, res: ServerResponse) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })

  const token = readSessionToken(req)
  if (token) await sql`delete from sessions where token = ${token}`
  clearSessionCookie(res)
  sendJson(res, 200, { ok: true })
}
