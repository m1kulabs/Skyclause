import { expect, test } from 'vitest'
import { parseMetWarnings, isMetWarningInForce } from '../src/adapters/met-warning-parser'
import { createMetWarningAdapter } from '../src/adapters/met-warning'
import { HttpError, NetworkError, SchemaError } from '../src/errors'
import { capture, context, response, warningSource } from './met-support'

const file = 'weather-warning-20261105T1313Z.json'
const sha = '4217dfb611b09e1ad421fbe5c00277a4b170aa78089d6e3452d39193a2903415'
const raw = () => capture(file, sha)
const parse = (body: unknown) => parseMetWarnings(body, [warningSource])

test('warning_capture_preserves_four_records_and_shared_issue_item_identity', () => {
  const body = raw()
  const rows = parse(body)
  expect(rows).toHaveLength(4)
  rows.forEach((row, i) => {
    const { valid_from_utc: _from, valid_to_utc: _to, excluded: _excluded, ...original } = row.valueJson
    expect(original).toEqual(body[i])
    expect(row.valueText).toBe(body[i]!.text_en)
    expect(row.value).toBeNull()
    expect(row.unit).toBeNull()
    expect(row.itemKey).toBe(`${(body[i]!.warning_issue as Record<string, unknown>).title_en}|${body[i]!.valid_from}`)
  })
  expect(rows.map((row) => row.valueJson.excluded)).toEqual([true, true, false, true])
  expect(rows[0]!.observedAt).toBe('2026-11-05T12:30:00.000Z')
  expect(rows[0]!.itemKey).not.toBe(rows[1]!.itemKey)
  expect(JSON.stringify(body).toLowerCase()).not.toContain('kuala lumpur')
})

test('warning_validity_is_inclusive_and_respects_terms_and_exclusions', () => {
  const body = raw()
  const original = structuredClone(body)
  const rows = parse(body)
  const warning = rows[2]!.valueJson
  const span = { from: '2026-11-05T13:00:00Z', to: '2026-11-05T17:00:00Z' }
  expect(isMetWarningInForce(warning, span, ['Kedah'])).toBe(true)
  expect(isMetWarningInForce(warning, span, ['Kuala Lumpur'])).toBe(false)
  expect(isMetWarningInForce(warning, span, [])).toBe(false)
  expect(isMetWarningInForce(warning, span, [' ', ''])).toBe(false)
  expect(isMetWarningInForce(warning, { from: '2026-11-05T17:05:00Z', to: '2026-11-05T18:00:00Z' }, ['Kedah'])).toBe(
    false
  )
  for (const boundary of [warning.valid_from_utc!, warning.valid_to_utc!]) {
    expect(isMetWarningInForce(warning, { from: boundary, to: boundary }, ['kedah'])).toBe(true)
  }
  expect(isMetWarningInForce(rows[0]!.valueJson, span, ['Kedah'])).toBe(false)
  expect(isMetWarningInForce({ ...rows[0]!.valueJson, excluded: false, text_en: 'Kedah' }, span, ['Kedah'])).toBe(false)
  expect(isMetWarningInForce(rows[3]!.valueJson, span, ['Kedah'])).toBe(false)
  // Fault injection changes copies of a real capture only.
  for (const field of ['valid_from_utc', 'valid_to_utc'] as const) {
    expect(isMetWarningInForce({ ...warning, [field]: null }, span, ['Kedah'])).toBe(false)
  }
  expect(isMetWarningInForce({ ...warning, excluded: true }, span, ['Kedah'])).toBe(false)
  expect(isMetWarningInForce({ ...warning, text_en: '', text_bm: '', heading_en: 'Kedah' }, span, ['Kedah'])).toBe(
    false
  )
  expect(body).toEqual(original)
})

