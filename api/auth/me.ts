import type { ServerResponse } from 'node:http'
import { getUserId } from '../_lib/auth.js'
import sql from '../_lib/db.js'
import { sendJson } from '../_lib/http.js'
import type { ApiRequest } from '../_lib/http.js'

export default async function handler(req: ApiRequest, res: ServerResponse) {
  const userId = await getUserId(req)
  if (!userId) return sendJson(res, 401, { error: 'not signed in' })

  const rows = await sql`select email from users where id = ${userId}`
  if (rows.length === 0) return sendJson(res, 401, { error: 'not signed in' })
  sendJson(res, 200, { email: rows[0].email })
}
