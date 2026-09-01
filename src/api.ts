import type { MapDoc } from './types'

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
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
  } catch {
    throw new ApiError("Can't reach the flowmap server. Check your connection.")
  }

  if (!res.headers.get('content-type')?.includes('application/json')) {
    throw unreachable(res.status)
  }
  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.()
    const body = await res.json().catch(() => ({}))
    throw new ApiError((body as { error?: string }).error ?? `Request failed (${res.status})`)
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

export function listMaps(): Promise<{ maps: MapDoc[] }> {
  return request('/maps')
}

export function createMap(patch: Partial<MapDoc> = {}): Promise<MapDoc> {
  return request('/maps', { method: 'POST', body: JSON.stringify(patch) })
}

export function updateMap(id: string, patch: Partial<MapDoc>, keepalive = false): Promise<MapDoc> {
  return request(`/maps/${id}`, { method: 'PUT', body: JSON.stringify(patch), keepalive })
}

export function deleteMap(id: string): Promise<{ ok: true }> {
  return request(`/maps/${id}`, { method: 'DELETE' })
}

export function importMaps(maps: Partial<MapDoc>[]): Promise<{ maps: MapDoc[] }> {
  return request('/maps/import', { method: 'POST', body: JSON.stringify({ maps }) })
}

export { ApiError }
