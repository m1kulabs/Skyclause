import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { CAMERA_SOURCE_ID } from './camera.ts'
import { buildEvidencePack, serializeEvidencePack } from './evidence-pack.ts'
import { projectEvidenceRows, type EvidenceStoredRows } from './evidence-projections.ts'
import { parseEvidenceRequest } from './evidence-request.ts'
import { parseJpsRainfall } from './jps.ts'
import type { Row } from './schema.ts'

// Receipt metadata is labelled test-only: source observations remain the real capture.
const context = {
  projectSlug: 'test-only-receipt',
  receivedAt: '2026-11-07T16:00:00+08:00',
  assembledAt: '2026-11-07T16:01:00+08:00'
}
const request = parseEvidenceRequest({
  subject: 'evidence for 2 Nov 14:00–16:30',
  body: '',
  receivedAt: context.receivedAt
})
const empty: EvidenceStoredRows = {
  readings: [],
  warnings: [],
  forecast: [],
  glossary: [],
  ledger: [],
  grades: [],
  windows: [],
  now: [],
  probation: []
}
function rows(): Row<'readings'>[] {
  const capture: unknown = JSON.parse(
    readFileSync(new URL('../../fixtures/rainfall-graph-75-20261105T1312Z.json', import.meta.url), 'utf8')
  )
  return parseJpsRainfall(capture).map((row) => ({
    source_id: '0232901RF',
    source_kind: 'jps_rain',
    metric: 'rain_5m_mm',
    unit: 'mm',
    observed_at: row.observedAt,
    received_at: context.receivedAt,
    value: row.value,
    revision: 1
  }))
}
function pack(overrides: Partial<EvidenceStoredRows> = {}, subject = 'evidence for 2 Nov 14:00–16:30') {
  const result = buildEvidencePack(
    parseEvidenceRequest({ subject, body: '', receivedAt: context.receivedAt }),
    context,
    projectEvidenceRows({ ...empty, ...overrides })
  )
  if (!('readings' in result)) throw new Error('expected evidence/call pack')
  return result
}

