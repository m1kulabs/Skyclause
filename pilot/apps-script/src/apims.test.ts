import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  decodeApimsBackfillState,
  runApimsHandler,
  runApimsPoll,
  type ApimsBackfillState,
  type ApimsPollPorts
} from './apims.ts'
import { APIMS_ENDPOINT, APIMS_STATIONS, apimsHistoryKey, apimsHistoryUrl } from './apims-parser.ts'
import { validateReading } from './readings.ts'
import type { Row } from './schema.ts'

const fixtures = join(import.meta.dir, '../../fixtures')
const latestBody = readFileSync(join(fixtures, 'mapcaqm-20261105T1313Z.json'), 'utf8')
const manifest = JSON.parse(
  readFileSync(join(fixtures, 'apims/apitablehourly-20261107-capture-manifest.json'), 'utf8')
) as { requests: { file: string; url: string }[] }
const end = '2026-11-03T23:00:00+08:00'
function batch(stateId: 14 | 10 | 16 = 14, completed = false): ApimsBackfillState {
  const stationId = APIMS_STATIONS.find((s) => s.stateId === stateId)!.id
  return {
    version: 1,
    requests: [0, 1, 2].map((i) => ({
      stationId,
      stateId,
      end: `2026-11-0${3 - i}T23:00:00+08:00`,
      attempts: 0,
      completed
    }))
  }
}
function harness() {
  const db = {
    sources: [] as Row<'sources'>[],
    readings: [] as Row<'readings'>[],
    polls: [] as Row<'polls'>[],
    state: null as ApimsBackfillState | null
  }
  let time = Date.parse('2026-11-03T23:10:00+08:00')
  let id = 0
  const calls: string[] = []
  let evaluations = 0
  const ports: ApimsPollPorts = {
    now: () => new Date(time),
    newPollId: () => `poll-${++id}`,
    fetch: (url) => {
      calls.push(url)
      return { status: 200, body: url === APIMS_ENDPOINT ? latestBody : '{"api_table_hourly":[]}' }
    },
    readSources: () => structuredClone(db.sources),
    appendSources: (rows) => db.sources.push(...structuredClone(rows)),
    readReadings: () => structuredClone(db.readings),
    readPolls: () => structuredClone(db.polls),
    appendReadings: (rows) => db.readings.push(...structuredClone(rows)),
    appendPoll: (row) => {
      db.polls.push(structuredClone(row))
    },
    readBackfillState: () => structuredClone(db.state),
    saveBackfillState: (state) => {
      db.state = structuredClone(state)
    },
    evaluate: () => {
      evaluations++
    }
  }
  return {
    db,
    calls,
    ports,
    evaluations: () => evaluations,
    setTime: (iso: string) => {
      time = Date.parse(iso)
    },
    advance: (ms: number) => {
      time += ms
    }
  }
}
function noHistory(h: ReturnType<typeof harness>) {
  h.db.state = { version: 1, requests: APIMS_STATIONS.flatMap((s) => batch(s.stateId, true).requests) }
}
function morning(stationId: string, date: string): Row<'readings'> {
  return {
    source_kind: 'apims',
    source_id: stationId,
    metric: 'api',
    observed_at: `${date}T06:00:00+08:00`,
    value: 0,
    revision: 1
  }
}

