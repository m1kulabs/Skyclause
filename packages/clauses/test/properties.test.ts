/// <reference types="node" />

import { readFileSync } from 'node:fs'
import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { check, evaluate, explain, snapshotAt } from '../src'
import type { IndicatorSnapshot, InputState, ReadingHistory, SheetInput, SkyMode, Window } from '../src/types'
import { TEST_REGISTRY } from './test-helpers'

const skySheet = JSON.parse(readFileSync(`${import.meta.dirname}/../defaults/sky.json`, 'utf8')) as SheetInput

const checkedSky = check(skySheet, TEST_REGISTRY).sheet!

const SKY_RANK: Record<SkyMode, number> = {
  normal: 0,
  outdoor_limited: 1,
  commute_disruption: 2,
  hybrid_recommended: 3
}

const waveWindow: Window = {
  id: 'win-prop',
  startsAt: '2026-11-02T07:30:00Z',
  endsAt: '2026-11-02T07:30:00Z',
  kind: 'commute_wave',
  tz: 'Asia/Kuala_Lumpur'
}

function buildSnapshotFromValues(params: {
  rain60m: number
  rain4h: number
  apiMax: number
  api0600: number
  metWarn: boolean
  rainState?: InputState
  apiState?: InputState
  warnState?: InputState
}): IndicatorSnapshot {
  const tEval = '2026-11-02T07:05:00Z'
  const obs = '2026-11-02T07:00:00Z'
  const rainState = params.rainState ?? 'fresh'
  const apiState = params.apiState ?? 'fresh'
  const warnState = params.warnState ?? 'fresh'

  return {
    projectId: 'proj-prop',
    pack: 'sky',
    tEval,
    inputs: [
      { name: 'site.rain_60m_mm', sourceId: '0232901RF', state: rainState, since: obs },
      { name: 'w.rain_max_60m_mm', sourceId: '0232901RF', state: rainState, since: obs },
      { name: 'w.rain_max_4h_mm', sourceId: '0232901RF', state: rainState, since: obs },
      { name: 'site.api_max', sourceId: 'CA16W', state: apiState, since: obs },
      { name: 'site.api_0600_min_last3_max', sourceId: 'CA16W', state: apiState, since: obs },
      { name: 'site.met_warning_in_force', sourceId: 'met-warn', state: warnState, since: obs },
      { name: 'w.met_warning_in_force', sourceId: 'met-warn', state: warnState, since: obs },
      { name: 'site.camera_far_low_frames', sourceId: 'cam-1', state: 'probation', since: obs }
    ],
    site: {
      'site.rain_60m_mm': {
        name: 'site.rain_60m_mm',
        value: rainState === 'fresh' ? params.rain60m : null,
        unit: 'mm',
        state: rainState,
        since: obs,
        ageS: 300,
        sourceIds: ['0232901RF'],
        readingIds: ['r-rain'],
        observedAt: obs
      },
      'site.api_max': {
        name: 'site.api_max',
        value: apiState === 'fresh' ? params.apiMax : null,
        unit: 'API',
        state: apiState,
        since: obs,
        ageS: 300,
        sourceIds: ['CA16W'],
        readingIds: ['r-api'],
        observedAt: obs
      },
      'site.api_0600_min_last3_max': {
        name: 'site.api_0600_min_last3_max',
        value: apiState === 'fresh' ? params.api0600 : null,
        unit: 'API',
        state: apiState,
        since: obs,
        ageS: 300,
        sourceIds: ['CA16W'],
        readingIds: ['r-api-0600'],
        observedAt: obs
      },
      'site.met_warning_in_force': {
        name: 'site.met_warning_in_force',
        value: warnState === 'fresh' ? params.metWarn : null,
        unit: '',
        state: warnState,
        since: obs,
        ageS: 300,
        sourceIds: ['met-warn'],
        readingIds: [],
        observedAt: obs
      }
    },
    series: {
      'w.rain_max_60m_mm': rainState === 'fresh' ? [[obs, params.rain60m, 'r-rain-60']] : [],
      'w.rain_max_4h_mm': rainState === 'fresh' ? [[obs, params.rain4h, 'r-rain-4h']] : [],
      'w.met_warning_in_force':
        warnState === 'fresh' && params.metWarn
          ? [['2026-11-02T06:00:00Z', Date.parse('2026-11-02T09:00:00Z'), 'mw-1']]
          : []
    },
    nights: [],
    registryHash: 'reg',
    hash: 'snap'
  }
}

