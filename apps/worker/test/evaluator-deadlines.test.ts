import { expect, test } from 'vitest'
import {
  check,
  snapshotAt,
  type ReadingHistory,
  type IndicatorRegistry,
  type Clause,
  type Window
} from '@skyclause/clauses'
import { nextEvaluationAt } from '../../../packages/api/src/services/evaluator/deadline'

const base = '2026-11-10T04:00:00Z'
const ms = Date.parse(base)
const iso = (delta: number) => new Date(ms + delta).toISOString()
const h = (kind: ReadingHistory['sources'][number]['kind'] = 'apims'): ReadingHistory => ({
  sources: [{ id: 's', kind, cadenceS: 300, staleAfterS: 600, freshness: 'observed', probation: false, meta: {} }],
  polls: [],
  readings: [
    {
      id: 'r',
      sourceId: 's',
      metric: 'api',
      observedAt: base,
      receivedAt: base,
      value: 20,
      valueText: null,
      valueJson: null,
      itemKey: '',
      revision: 1
    }
  ]
})
function plan(
  history: ReadingHistory,
  at = base,
  names = ['site.api_max'],
  windows: Window[] = [],
  extra: Partial<Clause> = {}
) {
  const registry: IndicatorRegistry = names.map((name) => ({
    name,
    sourceKind: history.sources[0]?.kind ?? 'apims',
    celType: name.includes('warning') ? 'bool' : 'int',
    scope: name.startsWith('w.') ? 'window' : 'site',
    unit: ''
  }))
  const sheet = check(
    {
      pack: 'sky',
      clauses: [
        {
          key: 'test',
          name: 'Test',
          enabled: true,
          scope: 'site',
          requires: names,
          when: 'true',
          proposes: { watch: true },
          wording: {},
          ...extra
        }
      ]
    },
    registry
  ).sheet!
  return nextEvaluationAt({
    history,
    sheet,
    windows,
    snapshot: snapshotAt(history, registry, 'p', 'sky', at),
    tEval: at
  })
}
test('floor-aged freshness changes at 601 seconds, never at 600 or a past deadline', () => {
  for (const delta of [0, 599999, 600000, 600999]) expect(Date.parse(plan(h(), iso(delta))!)).toBe(ms + 601000)
  expect(plan(h(), iso(601000))).toBeNull()
  expect(plan(h(), iso(601001))).toBeNull()
})
test('polled freshness uses last good poll, not observation or error poll', () => {
  const history = h()
  history.sources[0]!.freshness = 'polled'
  history.polls = [
    { id: 'poll', sourceId: 's', startedAt: iso(60000), receivedAt: iso(60000), outcome: 'unchanged', httpStatus: 304 }
  ]
  expect(Date.parse(plan(history, iso(60000))!)).toBe(ms + 661000)
  history.polls.push({
    ...history.polls[0]!,
    id: 'error',
    startedAt: iso(120000),
    receivedAt: iso(120000),
    outcome: 'error',
    httpStatus: null
  })
  expect(plan(history, iso(120000))).toBeNull()
})
test('pending, GTFS calendar and camera daylight use their actual boundaries', () => {
  const pending = h('rapidrail_od')
  pending.sources[0]!.meta = { next_update: iso(120000) }
  expect(Date.parse(plan(pending)!)).toBe(ms + 120000)
  expect(Date.parse(plan(pending, iso(120000))!)).toBe(ms + 601000)
  const gtfs = h('gtfs_static')
  gtfs.sources[0]!.staleAfterS = 100000
  gtfs.sources[0]!.meta = { calendar_end: '2026-11-10' }
  expect(plan(gtfs)).toBe('2026-11-10T16:00:00Z')
  const camera = h('camera')
  camera.sources[0]!.meta = { camera_day_start: '12:02', camera_day_end: '12:04' }
  expect(Date.parse(plan(camera)!)).toBe(ms + 120000)
  expect(Date.parse(plan(camera, iso(120000))!)).toBe(ms + 240000)
})
test('MET actual validity and forecast local date boundaries are derived', () => {
  const warning = h('met_warning')
  warning.warningAreaTerms = ['Kuala Lumpur']
  warning.sources[0]!.staleAfterS = 100000
  warning.readings[0]!.value = true
  warning.readings[0]!.valueJson = { valid_from_utc: iso(10000), valid_to_utc: iso(20000), text_en: 'Kuala Lumpur' }
  expect(Date.parse(plan(warning, base, ['site.met_warning_in_force'])!)).toBe(ms + 10000)
  expect(Date.parse(plan(warning, iso(10000), ['site.met_warning_in_force'])!)).toBe(ms + 20001)
  const forecast = h('met_forecast')
  forecast.sources[0]!.staleAfterS = 100000
  forecast.readings[0]!.valueJson = { date: '2026-11-10' }
  expect(plan(forecast, base, ['site.met_afternoon_thunderstorm'])).toBe('2026-11-10T16:00:00Z')
})
test('APIMS morning boundary follows actual six-am daily rotation', () => {
  const history = h()
  history.sources[0]!.staleAfterS = 200000
  history.readings = [0, 1, 2].map((day) => ({
    ...history.readings[0]!,
    id: 'morning-' + day,
    observedAt: new Date(Date.parse('2026-11-09T22:00:00Z') - day * 86400000).toISOString(),
    receivedAt: new Date(Date.parse('2026-11-09T22:00:00Z') - day * 86400000).toISOString()
  }))
  expect(plan(history, base, ['site.api_0600_min_last3_max'])).toBe('2026-11-10T22:00:00Z')
})
test('future span opening and terminal completion survive empty history; absent bounds are not invented', () => {
  const empty: ReadingHistory = { sources: [], polls: [], readings: [] }
  const windows: Window[] = [
    { id: 'w', startsAt: iso(3600000), endsAt: iso(7200000), kind: 'class', tz: 'Asia/Kuala_Lumpur' }
  ]
  const extra = { scope: 'window' as const, span: { from: 'start-30m', to: 'end+60m' } }
  expect(Date.parse(plan(empty, base, [], windows, extra)!)).toBe(ms + 1800000)
  expect(Date.parse(plan(empty, iso(7200000), [], windows, extra)!)).toBe(ms + 10800000)
  expect(plan(empty, iso(10800000), [], windows, extra)).toBeNull()
  expect(plan(empty, base, [], [])).toBeNull()
})
test('rolling rain plans a grid boundary only inside a real unfinished span', () => {
  const history = h('jps_rain')
  history.sources[0]!.staleAfterS = 100000
  const windows: Window[] = [
    { id: 'w', startsAt: iso(-3600000), endsAt: iso(600000), kind: 'class', tz: 'Asia/Kuala_Lumpur' }
  ]
  expect(Date.parse(plan(history, base, ['w.rain_max_60m_mm'], windows, { scope: 'window' })!)).toBe(ms + 300000)
  expect(Date.parse(plan(history, iso(4200000), ['w.rain_max_60m_mm'], windows, { scope: 'window' })!)).not.toBe(
    ms + 4500000
  )
})

