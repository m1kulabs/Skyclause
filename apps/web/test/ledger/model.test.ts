import { expect, test } from 'vitest'
import {
  filtersFromSearch,
  invalidFilters,
  targetEntry,
  ledgerHref,
  canApproveReply,
  requestState,
  measuredWindow,
  rowOffsets
} from '../../features/ledger/model'
import { ApiProblem } from '../../lib/api-fetch'
import { problemMessage } from '../../features/ledger/problem'

test('filters use the contract, survive a URL round trip and reset pagination when edited', () => {
  const search = new URLSearchParams(
    'from=2026-11-02&to=2026-11-04&pack=sky&mode=normal&state=approved&cursor=next&offset=50&tab=evidence'
  )
  expect(filtersFromSearch(search)).toEqual({
    from: '2026-11-02',
    to: '2026-11-04',
    pack: 'sky',
    mode: 'normal',
    state: 'approved'
  })
  const href = ledgerHref('/o/p/ledger', search, { mode: 'outdoor_limited', cursor: null, offset: null })
  expect(href).toContain('tab=evidence')
  expect(href).not.toContain('cursor=')
  expect(filtersFromSearch(new URLSearchParams(href.split('?')[1]))).toMatchObject({
    mode: 'outdoor_limited',
    pack: 'sky'
  })
  expect(() => filtersFromSearch(new URLSearchParams('from=bad'))).toThrow()
  expect(() => filtersFromSearch(new URLSearchParams('from=2026-11-04&to=2026-11-02'))).toThrow()
})

test('only a human approver session can approve an external reply awaiting approval', () => {
  const request = { leaves_org: true, approved_at: null, replied_at: null, drafted_at: '2026-11-02T06:00:00Z' }
  for (const role of ['owner', 'admin', 'approver'])
    expect(canApproveReply({ kind: 'session', role, isGuest: false }, request)).toBe(true)
  for (const role of ['editor', 'viewer', 'guest'])
    expect(canApproveReply({ kind: 'session', role, isGuest: false }, request)).toBe(false)
  expect(canApproveReply({ kind: 'api_key', role: 'owner' }, request)).toBe(false)
  expect(canApproveReply({ kind: 'session', role: 'owner', isGuest: true }, request)).toBe(false)
  expect(canApproveReply({ kind: 'session', role: 'owner' }, { ...request, leaves_org: false })).toBe(false)
  expect(canApproveReply({ kind: 'session', role: 'owner' }, { ...request, approved_at: request.drafted_at })).toBe(
    false
  )
})

test('guest, external waiting and replied requests use their distinct states', () => {
  expect(requestState({ leaves_org: false, approved_at: null, replied_at: null, status: 'not_reviewed' }, true)).toBe(
    'notReviewed'
  )
  expect(requestState({ leaves_org: true, approved_at: null, replied_at: null, status: 'drafted' }, false)).toBe(
    'waiting'
  )
  expect(
    requestState(
      { leaves_org: true, approved_at: '2026-11-02T06:00:00Z', replied_at: '2026-11-02T06:01:00Z', status: 'replied' },
      false
    )
  ).toBe('replied')
})

test('a measured table window includes tall rows and bounds the 10000-row DOM', () => {
  const heights = new Map([[0, 420]])
  const offsets = rowOffsets(10000, heights)
  const start = measuredWindow(offsets, 0, 600)
  expect(start.start).toBe(0)
  expect(start.end).toBeLessThan(20)
  const middle = measuredWindow(offsets, 500000, 600)
  expect(middle.start).toBeGreaterThan(1000)
  expect(middle.end - middle.start).toBeLessThan(20)
  expect(middle.before + middle.visible + middle.after).toBe(start.total)
})

test('budget exhaustion prints the API reset in MYT and unknown failures give a retry action', () => {
  expect(problemMessage(new ApiProblem(429, { type: 'budget-exhausted', reset_at: '2026-11-02T16:00:00Z' }))).toContain(
    '00:00 MYT'
  )
  expect(problemMessage(new Error('network'))).toContain('Try again')
})

test('only the offending filter field is marked invalid', () => {
  expect([...invalidFilters(new URLSearchParams('from=2026-11-02&pack=sky'))]).toEqual([])
  expect([...invalidFilters(new URLSearchParams('from=bad&pack=sky'))]).toEqual(['from'])
  expect([...invalidFilters(new URLSearchParams('pack=moon&to=2026-11-04'))]).toEqual(['pack'])
  expect([...invalidFilters(new URLSearchParams('from=2026-11-04&to=2026-11-02'))].sort()).toEqual(['from', 'to'])
})

test('a link to a call finds its approval entry, else its first entry; an entry link wins', () => {
  const rows: Parameters<typeof targetEntry>[0] = [
    { id: 'sent', kind: 'call_sent', refs: { call_id: 'c1' } },
    { id: 'approved', kind: 'call_approved', refs: { call_id: 'c1' } },
    { id: 'other', kind: 'call_sent', refs: {}, call: { id: 'c2' } }
  ]
  expect(targetEntry(rows, null, 'c1')).toBe('approved')
  expect(targetEntry(rows, null, 'c2')).toBe('other')
  expect(targetEntry(rows, 'sent', 'c1')).toBe('sent')
  expect(targetEntry(rows, null, 'missing')).toBeNull()
  expect(targetEntry(rows, null, null)).toBeNull()
})
