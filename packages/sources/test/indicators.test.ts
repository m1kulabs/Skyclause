import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, expectTypeOf, test } from 'vitest'
import type { IndicatorDefinition } from '@skyclause/clauses'
import { check } from '@skyclause/clauses'
import { indicators, jpsRainIndicators, apimsIndicators } from '../src/indicators'

const expected = [
  { name: 'site.rain_60m_mm', celType: 'double', unit: 'mm', scope: 'site', sourceKind: 'jps_rain' },
  { name: 'w.rain_max_60m_mm', celType: 'double', unit: 'mm', scope: 'window', sourceKind: 'jps_rain' },
  { name: 'w.rain_max_4h_mm', celType: 'double', unit: 'mm', scope: 'window', sourceKind: 'jps_rain' }
]
const expectedApims = [
  { name: 'site.api_max', celType: 'int', unit: 'API', scope: 'site', sourceKind: 'apims' },
  { name: 'site.api_0600_min_last3_max', celType: 'int', unit: 'API', scope: 'site', sourceKind: 'apims' }
]

test('exports real rain and APIMS definitions with the named clauses type', () => {
  expect(jpsRainIndicators).toEqual(expected)
  expect(apimsIndicators).toEqual(expectedApims)
  expect(indicators).toEqual([...expected, ...expectedApims])
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
    writeFileSync(
      entry,
      "export { indicators, jpsRainIndicators, apimsIndicators } from '@skyclause/sources/indicators'\n"
    )
    const code = execFileSync('bun', ['build', entry, '--target', 'browser'], { encoding: 'utf8' })
    expect(code).not.toMatch(/process|node:|worker|adapters|ADAPTER_USER_AGENT|\brequire\s*\(/)
    writeFileSync(output, code)
    const bundled = await import(/* @vite-ignore */ pathToFileURL(output).href)
    expect(bundled.indicators).toEqual([...expected, ...expectedApims])
    expect(bundled.jpsRainIndicators).toEqual(expected)
    expect(bundled.apimsIndicators).toEqual(expectedApims)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the real APIMS int declarations accept integer conditions and reject mixed arithmetic', () => {
  const sheet = (when: string) => ({
    pack: 'sky' as const,
    clauses: [
      {
        key: 'apims_type_contract',
        name: 'APIMS type contract',
        enabled: true,
        scope: 'site' as const,
        requires: apimsIndicators.map((indicator) => indicator.name),
        when,
        proposes: { mode: 'outdoor_limited' as const },
        wording: { en: 'APIMS readings' }
      }
    ]
  })
  expect(check(sheet('site.api_max >= 100 && site.api_0600_min_last3_max >= 100'), apimsIndicators)).toMatchObject({
    ok: true,
    publishable: true,
    issues: []
  })
  const invalid = check(sheet('site.api_max + 0.5 >= 100.5'), apimsIndicators)
  expect(invalid.ok).toBe(false)
  expect(invalid.issues.length).toBeGreaterThan(0)
})