import { cloudEvaluatorTasks, TaskNameUnavailable } from '../src/evaluator/cloud-tasks'
import { createEvaluatorPart } from '../src/evaluator'
import { createEvaluatorProviders } from '@skyclause/api'
import { vi } from 'vitest'
const taskIntent = {
  org: '00000000-0000-4000-8000-000000000001',
  project: '00000000-0000-4000-8000-000000000002',
  generation: '00000000-0000-4000-8000-000000000003',
  dueAt: '2026-11-10T05:00:00.000Z',
  taskName: 'eval-hash',
  createdAt: null
}
test('transport keeps tiny exact payload and invoker OIDC, rejects tombstone 409, accepts deletion 404', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  let status = 200
  const tasks = cloudEvaluatorTasks({
    config: () => ({
      project: 'gcp',
      region: 'asia-southeast1',
      workerUrl: 'https://worker.test',
      invoker: 'invoker@test'
    }),
    token: async () => 'token',
    fetch: (async (url, init) => {
      requests.push({ url: String(url), init })
      return new Response('', { status })
    }) as typeof fetch
  })
  await tasks.create(taskIntent)
  const payload = JSON.parse(String(requests[0]!.init!.body)).task
  expect(payload.httpRequest.oidcToken).toEqual({
    serviceAccountEmail: 'invoker@test',
    audience: 'https://worker.test'
  })
  expect(JSON.parse(Buffer.from(payload.httpRequest.body, 'base64').toString())).toEqual({
    org: taskIntent.org,
    project: taskIntent.project,
    generation: taskIntent.generation,
    dueAt: taskIntent.dueAt
  })
  expect(String(requests[0]!.init!.body).length).toBeLessThan(100000)
  status = 409
  await expect(tasks.create(taskIntent)).rejects.toBeInstanceOf(TaskNameUnavailable)
  status = 404
  await tasks.remove(taskIntent.taskName)
  expect(requests.at(-1)!.init!.method).toBe('DELETE')
  status = 503
  await expect(tasks.remove(taskIntent.taskName)).rejects.toThrow('503')
})
test('factory is lazy and has only the batch, real topic, domain consumers and queue seams', () => {
  const create = vi.fn(),
    remove = vi.fn()
  const part = createEvaluatorPart({
    providers: createEvaluatorProviders({ adapters: [], forecast: null }),
    clock: () => new Date(base),
    tasks: { create, remove }
  })
  expect(part.ticks).toBeUndefined()
  expect(Object.keys(part.batch!)).toEqual(['evaluator-repair'])
  expect(part.topics!['readings-updated']).toBeTypeOf('function')
  expect(part.queues!['evaluator-deadlines']).toBeTypeOf('function')
  expect(part.events!.flatMap((x) => x.types)).toEqual(
    expect.arrayContaining(['poll.recorded', 'window.updated', 'clause_sheet.published', 'source.bound'])
  )
  expect(create).not.toHaveBeenCalled()
  expect(remove).not.toHaveBeenCalled()
})

