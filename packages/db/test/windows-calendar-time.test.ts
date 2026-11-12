import { expect, test } from 'vitest'
import { nextWindowLocalDate, resolveWindowLocalSpan, withTenant } from '../src'
import { makeOrganization } from './factories'
import { memberOf } from './harness'

const span = {
  date: '2026-11-14',
  start: '23:00:12.345',
  end: '01:00:42.125',
  endDayOffset: 1,
  tz: 'Asia/Kuala_Lumpur'
}

test('resolves exact civil stamps and overnight dates without losing seconds', async () => {
  const { id: orgId } = await makeOrganization()
  const resolved = await withTenant({ orgId, principal: memberOf(orgId) }, (tx) => resolveWindowLocalSpan(tx, span))
  expect(resolved).toEqual({
    startsAt: new Date('2026-11-14T15:00:12.345Z'),
    endsAt: new Date('2026-11-14T17:00:42.125Z')
  })
})

test('rejects a nonexistent spring clock time by round trip', async () => {
  const { id: orgId } = await makeOrganization()
  await expect(
    withTenant({ orgId, principal: memberOf(orgId) }, (tx) =>
      resolveWindowLocalSpan(tx, {
        date: '2026-03-08',
        start: '02:30:00',
        end: '03:30:00',
        endDayOffset: 0,
        tz: 'America/New_York'
      })
    )
  ).rejects.toThrow(/nonexistent local time/)
})

test('chooses standard time in the fall overlap and keeps daily 09:00 across DST', async () => {
  const { id: orgId } = await makeOrganization()
  const resolved = await withTenant({ orgId, principal: memberOf(orgId) }, async (tx) => {
    const overlap = await resolveWindowLocalSpan(tx, {
      date: '2026-11-01',
      start: '01:30:00',
      end: '02:30:00',
      endDayOffset: 0,
      tz: 'America/New_York'
    })
    const daily = []
    for (const date of ['2026-03-07', '2026-03-08', '2026-03-09'])
      daily.push(
        await resolveWindowLocalSpan(tx, {
          date,
          start: '09:00:00',
          end: '10:00:00',
          endDayOffset: 0,
          tz: 'America/New_York'
        })
      )
    return { overlap, daily }
  })
  expect(resolved.overlap.startsAt.toISOString()).toBe('2026-11-01T06:30:00.000Z')
  expect(resolved.daily.map((row) => row.startsAt.toISOString())).toEqual([
    '2026-03-07T14:00:00.000Z',
    '2026-03-08T13:00:00.000Z',
    '2026-03-09T13:00:00.000Z'
  ])
})

test.each([
  ['late MYT evening', '2026-11-14T15:55:00Z', 'Asia/Kuala_Lumpur', '2026-11-14T16:00:00.000Z'],
  ['exact MYT midnight', '2026-11-14T16:00:00Z', 'Asia/Kuala_Lumpur', '2026-11-15T16:00:00.000Z'],
  ['23-hour spring date', '2026-03-08T05:00:00Z', 'America/New_York', '2026-03-09T04:00:00.000Z'],
  ['25-hour autumn date', '2026-11-01T04:00:00Z', 'America/New_York', '2026-11-02T05:00:00.000Z'],
  ['midnight spring gap', '2018-11-04T02:55:00Z', 'America/Sao_Paulo', '2018-11-04T03:00:00.000Z'],
  ['skipped civil date', '2011-12-30T09:55:00Z', 'Pacific/Apia', '2011-12-30T10:00:00.000Z']
])('the next local date boundary handles %s', async (_label, now, tz, expected) => {
  const { id: orgId } = await makeOrganization()
  const next = await withTenant({ orgId, principal: memberOf(orgId) }, (tx) =>
    nextWindowLocalDate(tx, { now: new Date(now), tz })
  )
  expect(next.toISOString()).toBe(expected)
  expect(next.getTime()).toBeGreaterThan(new Date(now).getTime())
})
