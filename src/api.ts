import type { MapDoc } from './types'

class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError((body as { error?: string }).error ?? `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export function signup(email: string, password: string): Promise<{ email: string }> {
  return request('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) })
}

export function login(email: string, password: string): Promise<{ email: string }> {
  return request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
}

export function logout(): Promise<{ ok: true }> {
  return request('/auth/logout', { method: 'POST' })
}

export function me(): Promise<{ email: string }> {
  return request('/auth/me')
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
