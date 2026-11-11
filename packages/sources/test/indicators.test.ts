import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, expectTypeOf, test } from 'vitest'
import type { IndicatorDefinition } from '@skyclause/clauses'
import { indicators, jpsRainIndicators, metWarningIndicators, metForecastIndicators } from '../src/indicators'
import { createMetWarningAdapter } from '../src/adapters/met-warning'
import { createMetForecastAdapter } from '../src/adapters/met-forecast'

const expected = [
  { name: 'site.rain_60m_mm', celType: 'double', unit: 'mm', scope: 'site', sourceKind: 'jps_rain' },
  { name: 'w.rain_max_60m_mm', celType: 'double', unit: 'mm', scope: 'window', sourceKind: 'jps_rain' },
  { name: 'w.rain_max_4h_mm', celType: 'double', unit: 'mm', scope: 'window', sourceKind: 'jps_rain' }
]

const metWarnings = [
  { name: 'site.met_warning_in_force', celType: 'bool', unit: '', scope: 'site', sourceKind: 'met_warning' },
  { name: 'w.met_warning_in_force', celType: 'bool', unit: '', scope: 'window', sourceKind: 'met_warning' }
]
const metForecast = [
  { name: 'site.met_afternoon_thunderstorm', celType: 'bool', unit: '', scope: 'site', sourceKind: 'met_forecast' }
]
const all = [...expected, ...metWarnings, ...metForecast]

test('exports actual rain and MET definitions with the named clauses type', () => {
  expect(jpsRainIndicators).toEqual(expected)
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
      "export { indicators, jpsRainIndicators, metWarningIndicators, metForecastIndicators } from '@skyclause/sources/indicators'\n"
    )
    const code = execFileSync('bun', ['build', entry, '--target', 'browser'], { encoding: 'utf8' })
    expect(code).not.toMatch(/process|node:|worker|adapters|fixtures|ADAPTER_USER_AGENT|\brequire\s*\(/)
    writeFileSync(output, code)
    const bundled = await import(/* @vite-ignore */ pathToFileURL(output).href)
    expect(bundled.indicators).toEqual(all)
    expect(bundled.metWarningIndicators).toEqual(metWarnings)
    expect(bundled.metForecastIndicators).toEqual(metForecast)
    expect(bundled.jpsRainIndicators).toEqual(expected)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
