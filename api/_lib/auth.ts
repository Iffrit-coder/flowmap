import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { promisify } from 'node:util'
import { nanoid } from 'nanoid'
import sql from './db.js'
import { readSessionToken, setSessionCookie } from './http.js'

const scrypt = promisify(scryptCb) as (password: string, salt: string, keylen: number) => Promise<Buffer>
const SESSION_DAYS = 30

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, 64)
  return `${salt}:${derived.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(':')
  if (!salt || !hashHex) return false
  const derived = await scrypt(password, salt, 64)
  const expected = Buffer.from(hashHex, 'hex')
  return derived.length === expected.length && timingSafeEqual(derived, expected)
}

export async function createSession(userId: string, res: ServerResponse): Promise<void> {
  const token = nanoid(32)
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await sql`insert into sessions (token, user_id, expires_at) values (${token}, ${userId}, ${expiresAt.toISOString()})`
  setSessionCookie(res, token, SESSION_DAYS * 24 * 60 * 60)
}

export async function getUserId(req: IncomingMessage): Promise<string | null> {
  const token = readSessionToken(req)
  if (!token) return null
  const rows = await sql`select user_id from sessions where token = ${token} and expires_at > now()`
  if (rows.length === 0) return null
  return rows[0].user_id as string
}
