// Spec §7 fixtures: each `packages/<pkg>/test/fixtures/fixtures.json` lists its captures as
// `{file, url, captured_at, station_id, sha256}`, `file` relative to the manifest.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

export function checkFixtures(root: string): string[] {
  const packages = join(root, 'packages')
  if (!existsSync(packages)) return []
  const manifests = readdirSync(packages)
    .map((name) => `packages/${name}/test/fixtures/fixtures.json`)
    .filter((manifest) => existsSync(join(root, manifest)))
  return manifests.flatMap((manifest) => {
    const entries: unknown = JSON.parse(readFileSync(join(root, manifest), 'utf8'))
    if (!Array.isArray(entries)) return [`${manifest}: must be an array of entries`]
    return entries.flatMap((entry: Record<string, unknown>, i) => {
      const name = typeof entry.file === 'string' ? entry.file : `entry ${i}`
      const problems: string[] = []
      if (typeof entry.file !== 'string') problems.push('needs file')
      if (typeof entry.url !== 'string' || !URL.canParse(entry.url)) problems.push('needs url')
      if (
        typeof entry.captured_at !== 'string' ||
        !INSTANT.test(entry.captured_at) ||
        Number.isNaN(Date.parse(entry.captured_at))
      )
        problems.push('needs captured_at as an RFC 3339 instant')
      if (typeof entry.station_id !== 'string' || entry.station_id === '') problems.push('needs station_id')
      if (typeof entry.file === 'string') {
        const path = join(root, dirname(manifest), entry.file)
        if (!existsSync(path)) problems.push('file is missing')
        else if (createHash('sha256').update(readFileSync(path)).digest('hex') !== entry.sha256)
          problems.push('sha256 does not match the file')
      }
      return problems.map((problem) => `${manifest}: ${name} ${problem}`)
    })
  })
}
