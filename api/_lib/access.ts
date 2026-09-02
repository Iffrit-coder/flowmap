import { createHash, randomBytes } from 'node:crypto'
import { getUserId } from './auth.js'
import sql from './db.js'
import type { ApiRequest } from './http.js'

/** Ordered by authority. `owner` is implicit in the map row; the other two are
 * granted, either to an account or to whoever holds a link. */
export type Role = 'owner' | 'editor' | 'viewer'

export type Access = { role: Role; userId: string | null }

const SHARE_HEADER = 'x-share-token'

export function shareToken(req: ApiRequest): string | null {
  const raw = req.headers[SHARE_HEADER]
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length >= 20 && trimmed.length <= 200 ? trimmed : null
}

export function newLinkToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function canWrite(role: Role): boolean {
  return role === 'owner' || role === 'editor'
}

/** Resolves what the requester may do with one map, from any of the three ways
 * access can be held.
 *
 * Checked in order of authority, and it matters: someone who owns a map they
 * were also sent a view link for still edits it, rather than being demoted by
 * the weaker credential they happen to be carrying. */
export async function resolveAccess(req: ApiRequest, mapId: string): Promise<Access | null> {
  const userId = await getUserId(req)

  if (userId) {
    const owned = await sql`select 1 from maps where id = ${mapId} and user_id = ${userId}`
    if (owned.length > 0) return { role: 'owner', userId }

    const granted = await sql`select role from map_grants where map_id = ${mapId} and user_id = ${userId}`
    if (granted.length > 0) return { role: granted[0].role as Role, userId }
  }

  const token = shareToken(req)
  if (token) {
    // Scoped to this map: a link for one map resolves to nothing on any other.
    const rows = await sql`
      select role from map_links
      where token_hash = ${hashToken(token)}
        and map_id = ${mapId}
        and revoked_at is null
        and (expires_at is null or expires_at > now())
    `
    if (rows.length > 0) {
      await sql`update map_links set last_used_at = now() where token_hash = ${hashToken(token)}`
      return { role: rows[0].role as Role, userId }
    }
  }

  return null
}

/** Resolves a link token on its own, for the case where the holder has a token
 * and no idea which map it opens. */
export async function resolveLink(token: string): Promise<{ mapId: string; role: Role } | null> {
  const rows = await sql`
    select map_id, role from map_links
    where token_hash = ${hashToken(token)}
      and revoked_at is null
      and (expires_at is null or expires_at > now())
  `
  if (rows.length === 0) return null
  await sql`update map_links set last_used_at = now() where token_hash = ${hashToken(token)}`
  return { mapId: rows[0].map_id as string, role: rows[0].role as Role }
}

/** Owning a map is the only way to manage who else can reach it, so that check
 * gets its own name rather than being spelled out at each call site. */
export async function isOwner(userId: string, mapId: string): Promise<boolean> {
  const rows = await sql`select 1 from maps where id = ${mapId} and user_id = ${userId}`
  return rows.length > 0
}