describe('APIMS map polling and revisions', () => {
  test('registers real sources, records one aggregate map poll and valid reading metadata', () => {
    const h = harness()
    noHistory(h)
    const result = runApimsPoll(h.ports)
    expect(h.calls).toEqual([APIMS_ENDPOINT])
    expect(h.db.sources).toEqual(
      APIMS_STATIONS.map((s) => ({
        source_id: s.id,
        kind: 'apims',
        name: s.name,
        cadence_min: 60,
        stale_after_min: 120,
        freshness: 'observed',
        licence: 'No published terms found (5 Nov 2026)',
        url: APIMS_ENDPOINT
      }))
    )
    expect(result.latestPoll).toEqual({
      poll_id: 'poll-1',
      source_kind: 'apims',
      source_id: 'apims',
      started_at: '2026-11-03T23:10:00+08:00',
      received_at: '2026-11-03T23:10:00+08:00',
      http_status: 200,
      latency_ms: 0,
      outcome: 'ok',
      new_rows: 3
    })
    expect(result.newReadings).toHaveLength(3)
    for (const row of result.newReadings) {
      expect(validateReading(row)).toEqual([])
      expect(row).toMatchObject({
        reading_id: `${row.source_id}:api:2026-11-05T21:00:00+08:00`,
        source_kind: 'apims',
        metric: 'api',
        unit: 'API',
        http_status: 200,
        latency_ms: 0,
        poll_id: 'poll-1',
        revision: 1,
        note: '{"class":"Moderate"}'
      })
    }
    expect(h.evaluations()).toBe(1)
    expect(h.db.polls).toHaveLength(1)
  })
  test('keeps existing source rows and does not append identical responses or class-only differences', () => {
    const h = harness()
    noHistory(h)
    h.db.sources = [{ source_id: 'CA16W', kind: 'apims', state: 'custom' }]
    runApimsPoll(h.ports)
    h.ports.fetch = () => ({ status: 200, body: latestBody.replaceAll('Moderate', 'Good') })
    expect(runApimsPoll(h.ports).newReadings).toEqual([])
    expect(h.db.sources[0]).toEqual({ source_id: 'CA16W', kind: 'apims', state: 'custom' })
    expect(h.db.sources).toHaveLength(3)
    expect(h.db.polls[1]!.outcome).toBe('unchanged')
  })
  test('a changed map response appends one revision with its own receipt metadata', () => {
    const h = harness()
    noHistory(h)
    runApimsPoll(h.ports)
    const old = structuredClone(h.db.readings)
    h.setTime('2026-11-03T23:11:00+08:00')
    const body = JSON.parse(latestBody)
    body.data.find((r: { STATION_ID: string }) => r.STATION_ID === 'CA16W').API = 68
    h.ports.fetch = () => {
      h.advance(125)
      return { status: 200, body: JSON.stringify(body) }
    }
    const result = runApimsPoll(h.ports)
    expect(result.newReadings).toHaveLength(1)
    expect(result.newReadings[0]).toMatchObject({
      source_id: 'CA16W',
      value: 68,
      revision: 2,
      received_at: '2026-11-03T23:11:00+08:00',
      latency_ms: 125,
      poll_id: 'poll-2',
      http_status: 200,
      note: '{"class":"Moderate"}'
    })
    expect(h.db.readings.slice(0, 3)).toEqual(old)
  })
  test('unrelated APIMS source IDs do not block or expand the fixed bound stations', () => {
    const h = harness()
    noHistory(h)
    h.db.sources = [{ source_id: 'unrelated', kind: 'apims', name: 'Existing configuration' }]
    runApimsPoll(h.ports)
    expect(h.db.sources).toHaveLength(4)
    expect(h.db.sources[0]).toEqual({ source_id: 'unrelated', kind: 'apims', name: 'Existing configuration' })
    expect(h.db.readings.every((r) => APIMS_STATIONS.some((s) => s.id === r.source_id))).toBe(true)
  })
  test('uses native Date observations and highest stored revision, preserving immutable older rows', () => {
    const h = harness()
    noHistory(h)
    h.db.readings = [
      {
        source_kind: 'apims',
        source_id: 'CA16W',
        metric: 'api',
        observed_at: new Date('2026-11-05T21:00:00+08:00'),
        value: 1,
        revision: 7,
        note: 'old'
      },
      {
        source_kind: 'apims',
        source_id: 'CA16W',
        metric: 'api',
        observed_at: '2026-11-05T21:00:00+08:00',
        value: 67,
        revision: 2
      }
    ]
    const old = structuredClone(h.db.readings)
    const result = runApimsPoll(h.ports)
    expect(result.newReadings.find((r) => r.source_id === 'CA16W')).toMatchObject({
      value: 67,
      revision: 8,
      note: '{"class":"Moderate"}'
    })
    expect(h.db.readings.slice(0, 2)).toEqual(old)
  })
  test('explicitly rejects a bound source ID with the wrong kind before HTTP', () => {
    const h = harness()
    h.db.sources.push({ source_id: 'CA16W', kind: 'jps_rain' })
    expect(() => runApimsPoll(h.ports)).toThrow(/source|kind/i)
    expect(h.calls).toEqual([])
  })
  for (const status of [429, 500, 0, 200])
    test(`records source failure ${status} once and evaluates once`, () => {
      const h = harness()
      noHistory(h)
      h.ports.fetch = () => {
        if (status === 0) throw new Error('network')
        return { status, body: status === 200 ? '{}' : 'failure' }
      }
      const result = runApimsPoll(h.ports)
      expect(result.latestPoll).toMatchObject({ outcome: 'error', http_status: status, new_rows: 0 })
      expect(result.newReadings).toEqual([])
      expect(h.db.polls).toHaveLength(1)
      expect(h.evaluations()).toBe(1)
    })
  test('keeps missing/invalid API diagnostics while ingesting valid peers and genuine zero', () => {
    const h = harness()
    noHistory(h)
    const body = JSON.parse(latestBody)
    body.data.find((r: { STATION_ID: string }) => r.STATION_ID === 'CA16W').API = null
    body.data.find((r: { STATION_ID: string }) => r.STATION_ID === 'CA19B').API = 0
    h.ports.fetch = () => ({ status: 200, body: JSON.stringify(body) })
    const result = runApimsPoll(h.ports)
    expect(result.newReadings).toHaveLength(2)
    expect(result.latestPoll.error).toContain('CA16W')
    expect(result.newReadings.find((r) => r.source_id === 'CA19B')!.value).toBe(0)
  })
  for (const operation of ['appendSources', 'readReadings', 'appendReadings', 'appendPoll'] as const)
    test(`propagates ${operation} storage errors`, () => {
      const h = harness()
      noHistory(h)
      h.ports[operation] = () => {
        throw new Error('storage failure')
      }
      expect(() => runApimsPoll(h.ports)).toThrow('storage failure')
      expect(h.db.polls.filter((p) => p.http_status === 0)).toEqual([])
    })
})

