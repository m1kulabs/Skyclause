/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { check, diff, evaluate, explain, snapshotAt } from '../src'
import type { IndicatorSnapshot, NightInput, ReadingHistory, SheetInput, Window } from '../src/types'
import { TEST_REGISTRY, completeRainSeries } from './test-helpers'
import { terminalRainCases } from './final-review-cases'

const readDefault = (pack: 'sky' | 'crowd'): SheetInput =>
  JSON.parse(readFileSync(`${import.meta.dirname}/../defaults/${pack}.json`, 'utf8')) as SheetInput

const skySheet = readDefault('sky')
const crowdSheet = readDefault('crowd')

function makeSkySnapshot(overrides: Partial<IndicatorSnapshot> = {}): IndicatorSnapshot {
  const tEval = '2026-11-02T07:05:00Z'
  const obs = '2026-11-02T07:00:00Z'
  return {
    projectId: 'proj-1',
    pack: 'sky',
    tEval,
    inputs: [
      { name: 'site.rain_60m_mm', sourceId: '0232901RF', state: 'fresh', since: obs },
      { name: 'w.rain_max_60m_mm', sourceId: '0232901RF', state: 'fresh', since: obs },
      { name: 'w.rain_max_4h_mm', sourceId: '0232901RF', state: 'fresh', since: obs },
      { name: 'site.api_max', sourceId: 'CA16W', state: 'fresh', since: obs },
      { name: 'site.api_0600_min_last3_max', sourceId: 'CA16W', state: 'fresh', since: obs },
      { name: 'site.met_warning_in_force', sourceId: 'met-warn', state: 'fresh', since: obs },
      { name: 'w.met_warning_in_force', sourceId: 'met-warn', state: 'fresh', since: obs },
      { name: 'site.camera_far_low_frames', sourceId: 'cam-1', state: 'probation', since: obs }
    ],
    site: {
      'site.rain_60m_mm': {
        name: 'site.rain_60m_mm',
        value: 39.0,
        unit: 'mm',
        state: 'fresh',
        since: obs,
        ageS: 300,
        sourceIds: ['0232901RF'],
        readingIds: ['r-rain'],
        observedAt: obs
      },
      'site.api_max': {
        name: 'site.api_max',
        value: 60,
        unit: 'API',
        state: 'fresh',
        since: obs,
        ageS: 300,
        sourceIds: ['CA16W'],
        readingIds: ['r-api'],
        observedAt: obs
      },
      'site.api_0600_min_last3_max': {
        name: 'site.api_0600_min_last3_max',
        value: 55,
        unit: 'API',
        state: 'fresh',
        since: obs,
        ageS: 300,
        sourceIds: ['CA16W'],
        readingIds: ['r-api-0600'],
        observedAt: obs
      },
      'site.met_warning_in_force': {
        name: 'site.met_warning_in_force',
        value: false,
        unit: '',
        state: 'fresh',
        since: obs,
        ageS: 300,
        sourceIds: ['met-warn'],
        readingIds: [],
        observedAt: obs
      },
      'site.camera_far_low_frames': {
        name: 'site.camera_far_low_frames',
        value: null,
        unit: 'frames',
        state: 'probation',
        since: obs,
        ageS: 300,
        sourceIds: ['cam-1'],
        readingIds: [],
        observedAt: obs
      }
    },
    series: {
      'w.rain_max_60m_mm': completeRainSeries(obs, 39.0, 60),
      'w.rain_max_4h_mm': completeRainSeries(obs, 39.0, 240),
      'w.met_warning_in_force': []
    },
    nights: [],
    registryHash: 'reg-hash',
    hash: 'snap-hash',
    ...overrides
  }
}