describe('evidence packs', () => {
  test('real JPS capture exposes exactly 30 visible triples and the hand-checked 39 mm trailing total', () => {
    const result = pack({ readings: rows() })
    const gauge = result.readings[0]!
    expect(gauge.rows).toHaveLength(30)
    expect(gauge.rows[0]?.[0]).toBe('2026-11-02T14:05:00+08:00')
    expect(gauge.rows.at(-1)?.[0]).toBe('2026-11-02T16:30:00+08:00')
    expect(gauge.rows.every((row) => row.length === 3)).toBe(true)
    expect(gauge.rain_60m?.find(([at]) => at === '2026-11-02T15:00:00+08:00')).toEqual([
      '2026-11-02T15:00:00+08:00',
      39
    ])
    expect(result.warnings).toBe('No warning record for this window')
    expect(result.frames).toBe('No frames held for this window')
    expect(result.header).toEqual({
      kind: 'evidence',
      project_slug: 'test-only-receipt',
      received_at: context.receivedAt,
      assembled_at: context.assembledAt,
      span_start: '2026-11-02T14:00:00+08:00',
      span_end: '2026-11-02T16:30:00+08:00',
      date_label: 'Monday 2 November 2026',
      start_time: '14:00',
      end_time: '16:30'
    })
  })

  test.each([
    {
      subject: 'call for today',
      kind: 'call',
      start: '2026-11-07T00:00:00+08:00',
      end: '2026-11-08T00:00:00+08:00',
      date: 'Saturday 7 November 2026',
      startTime: '00:00',
      endTime: '24:00'
    },
    {
      subject: 'evidence for 2 Nov 23:00–24:00',
      kind: 'evidence',
      start: '2026-11-02T23:00:00+08:00',
      end: '2026-11-03T00:00:00+08:00',
      date: 'Monday 2 November 2026',
      startTime: '23:00',
      endTime: '24:00'
    },
    {
      subject: 'evidence for 2 Nov 00:00–00:00',
      kind: 'evidence',
      start: '2026-11-02T00:00:00+08:00',
      end: '2026-11-02T00:00:00+08:00',
      date: 'Monday 2 November 2026',
      startTime: '00:00',
      endTime: '00:00'
    }
  ])('labels midnight accurately for $subject while preserving ISO span instants', (example) => {
    const result = pack({}, example.subject)
    expect(result.header).toEqual({
      kind: example.kind,
      project_slug: 'test-only-receipt',
      received_at: context.receivedAt,
      assembled_at: context.assembledAt,
      span_start: example.start,
      span_end: example.end,
      date_label: example.date,
      start_time: example.startTime,
      end_time: example.endTime
    })
  })

  test('missing warm-up stamps yield null while complete genuine zero stays zero', () => {
    const missing = rows().filter((row) => row.observed_at !== '2026-11-02T13:10:00+08:00')
    expect(
      pack({ readings: missing }).readings[0]?.rain_60m?.find(([at]) => at === '2026-11-02T14:05:00+08:00')?.[1]
    ).toBeNull()
    const zero = rows().map((row) => ({ ...row, value: 0 }))
    expect(
      pack({ readings: zero }).readings[0]?.rain_60m?.find(([at]) => at === '2026-11-02T15:00:00+08:00')?.[1]
    ).toBe(0)
  })

  test('rolling totals use the highest available revision but visible triples preserve available revisions', () => {
    const source = rows()
    const original = source.find((row) => row.observed_at === '2026-11-02T15:00:00+08:00')!
    source.push({ ...original, revision: 2, value: Number(original.value) + 1 })
    source.push({ ...original, revision: 3, value: 999, received_at: '2026-11-07T16:02:00+08:00' })
    const gauge = pack({ readings: source.reverse() }).readings[0]!
    expect(gauge.rows.filter(([at]) => at === '2026-11-02T15:00:00+08:00').map(([, , revision]) => revision)).toEqual([
      1, 2
    ])
    expect(gauge.rain_60m?.find(([at]) => at === '2026-11-02T15:00:00+08:00')?.[1]).toBe(40)
  })

  test('selects only three bound APIMS stations from the real capture', () => {
    const capture = JSON.parse(
      readFileSync(new URL('../../fixtures/mapcaqm-20261105T1313Z.json', import.meta.url), 'utf8')
    ) as { data: { STATION_ID: string; RECORD_DT: string; API: number }[] }
    const readings = capture.data.map((row) => ({
      source_id: row.STATION_ID,
      source_kind: 'apims',
      metric: 'api',
      unit: 'API',
      observed_at: `${row.RECORD_DT}+08:00`,
      received_at: context.receivedAt,
      value: row.API,
      revision: 1
    }))
    const result = pack({ readings }, 'evidence for 5 Nov 20:00–22:00')
    expect(result.readings.map((row) => row.source_id).sort()).toEqual(['CA16W', 'CA17W', 'CA19B'])
    expect(result.readings.map((row) => [row.source_id, row.rows[0]?.[1]]).sort()).toEqual([
      ['CA16W', 67],
      ['CA17W', 62],
      ['CA19B', 57]
    ])
  })

  test('camera exposes all three configured metric series and frame IDs/times only', () => {
    // Camera values are controlled test doubles; no production capture is invented.
    const readings = [
      ['contrast_near', 0.8, 'ratio'],
      ['contrast_far', 0.4, 'ratio'],
      ['flag', 'visible', '']
    ].map(([metric, value, unit]) => ({
      source_id: CAMERA_SOURCE_ID,
      source_kind: 'camera',
      metric,
      value,
      unit,
      observed_at: '2026-11-02T15:00:00+08:00',
      received_at: context.receivedAt,
      revision: 1
    })) as Row<'readings'>[]
    const result = pack({
      readings,
      probation: [{ frame_file_id: 'test-only-frame', device_time: '2026-11-02T15:00:00+08:00', label_a: 'PRIVATE' }]
    })
    expect(result.readings.map((row) => [row.source_id, row.metric, row.rows[0]])).toEqual([
      [CAMERA_SOURCE_ID, 'contrast_near', ['2026-11-02T15:00:00+08:00', 0.8, 1]],
      [CAMERA_SOURCE_ID, 'contrast_far', ['2026-11-02T15:00:00+08:00', 0.4, 1]],
      [CAMERA_SOURCE_ID, 'flag', ['2026-11-02T15:00:00+08:00', 'visible', 1]]
    ])
    expect(result.frames).toEqual([{ frame_file_id: 'test-only-frame', device_time: '2026-11-02T15:00:00+08:00' }])
  })

  test('latest warning revision is selected before testing validity and KL/marine/advisory exclusions', () => {
    const base: Row<'warnings'> = {
      warning_key: 'test-warning',
      issued: '2026-11-02T13:00:00+08:00',
      first_seen_at: '2026-11-02T13:00:00+08:00',
      valid_from: '2026-11-02T14:00:00+08:00',
      valid_to: '2026-11-02T17:00:00+08:00',
      names_kl: true,
      title_en: 'Thunderstorms Warning',
      text_en: 'Published text\nverbatim',
      text_bm: 'Teks asal'
    }
    const revised = { ...base, issued: '2026-11-02T13:30:00+08:00', valid_to: '2026-11-02T13:59:00+08:00' }
    expect(pack({ warnings: [base, revised] }).warnings).toBe('No warning record for this window')
    expect(pack({ warnings: [revised, base] }).warnings).toBe('No warning record for this window')
    for (const change of [
      { valid_from: '' },
      { names_kl: false },
      { title_en: 'No Advisory' },
      { title_en: 'Strong Winds and Rough Seas Warning' },
      { text_en: 'FOR MALAYSIAN WATERS' }
    ]) {
      expect(pack({ warnings: [{ ...base, ...change }] }).warnings).toBe('No warning record for this window')
    }
    const future = {
      ...base,
      issued: '2026-11-07T16:02:00+08:00',
      first_seen_at: '2026-11-07T16:02:00+08:00',
      text_en: 'not yet known'
    }
    const selected = pack({ warnings: [base, future] }).warnings
    expect(typeof selected).not.toBe('string')
    if (typeof selected !== 'string') {
      expect(selected[0]?.text_en).toBe('Published text\nverbatim')
      expect(selected[0]?.text_bm).toBe('Teks asal')
    }
  })

  test('associates overlapping windows and crossing-time entries once, then joins only linked grades', () => {
    const windows: Row<'windows'>[] = [
      {
        window_id: 'test-window',
        date: '2026-11-02',
        start_myt: '13:00',
        end_myt: '15:00',
        declared_at: context.receivedAt
      },
      { window_id: 'outside', date: '2026-11-03', start_myt: '13:00', end_myt: '15:00' }
    ]
    const ledger: Row<'ledger'>[] = [
      {
        entry_id: 'both',
        call_id: 'test-call',
        'window_id or night_id': 'test-window',
        crossing_at: '2026-11-02T15:00:00+08:00',
        recorded_at: context.receivedAt
      },
      { entry_id: 'crossing', crossing_at: '2026-11-02T16:30:00+08:00' },
      { entry_id: 'outside', 'window_id or night_id': 'outside', crossing_at: '2026-11-02T13:59:59+08:00' },
      { entry_id: 'late', 'window_id or night_id': 'test-window', recorded_at: '2026-11-07T16:02:00+08:00' }
    ]
    const grades: Row<'grades'>[] = [
      { grade_id: 'by-window', window_id: 'test-window', decision: 'approved', graded_at: context.receivedAt },
      { grade_id: 'by-call', call_id: 'test-call', outcome: 'correct' },
      { grade_id: 'unlinked', window_id: 'outside' },
      { grade_id: 'future', call_id: 'test-call', graded_at: '2026-11-07T16:02:00+08:00' }
    ]
    const result = pack({ windows, ledger, grades })
    expect(result.ledger.map((entry) => entry.entry_id)).toEqual(['both', 'crossing'])
    expect(result.ledger[0]?.grades.map((grade) => grade.grade_id)).toEqual(['by-window', 'by-call'])
    expect(result.ledger[1]?.grades).toEqual([])
  })

  test('call selects day windows, their available now rows and newest same-day forecast with matching glossary', () => {
    const result = pack(
      {
        windows: [{ window_id: 'test-window', date: '2026-11-02', start_myt: '14:00', end_myt: '15:00' }],
        now: [
          { scope: 'test-window', snapshot_id: '2026-11-07T16:00:00+08:00', 'site.api_max': 42 },
          { scope: 'unrelated', snapshot_id: context.receivedAt }
        ],
        forecast: [
          { date: '2026-11-01', first_seen_at: context.receivedAt, afternoon_forecast: 'wrong day' },
          { date: '2026-11-02', first_seen_at: '2026-11-06T00:00:00+08:00', afternoon_forecast: 'older' },
          {
            date: '2026-11-02',
            first_seen_at: context.receivedAt,
            afternoon_forecast: 'Ribut petir',
            summary_forecast: 'Published\nverbatim'
          },
          { date: '2026-11-02', first_seen_at: '2026-11-07T16:02:00+08:00', afternoon_forecast: 'future' }
        ],
        glossary: [
          { ms_phrase: 'Ribut petir', en_gloss: 'Thunderstorms' },
          { ms_phrase: 'Hujan', en_gloss: 'Rain' }
        ]
      },
      'call for 2 Nov'
    )
    if (!('windows' in result)) throw new Error('expected call')
    expect(result.windows.map((row) => row.window_id)).toEqual(['test-window'])
    expect(result.now.map((row) => row.scope)).toEqual(['test-window'])
    expect(result.forecast?.afternoon_forecast).toBe('Ribut petir')
    expect(result.forecast?.summary_forecast).toBe('Published\nverbatim')
    expect(result.glossary).toEqual([{ ms_phrase: 'Ribut petir', en_gloss: 'Thunderstorms' }])
    const absent = pack({}, 'call for 2 Nov')
    expect('windows' in absent && [absent.windows, absent.now, absent.glossary]).toEqual([[], [], []])
    expect('forecast' in absent).toBe(false)
  })

  test.each(['unsubscribe', 'unsupported'])('header-only %s packs contain no evidence sections', (subject) => {
    const parsed = parseEvidenceRequest({ subject, body: '', receivedAt: context.receivedAt })
    const result = buildEvidencePack(parsed, context, projectEvidenceRows({ ...empty, readings: rows() }))
    expect(Object.keys(result)).toEqual(['header'])
    expect(
      'header' in result && [
        result.header.span_start,
        result.header.span_end,
        result.header.date_label,
        result.header.start_time,
        result.header.end_time
      ]
    ).toEqual([null, null, null, null, null])
  })

  test('serializer keeps exactly 50000 JS units but replaces 50001 with the exact oversized error', () => {
    const base = buildEvidencePack(request, context, projectEvidenceRows(empty))
    const initialLength = JSON.stringify(base).length
    base.header.project_slug += 'x'.repeat(50_000 - initialLength)
    expect(serializeEvidencePack('evidence', base).packJson.length).toBe(50_000)
    expect(serializeEvidencePack('evidence', base).kind).toBe('evidence')
    base.header.project_slug += 'x'
    expect(serializeEvidencePack('evidence', base)).toEqual({
      kind: 'unparseable',
      packJson: '{"error":"pack too large"}'
    })
  })

  test('call windows are restricted to the named date even when another date touches its midnight boundary', () => {
    const result = pack(
      {
        windows: [
          { window_id: 'named-date', date: '2026-11-02', start_myt: '23:00', end_myt: '23:59' },
          { window_id: 'next-date', date: '2026-11-03', start_myt: '00:00', end_myt: '01:00' }
        ]
      },
      'call for 2 Nov'
    )
    if (!('windows' in result)) throw new Error('expected call')
    expect(result.windows.map((row) => row.window_id)).toEqual(['named-date'])
  })

  test('warning revisions with the same issued instant use the latest first-seen revision before validity', () => {
    const older: Row<'warnings'> = {
      warning_key: 'test-warning',
      issued: '2026-11-02T13:00:00+08:00',
      first_seen_at: '2026-11-02T13:01:00+08:00',
      valid_from: '2026-11-02T14:00:00+08:00',
      valid_to: '2026-11-02T17:00:00+08:00',
      names_kl: true
    }
    const newer = { ...older, first_seen_at: '2026-11-02T13:02:00+08:00', valid_to: '2026-11-02T13:59:00+08:00' }
    expect(pack({ warnings: [newer, older] }).warnings).toBe('No warning record for this window')
  })

  test('crossings and frames include both boundary instants while readings exclude the start', () => {
    const instants = [
      '2026-11-02T13:59:59+08:00',
      '2026-11-02T14:00:00+08:00',
      '2026-11-02T16:30:00+08:00',
      '2026-11-02T16:30:01+08:00'
    ]
    const result = pack({
      readings: rows(),
      ledger: instants.map((at) => ({ entry_id: at, crossing_at: at })),
      probation: instants.map((at) => ({ frame_file_id: at, device_time: at }))
    })
    expect(result.ledger.map((entry) => entry.entry_id)).toEqual([
      '2026-11-02T14:00:00+08:00',
      '2026-11-02T16:30:00+08:00'
    ])
    expect(typeof result.frames).not.toBe('string')
    if (typeof result.frames !== 'string')
      expect(result.frames.map((frame) => frame.device_time)).toEqual([
        '2026-11-02T14:00:00+08:00',
        '2026-11-02T16:30:00+08:00'
      ])
    expect(result.readings[0]?.rows).toHaveLength(30)
  })

  test('an equal-boundary evidence request includes point events and no readings', () => {
    const at = '2026-11-02T14:00:00+08:00'
    const result = pack(
      {
        readings: rows(),
        ledger: [{ entry_id: 'at-boundary', crossing_at: at }],
        probation: [{ frame_file_id: 'at-boundary', device_time: at }]
      },
      'evidence for 2 Nov 14:00–14:00'
    )
    expect(result.readings).toEqual([])
    expect(result.ledger.map((entry) => entry.entry_id)).toEqual(['at-boundary'])
    expect(result.frames).toEqual([{ frame_file_id: 'at-boundary', device_time: at }])
  })
})
