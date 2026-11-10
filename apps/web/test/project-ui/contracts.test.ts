import { expect, test } from 'vitest'
import { updateProjectPack } from '@skyclause/contracts/api/v1/packs'
import { listWindows } from '@skyclause/contracts/api/v1/windows'
import { getProjectStrip } from '@skyclause/contracts/api/v1/strip'
import { ShareLink } from '@skyclause/contracts/api/shared'

test('project pack patches accept an SLA without requiring an enabled change', () => {
  const schema = updateProjectPack.request.body.content['application/json'].schema
  expect(schema.parse({ sla_s: 1200 })).toEqual({ sla_s: 1200 })
})

test('project windows preserve their at-risk state', () => {
  const response = listWindows.responses[200].content['application/json'].schema.parse({
    data: [
      {
        id: '019a55e0-0000-7000-8000-000000000021',
        project_id: '019a55e0-0000-7000-8000-000000000001',
        starts_at: '2026-11-05T13:30:00.000Z',
        ends_at: '2026-11-05T15:00:00.000Z',
        title: 'Evening lecture',
        kind: 'class',
        tz: 'Asia/Kuala_Lumpur',
        declared_by: 'account-one',
        guest: false,
        via: 'app',
        expires_at: null,
        series_id: null,
        ics_feed_id: null,
        cancelled_at: null,
        share_link_id: null,
        moderation: 'visible',
        at_risk: true,
        latest_calls: { sky: null, crowd: null }
      }
    ],
    next_cursor: null
  })

  expect(response.data[0]?.at_risk).toBe(true)
})

test('project strips preserve the capture label for replay data', () => {
  const response = getProjectStrip.responses[200].content['application/json'].schema.parse({
    project_id: '019a55e0-0000-7000-8000-000000000001',
    range: { from: '2026-11-02T07:00:00.000Z', to: '2026-11-02T08:00:00.000Z' },
    window: null,
    series: {},
    inputs: [],
    packs: [],
    verdicts: [],
    nights: [],
    replay: { source: 'JPS Infobanjir', captured_at: '2026-11-02T07:05:00.000Z' }
  })

  expect(response.replay).toEqual({ source: 'JPS Infobanjir', captured_at: '2026-11-02T07:05:00.000Z' })
})

test('share links preserve the last-used time', () => {
  const link = ShareLink.parse({
    id: '019a55e0-0000-7000-8000-000000000031',
    project_id: '019a55e0-0000-7000-8000-000000000001',
    access: 'reviewer',
    expires_at: '2026-11-12T13:12:00.000Z',
    revoked_at: null,
    last_used_at: '2026-11-05T13:00:00.000Z'
  })

  expect(link.last_used_at).toBe('2026-11-05T13:00:00.000Z')
})
