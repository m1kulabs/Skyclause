// `check:unbuilt [--owner <key>]` (spec §7): lists every `notBuilt('<key>')` and `data-unbuilt="<key>"` in apps and
// packages outside tests, grouped by owner, and fails while any remain. `promote.yml` gates on it; PR CI doesn't.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isSource, isTestFile, listFiles } from './files'

const PLACEHOLDER = /notBuilt\(\s*(['"])([^'"]+)\1\s*\)|data-unbuilt=(['"])([^'"]+)\3/g

const args = process.argv.slice(2)
const ownerFlag = args.indexOf('--owner')
const ownerFilter = ownerFlag === -1 ? null : args[ownerFlag + 1]
if (ownerFilter === undefined) {
  console.error('usage: check-unbuilt.ts [--owner <key>]')
  process.exit(2)
}

const byOwner = new Map<string, string[]>()
for (const file of listFiles(process.cwd(), ['apps', 'packages']).filter(
  (file) => isSource(file) && !isTestFile(file)
)) {
  readFileSync(join(process.cwd(), file), 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const match of line.matchAll(PLACEHOLDER)) {
        const owner = match[2] ?? match[4] ?? ''
        if (ownerFilter && owner !== ownerFilter) continue
        byOwner.set(owner, [...(byOwner.get(owner) ?? []), `${file}:${i + 1}`])
      }
    })
}

for (const [owner, places] of [...byOwner].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`${owner}\n${places.map((place) => `  ${place}\n`).join('')}`)
}
const count = [...byOwner.values()].reduce((sum, places) => sum + places.length, 0)
console.log(count ? `${count} unbuilt placeholder(s) remain` : 'no unbuilt placeholders')
process.exitCode = count ? 1 : 0