describe('fast-check clause engine properties', () => {
  test('Property 1 (Determinism): snapshotAt and evaluate produce identical hashes regardless of reading/poll array order', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 30, noNaN: true }), { minLength: 3, maxLength: 12 }),
        fc.integer({ min: 20, max: 250 }),
        (rainSamples, apiVal) => {
          const readings: ReadingHistory['readings'] = rainSamples.map((val, idx) => {
            const min = String(idx * 5).padStart(2, '0')
            const ts = `2026-11-02T06:${min}:00Z`
            return {
              id: `r-rain-${idx}`,
              sourceId: '0232901RF',
              metric: 'rain_5m_mm',
              observedAt: ts,
              receivedAt: ts,
              value: Math.round(val * 2) / 2,
              valueText: null,
              valueJson: null,
              itemKey: ts,
              revision: 1
            }
          })
          readings.push({
            id: 'r-api-now',
            sourceId: 'CA16W',
            metric: 'api',
            observedAt: '2026-11-02T06:55:00Z',
            receivedAt: '2026-11-02T06:55:00Z',
            value: apiVal,
            valueText: null,
            valueJson: null,
            itemKey: '2026-11-02T06:55:00Z',
            revision: 1
          })

          const sources: ReadingHistory['sources'] = [
            {
              id: '0232901RF',
              kind: 'jps_rain',
              cadenceS: 300,
              staleAfterS: 600,
              freshness: 'observed',
              probation: false,
              meta: {}
            },
            {
              id: 'CA16W',
              kind: 'apims',
              cadenceS: 3600,
              staleAfterS: 7200,
              freshness: 'observed',
              probation: false,
              meta: {}
            }
          ]

          const tEval = '2026-11-02T07:00:00Z'
          const h1: ReadingHistory = { sources, polls: [], readings }
          const h2: ReadingHistory = { sources: [...sources].reverse(), polls: [], readings: [...readings].reverse() }

          const snap1 = snapshotAt(h1, TEST_REGISTRY, 'proj-1', 'sky', tEval)
          const snap2 = snapshotAt(h2, TEST_REGISTRY, 'proj-1', 'sky', tEval)
          expect(snap1.hash).toBe(snap2.hash)

          const v1 = evaluate(checkedSky, snap1, [waveWindow], tEval)
          const v2 = evaluate(checkedSky, snap2, [waveWindow], tEval)
          expect(v1.hash).toBe(v2.hash)
          expect(explain(JSON.parse(JSON.stringify(v1)))).toEqual(explain(v2))
        }
      ),
      { numRuns: 100 }
    )
  })

  test('Property 2 (Monotonicity): increasing rainfall or API readings on fresh inputs never lowers Sky mode rank', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 80, noNaN: true }),
        fc.double({ min: 0, max: 50, noNaN: true }),
        fc.integer({ min: 0, max: 220 }),
        fc.integer({ min: 0, max: 100 }),
        fc.boolean(),
        (baseRain, extraRain, baseApi, extraApi, metWarn) => {
          const snapLow = buildSnapshotFromValues({
            rain60m: baseRain,
            rain4h: baseRain,
            apiMax: baseApi,
            api0600: baseApi,
            metWarn
          })
          const snapHigh = buildSnapshotFromValues({
            rain60m: baseRain + extraRain,
            rain4h: baseRain + extraRain,
            apiMax: baseApi + extraApi,
            api0600: baseApi + extraApi,
            metWarn
          })

          const vLow = evaluate(checkedSky, snapLow, [waveWindow], snapLow.tEval).windows[0]!
          const vHigh = evaluate(checkedSky, snapHigh, [waveWindow], snapHigh.tEval).windows[0]!

          expect(vLow.mode).not.toBeNull()
          expect(vHigh.mode).not.toBeNull()
          expect(SKY_RANK[vHigh.mode as SkyMode]).toBeGreaterThanOrEqual(SKY_RANK[vLow.mode as SkyMode])
        }
      ),
      { numRuns: 100 }
    )
  })

  test('Property 3 (Precedence): when inputs are fresh, window verdict mode equals the highest fired clause mode and watch reflects storm_watch', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.integer({ min: 0, max: 250 }),
        fc.integer({ min: 0, max: 250 }),
        fc.boolean(),
        (rain60m, rain4h, apiMax, api0600, metWarn) => {
          const snap = buildSnapshotFromValues({ rain60m, rain4h, apiMax, api0600, metWarn })
          const winVerdict = evaluate(checkedSky, snap, [waveWindow], snap.tEval).windows[0]!

          let expectedRank = 0
          if (apiMax >= 101) expectedRank = Math.max(expectedRank, SKY_RANK.outdoor_limited)
          if (rain60m >= 31.0 || rain4h > 60) expectedRank = Math.max(expectedRank, SKY_RANK.commute_disruption)
          if (apiMax > 180 || api0600 > 150) expectedRank = Math.max(expectedRank, SKY_RANK.hybrid_recommended)

          expect(winVerdict.noCall).toBeNull()
          expect(SKY_RANK[winVerdict.mode as SkyMode]).toBe(expectedRank)
          expect(winVerdict.watch).toBe(metWarn)
        }
      ),
      { numRuns: 100 }
    )
  })

  test('Property 4 (No call): a blocked clause triggers No call iff its proposed mode rank exceeds the highest fired mode rank', () => {
    const nonFreshArb = fc.constantFrom<InputState>('stale', 'error', 'recovered')
    const stateArb = fc.oneof(fc.constant<InputState>('fresh'), nonFreshArb)

    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.integer({ min: 0, max: 250 }),
        stateArb,
        stateArb,
        (rain60m, apiMax, rainState, apiState) => {
          const snap = buildSnapshotFromValues({
            rain60m,
            rain4h: rain60m,
            apiMax,
            api0600: apiMax,
            metWarn: false,
            rainState,
            apiState
          })
          const winVerdict = evaluate(checkedSky, snap, [waveWindow], snap.tEval).windows[0]!

          let highestFired = 0
          if (apiState === 'fresh') {
            if (apiMax >= 101) highestFired = Math.max(highestFired, SKY_RANK.outdoor_limited)
            if (apiMax > 180 || apiMax > 150) highestFired = Math.max(highestFired, SKY_RANK.hybrid_recommended)
          }
          if (rainState === 'fresh') {
            if (rain60m >= 31.0 || rain60m > 60) highestFired = Math.max(highestFired, SKY_RANK.commute_disruption)
          }

          let highestBlocked = -1
          if (apiState !== 'fresh') {
            // haze_severe proposes hybrid_recommended (rank 3)
            highestBlocked = Math.max(highestBlocked, SKY_RANK.hybrid_recommended)
          }
          if (rainState !== 'fresh') {
            // storm_confirmed and flash_flood_risk propose commute_disruption (rank 2)
            highestBlocked = Math.max(highestBlocked, SKY_RANK.commute_disruption)
          }

          if (highestBlocked > highestFired) {
            expect(winVerdict.mode).toBeNull()
            expect(winVerdict.noCall).not.toBeNull()
            expect(winVerdict.noCall!.inputs.length).toBeGreaterThan(0)
          } else {
            expect(winVerdict.mode).not.toBeNull()
            expect(winVerdict.noCall).toBeNull()
            expect(SKY_RANK[winVerdict.mode as SkyMode]).toBe(highestFired)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
