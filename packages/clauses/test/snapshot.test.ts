import { describe, expect, test } from 'vitest'
import { deriveInputState, snapshotAt } from '../src'
import type { ReadingHistory } from '../src/types'
import { TEST_REGISTRY } from './test-helpers'

function baseHistory(): ReadingHistory {
  return {
    sources: [
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
      },
      {
        id: 'met-warn',
        kind: 'met_warning',
        cadenceS: 600,
        staleAfterS: 1200,
        freshness: 'polled',
        probation: false,
        meta: {}
      },
      {
        id: 'met-fcst',
        kind: 'met_forecast',
        cadenceS: 21600,
        staleAfterS: 43200,
        freshness: 'polled',
        probation: false,
        meta: {}
      },
      {
        id: 'cam-1',
        kind: 'camera',
        cadenceS: 600,
        staleAfterS: 1200,
        freshness: 'observed',
        probation: false,
        meta: { cameraDayStart: '07:15', cameraDayEnd: '19:00', timeZone: 'Asia/Kuala_Lumpur' }
      },
      {
        id: 'rail-sp17',
        kind: 'rapidrail_od',
        cadenceS: 1800,
        staleAfterS: 3600,
        freshness: 'polled',
        probation: false,
        meta: {}
      }
    ],
    polls: [],
    readings: []
  }
}

