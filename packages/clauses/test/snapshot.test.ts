import { metWarningHistory } from './met-warning-history'
import { describe, expect, test } from 'vitest'
import { deriveInputState, resolveSourceAt, snapshotAt } from '../src'
import { dedupeReadingsAt } from '../src/snapshot'
import type { ReadingHistory } from '../src/types'
import { TEST_REGISTRY } from './test-helpers'

function baseHistory(): ReadingHistory {
  return {
    warningAreaTerms: ['Kuala Lumpur'],
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

    // The cutoff test needs an explicitly measured complete dry leading grid.
    for (let ms = Date.parse('2026-11-02T06:05:00Z'); ms < Date.parse('2026-11-02T07:00:00Z'); ms += 300000) {
      const ts = new Date(ms).toISOString().replace('.000Z', 'Z')
      h.readings.push({
        id: `dry-${ms}`,
        sourceId: '0232901RF',
        metric: 'rain_5m_mm',
        observedAt: ts,
        receivedAt: ts,
        value: 0,
        valueText: null,
        valueJson: null,
        itemKey: ts,
        revision: 1
      })
    }
    const tEval = '2026-11-02T07:05:00Z'
    expect(deriveInputState(h, '0232901RF', tEval)).toBe('fresh')

    const snap = snapshotAt(h, TEST_REGISTRY, 'proj-1', 'sky', tEval)
    expect(snap.site['site.rain_60m_mm']?.value).toBe(5.0)
    expect(snap.site['site.rain_60m_mm']?.readingIds).toHaveLength(12)
    expect(snap.site['site.rain_60m_mm']?.readingIds).toContain('r-on-time')
    expect(snap.site['site.rain_60m_mm']?.readingIds).not.toContain('r-late-arrival')
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
        warning_issue: { title_en: 'Thunderstorms Warning' },
        excluded: false,
        text_en: 'Thunderstorms expected over W.P. Kuala Lumpur',
        valid_from_utc: '2026-11-02T06:00:00Z',
        valid_to_utc: '2026-11-02T09:00:00Z'
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

describe('review regressions: source observations and current mornings', () => {
  function reading(sourceId: string, metric: string, ts: string, value: number, receivedAt = ts) {
    return {
      id: `${sourceId}-${metric}-${ts}`,
      sourceId,
      metric,
      observedAt: ts,
      receivedAt,
      value,
      valueText: null,
      valueJson: null,
      itemKey: ts,
      revision: 1
    }
  }

  test('near, far and flag rows in one camera frame remain recovered until another frame arrives', () => {
    const h = baseHistory()
    for (const ts of ['2026-11-02T04:00:00Z', '2026-11-02T07:00:00Z']) {
      for (const metric of ['contrast_near', 'contrast_far', 'flag']) {
        // Each metric may arrive separately; that does not create another frame.
        h.readings.push(reading('cam-1', metric, ts, 0.3, ts.replace(':00Z', metric === 'flag' ? ':10Z' : ':05Z')))
      }
    }
    expect(deriveInputState(h, 'cam-1', '2026-11-02T06:50:00Z')).toBe('stale')
    expect(deriveInputState(h, 'cam-1', '2026-11-02T07:05:00Z')).toBe('recovered')
    for (const metric of ['contrast_near', 'contrast_far']) {
      h.readings.push(reading('cam-1', metric, '2026-11-02T07:10:00Z', 0.3))
    }
    expect(deriveInputState(h, 'cam-1', '2026-11-02T07:11:00Z')).toBe('fresh')
  })

  test('out of order receipts from an old camera frame cannot complete recovery', () => {
    const h = baseHistory()
    h.readings.push(
      reading('cam-1', 'contrast_far', '2026-11-02T04:00:00Z', 0.3),
      reading('cam-1', 'contrast_far', '2026-11-02T07:00:00Z', 0.3, '2026-11-02T07:01:00Z'),
      reading('cam-1', 'contrast_near', '2026-11-02T04:00:00Z', 0.3, '2026-11-02T07:02:00Z')
    )
    expect(deriveInputState(h, 'cam-1', '2026-11-02T07:05:00Z')).toBe('recovered')
  })

  test('a delayed older observation cannot restart recovery after two fresh camera frames', () => {
    const h = baseHistory()
    h.readings.push(
      reading('cam-1', 'contrast_far', '2026-11-02T04:00:00Z', 0.3),
      reading('cam-1', 'contrast_far', '2026-11-02T07:00:00Z', 0.3),
      reading('cam-1', 'contrast_far', '2026-11-02T03:00:00Z', 0.3, '2026-11-02T07:08:00Z'),
      reading('cam-1', 'contrast_far', '2026-11-02T07:10:00Z', 0.3)
    )
    expect(deriveInputState(h, 'cam-1', '2026-11-02T07:11:00Z')).toBe('fresh')
  })

  test('ancient nonconsecutive 06:00 mornings are unusable even when current hourly API is fresh', () => {
    const h = baseHistory()
    for (const ts of ['2026-10-01T22:00:00Z', '2026-10-15T22:00:00Z', '2026-10-25T22:00:00Z']) {
      h.readings.push(reading('CA16W', 'api', ts, 160))
    }
    for (const ts of ['2026-11-02T06:00:00Z', '2026-11-02T07:00:00Z']) {
      h.readings.push(reading('CA16W', 'api', ts, 20))
    }
    const snap = snapshotAt(h, TEST_REGISTRY, 'p', 'sky', '2026-11-02T07:05:00Z')
    expect(snap.site['site.api_max']?.value).toBe(20)
    expect(snap.site['site.api_0600_min_last3_max']?.value).toBeNull()
    expect(snap.site['site.api_0600_min_last3_max']?.state).toBe('stale')
    expect(snap.site['site.api_0600_min_last3_max']?.readingIds).toEqual([])
  })

  test('the three-day minimum is computed per station before taking the maximum across stations', () => {
    const h = baseHistory()
    const station = h.sources.find((source) => source.id === 'CA16W')!
    h.sources.push({ ...station, id: 'CA17W' })
    const dates = ['2026-10-30T22:00:00Z', '2026-10-31T22:00:00Z', '2026-11-01T22:00:00Z']
    for (const [index, ts] of dates.entries()) {
      h.readings.push(reading('CA16W', 'api', ts, [200, 100, 200][index]!))
      h.readings.push(reading('CA17W', 'api', ts, [100, 200, 100][index]!))
    }
    for (const sid of ['CA16W', 'CA17W']) {
      for (const ts of ['2026-11-02T06:00:00Z', '2026-11-02T07:00:00Z']) {
        h.readings.push(reading(sid, 'api', ts, 20))
      }
    }
    const indicator = snapshotAt(h, TEST_REGISTRY, 'p', 'sky', '2026-11-02T07:05:00Z').site[
      'site.api_0600_min_last3_max'
    ]!
    expect(indicator.value).toBe(100)
    expect(indicator.sourceIds).toEqual(['CA16W', 'CA17W'])
    expect(indicator.readingIds).toHaveLength(6)
  })

  test('the latest three required MYT mornings advance exactly at 06:00 without last-available fallback', () => {
    const h = baseHistory()
    for (const [ts, value] of [
      ['2026-10-29T22:00:00Z', 170],
      ['2026-10-30T22:00:00Z', 160],
      ['2026-10-31T22:00:00Z', 165],
      ['2026-11-01T20:00:00Z', 20],
      ['2026-11-01T21:00:00Z', 20]
    ] as const)
      h.readings.push(reading('CA16W', 'api', ts, value))
    expect(
      snapshotAt(h, TEST_REGISTRY, 'p', 'sky', '2026-11-01T21:59:59Z').site['site.api_0600_min_last3_max']?.value
    ).toBe(160)
    expect(
      snapshotAt(h, TEST_REGISTRY, 'p', 'sky', '2026-11-01T22:00:00Z').site['site.api_0600_min_last3_max']?.value
    ).toBeNull()
    h.readings.push(reading('CA16W', 'api', '2026-11-01T22:00:00Z', 150, '2026-11-01T22:05:00Z'))
    const snap = snapshotAt(h, TEST_REGISTRY, 'p', 'sky', '2026-11-01T22:05:00Z')
    expect(snap.site['site.api_0600_min_last3_max']?.value).toBe(150)
    expect(snap.site['site.api_0600_min_last3_max']?.readingIds).toEqual([
      'CA16W-api-2026-10-30T22:00:00Z',
      'CA16W-api-2026-10-31T22:00:00Z',
      'CA16W-api-2026-11-01T22:00:00Z'
    ])
    expect(snap.site['site.api_0600_min_last3_max']?.observedAt).toBe('2026-11-01T22:00:00Z')
  })
})

// Isolated boundary tests use explicit test readings and receipt clocks.
describe('isolated history identity and GTFS calendar boundaries', () => {
  const warning = (
    overrides: Partial<ReadingHistory['readings'][number]> = {}
  ): ReadingHistory['readings'][number] => ({
    id: 'warning-old',
    sourceId: 'met-warn',
    metric: 'warning',
    observedAt: '2026-11-02T07:00:00Z',
    receivedAt: '2026-11-02T07:01:00Z',
    value: true,
    valueText: null,
    valueJson: null,
    itemKey: 'warning-1',
    revision: 1,
    ...overrides
  })

  test('preserves distinct MET items at the same observation', () => {
    const h = baseHistory()
    h.readings = [warning(), warning({ id: 'warning-other', itemKey: 'warning-2' })]
    expect(dedupeReadingsAt(h, Date.parse('2026-11-02T07:05:00Z')).map((r) => r.id)).toEqual([
      'warning-old',
      'warning-other'
    ])
  })

  test('keeps independent revision sequences for the same MET item at different observations', () => {
    const h = baseHistory()
    h.readings = [
      warning({ revision: 9, receivedAt: '2026-11-02T07:04:00Z' }),
      warning({ id: 'warning-new', observedAt: '2026-11-02T07:02:00Z', receivedAt: '2026-11-02T07:03:00Z' })
    ]
    expect(dedupeReadingsAt(h, Date.parse('2026-11-02T07:05:00Z')).map((r) => r.id)).toEqual([
      'warning-old',
      'warning-new'
    ])
  })

  test('selects the earlier revision at an earlier receipt cutoff', () => {
    const h = baseHistory()
    h.readings = [warning(), warning({ id: 'warning-revised', revision: 2, receivedAt: '2026-11-02T07:04:00Z' })]
    expect(dedupeReadingsAt(h, Date.parse('2026-11-02T07:03:00Z')).map((r) => r.id)).toEqual(['warning-old'])
    expect(dedupeReadingsAt(h, Date.parse('2026-11-02T07:04:00Z')).map((r) => r.id)).toEqual(['warning-revised'])
  })

  test('GTFS calendar_end is inclusive through the MYT date and successful polls cannot extend it', () => {
    const h: ReadingHistory = {
      sources: [
        {
          id: 'gtfs',
          kind: 'gtfs_static',
          cadenceS: 300,
          staleAfterS: 600,
          freshness: 'polled',
          probation: false,
          meta: { calendar_end: '2026-11-02' }
        }
      ],
      readings: [],
      polls: [
        { id: 'before-midnight', sourceId: 'gtfs', startedAt: '2026-11-02T15:59:00Z', outcome: 'ok', httpStatus: 200 }
      ]
    }
    expect(deriveInputState(h, 'gtfs', '2026-11-02T15:59:59Z')).toBe('fresh')
    expect(deriveInputState(h, 'gtfs', '2026-11-02T16:00:00Z')).toBe('stale')
    h.polls.push({
      id: 'after-midnight',
      sourceId: 'gtfs',
      startedAt: '2026-11-02T16:01:00Z',
      outcome: 'unchanged',
      httpStatus: 304
    })
    expect(resolveSourceAt(h, 'gtfs', '2026-11-02T16:01:00Z')).toMatchObject({
      state: 'stale',
      since: '2026-11-02T16:00:00Z',
      ageS: 0
    })
    h.polls.push({
      id: 'failed-after-expiry',
      sourceId: 'gtfs',
      startedAt: '2026-11-02T16:02:00Z',
      outcome: 'error',
      httpStatus: 503
    })
    expect(deriveInputState(h, 'gtfs', '2026-11-02T16:02:00Z')).toBe('error')
  })

  test('freshness is current at age 600 seconds and stale at 601 seconds', () => {
    const h = baseHistory()
    h.readings = [warning({ sourceId: '0232901RF', metric: 'rain_5m_mm' })]
    expect(deriveInputState(h, '0232901RF', '2026-11-02T07:10:00Z')).toBe('fresh')
    expect(deriveInputState(h, '0232901RF', '2026-11-02T07:10:01Z')).toBe('stale')
  })
})

describe('MET project area and strict validity', () => {
  const registry = TEST_REGISTRY.filter((def) => def.sourceKind === 'met_warning')
  const value = (h: ReturnType<typeof metWarningHistory>, at = '2026-11-05T13:13:01Z') =>
    snapshotAt(h, registry, 'project', 'sky', at).site['site.met_warning_in_force']?.value
  test('same singleton uses explicit current project terms and matches raw English or Malay text only', () => {
    const h = metWarningHistory()
    expect(value(h)).toBe(true)
    h.warningAreaTerms = ['Kuala Lumpur']
    expect(value(h)).toBe(false)
    h.warningAreaTerms = []
    expect(value(h)).toBe(false)
    delete h.warningAreaTerms
    expect(value(h)).toBe(false)
    h.warningAreaTerms = ['   ']
    expect(value(h)).toBe(false)
    h.warningAreaTerms = ['Ribut Petir']
    expect(value(h)).toBe(true)
    h.warningAreaTerms = ['Thunderstorms Warning']
    expect(value(h)).toBe(false)
  })
  test.each(['valid_from_utc', 'valid_to_utc'])('either null normalized bound is false: %s', (field) => {
    const h = metWarningHistory()
    const thunder = h.readings.find((r) => r.valueJson?.excluded === false)!
    thunder.valueJson![field] = null
    expect(value(h)).toBe(false)
  })
  test('excluded local nested warning and titles cannot override area eligibility', () => {
    const h = metWarningHistory()
    h.warningAreaTerms = ['Kuala Lumpur']
    for (const r of h.readings) {
      r.valueJson!.text_en = 'Kuala Lumpur'
      r.valueJson!.excluded = true
    }
    expect(value(h)).toBe(false)
    const thunder = h.readings.find((r) => String(r.valueJson?.text_bm).includes('Kedah'))!
    thunder.valueJson!.excluded = false
    thunder.valueJson!.text_en = 'Elsewhere'
    thunder.valueJson!.text_bm = 'Tempat lain'
    thunder.valueJson!.warning_issue = { title_en: 'Kuala Lumpur', title_bm: 'Kuala Lumpur' }
    thunder.valueText = 'Kuala Lumpur'
    expect(value(h)).toBe(false)
  })
  test.each(['No Advisory', 'Strong Winds and Rough Seas Warning'])(
    'nested provider exclusion title remains ineligible: %s',
    (title) => {
      const h = metWarningHistory()
      const thunder = h.readings.find((r) => r.valueJson?.excluded === false)!
      thunder.valueJson!.warning_issue = { title_en: title }
      expect(value(h)).toBe(false)
    }
  )
  test('inclusive endpoints, expiry and empty successful poll retain original validity', () => {
    const h = metWarningHistory()
    const thunder = h.readings.find((r) => r.valueJson?.excluded === false)!
    const from = String(thunder.valueJson!.valid_from_utc),
      to = String(thunder.valueJson!.valid_to_utc)
    thunder.observedAt = from
    thunder.receivedAt = from
    h.polls = [{ id: 'empty', sourceId: 'met', startedAt: from, outcome: 'unchanged', httpStatus: 200 }]
    expect(value(h, from)).toBe(true)
    h.polls[0]!.startedAt = to
    expect(value(h, to)).toBe(true)
    const expired = new Date(Date.parse(to) + 1).toISOString()
    expect(value(h, expired)).toBe(false)
    expect(value(h, '2026-11-05T17:05:00Z')).toBe(false)
  })
})
