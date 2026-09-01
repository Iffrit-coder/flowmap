import type { IncomingMessage, ServerResponse } from 'node:http'
import { reportError } from './alert.js'

/** Vercel's Node runtime and our local dev server both attach `query`; some
 * bodies arrive pre-parsed (Vercel) and some don't (local dev), so both are
 * handled here rather than assumed. */
export type ApiRequest = IncomingMessage & { query?: Record<string, string>; body?: unknown }

export async function readJson<T = unknown>(req: ApiRequest): Promise<T> {
  if (req.body !== undefined) {
    return (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) as T
  }
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8')
  return (raw ? JSON.parse(raw) : {}) as T
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim())
  }
  return out
}

const COOKIE_NAME = 'flowmap_session'

export function setSessionCookie(res: ServerResponse, token: string, maxAgeSeconds: number): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`,
  )
}

export function clearSessionCookie(res: ServerResponse): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`)
}

export function readSessionToken(req: IncomingMessage): string | undefined {
  return parseCookies(req)[COOKIE_NAME]
}

export type Handler = (req: ApiRequest, res: ServerResponse) => Promise<void> | void

/** Wraps a handler so a thrown error becomes a logged, alerted, JSON 500.
 *
 * Without this the platform serves its own HTML error page, which the client
 * cannot parse and therefore reports as "the backend is missing" — the wrong
 * diagnosis for what is actually a crash in one handler. */
export function withErrors(context: string, handler: Handler): Handler {
  return async (req, res) => {
    try {
      await handler(req, res)
    } catch (err) {
      await reportError(context, err, req)
      if (!res.headersSent) sendJson(res, 500, { error: 'Something went wrong on our end.' })
    }
  }
}
