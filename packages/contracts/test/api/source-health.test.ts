import { expect, test } from 'vitest'
import { bindSource, listProjectSources } from '../../src/api/v1/sources'

const schema = listProjectSources.responses[200].content['application/json'].schema
const bind = bindSource.responses[201].content['application/json'].schema
const instant = '2026-11-05T06:00:00Z'
const base = {
  id: 'source',
  kind: 'apims',
  external_id: 'CA16W',
  owner_org_id: null,
  name: 'Cheras',
  lat: null,
  lon: null,
  url: 'https://apims.doe.gov.my/',
  cadence_s: 3600,
  stale_after_s: 7200,
  licence_id: null,
  licence_label: 'DOE',
  project_id: 'project',
  role: 'api_station',
  state: null,
  latest_reading: null,
  age_s: null,
  recent_errors: []
}
const error = {
  id: 'poll',
  source_id: 'source',
  started_at: instant,
  http_status: null,
  latency_ms: 100,
  outcome: 'error',
  request_id: 'request',
  error_code: null,
  message: null,
  purpose: 'apims_backfill'
}
const history = Array.from({ length: 48 }, () => ({ start_at: instant, end_at: instant, status: 'missed' }))
const page = (row: object) => ({ data: [row], next_cursor: null })

test('complete list row retains list-only health additions and nullable error fields', () => {
  const row = { ...base, history, last_error: error }
  expect(schema.parse(page(row)).data[0]).toEqual(row)
  expect(schema.parse(page({ ...base, history, last_error: null })).data[0]).toMatchObject({ last_error: null })
})

test('supplied history has exactly 48 valid slots', () => {
  for (const slots of [
    history.slice(1),
    [...history, history[0]],
    [{ ...history[0], status: 'fresh' }, ...history.slice(1)]
  ])
    expect(schema.safeParse(page({ ...base, history: slots })).success).toBe(false)
})

test('supplied last_error requires nullable message and a purpose', () => {
  const { message: _message, ...noMessage } = error
  const { purpose: _purpose, ...noPurpose } = error
  for (const last_error of [noMessage, noPurpose])
    expect(schema.safeParse(page({ ...base, last_error })).success).toBe(false)
})

test('existing list and bind responses remain compatible without optional health fields', () => {
  expect(schema.parse(page(base)).data[0]).toEqual(base)
  expect(bind.parse(base)).toEqual(base)
  expect(bind.parse({ ...base, history, last_error: error })).toEqual(base)
})
