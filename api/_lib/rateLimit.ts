import type { IncomingMessage } from 'node:http'
import sql from './db.js'

export type Limit = { key: string; max: number; windowSeconds: number }

/** Vercel's proxy sets both of these; `x-real-ip` is a single value and so is
 * not confusable with a client-supplied list, which makes it the safer of the
 * two to trust. Falls back to the first `x-forwarded-for` entry, then to a
 * constant — a shared bucket is still better than no limit at all. */
export function clientIp(req: IncomingMessage): string {
  const real = req.headers['x-real-ip']
  if (typeof real === 'string' && real.trim()) return real.trim()

  const fwd = req.headers['x-forwarded-for']
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim()
  return first || 'unknown'
}

/** Bumps a fixed window and reports whether it is now over budget.
 *
 * The upsert resets `count` to 1 when the stored window has already elapsed, so
 * expiry needs no sweeper job. Doing it in one statement keeps the read and the
 * increment atomic — two requests arriving together cannot both see the old
 * count and each write back the same value. */
export async function hit(limit: Limit): Promise<{ limited: boolean; retryAfter: number }> {
  const rows = await sql`
    insert into rate_limits (key, count, window_start)
    values (${limit.key}, 1, now())
    on conflict (key) do update set
      count = case
        when rate_limits.window_start < now() - make_interval(secs => ${limit.windowSeconds})
        then 1
        else rate_limits.count + 1
      end,
      window_start = case
        when rate_limits.window_start < now() - make_interval(secs => ${limit.windowSeconds})
        then now()
        else rate_limits.window_start
      end
    returning count, extract(epoch from (window_start + make_interval(secs => ${limit.windowSeconds}) - now()))::int as retry_after
  `
  const count = Number(rows[0]?.count ?? 0)
  const retryAfter = Math.max(1, Number(rows[0]?.retry_after ?? limit.windowSeconds))
  return { limited: count > limit.max, retryAfter }
}

/** Clears a counter — called on a successful login so a user who simply mistyped
 * a few times isn't left throttled for the rest of the window. */
export async function reset(key: string): Promise<void> {
  await sql`delete from rate_limits where key = ${key}`
}