describe('APIMS history planning and checkpoints', () => {
  test('ingests all nine real requests as 219 unique hours with literal 06:00 series, then stops', () => {
    const h = harness()
    h.ports.fetch = (url) => {
      h.calls.push(url)
      const capture = manifest.requests.find((r) => r.url === url)
      return {
        status: 200,
        body: url === APIMS_ENDPOINT ? '{"data":[]}' : readFileSync(join(fixtures, 'apims', capture!.file), 'utf8')
      }
    }
    const result = runApimsPoll(h.ports)
    expect(result.historyPolls).toHaveLength(9)
    expect(result.newReadings).toHaveLength(219)
    expect(result.pendingHistory).toBe(0)
    expect(new Set(h.calls.slice(1)).size).toBe(9)
    const expected = { CA16W: [81, 83, 65], CA19B: [65, 70, 62], CA17W: [73, 84, 67] }
    for (const station of APIMS_STATIONS) {
      expect(h.db.readings.filter((r) => r.source_id === station.id)).toHaveLength(73)
      expect(
        [1, 2, 3].map(
          (day) =>
            h.db.readings.find((r) => r.source_id === station.id && r.observed_at === `2026-11-0${day}T06:00:00+08:00`)!
              .value
        )
      ).toEqual(expected[station.id])
    }
    expect(h.evaluations()).toBe(1)
    h.calls.length = 0
    runApimsPoll(h.ports)
    expect(h.calls).toEqual([APIMS_ENDPOINT])
  })
  test('schedules by hour slot then state order and freezes all plans before first history HTTP', () => {
    const h = harness()
    const original = h.ports.fetch
    h.ports.fetch = (url) => {
      if (url !== APIMS_ENDPOINT) expect(h.db.state!.requests).toHaveLength(9)
      return original(url)
    }
    runApimsPoll(h.ports)
    expect(h.calls.slice(1)).toEqual(
      [3, 2, 1].flatMap((day) => [14, 10, 16].map((state) => apimsHistoryUrl(state, `2026-11-0${day}T23:00:00+08:00`)))
    )
    expect(h.db.state!.requests.every((r) => r.completed && r.attempts === 1)).toBe(true)
    expect(h.db.polls.slice(1).every((p) => p.outcome === 'empty')).toBe(true)
  })
  for (const [clock, dates] of [
    ['2026-11-03T05:59:00+08:00', ['2026-11-02', '2026-11-01', '2026-10-31']],
    ['2026-11-03T06:00:00+08:00', ['2026-11-03', '2026-11-02', '2026-11-01']],
    ['2027-01-01T04:00:00+08:00', ['2026-12-31', '2026-12-30', '2026-12-29']],
    ['2026-12-01T07:00:00+08:00', ['2026-12-01', '2026-11-30', '2026-11-29']]
  ] as const)
    test(`skips states with three eligible mornings at ${clock}`, () => {
      const h = harness()
      h.setTime(clock)
      h.db.readings = APIMS_STATIONS.flatMap((s) => dates.map((d) => morning(s.id, d)))
      runApimsPoll(h.ports)
      expect(h.calls).toEqual([APIMS_ENDPOINT])
      expect(h.db.state).toBeNull()
    })
  test('creates missing state plans while retaining pending frozen hours after day changes', () => {
    const h = harness()
    h.db.state = batch()
    h.setTime('2027-01-01T07:00:00+08:00')
    runApimsPoll(h.ports)
    expect(h.calls[1]).toBe(apimsHistoryUrl(14, end))
    expect(h.db.state!.requests).toHaveLength(9)
    expect(h.db.state!.requests.filter((r) => r.stateId === 14).map((r) => r.end)).toEqual(
      batch().requests.map((r) => r.end)
    )
  })
  test('previously recorded deterministic history keys complete without refetching', () => {
    const h = harness()
    h.db.state = batch()
    h.db.state.requests.push(...batch(10, true).requests, ...batch(16, true).requests)
    h.db.polls = batch().requests.map((r) => ({
      source_kind: 'apims_backfill',
      source_id: apimsHistoryKey(r.stateId, r.end),
      outcome: 'error'
    }))
    runApimsPoll(h.ports)
    expect(h.calls).toEqual([APIMS_ENDPOINT])
    expect(h.db.state.requests.every((r) => r.completed)).toBe(true)
  })
  test('prior history poll prevents only its own unrepresented state from planning', () => {
    const h = harness()
    h.db.polls = [{ source_kind: 'apims_backfill', source_id: apimsHistoryKey(14, end), outcome: 'error' }]
    const result = runApimsPoll(h.ports)
    expect(result.historyPolls).toHaveLength(6)
    expect(h.db.state!.requests.map((r) => r.stateId)).not.toContain(14)
    expect(h.db.state!.requests.filter((r) => r.stateId === 10)).toHaveLength(3)
    expect(h.db.state!.requests.filter((r) => r.stateId === 16)).toHaveLength(3)
  })
  test('a missing newest eligible morning plans exactly its state at a year boundary', () => {
    const h = harness()
    h.setTime('2027-01-01T07:15:00+08:00')
    h.db.readings = APIMS_STATIONS.flatMap((s) =>
      ['2027-01-01', '2026-12-31', '2026-12-30'].map((d) => morning(s.id, d))
    ).filter((r) => !(r.source_id === 'CA19B' && String(r.observed_at).startsWith('2027-01-01')))
    runApimsPoll(h.ports)
    expect(h.calls.slice(1)).toEqual(
      ['2027-01-01', '2026-12-31', '2026-12-30'].map((day) => apimsHistoryUrl(10, `${day}T07:00:00+08:00`))
    )
  })
  test('an attempt checkpoint failure prevents HTTP and propagates unchanged', () => {
    const h = harness()
    const save = h.ports.saveBackfillState
    h.ports.saveBackfillState = (state) => {
      if (state.requests.some((r) => r.attempts > 0)) throw new Error('attempt checkpoint')
      save(state)
    }
    expect(() => runApimsPoll(h.ports)).toThrow('attempt checkpoint')
    expect(h.calls).toEqual([APIMS_ENDPOINT])
    expect(h.db.state!.requests.every((r) => r.attempts === 0)).toBe(true)
  })
  test('a plan checkpoint failure prevents all history HTTP', () => {
    const h = harness()
    h.ports.saveBackfillState = () => {
      throw new Error('plan checkpoint')
    }
    expect(() => runApimsPoll(h.ports)).toThrow('plan checkpoint')
    expect(h.calls).toEqual([APIMS_ENDPOINT])
  })
  test('history readings persisted before a failed poll are deduplicated on retry', () => {
    const h = harness()
    const append = h.ports.appendPoll
    const first = apimsHistoryUrl(14, end)
    h.ports.fetch = (url) => {
      h.calls.push(url)
      const capture = manifest.requests.find((r) => r.url === url)
      return {
        status: 200,
        body: url === APIMS_ENDPOINT ? '{"data":[]}' : readFileSync(join(fixtures, 'apims', capture!.file), 'utf8')
      }
    }
    h.ports.appendPoll = (row) => {
      if (row.source_id === apimsHistoryKey(14, end)) throw new Error('poll did not persist')
      append(row)
    }
    expect(() => runApimsPoll(h.ports)).toThrow('poll did not persist')
    expect(h.db.readings).toHaveLength(25)
    h.ports.appendPoll = append
    h.calls.length = 0
    const report = runApimsPoll(h.ports)
    expect(h.calls).toContain(first)
    expect(h.db.readings).toHaveLength(219)
    expect(h.db.readings.every((r) => r.revision === 1)).toBe(true)
    expect(report.historyPolls.find((p) => p.source_id === apimsHistoryKey(14, end))!.outcome).toBe('unchanged')
  })
  test('failed history attempts are explicitly recorded and permanently complete', () => {
    const h = harness()
    const original = h.ports.fetch
    h.ports.fetch = (url) => (url === APIMS_ENDPOINT ? original(url) : { status: 500, body: 'failure' })
    expect(runApimsPoll(h.ports).historyPolls.every((p) => p.outcome === 'error' && p.http_status === 500)).toBe(true)
    h.calls.length = 0
    runApimsPoll(h.ports)
    expect(h.calls).toEqual([APIMS_ENDPOINT])
  })
  test('preserves map class on identical historical overlap and appends class-absent numeric revisions', () => {
    const h = harness()
    h.db.state = {
      version: 1,
      requests: [...batch().requests, ...batch(10, true).requests, ...batch(16, true).requests]
    }
    h.ports.fetch = (url) => {
      h.calls.push(url)
      return {
        status: 200,
        body:
          url === APIMS_ENDPOINT
            ? JSON.stringify({
                data: [
                  {
                    STATION_ID: 'CA16W',
                    STATE_ID: 14,
                    STATION_LOCATION: 'Cheras',
                    RECORD_DT: '2026-11-03T23:00:00',
                    API: 67,
                    CLASS: 'Moderate'
                  }
                ]
              })
            : JSON.stringify({
                api_table_hourly:
                  url === apimsHistoryUrl(14, end)
                    ? [
                        {
                          STATION_ID: 'CA16W',
                          STATE_ID: 14,
                          STATION_LOCATION: 'Cheras',
                          DATETIME: '2026-11-03T23:00:00',
                          API: 67
                        }
                      ]
                    : []
              })
      }
    }
    runApimsPoll(h.ports)
    expect(h.db.readings).toHaveLength(1)
    expect(h.db.readings[0]!.note).toBe('{"class":"Moderate"}')
    h.db.state!.requests[0]!.completed = false
    h.db.polls = h.db.polls.filter((p) => p.source_id !== apimsHistoryKey(14, end))
    const original = h.ports.fetch
    h.ports.fetch = (url) => {
      const response = original(url)
      return url === APIMS_ENDPOINT ? response : { ...response, body: response.body.replace('"API":67', '"API":68') }
    }
    runApimsPoll(h.ports)
    expect(h.db.readings).toHaveLength(2)
    expect(h.db.readings[1]).toMatchObject({ value: 68, revision: 2, note: '{}' })
    expect(h.db.readings[0]!.note).toBe('{"class":"Moderate"}')
  })
  test('replays persisted-then-thrown history polls without refetching and never duplicates readings', () => {
    const h = harness()
    const append = h.ports.appendPoll
    h.ports.fetch = (url) => {
      h.calls.push(url)
      const capture = manifest.requests.find((r) => r.url === url)
      return {
        status: 200,
        body: url === APIMS_ENDPOINT ? '{"data":[]}' : readFileSync(join(fixtures, 'apims', capture!.file), 'utf8')
      }
    }
    let broken = true
    h.ports.appendPoll = (row) => {
      append(row)
      if (row.source_kind === 'apims_backfill' && broken) throw new Error('poll persisted')
    }
    expect(() => runApimsPoll(h.ports)).toThrow('poll persisted')
    expect(h.db.readings).toHaveLength(25)
    const first = h.calls[1]!
    expect(h.db.state!.requests.find((r) => apimsHistoryUrl(r.stateId, r.end) === first)!.completed).toBe(false)
    broken = false
    h.calls.length = 0
    runApimsPoll(h.ports)
    expect(h.calls).not.toContain(first)
    expect(h.db.readings).toHaveLength(219)
    expect(new Set(h.db.readings.map((r) => r.reading_id)).size).toBe(219)
  })
  test('retries after a readings write persisted before throwing without duplicate revisions', () => {
    const h = harness()
    noHistory(h)
    const append = h.ports.appendReadings
    h.ports.appendReadings = (rows) => {
      append(rows)
      throw new Error('readings persisted')
    }
    expect(() => runApimsPoll(h.ports)).toThrow('readings persisted')
    h.ports.appendReadings = append
    expect(runApimsPoll(h.ports).newReadings).toEqual([])
    expect(h.db.readings).toHaveLength(3)
  })
  test('failed completion save is reconciled from the durable poll before refetch', () => {
    const h = harness()
    const save = h.ports.saveBackfillState
    let broken = true
    h.ports.saveBackfillState = (state) => {
      if (broken && state.requests.some((r) => r.completed)) throw new Error('checkpoint')
      save(state)
    }
    expect(() => runApimsPoll(h.ports)).toThrow('checkpoint')
    const first = h.calls[1]!
    broken = false
    h.calls.length = 0
    runApimsPoll(h.ports)
    expect(h.calls).not.toContain(first)
  })
  test('permits one history request even after map consumes the soft budget, then yields', () => {
    const h = harness()
    const fetch = h.ports.fetch
    h.ports.fetch = (url) => {
      const response = fetch(url)
      h.advance(90_000)
      return response
    }
    const result = runApimsPoll(h.ports)
    expect(result.historyPolls).toHaveLength(1)
    expect(result.pendingHistory).toBe(8)
    expect(h.db.state!.requests).toHaveLength(9)
  })
  test('one-request invocation budgets advance across states with durable attempts', () => {
    const h = harness()
    const fetch = h.ports.fetch
    h.ports.fetch = (url) => {
      const response = fetch(url)
      h.advance(90_000)
      return response
    }
    for (let i = 0; i < 3; i++) runApimsPoll(h.ports)
    expect(h.calls.filter((url) => url !== APIMS_ENDPOINT)).toEqual(
      [14, 10, 16].map((state) => apimsHistoryUrl(state, end))
    )
  })
  test('a repeatedly interrupted first request cannot starve later states', () => {
    const h = harness()
    const append = h.ports.appendPoll
    const fetch = h.ports.fetch
    h.ports.fetch = (url) => {
      const response = fetch(url)
      h.advance(90_000)
      return response
    }
    h.ports.appendPoll = (row) => {
      if (row.source_id === apimsHistoryKey(14, end)) throw new Error('interrupted')
      append(row)
    }
    expect(() => runApimsPoll(h.ports)).toThrow('interrupted')
    runApimsPoll(h.ports)
    runApimsPoll(h.ports)
    expect(h.calls.filter((url) => url !== APIMS_ENDPOINT).slice(0, 3)).toEqual(
      [14, 10, 16].map((state) => apimsHistoryUrl(state, end))
    )
    expect(h.db.state!.requests.find((r) => r.stateId === 14 && r.end === end)!.attempts).toBe(1)
    for (let i = 0; i < 7; i++) {
      try {
        runApimsPoll(h.ports)
      } catch (error) {
        expect(String(error)).toContain('interrupted')
      }
    }
    expect(h.db.state!.requests.filter((r) => r.stateId === 10 || r.stateId === 16).every((r) => r.completed)).toBe(
      true
    )
    expect(h.db.state!.requests.find((r) => r.stateId === 14 && r.end === end)!.attempts).toBe(2)
  })
  test('outer handler takes one lock and releases it on fatal storage failure', () => {
    const h = harness()
    let held = false
    let locks = 0
    h.ports.appendSources = () => {
      expect(held).toBe(true)
      throw new Error('storage')
    }
    expect(() =>
      runApimsHandler({
        ports: h.ports,
        withLock: (fn) => {
          locks++
          held = true
          try {
            return fn()
          } finally {
            held = false
          }
        }
      })
    ).toThrow('storage')
    expect(held).toBe(false)
    expect(locks).toBe(1)
  })
})

