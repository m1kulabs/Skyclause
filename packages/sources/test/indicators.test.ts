import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, expectTypeOf, test } from 'vitest'
import { check, type IndicatorDefinition } from '@skyclause/clauses'
import {
  indicators,
  jpsRainIndicators,
  apimsIndicators,
  metWarningIndicators,
  metForecastIndicators
} from '../src/indicators'
import { createMetWarningAdapter } from '../src/adapters/met-warning'
import { createMetForecastAdapter } from '../src/adapters/met-forecast'

const expected = [
  { name: 'site.rain_60m_mm', celType: 'double', unit: 'mm', scope: 'site', sourceKind: 'jps_rain' },
  { name: 'w.rain_max_60m_mm', celType: 'double', unit: 'mm', scope: 'window', sourceKind: 'jps_rain' },
  { name: 'w.rain_max_4h_mm', celType: 'double', unit: 'mm', scope: 'window', sourceKind: 'jps_rain' }
]
const expectedApims = [
  { name: 'site.api_max', celType: 'int', unit: 'API', scope: 'site', sourceKind: 'apims' },
  { name: 'site.api_0600_min_last3_max', celType: 'int', unit: 'API', scope: 'site', sourceKind: 'apims' }
]

const metWarnings = [
  { name: 'site.met_warning_in_force', celType: 'bool', unit: '', scope: 'site', sourceKind: 'met_warning' },
  { name: 'w.met_warning_in_force', celType: 'bool', unit: '', scope: 'window', sourceKind: 'met_warning' }
]
const metForecast = [
  { name: 'site.met_afternoon_thunderstorm', celType: 'bool', unit: '', scope: 'site', sourceKind: 'met_forecast' }
]
const all = [...expected, ...expectedApims, ...metWarnings, ...metForecast]

test('exports actual rain, APIMS and MET definitions with the named clauses type', () => {
  expect(jpsRainIndicators).toEqual(expected)
  expect(apimsIndicators).toEqual(expectedApims)
  expect(metWarningIndicators).toEqual(metWarnings)
  expect(metForecastIndicators).toEqual(metForecast)
  expect(createMetWarningAdapter().indicators).toEqual(metWarningIndicators)
  expect(createMetForecastAdapter().indicators).toEqual(metForecastIndicators)
  expect(indicators).toEqual(all)
  expect(new Set(indicators.map((row) => row.name)).size).toBe(all.length)
  expectTypeOf(metWarningIndicators).toEqualTypeOf<IndicatorDefinition[]>()
  expectTypeOf(metForecastIndicators).toEqualTypeOf<IndicatorDefinition[]>()
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
      "export { indicators, jpsRainIndicators, apimsIndicators, metWarningIndicators, metForecastIndicators } from '@skyclause/sources/indicators'\n"
    )
    const code = execFileSync('bun', ['build', entry, '--target', 'browser'], { encoding: 'utf8' })
    expect(code).not.toMatch(/process|node:|worker|adapters|fixtures|ADAPTER_USER_AGENT|\brequire\s*\(/)
    writeFileSync(output, code)
    const bundled = await import(/* @vite-ignore */ pathToFileURL(output).href)
    expect(bundled.indicators).toEqual(all)
    expect(bundled.metWarningIndicators).toEqual(metWarnings)
    expect(bundled.metForecastIndicators).toEqual(metForecast)
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
