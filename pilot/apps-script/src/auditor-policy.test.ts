import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { evaluateAudit, type AuditCrossingFile, type AuditInput } from './auditor-policy.ts'
import { parseJpsRainfall } from './jps.ts'
import { validateReading } from './readings.ts'
import type { Row } from './schema.ts'

const capture: unknown = JSON.parse(
  readFileSync(new URL('../../fixtures/rainfall-graph-75-20261105T1312Z.json', import.meta.url), 'utf8')
)
const gauge: Row<'sources'> = { source_id: '0232901RF', kind: 'jps_rain', stale_after_min: 10 }
const readings: Row<'readings'>[] = parseJpsRainfall(capture).map(({ observedAt, value }) => ({
  reading_id: `0232901RF:rain_5m_mm:${observedAt}`,
  source_id: '0232901RF',
  source_kind: 'jps_rain',
  metric: 'rain_5m_mm',
  observed_at: observedAt,
  value,
  received_at: '2026-11-05T21:00:00+08:00',
  http_status: 200,
  latency_ms: 0,
  revision: 1
}))
function input(overrides: Partial<AuditInput> = {}): AuditInput {
  return {
    sources: [],
    readings: [],
    polls: [],
    devices: [],
    crowdGrades: [],
    ledger: [],
    crossings: [],
    dayStart: null,
    dayEnd: null,
    refresh: { status: 'readable', value: null },
    ...overrides
  }
}
function at(clock: string): Date {
  return new Date(`2026-11-05T${clock}+08:00`)
}
function observation(data: AuditInput, time = at('21:15:00'), ref = '0232901RF') {
  return evaluateAudit(data, time).observations.find((item) => item.ref === ref)
}
function source(ref: string, kind: string, threshold: number): Row<'sources'> {
  return { source_id: ref, kind, stale_after_min: threshold }
}
function reading(
  ref: string,
  kind: string,
  observed_at: Row<'readings'>['observed_at'],
  metric = 'api',
  value: Row<'readings'>['value'] = 0
): Row<'readings'> {
  return { source_id: ref, source_kind: kind, observed_at, metric, value }
}
function poll(
  source_kind: string,
  source_id: string,
  received_at: Row<'polls'>['received_at'],
  outcome = 'ok',
  http_status = 200
): Row<'polls'> {
  return { source_kind, source_id, received_at, outcome, http_status }
}
function grade(
  night_id: string,
  graded_at: Row<'crowd_grades'>['graded_at'],
  outcome = 'pending',
  next_update: Row<'crowd_grades'>['next_update'] = '2026-11-05 18:00'
): Row<'crowd_grades'> {
  return { night_id, graded_at, outcome, next_update }
}
function crossing(
  pack: 'sky' | 'crowd' = 'sky',
  changes: unknown = [
    { scope: 'site', window: null, from: 'normal', to: 'commute_disruption', fired: [], blocked: [], inputs: [] }
  ]
): AuditCrossingFile {
  const document = {
    crossing_id: `X-${pack}`,
    pack,
    replay: false,
    t_eval: '2026-11-01T15:05:00+08:00',
    snapshot_id: 'old',
    ...(pack === 'sky' ? { clause_version: 1 } : {}),
    changes
  }
  return {
    fileId: `${pack}-file`,
    name: 'renamed.json',
    pack,
    writtenAt: at('15:05:00'),
    text: JSON.stringify(document)
  }
}

