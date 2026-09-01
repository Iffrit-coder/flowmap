import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import sql from './db.js'

export type Purpose = 'reset' | 'verify'

const TTL_SECONDS: Record<Purpose, number> = {
  // Short, because a reset link in an inbox is a standing key to the account.
  reset: 60 * 60,
  // Longer: confirming an address is not urgent and a bounced-around email may
  // sit unread for a day.
  verify: 24 * 60 * 60,
}

/** 32 bytes of CSPRNG output, url-safe. Guessing one is not a realistic attack
 * at this width, which is what lets the lookup be a single indexed read. */
function rawToken(): string {
  return randomBytes(32).toString('base64url')
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Issues a token and returns the raw value — the only time it exists outside
 * the recipient's inbox. Any outstanding token for the same purpose is dropped
 * first, so requesting a second reset link invalidates the first. */
export async function issue(userId: string, purpose: Purpose): Promise<string> {
  const token = rawToken()
  const expiresAt = new Date(Date.now() + TTL_SECONDS[purpose] * 1000)
  await sql`delete from auth_tokens where user_id = ${userId} and purpose = ${purpose}`
  await sql`
    insert into auth_tokens (token_hash, user_id, purpose, expires_at)
    values (${hash(token)}, ${userId}, ${purpose}, ${expiresAt.toISOString()})
  `
  return token
}

/** Redeems a token, returning the user it belongs to, or null if it is unknown,
 * expired, or for a different purpose. Deletion in the same statement as the
 * read is what makes it single-use: two concurrent redemptions cannot both
 * match, because only one delete can return a row. */
export async function consume(token: string, purpose: Purpose): Promise<string | null> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null

  const rows = await sql`
    delete from auth_tokens
    where token_hash = ${hash(token)}
      and purpose = ${purpose}
      and expires_at > now()
    returning user_id, token_hash
  `
  if (rows.length === 0) return null

  // The lookup is by primary key on a hash, so this comparison can only fail on
  // a SHA-256 collision. It is here so the equality is constant-time regardless.
  const stored = Buffer.from(rows[0].token_hash as string, 'hex')
  const expected = Buffer.from(hash(token), 'hex')
  if (stored.length !== expected.length || !timingSafeEqual(stored, expected)) return null

  return rows[0].user_id as string
}

/** Expired rows are only ever read past, never returned, so sweeping them is
 * housekeeping rather than correctness. Called opportunistically on issue. */
export async function pruneExpired(): Promise<void> {
  await sql`delete from auth_tokens where expires_at < now() - interval '7 days'`
}
