import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import {
  distanceKm,
  filterSources,
  formatDistanceKm,
  progressForSteps,
  sortSources,
  stepStates,
  type PickerSource,
  firstRunFinished,
  projectHomeHref
} from '../../features/onboarding/model'

type CapturedStation = {
  STATION_ID: string
  STATION_LOCATION: string
  LONGITUDE: number
  LATITUDE: number
  API: number
  CLASS: string
  RECORD_DT: string
}

const capture = JSON.parse(
  readFileSync(new URL('../../../../docs/sources/eqms.doe.gov.my/mapcaqm-20261105T1313Z.json', import.meta.url), 'utf8')
) as { data: CapturedStation[] }

function capturedSource(stationId: string, id: string): PickerSource {
  const row = capture.data.find((station) => station.STATION_ID === stationId)
  if (!row) throw new Error(`APIMS capture is missing ${stationId}`)
  return {
    id,
    kind: 'apims',
    external_id: row.STATION_ID,
    name: row.STATION_LOCATION,
    lat: row.LATITUDE,
    lon: row.LONGITUDE,
    url: 'https://eqms.doe.gov.my/api3/publicportalapims/mapcaqm',
    cadence_s: 3600,
    stale_after_s: 7200,
    licence_id: 'unpublished',
    licence_label: 'no published terms',
    latest_reading: {
      id: '019b7f4a-1e00-7000-8000-000000000101',
      source_id: id,
      poll_id: null,
      metric: 'api',
      unit: null,
      observed_at: `${row.RECORD_DT.replace(' ', 'T')}+08:00`,
      received_at: `${row.RECORD_DT.replace(' ', 'T')}+08:00`,
      value: row.API,
      value_text: row.CLASS ?? null,
      value_json: null,
      device_time: null,
      item_key: null,
      revision: '0'
    },
    age_s: 0,
    source_state: { state: 'fresh', since: '2026-11-05T13:00:00.000Z', http_status: 200, pending_until: null }
  }
}

const site = { lat: 3.0559, lon: 101.6997 }

test('APU to CA16W Cheras is 5.9 km within the captured-data tolerance', () => {
  const cheras = capturedSource('CA16W', '019b7f4a-1e00-7000-8000-000000000001')
  expect(distanceKm(site, cheras)).toBeCloseTo(5.9, 0)
  expect(formatDistanceKm(distanceKm(site, cheras))).toBe('5.9')
})

test('catalogue rows sort by distance and search matches station name or ID', () => {
  const far = capturedSource('CA01R', '019b7f4a-1e00-7000-8000-000000000002')
  const cheras = capturedSource('CA16W', '019b7f4a-1e00-7000-8000-000000000001')
  const ordered = sortSources([far, cheras], site)
  expect(ordered.map((source) => source.external_id)).toEqual(['CA16W', 'CA01R'])
  expect(filterSources(ordered, 'CA16W').map((source) => source.external_id)).toEqual(['CA16W'])
  expect(filterSources(ordered, 'Cheras').map((source) => source.external_id)).toEqual(['CA16W'])
})

test('progress is the exact share of completed or skipped steps', () => {
  expect(
    progressForSteps([
      { completed_at: '2026-11-05T13:00:00.000Z', skipped: false },
      { completed_at: null, skipped: true },
      { completed_at: null, skipped: false },
      { completed_at: null, skipped: false },
      { completed_at: null, skipped: false },
      { completed_at: null, skipped: false }
    ])
  ).toEqual({ completed: 2, total: 6, percentage: (2 / 6) * 100 })
})

test('each first-run step is done, skipped, the next one, or still to do', () => {
  const step = (completed: boolean, skipped = false) => ({
    completed_at: completed ? '2026-11-05T13:13:00Z' : null,
    skipped
  })
  expect(stepStates([step(true), step(false), step(false, true), step(false), step(false)])).toEqual([
    'done',
    'current',
    'skipped',
    'todo',
    'todo'
  ])
  // A skipped step is never the next one; the first open step after it is.
  expect(stepStates([step(false, true), step(false)])).toEqual(['skipped', 'current'])
  expect(stepStates([step(true), step(false, true)])).toEqual(['done', 'skipped'])
})

test('the first run is finished once every step is done or skipped', () => {
  const step = (completed: boolean, skipped = false) => ({
    completed_at: completed ? '2026-11-12T01:00:00.000Z' : null,
    skipped
  })
  expect(firstRunFinished([step(true), step(false, true)])).toBe(true)
  expect(firstRunFinished([step(true), step(false)])).toBe(false)
})

test('the first project’s overview is read from the steps’ own links', () => {
  const steps = (channel: string) => [
    { step: 'sources', href: '/campus/bukit-jalil/settings/packs' },
    { step: 'channel', href: channel }
  ]
  expect(projectHomeHref(steps('/campus/bukit-jalil/settings/channels'))).toBe('/campus/bukit-jalil')
  // No project yet: the channel step points at the project form, and there is no overview to open.
  expect(projectHomeHref(steps('/campus/new'))).toBeNull()
})
