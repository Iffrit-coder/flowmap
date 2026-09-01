import type { ServerResponse } from 'node:http'
import { nanoid } from 'nanoid'
import { getUserId } from '../_lib/auth.js'
import sql from '../_lib/db.js'
import { readJson, sendJson, withErrors } from '../_lib/http.js'
import type { ApiRequest } from '../_lib/http.js'
import { InvalidMap, sanitizeMapInput } from '../../src/mapSchema.js'
import type { MapDoc } from '../../src/types.js'

/** The client chunks at 25; this is the server's own ceiling, since the client
 * is not the thing being trusted here. */
const MAX_PER_REQUEST = 50

export default withErrors('maps/import', async (req: ApiRequest, res: ServerResponse) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })

  const userId = await getUserId(req)
  if (!userId) return sendJson(res, 401, { error: 'not signed in' })

  const body = await readJson<{ maps?: unknown[] }>(req)
  const incoming = Array.isArray(body.maps) ? body.maps : []
  if (incoming.length === 0) return sendJson(res, 200, { maps: [] })
  if (incoming.length > MAX_PER_REQUEST) {
    return sendJson(res, 400, { error: `Import at most ${MAX_PER_REQUEST} maps per request.` })
  }

  // Fresh ids on the way in, so re-importing a file — or importing someone
  // else's export — never collides with what's already on the dashboard.
  let imported: MapDoc[]
  try {
    imported = incoming.map((doc, i) => {
      try {
        const clean = sanitizeMapInput(doc)
        return { version: 1, id: nanoid(8), ...clean, updatedAt: new Date().toISOString() }
      } catch (err) {
        // Name the offending map, since a batch import otherwise gives the user
        // no way to tell which of fifty files was the bad one.
        if (err instanceof InvalidMap) throw new InvalidMap(`map ${i + 1}: ${err.message}`)
        throw err
      }
    })
  } catch (err) {
    if (err instanceof InvalidMap) return sendJson(res, 400, { error: err.message })
    throw err
  }

  // One round trip for the whole batch, and all-or-nothing: a bulk import that
  // half-lands would leave the user hand-reconciling which maps made it.
  await sql.transaction(
    imported.map(
      (m) => sql`
        insert into maps (id, user_id, name, nodes, edges, pinned)
        values (${m.id}, ${userId}, ${m.name}, ${JSON.stringify(m.nodes)}::jsonb, ${JSON.stringify(m.edges)}::jsonb, ${m.pinned})
      `,
    ),
  )

  sendJson(res, 200, { maps: imported })
})
