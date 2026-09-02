import type { ServerResponse } from 'node:http'
import { sendJson } from '../_lib/http.js'
import type { ApiRequest, Handler } from '../_lib/http.js'
import grants from '../_handlers/shares/grants.js'
import links from '../_handlers/shares/links.js'

/** Same dispatcher shape as auth, for the same function-count reason. */
const ROUTES: Record<string, Handler> = { links, grants }

export default async function handler(req: ApiRequest, res: ServerResponse) {
  const route = ROUTES[req.query?.action ?? '']
  if (!route) return sendJson(res, 404, { error: 'not found' })
  await route(req, res)
}