describe('evaluate, explain, and diff', () => {
  const wave1530: Window = {
    id: 'win-1530',
    startsAt: '2026-11-02T07:30:00Z',
    endsAt: '2026-11-02T07:30:00Z',
    kind: 'commute_wave',
    tz: 'Asia/Kuala_Lumpur'
  }

  test('CLS-2: Haze watch and Storm confirmed firing on one window yields Commute disruption and lists both fired clauses', () => {
    const checked = check(skySheet, TEST_REGISTRY).sheet!
    const snap = makeSkySnapshot()
    snap.site['site.api_max']!.value = 125 // Fires haze_watch (outdoor_limited)
    snap.series['w.met_warning_in_force'] = [['2026-11-02T06:00:00Z', Date.parse('2026-11-02T09:00:00Z'), 'mw-1']]

    const verdicts = evaluate(checked, snap, [wave1530], snap.tEval)
    expect(verdicts.site[0]?.mode).toBe('outdoor_limited')

    const winVerdict = verdicts.windows[0]!
    expect(winVerdict.mode).toBe('commute_disruption')
    expect(winVerdict.watch).toBe(true)
    expect(winVerdict.noCall).toBeNull()

    const firedKeys = winVerdict.clauses.filter((c) => c.result === 'fired').map((c) => c.key)
    expect(firedKeys).toContain('haze_watch')
    expect(firedKeys).toContain('storm_watch')
    expect(firedKeys).toContain('storm_confirmed')
  })

  test('CLS-3: APIMS erroring with gauge fresh evaluates Storm confirmed, blocks haze clauses, and applies No call rule by mode rank', () => {
    const checked = check(skySheet, TEST_REGISTRY).sheet!
    const snap = makeSkySnapshot()
    const errSince = '2026-11-02T06:50:00Z'
    for (const inp of snap.inputs) {
      if (inp.name === 'site.api_max' || inp.name === 'site.api_0600_min_last3_max') {
        inp.state = 'error'
        inp.since = errSince
      }
    }
    snap.site['site.api_max']!.state = 'error'
    snap.site['site.api_max']!.value = null
    snap.site['site.api_max']!.since = errSince
    snap.site['site.api_0600_min_last3_max']!.state = 'error'
    snap.site['site.api_0600_min_last3_max']!.value = null
    snap.site['site.api_0600_min_last3_max']!.since = errSince

    const verdicts = evaluate(checked, snap, [wave1530], snap.tEval)
    const winVerdict = verdicts.windows[0]!

    // storm_confirmed fired (commute_disruption), but haze_severe (hybrid_recommended > commute_disruption) is blocked -> No call!
    expect(winVerdict.clauses.find((c) => c.key === 'storm_confirmed')?.result).toBe('fired')
    expect(winVerdict.clauses.find((c) => c.key === 'haze_watch')?.result).toBe('blocked')
    expect(winVerdict.clauses.find((c) => c.key === 'haze_severe')?.result).toBe('blocked')
    expect(winVerdict.mode).toBeNull()
    expect(winVerdict.noCall?.inputs.map((i) => i.name)).toContain('site.api_max')

    // Conversely: if haze_severe fires (hybrid_recommended) and the rain gauge is stale, Storm confirmed is blocked
    // but hybrid_recommended > commute_disruption, so hybrid_recommended stands!
    const snapHazeSevere = makeSkySnapshot()
    snapHazeSevere.site['site.api_max']!.value = 195
    for (const inp of snapHazeSevere.inputs) {
      if (inp.sourceId === '0232901RF') {
        inp.state = 'stale'
        inp.since = errSince
      }
    }
    snapHazeSevere.site['site.rain_60m_mm']!.state = 'stale'
    snapHazeSevere.site['site.rain_60m_mm']!.value = null
    snapHazeSevere.series['w.rain_max_60m_mm'] = []

    const verdictsHaze = evaluate(checked, snapHazeSevere, [wave1530], snapHazeSevere.tEval)
    const winHaze = verdictsHaze.windows[0]!
    expect(winHaze.mode).toBe('hybrid_recommended')
    expect(winHaze.noCall).toBeNull()
    expect(winHaze.clauses.find((c) => c.key === 'storm_confirmed')?.result).toBe('blocked')
  })

  test('CLS-3: recovered input blocks requires clauses until next fresh reading, and unbound required input blocks with sourceId null', () => {
    const checked = check(skySheet, TEST_REGISTRY).sheet!
    const snap = makeSkySnapshot()
    for (const inp of snap.inputs) {
      if (inp.sourceId === '0232901RF') {
        inp.state = 'recovered'
      }
      if (inp.sourceId === 'CA16W') {
        inp.sourceId = null
        inp.state = 'stale'
      }
    }
    snap.site['site.rain_60m_mm']!.state = 'recovered'
    snap.site['site.api_max']!.state = 'stale'
    snap.site['site.api_max']!.value = null
    snap.site['site.api_max']!.sourceIds = []

    const verdicts = evaluate(checked, snap, [wave1530], snap.tEval)
    const winVerdict = verdicts.windows[0]!
    const storm = winVerdict.clauses.find((c) => c.key === 'storm_confirmed')!
    expect(storm.result).toBe('blocked')
    expect(storm.blockedBy[0]?.state).toBe('recovered')

    const hazeWatch = winVerdict.clauses.find((c) => c.key === 'haze_watch')!
    expect(hazeWatch.result).toBe('blocked')
    expect(hazeWatch.blockedBy[0]?.sourceId).toBeNull()
  })

  test('Crowd evaluation: surge_night, window recommendations in sheet order, and missing exit end blocks exit_clash', () => {
    const checked = check(crowdSheet, TEST_REGISTRY).sheet!
    const tEval = '2026-11-07T10:00:00Z'
    const nightWithExit: NightInput = {
      id: 'night-1',
      date: '2026-11-07',
      baseline: 3928,
      uplift: 6200,
      forecast: 10128,
      band: { low: 8500, high: 11800 },
      doors: '2026-11-07T10:30:00Z',
      show: '2026-11-07T12:30:00Z',
      arrivalStart: '2026-11-07T09:30:00Z',
      arrivalEnd: '2026-11-07T12:30:00Z',
      exitStart: '2026-11-07T14:30:00Z',
      exitEnd: '2026-11-07T16:00:00Z',
      singleSource: true,
      forecastId: 'fc-1',
      state: 'fresh'
    }
    const snap: IndicatorSnapshot = {
      projectId: 'proj-1',
      pack: 'crowd',
      tEval,
      inputs: TEST_REGISTRY.map((d) => ({
        name: d.name,
        sourceId: 'src-1',
        state: 'fresh' as const,
        since: tEval
      })),
      site: {},
      series: {},
      nights: [nightWithExit],
      registryHash: 'reg-hash',
      hash: 'snap-hash'
    }

    // Window ending at 19:30 MYT (11:30Z): inside arrivalStart..arrivalEnd AND > 19:15 local min
    const classWin: Window = {
      id: 'win-evening',
      startsAt: '2026-11-07T09:30:00Z',
      endsAt: '2026-11-07T11:30:00Z',
      kind: 'class',
      tz: 'Asia/Kuala_Lumpur'
    }

    const verdicts = evaluate(checked, snap, [classWin], tEval)
    expect(verdicts.nights[0]?.mode).toBe('surge_night')
    expect(verdicts.nights[0]?.clauses.find((c) => c.key === 'single_source_listing')?.result).toBe('fired')

    // Window recommendations union in sheet order: arrival_clash (shift_end, leave_before_doors) + after_last_shuttle (ask_shuttle)
    expect(verdicts.windows[0]?.recommendations).toEqual(['shift_end', 'leave_before_doors', 'ask_shuttle'])

    // When listing has no show end (exitStart / exitEnd null), exit_clash is blocked
    const nightNoExit: NightInput = {
      ...nightWithExit,
      id: 'night-no-exit',
      exitStart: null,
      exitEnd: null
    }
    const snapNoExit: IndicatorSnapshot = {
      ...snap,
      nights: [nightNoExit]
    }
    const verdictsNoExit = evaluate(checked, snapNoExit, [classWin], tEval)
    const exitClash = verdictsNoExit.windows[0]?.clauses.find((c) => c.key === 'exit_clash')
    expect(exitClash?.result).toBe('blocked')
  })

  test('Review Focus #3: partial rainfall grid (null reading in 60-min window) blocks storm_confirmed instead of turning into 0 rainfall', () => {
    const checked = check(skySheet, TEST_REGISTRY).sheet!
    const snap = makeSkySnapshot()
    snap.series['w.rain_max_60m_mm'] = [
      ['2026-11-02T06:55:00Z', 10.0, 'r-1'],
      ['2026-11-02T07:00:00Z', null, 'r-2']
    ]

    const verdicts = evaluate(checked, snap, [wave1530], snap.tEval)
    const storm = verdicts.windows[0]!.clauses.find((c) => c.key === 'storm_confirmed')!
    expect(storm.result).toBe('blocked')
    expect(storm.inputs.find((i) => i.name === 'w.rain_max_60m_mm')?.value).toBeNull()
  })

  test('Review Focus #5: explain(v) works after JSON.parse(JSON.stringify(verdicts)) round-trip without WeakMap or symbols', () => {
    const customSheet: SheetInput = {
      pack: 'sky',
      clauses: [
        {
          key: 'custom_rain',
          name: 'Custom rain',
          enabled: true,
          scope: 'window',
          requires: ['w.rain_max_60m_mm'],
          span: { from: 'end-30m', to: 'end+60m' },
          when: 'w.rain_max_60m_mm >= 25.0',
          expiry: 'end',
          proposes: { mode: 'commute_disruption' },
          wording: {
            en: 'Custom rain alert: {w.rain_max_60m_mm.value} mm',
            ms: 'Amaran hujan: {w.rain_max_60m_mm.value} mm'
          }
        }
      ]
    }
    const checked = check(customSheet, TEST_REGISTRY).sheet!
    const snap = makeSkySnapshot()
    const verdicts = evaluate(checked, snap, [wave1530], snap.tEval)
    const roundTripped = JSON.parse(JSON.stringify(verdicts))
    const explained = explain(roundTripped)

    expect(explained).toHaveLength(1)
    expect(explained[0]?.key).toBe('custom_rain')
    expect(explained[0]?.cel).toBe('w.rain_max_60m_mm >= 25.0')
    expect(explained[0]?.wording.en).toContain('Custom rain alert')
    expect(explained[0]?.wording.ms).toContain('Amaran hujan')
    expect(explained[0]?.inputs[0]?.sourceIds).toEqual(['0232901RF'])
  })

  test('diff(before, after) reports added, modified, and removed clauses in sheet order', () => {
    const afterSheet: SheetInput = {
      pack: 'sky',
      clauses: [
        ...skySheet.clauses
          .filter((c) => c.key !== 'flash_flood_risk')
          .map((c) => (c.key === 'storm_confirmed' ? { ...c, when: 'w.rain_max_60m_mm >= 35.0' } : c)),
        {
          key: 'new_clause',
          name: 'New clause',
          enabled: true,
          scope: 'site',
          requires: ['site.api_max'],
          when: 'site.api_max >= 120',
          proposes: { mode: 'outdoor_limited' },
          wording: { en: 'New outdoor advisory' }
        }
      ]
    }

    const changes = diff(skySheet, afterSheet)
    expect(changes.map((c) => ({ key: c.key, hasBefore: c.before !== null, hasAfter: c.after !== null }))).toEqual([
      { key: 'storm_confirmed', hasBefore: true, hasAfter: true },
      { key: 'flash_flood_risk', hasBefore: true, hasAfter: false },
      { key: 'new_clause', hasBefore: false, hasAfter: true }
    ])
  })

  test('implicit rain span clauses (flash_flood_risk) are not_open before end-30m and do not force false No call', () => {
    const skyRainOnly: SheetInput = {
      ...skySheet,
      clauses: skySheet.clauses.filter((c) => ['storm_confirmed', 'flash_flood_risk', 'silent_input'].includes(c.key))
    }
    const checkedRainOnly = check(skyRainOnly, TEST_REGISTRY).sheet!
    const tEval = '2026-11-02T07:05:00Z'
    const wave1545: Window = {
      id: 'wave-1545',
      startsAt: '2026-11-02T07:45:00Z',
      endsAt: '2026-11-02T07:45:00Z',
      kind: 'commute_wave',
      tz: 'Asia/Kuala_Lumpur'
    }
    const snap = makeSkySnapshot()
    const winVerdict = evaluate(checkedRainOnly, snap, [wave1545], tEval).windows[0]!

    expect(winVerdict.openFrom).toBe('2026-11-02T07:15:00Z')
    expect(winVerdict.noCall).toBeNull()
    expect(winVerdict.mode).toBe('normal')
    expect(winVerdict.clauses.find((c) => c.key === 'storm_confirmed')?.result).toBe('not_open')
    expect(winVerdict.clauses.find((c) => c.key === 'flash_flood_risk')?.result).toBe('not_open')
    expect(winVerdict.clauses.find((c) => c.key === 'silent_input')?.result).toBe('not_fired')
  })

  test('custom registry-defined int, double, and list indicators survive CheckedSheet JSON round-trip and evaluate with authoritative CEL types', () => {
    const customReg = [
      {
        name: 'site.custom_int',
        celType: 'int' as const,
        unit: '',
        scope: 'site' as const,
        sourceKind: 'apims' as const
      },
      {
        name: 'site.custom_double',
        celType: 'double' as const,
        unit: '',
        scope: 'site' as const,
        sourceKind: 'jps_rain' as const
      },
      {
        name: 'site.custom_list',
        celType: 'list' as const,
        unit: '',
        scope: 'site' as const,
        sourceKind: 'apims' as const
      }
    ]
    const customSheet: SheetInput = {
      pack: 'sky',
      clauses: [
        {
          key: 'custom_typed_clause',
          name: 'Custom typed clause',
          enabled: true,
          scope: 'site',
          requires: ['site.custom_int', 'site.custom_double', 'site.custom_list'],
          when: 'site.custom_int + 1 == 3 && site.custom_double + 0.5 == 2.0 && site.custom_list.all(x, x >= 10)',
          proposes: { mode: 'outdoor_limited' },
          wording: { en: 'Custom typed clause fired' }
        }
      ]
    }
    const checkRes = check(customSheet, customReg)
    expect(checkRes.ok).toBe(true)
    expect(checkRes.publishable).toBe(true)

    const roundTrippedSheet = JSON.parse(JSON.stringify(checkRes.sheet!))
    const tEval = '2026-11-02T07:05:00Z'
    const customSnap: IndicatorSnapshot = {
      projectId: 'proj-custom',
      pack: 'sky',
      tEval,
      inputs: [
        { name: 'site.custom_int', sourceId: 's1', state: 'fresh', since: tEval },
        { name: 'site.custom_double', sourceId: 's2', state: 'fresh', since: tEval },
        { name: 'site.custom_list', sourceId: 's3', state: 'fresh', since: tEval }
      ],
      site: {
        'site.custom_int': {
          name: 'site.custom_int',
          value: 2,
          unit: '',
          state: 'fresh',
          since: tEval,
          ageS: 0,
          sourceIds: ['s1'],
          readingIds: ['r1'],
          observedAt: tEval
        },
        'site.custom_double': {
          name: 'site.custom_double',
          value: 1.5,
          unit: '',
          state: 'fresh',
          since: tEval,
          ageS: 0,
          sourceIds: ['s2'],
          readingIds: ['r2'],
          observedAt: tEval
        },
        'site.custom_list': {
          name: 'site.custom_list',
          value: [10, 20, 30],
          unit: '',
          state: 'fresh',
          since: tEval,
          ageS: 0,
          sourceIds: ['s3'],
          readingIds: ['r3'],
          observedAt: tEval
        }
      },
      series: {},
      nights: [],
      registryHash: checkRes.sheet!.registryHash,
      hash: 'snap-custom'
    }

    const verdicts = evaluate(roundTrippedSheet, customSnap, [], tEval)
    expect(verdicts.site[0]?.clauses[0]?.result).toBe('fired')

    const { registryTypes: _omitted, ...sheetWithoutRegistryTypes } = roundTrippedSheet as typeof roundTrippedSheet & {
      registryTypes?: unknown
    }
    expect(() => evaluate(sheetWithoutRegistryTypes as typeof roundTrippedSheet, customSnap, [], tEval)).toThrow(
      /registryTypes/i
    )
  })
})

