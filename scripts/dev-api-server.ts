import { config } from 'dotenv'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { URL } from 'node:url'
import type { ApiRequest } from '../api/_lib/http.js'

config({ path: '.env.local' })

type Handler = (req: ApiRequest, res: ServerResponse) => Promise<void> | void

/** Mirrors Vercel's file-based /api routing so the same handler modules run
 * identically in local dev and in production. */
async function resolveHandler(pathname: string): Promise<Handler | null> {
  // Mirrors the platform's file-based routing, dispatchers included — dev has to
  // exercise the same entry points as production or the two drift apart, which
  // is exactly how a working local build shipped a broken deployment before.
  if (/^\/api\/auth\/[^/]+$/.test(pathname)) return (await import('../api/auth/[action].js')).default
  if (/^\/api\/shares\/[^/]+$/.test(pathname)) return (await import('../api/shares/[action].js')).default
  if (pathname === '/api/shared') return (await import('../api/shared.js')).default
  if (pathname === '/api/maps') return (await import('../api/maps/index.js')).default
  if (pathname === '/api/maps/import') return (await import('../api/maps/import.js')).default
  if (/^\/api\/maps\/[^/]+$/.test(pathname)) return (await import('../api/maps/[id].js')).default
  return null
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const handler = await resolveHandler(url.pathname)
  if (!handler) {
    res.statusCode = 404
    res.end('not found')
    return
  }

  const query: Record<string, string> = Object.fromEntries(url.searchParams)
  // Dynamic segments, filled in the same way the platform fills them.
  if (/^\/api\/maps\/[^/]+$/.test(url.pathname) && url.pathname !== '/api/maps/import') {
    query.id = decodeURIComponent(url.pathname.slice('/api/maps/'.length))
  }
  const action = url.pathname.match(/^\/api\/(?:auth|shares)\/([^/]+)$/)
  if (action) query.action = decodeURIComponent(action[1])
  const apiReq = req as ApiRequest
  apiReq.query = query

  try {
    await handler(apiReq, res)
  } catch (err) {
    console.error(err)
    if (!res.headersSent) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'internal error' }))
    }
  }
})

const port = Number(process.env.API_PORT ?? 8787)
server.listen(port, () => {
  console.log(`flowmap api dev server on http://localhost:${port}`)
})
