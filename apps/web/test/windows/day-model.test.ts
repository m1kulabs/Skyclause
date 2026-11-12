import { expect, test } from 'vitest'
import { axisOf, capsuleOf, segmentsOf, ticksOf } from '../../features/windows/day-model'
import type { BundleView, WindowView } from '../../features/windows/operations'

const call = (state: string, mode: string | null, bundle = 'bundle-1') => ({
  id: `call-${bundle}`,
  bundle_id: bundle,
  state,
  mode
})
const window = (id: string, from: string, to: string, calls: Record<string, unknown> = {}) =>
  ({
    id,
    title: id,
    starts_at: from,
    ends_at: to,
    latest_calls: { sky: null, crowd: null, ...calls }
  }) as unknown as WindowView
const bundle = (id: string, state: string) => ({ id, state }) as unknown as BundleView

test('a call is filled when sent, dotted while a draft or waiting for review, plain once it is past', () => {
  expect(capsuleOf(call('sent', 'commute_disruption') as never, []).tone).toBe('commute-disruption')
  expect(capsuleOf(call('approved', 'normal') as never, []).tone).toBe('normal')
  expect(capsuleOf(call('drafted', 'normal') as never, []).tone).toBe('draft')
  expect(capsuleOf(call('approved', 'normal') as never, [bundle('bundle-1', 'needs_review')]).tone).toBe('draft')
  expect(capsuleOf(call('rejected', 'normal') as never, []).tone).toBe('rejected')
  expect(capsuleOf(call('superseded', 'normal') as never, []).tone).toBe('expired')
  expect(capsuleOf(null, [])).toEqual({ state: null, tone: 'pending', call: null })
})

test('a mode-less call is drawn as No call, with its glyph and word', () => {
  expect(capsuleOf(call('sent', null) as never, []).state).toBe('no_call')
})

test('a window draws a Sky lane (pending until its call), and a Crowd lane only with a crowd call', () => {
  const none = segmentsOf('2026-11-02', [window('a', '2026-11-02T07:30:00Z', '2026-11-02T08:00:00Z')], [])
  expect(none.map((segment) => [segment.lane, segment.capsule.tone])).toEqual([['sky', 'pending']])
  const both = segmentsOf(
    '2026-11-02',
    [
      window('a', '2026-11-02T07:30:00Z', '2026-11-02T08:00:00Z', {
        sky: call('sent', 'normal'),
        crowd: call('drafted', 'surge_night', 'b2')
      })
    ],
    []
  )
  expect(both.map((segment) => segment.lane)).toEqual(['sky', 'crowd'])
  // A window with only a crowd call has no empty Sky capsule.
  const crowdOnly = segmentsOf(
    '2026-11-02',
    [window('a', '2026-11-02T07:30:00Z', '2026-11-02T08:00:00Z', { crowd: call('drafted', 'surge_night') })],
    []
  )
  expect(crowdOnly.map((segment) => segment.lane)).toEqual(['crowd'])
})

test('segments are clipped to the MYT day, minutes after its midnight', () => {
  // 15:30 to 16:00 MYT is 07:30 to 08:00 UTC.
  const [segment] = segmentsOf('2026-11-02', [window('a', '2026-11-02T07:30:00Z', '2026-11-02T08:00:00Z')], [])
  expect([segment!.from, segment!.to]).toEqual([15 * 60 + 30, 16 * 60])
  // A window across midnight is drawn on both days, clipped to each.
  const across = window('b', '2026-11-02T15:00:00Z', '2026-11-02T17:00:00Z')
  expect(segmentsOf('2026-11-02', [across], []).map((s) => [s.from, s.to])).toEqual([[23 * 60, 24 * 60]])
  expect(segmentsOf('2026-11-03', [across], []).map((s) => [s.from, s.to])).toEqual([[0, 60]])
  // A zero-length commute wave belongs to the day it starts in; one ending at midnight does not touch the next day.
  const wave = window('c', '2026-11-02T07:30:00Z', '2026-11-02T07:30:00Z')
  expect(segmentsOf('2026-11-02', [wave], [])).toHaveLength(1)
  const ends = window('d', '2026-11-02T14:00:00Z', '2026-11-02T16:00:00Z')
  expect(segmentsOf('2026-11-03', [ends], [])).toHaveLength(0)
})

test('the axis spans the windows plus an hour, on whole hours and never under twelve hours', () => {
  expect(axisOf([])).toEqual({ from: 6 * 60, to: 22 * 60 })
  expect(axisOf([{ from: 15 * 60 + 30, to: 16 * 60 }])).toEqual({ from: 9 * 60, to: 21 * 60 })
  expect(axisOf([{ from: 8 * 60 + 30, to: 23 * 60 + 30 }])).toEqual({ from: 7 * 60, to: 24 * 60 })
})

test('ticks fall on whole hours and the closing midnight is not labelled as 00:00', () => {
  expect(ticksOf({ from: 7 * 60, to: 24 * 60 })).toEqual([9, 12, 15, 18, 21].map((hour) => hour * 60))
  expect(ticksOf({ from: 9 * 60, to: 21 * 60 })).toEqual([10, 12, 14, 16, 18, 20].map((hour) => hour * 60))
})