test('warning_empty_is_valid_but_malformed_fields_are_not', () => {
  expect(parse([])).toEqual([])
  for (const body of [{ error: 'failure' }, '<html>', null]) expect(() => parse(body)).toThrow(SchemaError)
  for (const field of [
    'text_en',
    'text_bm',
    'heading_en',
    'heading_bm',
    'instruction_en',
    'instruction_bm',
    'valid_from',
    'valid_to'
  ]) {
    const body = raw()
    delete body[2]![field]
    expect(() => parse(body), field).toThrow(SchemaError)
  }
  for (const field of ['instruction_en', 'instruction_bm']) {
    const body = raw()
    body[2]![field] = 1
    expect(() => parse(body)).toThrow(SchemaError)
  }
  const missing = raw()
  delete (missing[2]!.warning_issue as Record<string, unknown>).issued
  expect(() => parse(missing)).toThrow(SchemaError)
  for (const date of ['2026-02-30T21:00:00', '2026-11-05T24:00:00', 'not a date']) {
    const body = raw()
    body[2]!.valid_from = date
    expect(() => parse(body)).toThrow(SchemaError)
    const issue = raw()
    ;(issue[2]!.warning_issue as Record<string, unknown>).issued = date
    expect(() => parse(issue)).toThrow(SchemaError)
  }
  const reversed = raw()
  reversed[2]!.valid_from = '2026-11-07T00:00:00'
  expect(() => parse(reversed)).toThrow(SchemaError)
  const extra = raw()
  extra[0]!.provider_extra = { untouched: true }
  ;(extra[0]!.warning_issue as Record<string, unknown>).extra = 'raw'
  expect(parse(extra)[0]!.valueJson).toMatchObject(extra[0]!)
  expect(parse([...raw(), raw()[0]])).toHaveLength(4)
  const conflict = raw()
  conflict.push({ ...conflict[0], text_en: 'changed revision in same body' })
  expect(() => parse(conflict)).toThrow(SchemaError)
  for (const sources of [
    [],
    [{ ...warningSource, externalId: 'other' }],
    [{ ...warningSource, kind: 'met_forecast' as const }]
  ]) {
    expect(() => parseMetWarnings(raw(), sources)).toThrow(SchemaError)
  }
})

test('warning factory discovers without HTTP and fetches exactly once through context', async () => {
  const adapter = createMetWarningAdapter()
  expect(await adapter.discover!()).toEqual([
    { externalId: 'met-warnings', name: warningSource.name, lat: null, lon: null, url: warningSource.url, meta: {} }
  ])
  let calls = 0
  const body = raw()
  expect(
    await adapter.fetch(
      [warningSource],
      context(async (url) => {
        calls++
        expect(url).toBe(warningSource.url)
        return response(body)
      })
    )
  ).toBe(body)
  expect(calls).toBe(1)
  expect(adapter.backfill).toBeUndefined()
  for (const status of [301, 429, 500]) {
    await expect(
      adapter.fetch(
        [warningSource],
        context(async () => response(body, status))
      )
    ).rejects.toBeInstanceOf(HttpError)
  }
  await expect(
    adapter.fetch(
      [warningSource],
      context(async () => response('<html>', 200, 'text/html'))
    )
  ).rejects.toBeInstanceOf(SchemaError)
  const failure = new NetworkError(warningSource.url, 'offline')
  await expect(
    adapter.fetch(
      [warningSource],
      context(async () => {
        throw failure
      })
    )
  ).rejects.toBe(failure)
  await expect(
    adapter.fetch(
      [warningSource],
      context(async () => ({
        ...response(null),
        json: async () => {
          throw new SyntaxError()
        }
      }))
    )
  ).rejects.toBeInstanceOf(SchemaError)
  expect(adapter).toMatchObject({
    kind: 'met_warning',
    cadence: 600,
    apiFamily: 'datagovmy-weather',
    freshness: 'polled',
    batch: 'all_bound',
    licence: { id: 'CC-BY-4.0', label: 'MET Malaysia via data.gov.my, CC BY 4.0' }
  })
})
