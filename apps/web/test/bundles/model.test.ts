import { expect, test, vi } from 'vitest'
import type { CallView } from '@skyclause/contracts'
import {
  approvalReach,
  approvedReach,
  callFate,
  canReviewCall,
  decisionsFor,
  teachingLineIncluded,
  orderedCalls,
  reviewCount
} from '../../features/bundles/model'
import { t } from '../../features/bundles/i18n'

const call = (id: string, patch: Partial<CallView> = {}): CallView => ({
  id,
  bundle_id: 'bundle',
  window_id: id,
  night_id: null,
  mode: 'commute_disruption',
  watch: false,
  no_call: null,
  fired: [],
  recommendations: [],
  recipients: [],
  notices: [],
  reason: '',
  state: 'drafted',
  shadow: {
    scope: { kind: 'window', id },
    pack: 'sky',
    mode: 'normal',
    watch: false,
    no_call: null,
    recommendations: [],
    clauses: [],
    open_from: null
  },
  chosen: 'agent',
  agrees: true,
  decision: null,
  expires_at: '2099-11-02T07:30:00Z',
  triggered_at: '2026-11-02T07:05:00Z',
  drafted_at: '2026-11-02T07:06:00Z',
  approved_at: null,
  sent_at: null,
  superseded_by_call_id: null,
  ics_uid: id,
  ics_sequence: 0,
  ...patch
})

test('disagreements precede agreeing calls and rejected calls reduce the approval count', () => {
  const calls = [call('agree'), call('disagree', { agrees: false })]
  expect(orderedCalls(calls).map((item) => item.id)).toEqual(['disagree', 'agree'])
  expect(reviewCount(calls, {}, Date.now())).toBe(2)
  expect(reviewCount(calls, { agree: { action: 'reject' } }, Date.now())).toBe(1)
})

test('approval includes rejected decisions and per-window shadow choices without touching unreviewable calls', () => {
  const calls = [call('a'), call('b', { agrees: false }), call('old', { state: 'superseded' })]
  expect(
    decisionsFor(calls, { a: { action: 'reject' }, b: { action: 'approve', chosen: 'shadow' } }, Date.now())
  ).toEqual([
    { call_id: 'a', action: 'reject' },
    { call_id: 'b', action: 'approve', chosen: 'shadow' }
  ])
})

test('expired, No call and Normal-only calls cannot be approved', () => {
  for (const item of [
    call('a', { expires_at: '2026-01-01T00:00:00Z' }),
    call('b', { no_call: ['gauge'] }),
    call('c', { mode: 'normal' })
  ]) {
    expect(canReviewCall(item, Date.now())).toBe(false)
  }
  expect(canReviewCall(call('disagree', { mode: 'normal', agrees: false }), Date.now())).toBe(true)
})

test('Hybrid edit check refuses the template teaching line in English and Malay', () => {
  for (const language of ['en', 'ms'] as const) {
    const original = call('a', { mode: 'hybrid_recommended' })
    expect(teachingLineIncluded(original, { notices: [{ language, subject: 'test', body: 'edited wording' }] })).toBe(
      false
    )
    expect(
      teachingLineIncluded(original, {
        notices: [{ language, subject: 'test', body: t('bundles.teaching', {}, language) }]
      })
    ).toBe(true)
    expect(
      teachingLineIncluded(original, {
        notices: [{ language, subject: t('bundles.teaching', {}, language), body: 'edited wording' }]
      })
    ).toBe(true)
    expect(
      teachingLineIncluded(original, {
        action: 'reject',
        notices: [{ language, subject: 'test', body: t('bundles.teaching', {}, language) }]
      })
    ).toBe(false)
  }
  const original = call('a')
  original.shadow.mode = 'hybrid_recommended'
  expect(
    teachingLineIncluded(original, {
      chosen: 'shadow',
      notices: [{ language: 'en', subject: 'test', body: t('bundles.teaching') }]
    })
  ).toBe(true)
})

test('pseudo UI copy never changes the canonical teaching-line validation', () => {
  const original = call('a', {
    mode: 'hybrid_recommended',
    notices: [{ language: 'en', subject: 'test', body: t('bundles.teaching') }]
  })
  vi.stubEnv('NEXT_PUBLIC_SKYCLAUSE_PSEUDO', '1')
  try {
    expect(teachingLineIncluded(original, {})).toBe(false)
    expect(teachingLineIncluded(original, { notices: original.notices })).toBe(true)
  } finally {
    vi.unstubAllEnvs()
  }
})

test('every open call counts as approved until rejected, and its fate says so in words', () => {
  expect(callFate({})).toBe('included')
  expect(callFate({ action: 'approve', chosen: 'agent' })).toBe('included')
  expect(callFate({ action: 'edit', notices: [] })).toBe('edited')
  expect(callFate({ recipients: ['test-recipient-1'] })).toBe('edited')
  expect(callFate({ action: 'reject', notices: [] })).toBe('rejected')
})

test('Approve says what it sends: one notice per open call with recipients, each recipient once', () => {
  const calls = [
    call('a', { recipients: ['test-r1', 'test-r2'] }),
    call('b', { recipients: ['test-r2', 'test-r3'] }),
    call('quiet', { recipients: [] }),
    call('old', { state: 'superseded', recipients: ['test-r9'] })
  ]
  expect(approvalReach(calls, {}, Date.now())).toEqual({ notices: 2, recipients: 3, rejected: 0 })
  expect(approvalReach(calls, { b: { action: 'reject' } }, Date.now())).toEqual({
    notices: 1,
    recipients: 2,
    rejected: 1
  })
  // An edit that removes a recipient is what is sent.
  expect(approvalReach(calls, { a: { action: 'edit', recipients: ['test-r1'] } }, Date.now())).toEqual({
    notices: 2,
    recipients: 3,
    rejected: 0
  })
  expect(approvalReach(calls, { a: { action: 'reject' }, b: { action: 'reject' } }, Date.now())).toEqual({
    notices: 0,
    recipients: 0,
    rejected: 2
  })
})

test('an approved bundle says when it was approved, what it sent and, once all are out, when', () => {
  const approved = [
    call('a', { state: 'sending', recipients: ['test-r1'], approved_at: '2026-11-02T07:08:00Z' }),
    call('b', {
      state: 'sent',
      recipients: ['test-r2'],
      approved_at: '2026-11-02T07:09:00Z',
      sent_at: '2026-11-02T07:10:00Z'
    }),
    call('c', { state: 'rejected', recipients: ['test-r3'] })
  ]
  expect(approvedReach(approved)).toEqual({
    notices: 2,
    recipients: 2,
    rejected: 1,
    approvedAt: '2026-11-02T07:09:00Z',
    sentAt: null
  })
  approved[0] = { ...approved[0]!, state: 'sent', sent_at: '2026-11-02T07:11:00Z' }
  expect(approvedReach(approved).sentAt).toBe('2026-11-02T07:11:00Z')
})
