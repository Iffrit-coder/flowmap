// Vercel transpiles the API handlers file-by-file and runs them as ESM, where
// Node will not guess file extensions. `tsx` in local dev does guess, so an
// extensionless relative import type-checks, passes every local test, and then
// takes the function down in production with ERR_MODULE_NOT_FOUND.
//
// This walks the real import graph out of api/ — including the src/ modules the
// handlers reach into — and fails the build on any relative import missing its
// extension. Runs before the build so it can't be skipped by accident.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = process.cwd()
const RELATIVE_IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+'(\.[^']*)'|import\('(\.[^']*)'\)/g

function entryPoints(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...entryPoints(full))
    else if (full.endsWith('.ts')) out.push(full)
  }
  return out
}

function resolveSpecifier(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec)
  for (const candidate of [base, base.replace(/\.js$/, '.ts'), `${base}.ts`, join(base, 'index.ts')]) {
    try {
      if (statSync(candidate).isFile()) return candidate
    } catch {
      /* keep trying */
    }
  }
  return null
}

const problems = []
const seen = new Set()
const queue = entryPoints(join(ROOT, 'api'))

while (queue.length > 0) {
  const file = queue.pop()
  if (seen.has(file)) continue
  seen.add(file)

  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(RELATIVE_IMPORT)) {
    const spec = match[1] ?? match[2]
    if (!spec) continue
    if (!spec.endsWith('.js')) {
      problems.push(`${relative(ROOT, file)}: "${spec}" is missing its .js extension`)
      continue
    }
    const target = resolveSpecifier(file, spec)
    if (!target) problems.push(`${relative(ROOT, file)}: "${spec}" does not resolve to a file`)
    else queue.push(target)
  }
}

if (problems.length > 0) {
  console.error('ESM import check failed — these would break in production:\n')
  for (const p of problems) console.error(`  ${p}`)
  console.error('\nEvery relative import reachable from api/ needs an explicit .js extension.')
  process.exit(1)
}
console.log(`ESM import check passed (${seen.size} modules reachable from api/)`)
