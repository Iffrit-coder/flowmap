#!/usr/bin/env node
/**
 * Restores a backup produced by backup.mjs.
 *
 * Refuses to run against a database that already holds users unless --force is
 * given: the overwhelmingly likely reason to run this is into an empty recovery
 * database, and the overwhelmingly costly mistake is running it against the
 * live one. Rows are upserted by primary key, so a --force run repairs missing
 * rows rather than duplicating them.
 *
 * Usage: DATABASE_URL=... node scripts/restore.mjs backup.json [--force]
 */
import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/restore.mjs <backup.json> [--force]')
  process.exit(1)
}
const force = process.argv.includes('--force')

const backup = JSON.parse(readFileSync(file, 'utf8'))
if (backup.format !== 'flowmap-backup') {
  console.error(`${file} is not a flowmap backup`)
  process.exit(1)
}

const sql = neon(url)
const existing = await sql`select count(*)::int as n from users`
if (existing[0].n > 0 && !force) {
  console.error(`refusing to restore: target already has ${existing[0].n} users. Pass --force to merge anyway.`)
  process.exit(1)
}

for (const u of backup.users) {
  await sql`
    insert into users (id, email, password_hash, created_at, email_verified_at)
    values (${u.id}, ${u.email}, ${u.password_hash}, ${u.created_at}, ${u.email_verified_at})
    on conflict (id) do update set
      email = excluded.email,
      password_hash = excluded.password_hash,
      email_verified_at = excluded.email_verified_at
  `
}

for (const m of backup.maps) {
  await sql`
    insert into maps (id, user_id, name, nodes, edges, pinned, updated_at)
    values (${m.id}, ${m.user_id}, ${m.name}, ${JSON.stringify(m.nodes)}::jsonb,
            ${JSON.stringify(m.edges)}::jsonb, ${m.pinned}, ${m.updated_at})
    on conflict (id) do update set
      name = excluded.name,
      nodes = excluded.nodes,
      edges = excluded.edges,
      pinned = excluded.pinned,
      updated_at = excluded.updated_at
  `
}

console.error(`restored ${backup.users.length} users and ${backup.maps.length} maps from ${backup.takenAt}`)
