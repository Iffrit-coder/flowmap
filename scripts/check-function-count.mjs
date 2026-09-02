// Vercel turns every .ts file under api/ into its own serverless function, and
// the Hobby plan refuses a deployment with more than 12. That limit is enforced
// at deploy time, not build time, so without this the failure mode is a green
// local build and a red deployment — which is exactly what happened.
//
// Files and directories prefixed with `_` are not routed, so shared code and
// dispatcher-backed handlers don't count.
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const LIMIT = 12
const ROOT = process.cwd()
const API = join(ROOT, 'api')

function routes(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (name.startsWith('_')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...routes(full))
    else if (full.endsWith('.ts')) out.push(full)
  }
  return out
}

const found = routes(API)
console.log(`Serverless function check: ${found.length}/${LIMIT}`)

if (found.length > LIMIT) {
  console.error(`\nToo many serverless functions: ${found.length}, limit is ${LIMIT}.\n`)
  for (const f of found) console.error(`  ${relative(ROOT, f)}`)
  console.error(
    '\nCollapse related endpoints behind a [action].ts dispatcher and move the\n' +
      'handlers under api/_handlers/, the way api/auth already works.',
  )
  process.exit(1)
}
