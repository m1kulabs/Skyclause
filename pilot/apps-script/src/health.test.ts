import { describe, expect, test } from 'bun:test'
import { buildHealth } from './health.ts'

const stamp = { sha: '2fcb76b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6', builtAt: '2026-11-06T10:00:00+08:00' }
const now = new Date('2026-11-06T15:13:30+08:00')

describe('buildHealth', () => {
  test('reports the build and each source’s newest ok poll, counting unchanged polls only for polled sources', () => {
    const health = buildHealth({
      stamp,
      now,
      sources: [
        { source_id: '0232901RF', freshness: 'observed', state: 'fresh', stale_after_min: 10 },
        { source_id: 'met_warning', freshness: 'polled', state: 'fresh', stale_after_min: '20' }
      ],
      polls: [
        { source_id: '0232901RF', outcome: 'ok', received_at: '2026-11-06T15:10:41+08:00' },
        { source_id: '0232901RF', outcome: 'ok', received_at: '2026-11-06T15:00:40+08:00' },
        { source_id: '0232901RF', outcome: 'error', received_at: '2026-11-06T15:12:00+08:00' },
        { source_id: '0232901RF', outcome: 'unchanged', received_at: '2026-11-06T15:13:00+08:00' },
        { source_id: 'met_warning', outcome: 'unchanged', received_at: '2026-11-06T15:05:02+08:00' },
        { source_id: 'met_warning', outcome: 'ok', received_at: '2026-11-06T09:35:00+08:00' }
      ]
    })
    expect(health).toEqual({
      ok: true,
      sha: stamp.sha,
      built_at: stamp.builtAt,
      sources: [
        {
          source_id: '0232901RF',
          state: 'fresh',
          received_at: '2026-11-06T15:10:41+08:00',
          age_min: 2,
          stale_after_min: 10
        },
        {
          source_id: 'met_warning',
          state: 'fresh',
          received_at: '2026-11-06T15:05:02+08:00',
          age_min: 8,
          stale_after_min: 20
        }
      ]
    })
  })

  test('gives a null age to a source with no successful poll', () => {
    const health = buildHealth({
      stamp,
      now,
      sources: [{ source_id: 'CA16W', freshness: 'observed', state: 'error', stale_after_min: 120 }],
      polls: [{ source_id: 'CA16W', outcome: 'error', received_at: '2026-11-06T15:00:00+08:00' }]
    })
    expect(health.sources).toEqual([
      { source_id: 'CA16W', state: 'error', received_at: null, age_min: null, stale_after_min: 120 }
    ])
  })

  test('reads a receipt time that Sheets returned as a date', () => {
    const health = buildHealth({
      stamp,
      now,
      sources: [{ source_id: 'cam-1', freshness: 'observed', state: 'off_hours', stale_after_min: 20 }],
      polls: [{ source_id: 'cam-1', outcome: 'ok', received_at: new Date('2026-11-06T07:10:00Z') }]
    })
    expect(health.sources[0]).toEqual({
      source_id: 'cam-1',
      state: 'off_hours',
      received_at: '2026-11-06T15:10:00+08:00',
      age_min: 3,
      stale_after_min: 20
    })
  })
})
