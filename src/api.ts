import type { MapDoc, MapRecord, Role } from './types'

class ApiError extends Error {}

export type Account = { email: string; emailVerified: boolean }

/** Any request can be the one that discovers the session is gone — it expires on
 * its own schedule, and a password reset elsewhere revokes it outright. Rather
 * than have every caller check, the store registers here and gets told once.
 * Registered as a callback because the store imports this module, not the
 * reverse. */
let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn
}

/** Raised on 409 so callers can distinguish "someone else saved" from a plain
 * failure — it is the one error with a recoverable, user-facing choice behind it. */
export class ConflictError extends Error {
  current: MapRecord

  constructor(message: string, current: MapRecord) {
    super(message)
    this.current = current
  }
}

/** The link token for the map currently open via a share URL, if any.
 *
 * Module-level rather than threaded through every call because it is a property
 * of the session's entry point, not of any one request — and it stays in memory
 * only, so closing the tab drops it. */
let activeShareToken: string | null = null

export function setShareToken(token: string | null): void {
  activeShareToken = token
}

export function getShareToken(): string | null {
  return activeShareToken
}

/** A response that isn't JSON didn't come from our handlers at all — it's a
 * static host's 404 page or a platform error page, which means the app is
 * deployed somewhere `/api` doesn't exist. Say that, rather than surfacing a
 * bare status code that looks like a rejected password. */
function unreachable(status: number): ApiError {
  return new ApiError(
    status === 404
      ? "Can't reach the flowmap server. This build is deployed without its backend."
      : `Can't reach the flowmap server (${status}).`,
  )
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'include',
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(activeShareToken ? { 'X-Share-Token': activeShareToken } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError("Can't reach the flowmap server. Check your connection.")
  }

  if (!res.headers.get('content-type')?.includes('application/json')) {
    throw unreachable(res.status)
  }
  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.()
    const body = (await res.json().catch(() => ({}))) as { error?: string; current?: MapRecord }
    if (res.status === 409 && body.current) {
      throw new ConflictError(body.error ?? 'This map changed somewhere else.', body.current)
    }
    throw new ApiError(body.error ?? `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export function signup(email: string, password: string): Promise<Account> {
  return request('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) })
}

export function login(email: string, password: string): Promise<Account> {
  return request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
}

export function logout(): Promise<{ ok: true }> {
  return request('/auth/logout', { method: 'POST' })
}

export function me(): Promise<Account> {
  return request('/auth/me')
}

export function forgotPassword(email: string): Promise<{ ok: true; message: string }> {
  return request('/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) })
}

export function resetPassword(token: string, password: string): Promise<{ ok: true }> {
  return request('/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) })
}

export function verifyEmail(token: string): Promise<{ ok: true }> {
  return request('/auth/verify', { method: 'POST', body: JSON.stringify({ token }) })
}

export function resendVerification(): Promise<{ ok: true; alreadyVerified?: boolean }> {
  return request('/auth/resend-verification', { method: 'POST' })
}

export function listMaps(): Promise<{ maps: MapRecord[] }> {
  return request('/maps')
}

export function getMap(id: string): Promise<MapRecord> {
  return request(`/maps/${id}`)
}

/** Opens a map from a share token alone — the holder has the token and no idea
 * which map it belongs to. */
export function openShared(token: string): Promise<MapRecord> {
  return request('/shared', { headers: { 'X-Share-Token': token } })
}

export type ShareLink = {
  id: string
  role: Role
  label: string | null
  createdAt: string
  expiresAt: string | null
  lastUsedAt: string | null
}

export function listLinks(mapId: string): Promise<{ links: ShareLink[] }> {
  return request(`/shares/links?mapId=${encodeURIComponent(mapId)}`)
}

export function createLink(
  mapId: string,
  role: Role,
  label?: string,
  expiresInDays?: number,
): Promise<{ token: string; id: string; role: Role }> {
  return request('/shares/links', {
    method: 'POST',
    body: JSON.stringify({ mapId, role, label, expiresInDays }),
  })
}

export function revokeLink(mapId: string, id: string): Promise<{ ok: true }> {
  return request('/shares/links', { method: 'DELETE', body: JSON.stringify({ mapId, id }) })
}

export type Grant = { email: string; role: Role; createdAt: string }

export function listGrants(mapId: string): Promise<{ grants: Grant[] }> {
  return request(`/shares/grants?mapId=${encodeURIComponent(mapId)}`)
}

export function addGrant(mapId: string, email: string, role: Role): Promise<{ email: string; role: Role }> {
  return request('/shares/grants', { method: 'POST', body: JSON.stringify({ mapId, email, role }) })
}

export function removeGrant(mapId: string, email: string): Promise<{ ok: true }> {
  return request('/shares/grants', { method: 'DELETE', body: JSON.stringify({ mapId, email }) })
}

export function createMap(patch: Partial<MapDoc> = {}): Promise<MapRecord> {
  return request('/maps', { method: 'POST', body: JSON.stringify(patch) })
}

export function updateMap(
  id: string,
  patch: Partial<MapDoc> & { rev?: number },
  keepalive = false,
): Promise<MapRecord> {
  return request(`/maps/${id}`, { method: 'PUT', body: JSON.stringify(patch), keepalive })
}

export function deleteMap(id: string): Promise<{ ok: true }> {
  return request(`/maps/${id}`, { method: 'DELETE' })
}

export function importMaps(maps: Partial<MapDoc>[]): Promise<{ maps: MapRecord[] }> {
  return request('/maps/import', { method: 'POST', body: JSON.stringify({ maps }) })
}

export { ApiError }
