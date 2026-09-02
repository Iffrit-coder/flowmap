import type { ServerResponse } from 'node:http'
import sql from '../../_lib/db.js'
import { clearSessionCookie, readSessionToken, sendJson, withErrors } from '../../_lib/http.js'
import type { ApiRequest } from '../../_lib/http.js'

export default withErrors('auth/logout', async (req: ApiRequest, res: ServerResponse) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })

  const token = readSessionToken(req)
  if (token) await sql`delete from sessions where token = ${token}`
  clearSessionCookie(res)
  sendJson(res, 200, { ok: true })
})