describe('APIMS private state validation', () => {
  test('accepts absent and complete/pending valid batches without dropping completed records', () => {
    expect(decodeApimsBackfillState(null)).toBeNull()
    expect(decodeApimsBackfillState(JSON.stringify(batch()))).toEqual(batch())
    expect(decodeApimsBackfillState(JSON.stringify(batch(10, true)))).toEqual(batch(10, true))
  })
  type Candidate = {
    version: unknown
    requests: { stationId: unknown; stateId: unknown; end: unknown; attempts: unknown; completed: unknown }[]
  }
  const mutations: [string, (state: Candidate) => void][] = [
    [
      'version',
      (s) => {
        s.version = 2
      }
    ],
    [
      'station/state pairing',
      (s) => {
        s.requests[0]!.stationId = 'CA19B'
      }
    ],
    [
      'calendar hour',
      (s) => {
        s.requests[0]!.end = '2026-02-30T23:00:00+08:00'
      }
    ],
    [
      'minutes',
      (s) => {
        s.requests[0]!.end = '2026-11-03T23:01:00+08:00'
      }
    ],
    [
      'offset',
      (s) => {
        s.requests[0]!.end = end.slice(0, -6)
      }
    ],
    [
      'partial batch',
      (s) => {
        s.requests.pop()
      }
    ],
    [
      'duplicate',
      (s) => {
        s.requests.push({ ...s.requests[0]! })
      }
    ],
    [
      'negative attempts',
      (s) => {
        s.requests[0]!.attempts = -1
      }
    ],
    [
      'fractional attempts',
      (s) => {
        s.requests[0]!.attempts = 0.5
      }
    ],
    [
      'completion type',
      (s) => {
        s.requests[0]!.completed = 'false'
      }
    ],
    [
      '24-hour spacing',
      (s) => {
        s.requests[1]!.end = '2026-11-02T22:00:00+08:00'
      }
    ],
    [
      'too many records',
      (s) => {
        s.requests.push(...Array.from({ length: 7 }, () => ({ ...s.requests[0]! })))
      }
    ]
  ]
  for (const [label, mutate] of mutations)
    test(`rejects malformed state: ${label}`, () => {
      const state: Candidate = batch()
      mutate(state)
      expect(() => decodeApimsBackfillState(JSON.stringify(state))).toThrow()
    })
  for (const raw of ['null', '[]', '{}', 'bad', '{"version":1,"requests":null}'])
    test(`rejects present malformed state ${raw}`, () => expect(() => decodeApimsBackfillState(raw)).toThrow())
  test('invalid stored state causes no HTTP and no new plan', () => {
    const h = harness()
    h.ports.readBackfillState = () => ({ version: 2, requests: [] }) as unknown as ApimsBackfillState
    expect(() => runApimsPoll(h.ports)).toThrow()
    expect(h.calls).toEqual([])
    expect(h.db.state).toBeNull()
  })
})
