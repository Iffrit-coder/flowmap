import type { ServerResponse } from 'node:http'
import { canWrite, resolveAccess } from '../_lib/access.js'
import sql from '../_lib/db.js'
import { readJson, sendJson, withErrors } from '../_lib/http.js'
import type { ApiRequest } from '../_lib/http.js'
import { toMapDoc } from '../_lib/maps.js'
import { clientIp, hit } from '../_lib/rateLimit.js'
import { InvalidMap, sanitizeMapInput } from '../../src/mapSchema.js'

export default withErrors('maps/[id]', async (req: ApiRequest, res: ServerResponse) => {
  const id = req.query?.id
  if (!id) return sendJson(res, 400, { error: 'missing id' })

  // A link holder can reach this without a session, so it is the one map
  // endpoint an unauthenticated stranger can call. Throttle by IP before doing
  // any lookup work.
  const throttle = await hit({ key: `map:ip:${clientIp(req)}`, max: 600, windowSeconds: 3600 })
  if (throttle.limited) {
    res.setHeader('Retry-After', String(throttle.retryAfter))
    return sendJson(res, 429, { error: 'Too many requests. Try again later.' })
  }

  const access = await resolveAccess(req, id)
  // Deliberately 404 rather than 403: telling an unauthorized caller that a map
  // exists is itself a disclosure, and map ids are guessable at 8 characters.
  if (!access) return sendJson(res, 404, { error: 'not found' })

  if (req.method === 'GET') {
    const rows = await sql`select id, name, nodes, edges, pinned, updated_at, version from maps where id = ${id}`
    if (rows.length === 0) return sendJson(res, 404, { error: 'not found' })
    return sendJson(res, 200, { ...toMapDoc(rows[0]), role: access.role })
  }

  if (req.method === 'PUT') {
    if (!canWrite(access.role)) return sendJson(res, 403, { error: 'You have view-only access to this map.' })

    const body = (await readJson<Record<string, unknown>>(req)) ?? {}

    // A PUT is a partial update — pin/rename send one field — so each field is
    // sanitized only when present, and the graph is validated as a unit because
    // an edge can only be checked against the nodes it ships with.
    let name: string | null = null
    let graph: { nodes: unknown; edges: unknown } | null = null
    try {
      if (body.name !== undefined) {
        name = sanitizeMapInput({ name: body.name, nodes: [], edges: [] }).name
      }
      if (body.nodes !== undefined || body.edges !== undefined) {
        if (body.nodes === undefined || body.edges === undefined) {
          return sendJson(res, 400, { error: 'nodes and edges must be sent together' })
        }
        const clean = sanitizeMapInput({ name: 'x', nodes: body.nodes, edges: body.edges })
        graph = { nodes: clean.nodes, edges: clean.edges }
      }
    } catch (err) {
      if (err instanceof InvalidMap) return sendJson(res, 400, { error: err.message })
      throw err
    }

    // Pinning is per-owner dashboard state, not part of the document, so a
    // shared editor pinning their copy must not reorder the owner's dashboard.
    const pinned = typeof body.pinned === 'boolean' && access.role === 'owner' ? body.pinned : null

    // Optimistic concurrency. `rev` absent means a caller that predates this
    // check; those still write unconditionally rather than failing outright.
    const expected = typeof body.rev === 'number' ? body.rev : null

    const updated = await sql`
      update maps set
        name = coalesce(${name}, name),
        nodes = coalesce(${graph ? JSON.stringify(graph.nodes) : null}::jsonb, nodes),
        edges = coalesce(${graph ? JSON.stringify(graph.edges) : null}::jsonb, edges),
        pinned = coalesce(${pinned}, pinned),
        version = version + 1,
        updated_at = now()
      where id = ${id}
        and (${expected}::int is null or version = ${expected})
      returning id, name, nodes, edges, pinned, updated_at, version
    `

    if (updated.length === 0) {
      // Someone else saved in between. Hand back their version so the client can
      // show what it would have overwritten instead of guessing.
      const current = await sql`select id, name, nodes, edges, pinned, updated_at, version from maps where id = ${id}`
      if (current.length === 0) return sendJson(res, 404, { error: 'not found' })
      return sendJson(res, 409, {
        error: 'This map changed somewhere else while you were editing.',
        current: { ...toMapDoc(current[0]), role: access.role },
      })
    }

    return sendJson(res, 200, { ...toMapDoc(updated[0]), role: access.role })
  }

  if (req.method === 'DELETE') {
    // Owner only. An editor must not be able to destroy someone else's map, and
    // the cascade would take every share with it.
    if (access.role !== 'owner') return sendJson(res, 403, { error: 'Only the owner can delete this map.' })
    await sql`delete from maps where id = ${id}`
    return sendJson(res, 200, { ok: true })
  }

  sendJson(res, 405, { error: 'method not allowed' })
})
