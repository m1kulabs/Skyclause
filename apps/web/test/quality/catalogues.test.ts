import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { catalogueFindings } from '../../e2e/quality/static'

// Spec §1: `packages/i18n/catalogue/{en,ms}/<feature>.json`, which #95 starts.
const root = path.join(import.meta.dirname, '../../../../packages/i18n/catalogue')
const files = (() => {
  try {
    return readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.json'))
  } catch {
    return []
  }
})()

test.skipIf(files.length === 0)(
  'every catalogue string passes the loading and ellipsis rules (#95 adds catalogues)',
  () => {
    const findings = files.flatMap((file) =>
      catalogueFindings(JSON.parse(readFileSync(path.join(root, file), 'utf8'))).map((f) => `${file}: ${f.detail}`)
    )
    expect(findings).toEqual([])
  }
)
