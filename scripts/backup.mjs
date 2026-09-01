#!/usr/bin/env node
/**
 * Dumps the durable tables to a JSON file on stdout or at --out.
 *
 * Deliberately not pg_dump: that requires a client whose major version matches
 * the server, which silently rots every time Neon upgrades Postgres. The data
 * here is small and plainly shaped, so a JSON export is both version-proof and
 * readable by anything.
 *
 * Sessions, rate limits, and auth tokens are excluded — all three are
 * short-lived by construction, and restoring stale ones would be worse than
 * starting clean.
 *
 * Usage: DATABASE_URL=... node scripts/backup.mjs --out backup.json
 */
import { writeFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

const outIndex = process.argv.indexOf('--out')
const outPath = outIndex === -1 ? null : process.argv[outIndex + 1]

const sql = neon(url)

const users = await sql`select id, email, password_hash, created_at, email_verified_at from users order by created_at`
const maps = await sql`select id, user_id, name, nodes, edges, pinned, updated_at from maps order by updated_at`

const backup = {
  format: 'flowmap-backup',
  version: 1,
  // Stamped by the caller's clock; only ever used to tell two dumps apart.
  takenAt: new Date().toISOString(),
  counts: { users: users.length, maps: maps.length },
  users,
  maps,
}

const json = JSON.stringify(backup, null, 2)

if (outPath) {
  writeFileSync(outPath, json)
  console.error(`wrote ${outPath} — ${users.length} users, ${maps.length} maps, ${json.length} bytes`)
} else {
  process.stdout.write(json)
}