describe('deriveInputState and snapshotAt', () => {
  test('enforces receipt cutoffs: readings with receivedAt > tEval and polls with startedAt > tEval are ignored', () => {
    const h = baseHistory()
    h.readings.push(
      {
        id: 'r-on-time',
        sourceId: '0232901RF',
        metric: 'rain_5m_mm',
        observedAt: '2026-11-02T07:00:00Z',
        receivedAt: '2026-11-02T07:04:00Z',
        value: 5.0,
        valueText: null,
        valueJson: null,
        itemKey: '2026-11-02T07:00:00Z',
        revision: 1
      },
      {
        id: 'r-late-arrival',
        sourceId: '0232901RF',
        metric: 'rain_5m_mm',
        observedAt: '2026-11-02T07:05:00Z',
        receivedAt: '2026-11-02T07:06:00Z',
        value: 25.0,
        valueText: null,
        valueJson: null,
        itemKey: '2026-11-02T07:05:00Z',
        revision: 1
      }
    )
    h.polls.push({
      id: 'p-future-err',
      sourceId: '0232901RF',
      startedAt: '2026-11-02T07:06:00Z',
      outcome: 'error',
      httpStatus: 500
    })

    const tEval = '2026-11-02T07:05:00Z'
    expect(deriveInputState(h, '0232901RF', tEval)).toBe('fresh')

    const snap = snapshotAt(h, TEST_REGISTRY, 'proj-1', 'sky', tEval)
    expect(snap.site['site.rain_60m_mm']?.value).toBe(5.0)
    expect(snap.site['site.rain_60m_mm']?.readingIds).toEqual(['r-on-time'])
    expect(snap.site['site.rain_60m_mm']?.ageS).toBe(300)
  })

  test('resolves revisions deterministically regardless of input array order', () => {
    const r1 = {
      id: 'r-rev-1',
      sourceId: 'CA16W',
      metric: 'api',
      observedAt: '2026-11-02T07:00:00Z',
      receivedAt: '2026-11-02T07:01:00Z',
      value: 95,
      valueText: null,
      valueJson: null,
      itemKey: '2026-11-02T07:00:00Z',
      revision: 1
    }
    const r2 = {
      ...r1,
      id: 'r-rev-2',
      receivedAt: '2026-11-02T07:02:00Z',
      value: 135,
      revision: 2
    }

    const hForward = baseHistory()
    hForward.readings.push(r1, r2)
    const hReverse = baseHistory()
    hReverse.readings.push(r2, r1)

    const tEval = '2026-11-02T07:05:00Z'
    const snapForward = snapshotAt(hForward, TEST_REGISTRY, 'proj-1', 'sky', tEval)
    const snapReverse = snapshotAt(hReverse, TEST_REGISTRY, 'proj-1', 'sky', tEval)

    expect(snapForward.site['site.api_max']?.value).toBe(135)
    expect(snapForward.site['site.api_max']?.readingIds).toEqual(['r-rev-2'])
    expect(snapForward.hash).toBe(snapReverse.hash)
  })

  test('derives fresh, stale, error, and recovered states across two missed intervals and subsequent readings', () => {
    const h = baseHistory()
    h.readings.push({
      id: 'r-1',
      sourceId: '0232901RF',
      metric: 'rain_5m_mm',
      observedAt: '2026-11-02T07:00:00Z',
      receivedAt: '2026-11-02T07:00:10Z',
      value: 2.0,
      valueText: null,
      valueJson: null,
      itemKey: '2026-11-02T07:00:00Z',
      revision: 1
    })

    // Fresh within 10m (600s)
    expect(deriveInputState(h, '0232901RF', '2026-11-02T07:10:00Z')).toBe('fresh')
    // Stale after two missed 5m intervals (> 600s)
    expect(deriveInputState(h, '0232901RF', '2026-11-02T07:10:01Z')).toBe('stale')

    // First good reading after stale gap -> recovered
    h.readings.push({
      id: 'r-2',
      sourceId: '0232901RF',
      metric: 'rain_5m_mm',
      observedAt: '2026-11-02T07:20:00Z',
      receivedAt: '2026-11-02T07:20:10Z',
      value: 4.0,
      valueText: null,
      valueJson: null,
      itemKey: '2026-11-02T07:20:00Z',
      revision: 1
    })
    expect(deriveInputState(h, '0232901RF', '2026-11-02T07:21:00Z')).toBe('recovered')

    // Next distinct timely reading -> fresh
    h.readings.push({
      id: 'r-3',
      sourceId: '0232901RF',
      metric: 'rain_5m_mm',
      observedAt: '2026-11-02T07:25:00Z',
      receivedAt: '2026-11-02T07:25:10Z',
      value: 1.0,
      valueText: null,
      valueJson: null,
      itemKey: '2026-11-02T07:25:00Z',
      revision: 1
    })
    expect(deriveInputState(h, '0232901RF', '2026-11-02T07:26:00Z')).toBe('fresh')

    // Error poll marks source error; first good reading after error poll marks recovered
    h.polls.push({
      id: 'p-err',
      sourceId: '0232901RF',
      startedAt: '2026-11-02T07:27:00Z',
      outcome: 'error',
      httpStatus: 502
    })
    expect(deriveInputState(h, '0232901RF', '2026-11-02T07:28:00Z')).toBe('error')

    h.polls.push({
      id: 'p-ok',
      sourceId: '0232901RF',
      startedAt: '2026-11-02T07:30:00Z',
      outcome: 'ok',
      httpStatus: 200
    })
    h.readings.push({
      id: 'r-4',
      sourceId: '0232901RF',
      metric: 'rain_5m_mm',
      observedAt: '2026-11-02T07:30:00Z',
      receivedAt: '2026-11-02T07:30:05Z',
      value: 3.0,
      valueText: null,
      valueJson: null,
      itemKey: '2026-11-02T07:30:00Z',
      revision: 1
    })
    expect(deriveInputState(h, '0232901RF', '2026-11-02T07:31:00Z')).toBe('recovered')
  })

  test('long poller outage (> 3x staleAfterS) with no intervening polls enters recovered on first returning reading and fresh on second', () => {
    const h = baseHistory()
    // Initial reading known at 01:00:05Z
    h.readings.push({
      id: 'r-long-1',
      sourceId: '0232901RF',
      metric: 'rain_5m_mm',
      observedAt: '2026-11-02T01:00:00Z',
      receivedAt: '2026-11-02T01:00:05Z',
      value: 0.5,
      valueText: null,
      valueJson: null,
      itemKey: '2026-11-02T01:00:00Z',
      revision: 1
    })
    expect(deriveInputState(h, '0232901RF', '2026-11-02T01:02:00Z')).toBe('fresh')

    // 6-hour outage (36x staleAfterS=600s) with no intervening polls; first returning reading at 07:00Z must be recovered
    h.readings.push({
      id: 'r-long-2',
      sourceId: '0232901RF',
      metric: 'rain_5m_mm',
      observedAt: '2026-11-02T07:00:00Z',
      receivedAt: '2026-11-02T07:00:05Z',
      value: 2.0,
      valueText: null,
      valueJson: null,
      itemKey: '2026-11-02T07:00:00Z',
      revision: 1
    })
    expect(deriveInputState(h, '0232901RF', '2026-11-02T07:01:00Z')).toBe('recovered')

    // Second distinct fresh reading at 07:05Z restores fresh
    h.readings.push({
      id: 'r-long-3',
      sourceId: '0232901RF',
      metric: 'rain_5m_mm',
      observedAt: '2026-11-02T07:05:00Z',
      receivedAt: '2026-11-02T07:05:05Z',
      value: 1.5,
      valueText: null,
      valueJson: null,
      itemKey: '2026-11-02T07:05:00Z',
      revision: 1
    })
    expect(deriveInputState(h, '0232901RF', '2026-11-02T07:06:00Z')).toBe('fresh')
  })

  test('uses receipt/availability ordering so an error poll after an older observedAt but before delayed receipt still requires recovery', () => {
    const h = baseHistory()
    // First reading observed at 07:00Z, received at 07:00:05Z
    h.readings.push({
      id: 'r-del-1',
      sourceId: '0232901RF',
      metric: 'rain_5m_mm',
      observedAt: '2026-11-02T07:00:00Z',
      receivedAt: '2026-11-02T07:00:05Z',
      value: 1.0,
      valueText: null,
      valueJson: null,
      itemKey: '2026-11-02T07:00:00Z',
      revision: 1
    })
    // Error poll at 07:06Z
    h.polls.push({
      id: 'p-del-err',
      sourceId: '0232901RF',
      startedAt: '2026-11-02T07:06:00Z',
      outcome: 'error',
      httpStatus: 503
    })
    expect(deriveInputState(h, '0232901RF', '2026-11-02T07:06:30Z')).toBe('error')

    // Good poll at 07:07Z delivers delayed reading whose observedAt (07:05Z) < error poll (07:06Z), but receivedAt (07:07:05Z) > error poll
    h.polls.push({
      id: 'p-del-ok',
      sourceId: '0232901RF',
      startedAt: '2026-11-02T07:07:00Z',
      outcome: 'ok',
      httpStatus: 200
    })
    h.readings.push({
      id: 'r-del-2',
      sourceId: '0232901RF',
      metric: 'rain_5m_mm',
      observedAt: '2026-11-02T07:05:00Z',
      receivedAt: '2026-11-02T07:07:05Z',
      value: 2.5,
      valueText: null,
      valueJson: null,
      itemKey: '2026-11-02T07:05:00Z',
      revision: 1
    })
    // Must be recovered (only 1 distinct reading received since the error poll)
    expect(deriveInputState(h, '0232901RF', '2026-11-02T07:07:30Z')).toBe('recovered')

    // Second distinct fresh reading received after error poll transitions to fresh
    h.readings.push({
      id: 'r-del-3',
      sourceId: '0232901RF',
      metric: 'rain_5m_mm',
      observedAt: '2026-11-02T07:10:00Z',
      receivedAt: '2026-11-02T07:10:05Z',
      value: 3.0,
      valueText: null,
      valueJson: null,
      itemKey: '2026-11-02T07:10:00Z',
      revision: 1
    })
    expect(deriveInputState(h, '0232901RF', '2026-11-02T07:10:30Z')).toBe('fresh')
  })

  test('derives camera probation, off_hours outside MYT daylight, and fresh during daylight', () => {
    const h = baseHistory()
    const cam = h.sources.find((s) => s.id === 'cam-1')!
    cam.probation = true
    h.readings.push({
      id: 'cam-r1',
      sourceId: 'cam-1',
      metric: 'contrast_far',
      observedAt: '2026-11-02T04:00:00Z', // 12:00 MYT
      receivedAt: '2026-11-02T04:00:05Z',
      value: 0.3,
      valueText: null,
      valueJson: null,
      itemKey: '2026-11-02T04:00:00Z',
      revision: 1
    })

    // In daylight (12:05 MYT) but probation=true -> probation
    expect(deriveInputState(h, 'cam-1', '2026-11-02T04:05:00Z')).toBe('probation')

    // Outside daylight (20:00 MYT = 12:00Z) with probation=false -> off_hours
    cam.probation = false
    expect(deriveInputState(h, 'cam-1', '2026-11-02T12:00:00Z')).toBe('off_hours')

    // In daylight (12:05 MYT = 04:05Z) with probation=false -> fresh
    expect(deriveInputState(h, 'cam-1', '2026-11-02T04:05:00Z')).toBe('fresh')
  })

  test('derives pending for rapidrail_od before next_update and stale after two missed polls past next_update', () => {
    const h = baseHistory()
    const rail = h.sources.find((s) => s.id === 'rail-sp17')!
    rail.meta = { next_update: '2026-11-02T08:00:00Z' }

    expect(deriveInputState(h, 'rail-sp17', '2026-11-02T07:30:00Z')).toBe('pending')
    expect(deriveInputState(h, 'rail-sp17', '2026-11-02T09:05:00Z')).toBe('stale')
  })

  test('computes named site indicators (api_max, api_0600_min_last3_max, met_warning_in_force, met_afternoon_thunderstorm, camera_far_low_frames)', () => {
    const h = baseHistory()
    // 3 consecutive days of 06:00 MYT (22:00Z previous UTC day) readings > 150 at CA16W
    h.readings.push(
      {
        id: 'api-d1',
        sourceId: 'CA16W',
        metric: 'api',
        observedAt: '2026-10-30T22:00:00Z', // 2026-10-31 06:00 MYT
        receivedAt: '2026-10-30T22:05:00Z',
        value: 155,
        valueText: null,
        valueJson: null,
        itemKey: '2026-10-30T22:00:00Z',
        revision: 1
      },
      {
        id: 'api-d2',
        sourceId: 'CA16W',
        metric: 'api',
        observedAt: '2026-10-31T22:00:00Z', // 2026-11-01 06:00 MYT
        receivedAt: '2026-10-31T22:05:00Z',
        value: 162,
        valueText: null,
        valueJson: null,
        itemKey: '2026-10-31T22:00:00Z',
        revision: 1
      },
      {
        id: 'api-d3',
        sourceId: 'CA16W',
        metric: 'api',
        observedAt: '2026-11-01T22:00:00Z', // 2026-11-02 06:00 MYT
        receivedAt: '2026-11-01T22:05:00Z',
        value: 158,
        valueText: null,
        valueJson: null,
        itemKey: '2026-11-01T22:00:00Z',
        revision: 1
      },
      {
        id: 'api-prev-hour',
        sourceId: 'CA16W',
        metric: 'api',
        observedAt: '2026-11-02T05:00:00Z', // 2026-11-02 13:00 MYT
        receivedAt: '2026-11-02T05:05:00Z',
        value: 170,
        valueText: null,
        valueJson: null,
        itemKey: '2026-11-02T05:00:00Z',
        revision: 1
      },
      {
        id: 'api-now',
        sourceId: 'CA16W',
        metric: 'api',
        observedAt: '2026-11-02T06:00:00Z', // 2026-11-02 14:00 MYT
        receivedAt: '2026-11-02T06:05:00Z',
        value: 175,
        valueText: null,
        valueJson: null,
        itemKey: '2026-11-02T06:00:00Z',
        revision: 1
      }
    )

    // MET warning in force covering 14:00-17:00 MYT (06:00Z-09:00Z)
    h.polls.push({
      id: 'mw-poll-1',
      sourceId: 'met-warn',
      startedAt: '2026-11-02T07:00:00Z',
      outcome: 'ok',
      httpStatus: 200
    })
    h.readings.push({
      id: 'mw-1',
      sourceId: 'met-warn',
      metric: 'warning',
      observedAt: '2026-11-02T06:05:00Z',
      receivedAt: '2026-11-02T07:00:00Z',
      value: 1,
      valueText: 'Thunderstorm warning for W.P. Kuala Lumpur',
      valueJson: {
        title_en: 'Thunderstorms Warning',
        text_en: 'Thunderstorms expected over W.P. Kuala Lumpur',
        valid_from: '2026-11-02T06:00:00Z',
        valid_to: '2026-11-02T09:00:00Z'
      },
      itemKey: 'mw-1',
      revision: 1
    })

    // MET forecast afternoon thunderstorm
    h.polls.push({
      id: 'mf-poll-1',
      sourceId: 'met-fcst',
      startedAt: '2026-11-02T06:00:00Z',
      outcome: 'ok',
      httpStatus: 200
    })
    h.readings.push({
      id: 'mf-1',
      sourceId: 'met-fcst',
      metric: 'forecast',
      observedAt: '2026-11-02T06:00:00Z',
      receivedAt: '2026-11-02T06:00:00Z',
      value: true,
      valueText: 'Ribut petir di satu dua tempat pada sebelah petang',
      valueJson: { date: '2026-11-02', afternoon_forecast: 'Ribut petir di satu dua tempat' },
      itemKey: '2026-11-02',
      revision: 1
    })

    // 3 low-contrast camera frames (< 0.5)
    for (const [idx, min] of ['40', '50', '00'].entries()) {
      const hour = min === '00' ? '07' : '06'
      const ts = `2026-11-02T${hour}:${min}:00Z`
      h.readings.push({
        id: `cam-${idx + 1}`,
        sourceId: 'cam-1',
        metric: 'contrast_far',
        observedAt: ts,
        receivedAt: ts,
        value: 0.35,
        valueText: null,
        valueJson: null,
        itemKey: ts,
        revision: 1
      })
    }

    const snap = snapshotAt(h, TEST_REGISTRY, 'proj-1', 'sky', '2026-11-02T07:05:00Z')
    expect(snap.site['site.api_max']?.value).toBe(175)
    expect(snap.site['site.api_0600_min_last3_max']?.value).toBe(155)
    expect(snap.site['site.met_warning_in_force']?.value).toBe(true)
    expect(snap.site['site.met_afternoon_thunderstorm']?.value).toBe(true)
    expect(snap.site['site.camera_far_low_frames']?.value).toBe(3)
  })
})
