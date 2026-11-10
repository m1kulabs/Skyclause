import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, expectTypeOf, test } from 'vitest'
import type { IndicatorDefinition } from '@skyclause/clauses'
import { indicators, jpsRainIndicators } from '../src/indicators'

const expected = [
  { name: 'site.rain_60m_mm', celType: 'double', unit: 'mm', scope: 'site', sourceKind: 'jps_rain' },
  { name: 'w.rain_max_60m_mm', celType: 'double', unit: 'mm', scope: 'window', sourceKind: 'jps_rain' },
  { name: 'w.rain_max_4h_mm', celType: 'double', unit: 'mm', scope: 'window', sourceKind: 'jps_rain' }
]

test('exports only the three rain definitions with the named clauses type', () => {
  expect(jpsRainIndicators).toEqual(expected)
  expect(indicators).toEqual(expected)
  expectTypeOf(indicators).toEqualTypeOf<IndicatorDefinition[]>()
  expectTypeOf(jpsRainIndicators).toEqualTypeOf<IndicatorDefinition[]>()
  expect(readFileSync(new URL('../src/indicators/index.ts', import.meta.url), 'utf8')).toContain(
    'satisfies IndicatorDefinition[]'
  )
})

test('installed Bun bundles the public subpath for browsers without server dependencies', async () => {
  // A temporary directory in this package lets Bun resolve its workspace imports.
  const directory = mkdtempSync(fileURLToPath(new URL('./.indicators-browser-', import.meta.url)))
  try {
    const entry = join(directory, 'entry.ts')
    const output = join(directory, 'browser.mjs')
    writeFileSync(entry, "export { indicators, jpsRainIndicators } from '@skyclause/sources/indicators'\n")
    const code = execFileSync('bun', ['build', entry, '--target', 'browser'], { encoding: 'utf8' })
    expect(code).not.toMatch(/process|node:|worker|adapters|ADAPTER_USER_AGENT|\brequire\s*\(/)
    writeFileSync(output, code)
    const bundled = await import(/* @vite-ignore */ pathToFileURL(output).href)
    expect(bundled.indicators).toEqual(expected)
    expect(bundled.jpsRainIndicators).toEqual(expected)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
