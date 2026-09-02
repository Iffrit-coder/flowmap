import type { ServerResponse } from 'node:http'
import { sendJson } from '../_lib/http.js'
import type { ApiRequest, Handler } from '../_lib/http.js'
import forgot from '../_handlers/auth/forgot.js'
import login from '../_handlers/auth/login.js'
import logout from '../_handlers/auth/logout.js'
import me from '../_handlers/auth/me.js'
import resendVerification from '../_handlers/auth/resend-verification.js'
import reset from '../_handlers/auth/reset.js'
import signup from '../_handlers/auth/signup.js'
import verify from '../_handlers/auth/verify.js'

/** One function serving every auth route.
 *
 * The platform's Hobby plan caps a deployment at 12 serverless functions, and
 * one file per endpoint blew past it. Collapsing to a dispatcher keeps the URLs
 * exactly as they were — `/api/auth/login` still resolves here with
 * `action = 'login'` — while the handlers stay one per file, under `_handlers`
 * so the platform doesn't route to them directly. */
const ROUTES: Record<string, Handler> = {
  login,
  logout,
  signup,
  me,
  forgot,
  reset,
  verify,
  'resend-verification': resendVerification,
}

export default async function handler(req: ApiRequest, res: ServerResponse) {
  const route = ROUTES[req.query?.action ?? '']
  if (!route) return sendJson(res, 404, { error: 'not found' })
  await route(req, res)
}