describe('stored audit policy', () => {
  test('real JPS observations cross the ten-minute boundary independently of source state', () => {
    for (const row of readings) expect(validateReading(row)).toEqual([])
    const data = input({ sources: [{ ...gauge, state: 'silent', state_since: '1999-01-01' }], readings })
    expect(observation(data, at('21:05:00'))?.state).toBe('clear')
    expect(observation(data, at('21:15:00'))?.state).toBe('active')
    expect(observation(data, at('21:20:00'))?.state).toBe('active')
    const fresh = { ...readings.at(-1)!, observed_at: at('21:21:00'), value: 0 }
    expect(observation({ ...data, readings: [...readings, fresh] }, at('21:22:00'))?.state).toBe('clear')
  })

  test('thresholds are configured, strictly elapsed, and accept zero numeric observations', () => {
    for (const [ref, kind, metric, threshold] of [
      ['0232901RF', 'jps_rain', 'rain_5m_mm', 10],
      ['CA16W', 'apims', 'api', 120],
      ['CA19B', 'apims', 'api', 120],
      ['CA17W', 'apims', 'api', 120]
    ] as const) {
      const observed = at('15:00:00')
      const data = input({ sources: [source(ref, kind, threshold)], readings: [reading(ref, kind, observed, metric)] })
      expect(observation(data, new Date(observed.getTime() + threshold * 60_000), ref)?.state).toBe('clear')
      expect(observation(data, new Date(observed.getTime() + threshold * 60_000 + 1), ref)?.state).toBe('active')
      expect(
        observation(
          { ...data, sources: [source(ref, kind, threshold + 5)] },
          new Date(observed.getTime() + threshold * 60_000 + 1),
          ref
        )?.state
      ).toBe('clear')
    }
  })

  test('unusable observations and configuration cannot manufacture freshness or silence', () => {
    for (const value of ['', 'not numeric', false, Number.NaN, Infinity] as const) {
      expect(
        observation(
          input({ sources: [gauge], readings: [reading('0232901RF', 'jps_rain', at('21:00:00'), 'rain_5m_mm', value)] })
        )?.state
      ).toBe('unavailable')
    }
    for (const observed of [
      '',
      0,
      false,
      '2026-02-30T15:00:00+08:00',
      '2026-11-05T21:00:00',
      at('21:16:00'),
      new Date('invalid')
    ] as const) {
      expect(
        observation(input({ sources: [gauge], readings: [reading('0232901RF', 'jps_rain', observed, 'rain_5m_mm')] }))
          ?.state
      ).toBe('unavailable')
    }
    for (const threshold of ['', 'n/a', false, 0, -1, Infinity] as const) {
      const result = evaluateAudit(input({ sources: [{ ...gauge, stale_after_min: threshold }] }), at('21:15:00'))
      expect(result.problems).toContainEqual({ code: 'feed_configuration', ref: '0232901RF' })
      expect(result.observations[0]?.state).toBe('unavailable')
    }
    expect(observation(input({ sources: [{ ...gauge, kind: 'met_forecast' }], readings }))?.state).toBe('unavailable')
    expect(observation(input({ readings }))).toBeUndefined()
    expect(
      observation(
        input({ sources: [gauge], readings: [reading('0232901RF', 'jps_rain', at('21:00:00'), 'daily_rain_mm')] })
      )?.state
    ).toBe('unavailable')
    expect(
      observation(input({ sources: [gauge], readings: [{ ...readings.at(-1)!, received_at: at('21:16:00') }] }))?.state
    ).toBe('unavailable')
  })

  test('explicit-offset instants and latest actual shared APIMS attempts use physical ties and exclude backfill', () => {
    const data = input({
      sources: [source('CA16W', 'apims', 120)],
      readings: [reading('CA16W', 'apims', '2026-11-05T11:00:00Z')],
      polls: [
        poll('apims', 'apims', at('21:00:00')),
        poll('apims', 'apims', new Date(at('21:00:00')), 'error', 503),
        poll('apims_backfill', 'apims', at('21:10:00'), 'ok')
      ]
    })
    const found = observation(data, at('21:15:00'), 'CA16W')!
    expect(found.state).toBe('active')
    expect(found.body).toContain('2026-11-05 19:00 MYT; age 135 minutes')
    expect(found.body).toContain('Latest poll: error, HTTP 503 at 2026-11-05 21:00 MYT')
    const missing = observation({ ...data, polls: [] }, at('21:15:00'), 'CA16W')!
    expect(missing.body).toContain('No poll record')
    expect(missing.body).not.toContain('HTTP 0')
    expect(
      evaluateAudit(
        input({ sources: [source('met_forecast', 'met_forecast', 1), source('SP17', 'rapidrail_od', 1)] }),
        at('21:15:00')
      ).observations.map((item) => item.ref)
    ).toEqual(['rapidrail_od'])
  })

  test('MET freshness uses newest successful warning receipt while diagnostics retain later errors', () => {
    const met = source('met_warning', 'met_warning', 20)
    const data = input({
      sources: [met],
      polls: [
        poll('met_warning', 'met_warning', at('20:55:00'), 'unchanged'),
        poll('met_warning', 'met_warning', at('21:10:00'), 'error', 500),
        poll('met_forecast', 'met_forecast', at('21:15:00'))
      ]
    })
    expect(observation(data, at('21:15:00'), 'met_warning')?.state).toBe('clear')
    expect(observation(data, at('21:15:01'), 'met_warning')?.state).toBe('active')
    expect(observation(data, at('21:15:01'), 'met_warning')?.body).toContain('HTTP 500')
    for (const polls of [
      [],
      [poll('met_warning', 'met_warning', '', 'ok')],
      [poll('met_warning', 'met_warning', at('21:16:00'))],
      [poll('met_warning', 'met_warning', at('21:00:00'), 'error')]
    ]) {
      expect(observation({ ...data, polls }, at('21:15:00'), 'met_warning')?.state).toBe('unavailable')
    }
  })

  test('camera daylight is start inclusive/end exclusive with neutral no-receipt grace', () => {
    const data = input({ sources: [source('cam-1', 'camera', 20)], dayStart: '07:00', dayEnd: '19:00' })
    for (const clock of ['06:59:59', '07:00:00', '07:20:00', '19:00:00', '21:15:00'])
      expect(observation(data, at(clock), 'cam-1')?.state).toBe('paused')
    expect(observation(data, at('07:20:01'), 'cam-1')?.state).toBe('active')
    expect(observation(data, at('07:20:01'), 'cam-1')?.body).toContain(
      'No usable camera receipt. Daylight reference 2026-11-05 07:00 MYT'
    )
    for (const [dayStart, dayEnd] of [
      [null, '19:00'],
      ['7:00', '19:00'],
      ['25:00', '19:00'],
      ['19:00', '07:00'],
      ['07:00', '07:00']
    ] as const) {
      expect(observation({ ...data, dayStart, dayEnd }, at('10:00:00'), 'cam-1')?.state).toBe('unavailable')
    }
    const buffered = { ...reading('cam-1', 'camera', at('06:00:00'), 'contrast_far', 0), received_at: at('10:00:00') }
    expect(observation({ ...data, readings: [buffered] }, at('10:20:00'), 'cam-1')?.state).toBe('clear')
    expect(observation({ ...data, readings: [buffered] }, at('10:20:01'), 'cam-1')?.state).toBe('active')
    expect(observation({ ...data, readings: [buffered] }, at('19:00:00'), 'cam-1')?.state).toBe('paused')
    const yesterday = {
      ...buffered,
      observed_at: '2026-11-04T18:00:00+08:00',
      received_at: '2026-11-04T18:00:00+08:00'
    }
    expect(observation({ ...data, readings: [yesterday] }, at('07:05:00'), 'cam-1')?.state).toBe('paused')
  })

  test('a real fresh receipt today before daylight clears during the later-of-start clock', () => {
    const data = input({
      sources: [source('cam-1', 'camera', 20)],
      dayStart: '07:00',
      dayEnd: '19:00',
      readings: [{ ...reading('cam-1', 'camera', at('06:50:00'), 'contrast_far'), received_at: at('06:55:00') }]
    })
    expect(observation(data, at('07:05:00'), 'cam-1')?.state).toBe('clear')
  })

  test('Pi heartbeat uses sixty elapsed minutes without last_row fallback or other device kinds', () => {
    const data = input({
      devices: [
        {
          device_id: 'pi-real',
          kind: 'pi',
          last_heartbeat_at: at('20:15:00'),
          last_row_at: at('21:15:00'),
          state: 'active'
        },
        { device_id: 'cam-1', kind: 'camera', last_heartbeat_at: at('10:00:00') }
      ]
    })
    expect(observation(data, at('21:15:00'), 'pi-real')?.state).toBe('clear')
    expect(observation(data, at('21:15:01'), 'pi-real')?.state).toBe('active')
    expect(observation(data, at('21:15:01'), 'pi-real')?.body).toContain('Pi offline since 20:15')
    expect(observation(data, at('21:15:01'), 'cam-1')).toBeUndefined()
    for (const heartbeat of [undefined, '', false, 0, 'invalid', at('21:16:00')]) {
      const devices = [{ ...data.devices[0]!, last_heartbeat_at: heartbeat }]
      expect(observation({ ...data, devices }, at('21:15:00'), 'pi-real')?.state).toBe('unavailable')
    }
  })

  test('Rapid Rail selects latest per-night row before qualification, and holds active across nights', () => {
    const pending = grade('night-a', at('18:00:00'))
    const data = input({ crowdGrades: [pending] })
    expect(observation(data, at('20:00:00'), 'rapidrail_od')?.state).toBe('clear')
    expect(observation(data, at('20:00:01'), 'rapidrail_od')?.state).toBe('active')
    for (const outcome of ['in_band', 'out_of_band', 'unlisted_surge', 'no_surge']) {
      const final = grade('night-a', at('20:00:00'), outcome, '')
      expect(observation({ ...data, crowdGrades: [pending, final] }, at('21:15:00'), 'rapidrail_od')?.state).toBe(
        'clear'
      )
      expect(
        observation(
          { ...data, crowdGrades: [pending, final, grade('night-b', at('19:00:00'))] },
          at('21:15:00'),
          'rapidrail_od'
        )?.state
      ).toBe('active')
    }
    expect(
      observation(
        input({ crowdGrades: [pending, grade('night-a', at('18:00:00'), 'pending', '2026-11-06 18:00')] }),
        at('21:15:00'),
        'rapidrail_od'
      )?.state
    ).toBe('clear')
    expect(
      observation(
        input({ crowdGrades: [pending, grade('night-a', at('18:00:00'), 'in_band', '')] }),
        at('21:15:00'),
        'rapidrail_od'
      )?.state
    ).toBe('clear')
    expect(
      observation(input({ crowdGrades: [grade('night-b', at('19:00:00')), pending] }), at('21:15:00'), 'rapidrail_od')
        ?.body
    ).toContain('night-b')
    for (const next_update of ['invalid', '2026-02-30 15:00', '', false]) {
      const broken = grade('night-a', at('19:00:00'), 'pending', next_update)
      expect(observation(input({ crowdGrades: [pending, broken] }), at('21:15:00'), 'rapidrail_od')?.state).toBe(
        'unavailable'
      )
    }
    for (const next_update of [at('18:00:00'), '2026-11-05T10:00:00Z'])
      expect(
        observation(
          input({ crowdGrades: [grade('night-a', at('18:00:00'), 'pending', next_update)] }),
          at('21:15:00'),
          'rapidrail_od'
        )?.state
      ).toBe('active')
    expect(observation(input(), at('21:15:00'), 'rapidrail_od')?.state).toBe('unavailable')
    expect(
      observation(input({ crowdGrades: [grade('night-a', at('21:16:00'))] }), at('21:15:00'), 'rapidrail_od')?.state
    ).toBe('unavailable')
  })

  test('Rapid Rail retains unreadable timestamp uncertainty across nights until a later usable row repairs it', () => {
    const resolved = grade('resolved', at('19:00:00'), 'in_band', '')
    for (const gradedAt of [undefined, '', 'invalid', '2026-02-30T18:00:00+08:00']) {
      const unreadable = grade('uncertain', gradedAt)
      const evaluate = (crowdGrades: Row<'crowd_grades'>[]) =>
        observation(input({ crowdGrades }), at('21:15:00'), 'rapidrail_od')
      expect(evaluate([resolved, unreadable])?.state).toBe('unavailable')
      expect(evaluate([resolved, unreadable, grade('known-overdue', at('19:30:00'))])?.state).toBe('active')
      expect(evaluate([unreadable, grade('uncertain', at('20:00:00'), 'no_surge', ''), resolved])?.state).toBe('clear')
      expect(evaluate([grade('uncertain', at('20:00:00'), 'no_surge', ''), unreadable, resolved])?.state).toBe(
        'unavailable'
      )
      expect(evaluate([unreadable, grade('uncertain', at('21:16:00'), 'no_surge', ''), resolved])?.state).toBe(
        'unavailable'
      )
    }
    expect(
      observation(
        input({ crowdGrades: [resolved, grade('future-only', at('21:16:00'))] }),
        at('21:15:00'),
        'rapidrail_od'
      )?.state
    ).toBe('clear')
  })

  test('Rapid Rail selects the later physical revised night when selected grade times tie', () => {
    const crowdGrades = [
      grade('night-a', at('17:00:00')),
      grade('night-b', at('19:00:00')),
      grade('night-a', at('19:00:00'))
    ]
    const result = observation(input({ crowdGrades }), at('21:15:00'), 'rapidrail_od')
    expect(result?.state).toBe('active')
    expect(result?.body).toContain('Night night-a remains pending')
  })

  test('crossing stall uses real file write time, both producer envelopes, and exact ledger refs', () => {
    const sky = crossing()
    const crowd = crossing('crowd', [
      {
        scope: 'night-a',
        night: {
          night_id: 'night-a',
          venue: 'venue',
          show: 'show',
          doors_myt: '',
          show_myt: '',
          show_end_myt: '',
          listing_ids: []
        },
        from: 'normal',
        to: 'surge_night',
        fired: ['surge_night'],
        blocked: [],
        inputs: []
      }
    ])
    const data = input({ crossings: [sky, crowd] })
    expect(evaluateAudit(data, at('15:24:59')).oneShots).toEqual([])
    const due = evaluateAudit(data, at('15:25:00')).oneShots
    expect(due.map((item) => item.ref)).toEqual(['X-sky', 'X-crowd'])
    expect(due[0]!.body).toContain(
      "No ledger row references X-sky 20 minutes after its file was written. Apps Script can't see Gemini Enterprise run state, so check the Runs tab."
    )
    expect(due[0]!.body).toContain('Detected 2026-11-05 15:25 MYT for sky')
    expect(
      evaluateAudit(
        { ...data, ledger: [{ source_ref: 'X-sky', kind: 'anything', sent_at: '' }] },
        at('15:25:00')
      ).oneShots.map((item) => item.ref)
    ).toEqual(['X-crowd'])
  })

  test('crossings isolate malformed, replay, normal, future and ambiguous legacy records', () => {
    const sky = crossing()
    for (const text of [
      'invalid',
      'null',
      '[]',
      JSON.stringify({ ...JSON.parse(sky.text), changes: [] }),
      JSON.stringify({ ...JSON.parse(sky.text), changes: [{}] }),
      JSON.stringify({ ...JSON.parse(sky.text), replay: 'false' }),
      JSON.stringify({ ...JSON.parse(sky.text), crossing_id: 42 }),
      JSON.stringify({ ...JSON.parse(sky.text), pack: 'crowd' })
    ]) {
      const result = evaluateAudit(input({ crossings: [{ ...sky, text }] }), at('15:25:00'))
      expect(result.oneShots).toEqual([])
      expect(result.problems.length).toBeGreaterThan(0)
    }
    for (const text of [
      JSON.stringify({ replay: true }),
      JSON.stringify({ ...JSON.parse(sky.text), changes: [{ to: 'normal' }] })
    ]) {
      const result = evaluateAudit(input({ crossings: [{ ...sky, text, writtenAt: '' }] }), at('15:25:00'))
      expect(result.oneShots).toEqual([])
      expect(result.problems).toEqual([])
    }
    for (const writtenAt of ['', at('15:26:00'), '2026-02-30T15:00:00+08:00']) {
      const result = evaluateAudit(input({ crossings: [{ ...sky, writtenAt }] }), at('15:25:00'))
      expect(result.oneShots).toEqual([])
      expect(result.problems).toContainEqual({ code: 'crossing_written_at_unavailable', ref: sky.fileId })
    }
    const duplicate = { ...sky, fileId: 'legacy-copy' }
    const result = evaluateAudit(
      input({ crossings: [sky, duplicate, crossing('crowd')], ledger: [{ source_ref: 'X-sky' }] }),
      at('15:25:00')
    )
    expect(result.oneShots.map((item) => item.ref)).toEqual(['X-crowd'])
    expect(result.problems).toContainEqual({ code: 'crossing_duplicate_id', ref: 'X-sky' })
    expect(evaluateAudit(input({ crossings: [sky, sky] }), at('15:25:00')).oneShots).toHaveLength(1)
  })

  test('crossing identity preserves the actual JSON ref when matching the ledger', () => {
    const sky = crossing()
    const ref = ' X-sky '
    const file = { ...sky, text: JSON.stringify({ ...JSON.parse(sky.text), crossing_id: ref }) }
    expect(evaluateAudit(input({ crossings: [file] }), at('15:25:00')).oneShots[0]?.ref).toBe(ref)
    expect(evaluateAudit(input({ crossings: [file], ledger: [{ source_ref: ref }] }), at('15:25:00')).oneShots).toEqual(
      []
    )
  })

  test('malformed poll times are reported as unavailable without denying a stored attempt exists', () => {
    const data = input({ sources: [gauge], readings, polls: [poll('jps_rain', '0232901RF', '')] })
    expect(observation(data)?.body).toContain('Poll records exist; no usable as-of attempt time.')
    expect(observation(data)?.body).not.toContain('HTTP 0')
  })

  test('credential dates preserve raw refs, exact day twelve and MYT expiry, including catch-up', () => {
    const data = input({ refresh: { status: 'readable', value: '2026-11-09' } })
    expect(evaluateAudit(data, new Date('2026-11-20T23:59:59+08:00')).credentials).toEqual({
      state: 'valid',
      rawValue: '2026-11-09',
      due: false,
      expiresOn: '2026-11-23'
    })
    for (const clock of ['2026-11-21T00:00:00+08:00', '2026-11-22T00:00:00+08:00', '2026-12-01T00:00:00+08:00'])
      expect(evaluateAudit(data, new Date(clock)).credentials).toEqual({
        state: 'valid',
        rawValue: '2026-11-09',
        due: true,
        expiresOn: '2026-11-23'
      })
    const rawValue = '2026-11-08T16:00:00Z'
    expect(
      evaluateAudit(input({ refresh: { status: 'readable', value: rawValue } }), new Date('2026-11-21T00:00:00+08:00'))
        .credentials
    ).toEqual({ state: 'valid', rawValue, due: true, expiresOn: '2026-11-23' })
    for (const [value, reason] of [
      [null, 'missing'],
      ['', 'missing'],
      ['2026-02-30', 'invalid'],
      ['2026-11-09T00:00:00', 'invalid'],
      ['n/a', 'invalid'],
      ['2026-11-09', 'future']
    ] as const)
      expect(evaluateAudit(input({ refresh: { status: 'readable', value } }), at('21:15:00')).credentials).toEqual({
        state: 'unavailable',
        reason
      })
    expect(evaluateAudit(input({ refresh: { status: 'unreadable' } }), at('21:15:00')).credentials).toEqual({
      state: 'unavailable',
      reason: 'unreadable'
    })
  })
})