test('missing APIMS morning coverage never becomes a daily polling deadline', () => {
  const history = h()
  history.sources[0]!.staleAfterS = 1
  expect(plan(history, iso(5000), ['site.api_0600_min_last3_max'])).toBeNull()
})

test('MET missing validity never fabricates an infinite warning boundary', () => {
  const history = h('met_warning')
  history.warningAreaTerms = ['Kuala Lumpur']
  history.sources[0]!.staleAfterS = 1
  history.readings[0]!.value = true
  history.readings[0]!.valueJson = { valid_to_utc: iso(500000), text_en: 'Kuala Lumpur' }
  expect(plan(history, iso(5000), ['site.met_warning_in_force'])).toBeNull()
  history.readings[0]!.valueJson = { valid_from_utc: iso(500000), text_en: 'Kuala Lumpur' }
  expect(plan(history, iso(5000), ['site.met_warning_in_force'])).toBeNull()
})

test('MET deadlines use the same project terms, raw bilingual text and strict exclusions as snapshots', () => {
  const warning = h('met_warning')
  warning.sources[0]!.staleAfterS = 100000
  warning.readings[0]!.valueJson = {
    warning_issue: { title_en: 'Thunderstorms Warning' },
    valid_from_utc: iso(10000),
    valid_to_utc: iso(20000),
    text_en: 'Kedah',
    text_bm: 'Amaran di Kedah',
    excluded: false
  }
  warning.warningAreaTerms = ['Kedah']
  expect(Date.parse(plan(warning, base, ['site.met_warning_in_force'])!)).toBe(ms + 10000)
  warning.warningAreaTerms = ['Kuala Lumpur']
  expect(Date.parse(plan(warning, base, ['site.met_warning_in_force'])!)).not.toBe(ms + 10000)
  delete warning.warningAreaTerms
  expect(Date.parse(plan(warning, base, ['site.met_warning_in_force'])!)).not.toBe(ms + 10000)
  warning.warningAreaTerms = ['Kedah']
  warning.readings[0]!.valueJson!.excluded = true
  expect(Date.parse(plan(warning, base, ['site.met_warning_in_force'])!)).not.toBe(ms + 10000)
})