describe('review regression: warning observation interval and provenance', () => {
  const ts = (time: string) => `2026-11-02T${time}:00Z`
  const window: Window = {
    id: 'wave',
    startsAt: ts('07:30'),
    endsAt: ts('07:30'),
    kind: 'commute_wave',
    tz: 'Asia/Kuala_Lumpur'
  }
  const registry = TEST_REGISTRY.filter((def) => def.name === 'w.met_warning_in_force')
  const sheet: SheetInput = {
    pack: 'sky',
    clauses: [
      {
        key: 'warning',
        name: 'Warning',
        enabled: true,
        scope: 'window',
        requires: ['w.met_warning_in_force'],
        span: { from: 'end-30m', to: 'end+60m' },
        when: 'w.met_warning_in_force',
        proposes: { mode: 'outdoor_limited' },
        wording: { en: 'Warning' }
      }
    ]
  }
  function history(observedAt: string, receivedAt = observedAt): ReadingHistory {
    return {
      sources: [
        {
          id: 'met',
          kind: 'met_warning',
          cadenceS: 600,
          staleAfterS: 1200,
          freshness: 'polled',
          probation: false,
          meta: {}
        }
      ],
      polls: [{ id: 'poll', sourceId: 'met', startedAt: ts('09:00'), outcome: 'ok', httpStatus: 200 }],
      readings: [
        {
          id: 'warning',
          sourceId: 'met',
          metric: 'warning',
          observedAt,
          receivedAt,
          value: true,
          valueText: 'Kuala Lumpur',
          valueJson: { valid_from: ts('06:00'), valid_to: ts('10:00') },
          itemKey: 'warning',
          revision: 1
        }
      ]
    }
  }

  test.each([
    ['06:59', 'fired'],
    ['07:00', 'fired'],
    ['08:30', 'fired'],
    ['08:31', 'not_fired'],
    ['08:45', 'not_fired']
  ])(
    'explicit completed span carries active warnings and uses inclusive observation upper bound: %s -> %s',
    (observed, result) => {
      const snap = snapshotAt(history(ts(observed)), registry, 'p', 'sky', ts('09:00'))
      const verdict = evaluate(check(sheet, registry).sheet!, JSON.parse(JSON.stringify(snap)), [window], ts('09:00'))
      const clause = verdict.windows[0]!.clauses[0]!
      expect(clause.span?.complete).toBe(true)
      expect(clause.result).toBe(result)
      if (result === 'fired') {
        const explanation = explain(JSON.parse(JSON.stringify(verdict)))[0]!
        expect(explanation.inputs[0]?.observedAt).toBe(ts(observed))
        expect(explanation.inputs[0]?.ageS).toBe((Date.parse(ts('09:00')) - Date.parse(ts(observed))) / 1000)
      } else expect(clause.inputs[0]?.readingIds).toEqual([])
    }
  )

  test('explicit span extension accepts a warning valid within the extension but outside the actual window', () => {
    const h = history(ts('08:00'))
    h.readings[0]!.valueJson = { valid_from: ts('08:00'), valid_to: ts('08:15') }
    const snap = snapshotAt(h, registry, 'p', 'sky', ts('09:00'))
    expect(evaluate(check(sheet, registry).sheet!, snap, [window], ts('09:00')).windows[0]?.clauses[0]?.result).toBe(
      'fired'
    )
  })

  test('receipt is distinct from observation and validity and remains serializable', () => {
    const snap = snapshotAt(history(ts('08:15'), ts('08:45')), registry, 'p', 'sky', ts('09:00'))
    expect(snap.series['w.met_warning_in_force']?.[0]?.[0]).toBe(ts('08:15'))
    expect(JSON.parse(JSON.stringify(snap))).toMatchObject({
      warningObservations: {
        warning: {
          observedAt: ts('08:15'),
          receivedAt: ts('08:45'),
          validFrom: ts('06:00'),
          validTo: ts('10:00'),
          sourceId: 'met'
        }
      }
    })
    const verdict = evaluate(check(sheet, registry).sheet!, JSON.parse(JSON.stringify(snap)), [window], ts('09:00'))
    expect(verdict.windows[0]?.clauses[0]?.result).toBe('fired')
    expect(verdict.windows[0]?.clauses[0]?.inputs[0]?.observedAt).toBe(ts('08:15'))
    expect(verdict.windows[0]?.clauses[0]?.inputs[0]?.ageS).toBe(2700)
  })

  test('a span stops at tEval and unchanged warnings carry in with original observation provenance', () => {
    const earlier = ts('07:05')
    const h = history(ts('06:30'))
    h.polls[0]!.startedAt = earlier
    const snap = snapshotAt(h, registry, 'p', 'sky', earlier)
    const noSpanSheet: SheetInput = { ...sheet, clauses: sheet.clauses.map(({ span: _span, ...clause }) => clause) }
    expect(evaluate(check(noSpanSheet, registry).sheet!, snap, [window], earlier).windows[0]?.clauses[0]?.result).toBe(
      'fired'
    )
    const explicit = evaluate(check(sheet, registry).sheet!, snap, [window], earlier).windows[0]!.clauses[0]!
    expect(explicit.result).toBe('fired')
    expect(explicit.inputs[0]?.observedAt).toBe(ts('06:30'))
    const futureSnapshot = snapshotAt(history(ts('08:15')), registry, 'p', 'sky', ts('09:00'))
    expect(
      evaluate(check(sheet, registry).sheet!, futureSnapshot, [window], earlier).windows[0]?.clauses[0]?.result
    ).toBe('not_fired')
  })
})

describe('Task 2 historical rainfall endpoint', () => {
  test.each(terminalRainCases)('$name', ({ run }) => run())
})
