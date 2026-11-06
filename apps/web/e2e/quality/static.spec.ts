// NFR-7 over the CSS the build ships.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { cssFindings } from './static'

const dir = path.join(import.meta.dirname, '../../.next/static')
const css = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.css'))

test('built CSS animates only transform and opacity, never transition: all', () => {
  test.skip(css.length === 0, 'the build has no CSS yet; the global CSS lands with #95')
  const findings = css.flatMap((file) =>
    cssFindings(readFileSync(path.join(dir, file), 'utf8')).map((finding) => `${file}: ${finding.detail}`)
  )
  expect(findings).toEqual([])
})
