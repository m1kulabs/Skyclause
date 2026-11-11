import { describe, expect, test } from 'bun:test'
import { buildHealth } from './health.ts'

const stamp = { sha: '2fcb76b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6', builtAt: '2026-11-06T10:00:00+08:00' }
const now = new Date('2026-11-06T15:13:30+08:00')

describe('buildHealth', () => {
  test('reports Pi age from successful heartbeat polls', () => {
    const health = buildHealth({
      stamp,
      now,
      sources: [{ source_id: 'pi-01', kind: 'pi', freshness: 'polled', state: 'fresh', stale_after_min: 60 }],
      polls: [
        {
          source_id: 'pi-01',
          source_kind: 'pi',
          outcome: 'ok',
          received_at: '2026-11-06T15:12:30+08:00'
        }
      ]
    })

    expect(health.sources).toEqual([
      {
        source_id: 'pi-01',
        state: 'fresh',
        received_at: '2026-11-06T15:12:30+08:00',
        age_min: 1,
        stale_after_min: 60
      }
    ])
  })

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

describe('APIMS station health receipts', () => {
  for (const sourceKind of ['apims', 'apims_backfill']) {
    test(`joins a successful ${sourceKind} receipt only to stations with an actual stored reading`, () => {
      const input = {
        stamp,
        now,
        sources: [
          { source_id: 'CA16W', kind: 'apims', freshness: 'observed', state: 'fresh', stale_after_min: 120 },
          { source_id: 'CA19B', kind: 'apims', freshness: 'observed', state: 'unknown', stale_after_min: 120 },
          { source_id: 'other', kind: 'jps', freshness: 'observed', state: 'fresh', stale_after_min: 10 }
        ],
        polls: [
          {
            poll_id: 'shared',
            source_kind: sourceKind,
            source_id: sourceKind === 'apims' ? 'apims' : 'apims:backfill:14:2026-11-06T15:00:00+08:00',
            outcome: 'ok',
            received_at: '2026-11-06T15:10:00+08:00'
          },
          {
            poll_id: 'unchanged',
            source_kind: sourceKind,
            source_id: 'apims',
            outcome: 'unchanged',
            received_at: '2026-11-06T15:12:00+08:00'
          },
          {
            poll_id: 'error',
            source_kind: sourceKind,
            source_id: 'apims',
            outcome: 'error',
            received_at: '2026-11-06T15:13:00+08:00'
          },
          {
            poll_id: 'wrong-kind',
            source_kind: 'jps',
            source_id: 'apims',
            outcome: 'ok',
            received_at: '2026-11-06T15:13:10+08:00'
          }
        ],
        readings: [
          { source_id: 'CA16W', poll_id: 'shared' },
          { source_id: 'CA16W', poll_id: 'unchanged' },
          { source_id: 'CA16W', poll_id: 'error' },
          { source_id: 'CA16W', poll_id: 'wrong-kind' },
          { source_id: 'other', poll_id: 'shared' },
          { source_id: 'CA19B', poll_id: 'missing' }
        ]
      }
      expect(buildHealth(input)).toEqual({
        ok: true,
        sha: stamp.sha,
        built_at: stamp.builtAt,
        sources: [
          {
            source_id: 'CA16W',
            state: 'fresh',
            received_at: '2026-11-06T15:10:00+08:00',
            age_min: 3,
            stale_after_min: 120
          },
          { source_id: 'CA19B', state: 'unknown', received_at: null, age_min: null, stale_after_min: 120 },
          { source_id: 'other', state: 'fresh', received_at: null, age_min: null, stale_after_min: 10 }
        ]
      })
    })
  }
})
