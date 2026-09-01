import type { ServerResponse } from 'node:http'
import { getUserId } from '../_lib/auth.js'
import sql from '../_lib/db.js'
import { readJson, sendJson, withErrors } from '../_lib/http.js'
import type { ApiRequest } from '../_lib/http.js'
import { toMapDoc } from '../_lib/maps.js'
import { InvalidMap, sanitizeMapInput } from '../../src/mapSchema.js'

export default withErrors('maps/[id]', async (req: ApiRequest, res: ServerResponse) => {
  const userId = await getUserId(req)
  if (!userId) return sendJson(res, 401, { error: 'not signed in' })

  const id = req.query?.id
  if (!id) return sendJson(res, 400, { error: 'missing id' })

  const existing = await sql`select id from maps where id = ${id} and user_id = ${userId}`
  if (existing.length === 0) return sendJson(res, 404, { error: 'not found' })

  if (req.method === 'PUT') {
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

    const pinned = typeof body.pinned === 'boolean' ? body.pinned : null

    await sql`
      update maps set
        name = coalesce(${name}, name),
        nodes = coalesce(${graph ? JSON.stringify(graph.nodes) : null}::jsonb, nodes),
        edges = coalesce(${graph ? JSON.stringify(graph.edges) : null}::jsonb, edges),
        pinned = coalesce(${pinned}, pinned),
        updated_at = now()
      where id = ${id} and user_id = ${userId}
    `
    const rows = await sql`
      select id, name, nodes, edges, pinned, updated_at from maps
      where id = ${id} and user_id = ${userId}
    `
    return sendJson(res, 200, toMapDoc(rows[0]))
  }

  if (req.method === 'DELETE') {
    await sql`delete from maps where id = ${id} and user_id = ${userId}`
    return sendJson(res, 200, { ok: true })
  }

  sendJson(res, 405, { error: 'method not allowed' })
})
