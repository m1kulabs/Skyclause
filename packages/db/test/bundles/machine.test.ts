// #150: the pure bundle and call machine (TRD bundle state machine, #79 §3 call states, CAL-5 to CAL-8).
import { describe, expect, test } from 'vitest'
import {
  canMoveBundle,
  canMoveCall,
  closes,
  expireStep,
  expiresAt,
  sendStep,
  supersedeStep,
  transitionStep,
  type BundleSlot
} from '../../src/bundles/machine'

const at = (iso: string) => new Date(iso)

describe('transitions', () => {
  test('a drafted call can be decided, expire or be superseded; only an approved or edited one sends', () => {
    expect(['approved', 'edited', 'rejected', 'expired', 'superseded'].every((to) => canMoveCall('drafted', to))).toBe(
      true
    )
    expect(canMoveCall('drafted', 'sending')).toBe(false)
    expect(canMoveCall('approved', 'sending')).toBe(true)
    expect(canMoveCall('edited', 'sending')).toBe(true)
    expect(canMoveCall('expired', 'sending')).toBe(false)
    expect(canMoveCall('superseded', 'sending')).toBe(false)
    expect(canMoveCall('sending', 'sent')).toBe(true)
    expect(canMoveCall('sending', 'failed')).toBe(true)
  })

  test('bundles follow the TRD diagram', () => {
    expect(canMoveBundle('drafted', 'closed')).toBe(true)
    expect(canMoveBundle('drafted', 'needs_review')).toBe(true)
    expect(canMoveBundle('needs_review', 'approved')).toBe(true)
    expect(canMoveBundle('needs_review', 'reconfirm')).toBe(true)
    expect(canMoveBundle('reconfirm', 'needs_review')).toBe(true)
    expect(canMoveBundle('approved', 'sending')).toBe(true)
    expect(canMoveBundle('sending', 'sent')).toBe(true)
    expect(['sent', 'closed', 'expired'].every((from) => canMoveBundle(from, 'graded'))).toBe(true)
    expect(canMoveBundle('superseded', 'needs_review')).toBe(false)
    expect(canMoveBundle('closed', 'needs_review')).toBe(false)
    expect(canMoveBundle('expired', 'approved')).toBe(false)
  })
})

describe('closes (CAL-5, D23)', () => {
  test('every call Normal, with or without a watch, closes; a mode above Normal or a No call needs review', () => {
    expect(
      closes(
        [
          { mode: 'normal', noCall: null },
          { mode: 'normal', noCall: null }
        ],
        false
      )
    ).toBe(true)
    expect(
      closes(
        [
          { mode: 'normal', noCall: null },
          { mode: 'commute_disruption', noCall: null }
        ],
        false
      )
    ).toBe(false)
    expect(closes([{ mode: null, noCall: ['site.rain_60m_mm'] }], false)).toBe(false)
  })

  test('a guest-window bundle closes draft-only whatever it proposes, and a bundle with no calls closes', () => {
    expect(closes([{ mode: 'commute_disruption', noCall: null }], true)).toBe(true)
    expect(closes([], false)).toBe(true)
  })
})

describe('expiresAt (CAL-8)', () => {
  const window = { startsAt: at('2026-11-02T07:15:00Z'), endsAt: at('2026-11-02T07:30:00Z') }

  test("a window call expires at the window's start unless a fired clause expires at its end", () => {
    expect(expiresAt({ window }, [{ clause: 'storm_watch' }], { storm_confirmed: 'end' })).toEqual(window.startsAt)
    expect(expiresAt({ window }, [{ clause: 'storm_confirmed' }], { storm_confirmed: 'end' })).toEqual(window.endsAt)
    expect(expiresAt({ window }, [{ clause: 'haze_watch' }], { haze_watch: 'start' })).toEqual(window.startsAt)
  })

  test("a night call expires when the night's arrival period starts", () => {
    const night = { arrivalStart: at('2026-11-14T10:00:00Z') }
    expect(expiresAt({ night }, [{ clause: 'surge_night' }], {})).toEqual(night.arrivalStart)
  })

  test('a night without an arrival start has no expiry, which is refused', () => {
    expect(() => expiresAt({ night: { arrivalStart: null } }, [], {})).toThrow(/arrival/)
  })
})

const call = (id: string, state: BundleSlot['calls'][number]['state'], expires: string, windowId = `w-${id}`) => ({
  id,
  state,
  windowId,
  nightId: null,
  expiresAt: at(expires),
  supersededByCallId: null
})

describe('expireStep', () => {
  const bundle: BundleSlot = {
    id: 'b',
    state: 'needs_review',
    supersededBy: null,
    calls: [call('a', 'drafted', '2026-11-02T07:30:00Z'), call('b', 'drafted', '2026-11-02T07:45:00Z')]
  }

  test('expires an open call once due; the bundle expires with its last open call', () => {
    const first = expireStep(bundle, 'a', at('2026-11-02T07:30:00Z'))
    expect(first).toMatchObject({ outcome: 'expired', bundleExpired: false })
    expect(first.bundle.calls.map((c) => c.state)).toEqual(['expired', 'drafted'])
    const second = expireStep(first.bundle, 'b', at('2026-11-02T07:45:00Z'))
    expect(second).toMatchObject({ outcome: 'expired', bundleExpired: true })
    expect(second.bundle.state).toBe('expired')
  })

  test('changes nothing before the call is due, or once it is no longer open', () => {
    expect(expireStep(bundle, 'a', at('2026-11-02T07:29:59Z'))).toMatchObject({ outcome: 'not_due', bundle })
    const sending: BundleSlot = { ...bundle, state: 'sending', calls: [call('a', 'sending', '2026-11-02T07:30:00Z')] }
    expect(expireStep(sending, 'a', at('2026-11-02T08:00:00Z'))).toMatchObject({ outcome: 'not_open', bundle: sending })
  })

  test('an approved call that has not reached sending still expires; its bundle stays approved', () => {
    const approved: BundleSlot = {
      ...bundle,
      state: 'approved',
      calls: [call('a', 'approved', '2026-11-02T07:30:00Z')]
    }
    const step = expireStep(approved, 'a', at('2026-11-02T07:30:00Z'))
    expect(step).toMatchObject({ outcome: 'expired', bundleExpired: false })
    expect(step.bundle.state).toBe('approved')
  })

  test("a closed bundle's calls were never open, so they don't expire", () => {
    const closed: BundleSlot = { ...bundle, state: 'closed' }
    expect(expireStep(closed, 'a', at('2026-11-02T08:00:00Z'))).toMatchObject({ outcome: 'not_open', bundle: closed })
  })
})

describe('supersedeStep (CAL-7)', () => {
  const older: BundleSlot = {
    id: 'old',
    state: 'needs_review',
    supersededBy: null,
    calls: [call('a', 'drafted', '2026-11-02T07:30:00Z', 'w1'), call('b', 'drafted', '2026-11-02T07:45:00Z', 'w2')]
  }

  test('supersedes only the calls whose windows the newer bundle covers', () => {
    const step = supersedeStep(older, { id: 'new', calls: [{ id: 'n1', windowId: 'w1', nightId: null }] })
    expect(step.supersededCallIds).toEqual(['a'])
    expect(step.bundleSuperseded).toBe(false)
    expect(step.bundle.calls[0]).toMatchObject({ state: 'superseded', supersededByCallId: 'n1' })
    expect(step.bundle.calls[1]).toMatchObject({ state: 'drafted', supersededByCallId: null })
  })

  test('a bundle left with no open call is superseded and links to its successor', () => {
    const step = supersedeStep(older, {
      id: 'new',
      calls: [
        { id: 'n1', windowId: 'w1', nightId: null },
        { id: 'n2', windowId: 'w2', nightId: null }
      ]
    })
    expect(step.bundleSuperseded).toBe(true)
    expect(step.bundle).toMatchObject({ state: 'superseded', supersededBy: 'new' })
  })

  test('an edited call still under review is open, so it is superseded too', () => {
    const edited: BundleSlot = { ...older, calls: [{ ...older.calls[0]!, state: 'edited' }, older.calls[1]!] }
    const step = supersedeStep(edited, { id: 'new', calls: [{ id: 'n1', windowId: 'w1', nightId: null }] })
    expect(step.supersededCallIds).toEqual(['a'])
  })

  test('a bundle no longer under review is left alone', () => {
    const approved: BundleSlot = { ...older, state: 'approved' }
    const step = supersedeStep(approved, { id: 'new', calls: [{ id: 'n1', windowId: 'w1', nightId: null }] })
    expect(step).toMatchObject({ supersededCallIds: [], bundleSuperseded: false, bundle: approved })
  })
})

describe('sendStep', () => {
  test('moves approved and edited calls, and the approved bundle, to sending', () => {
    const bundle: BundleSlot = {
      id: 'b',
      state: 'approved',
      supersededBy: null,
      calls: [call('a', 'approved', '2026-11-02T07:45:00Z'), call('b', 'edited', '2026-11-02T07:45:00Z')]
    }
    const next = sendStep(bundle, ['a', 'b'], at('2026-11-02T07:35:00Z'))
    expect(next.state).toBe('sending')
    expect(next.calls.map((c) => c.state)).toEqual(['sending', 'sending'])
  })

  test('refuses an expired or superseded call', () => {
    const bundle: BundleSlot = {
      id: 'b',
      state: 'approved',
      supersededBy: null,
      calls: [call('a', 'expired', '2026-11-02T07:30:00Z'), call('b', 'superseded', '2026-11-02T07:45:00Z')]
    }
    expect(() => sendStep(bundle, ['a'], at('2026-11-02T07:35:00Z'))).toThrow(/expired/)
    expect(() => sendStep(bundle, ['b'], at('2026-11-02T07:35:00Z'))).toThrow(/superseded/)
  })

  test('refuses an approved call whose expiry has passed, even before its timer fires', () => {
    const bundle: BundleSlot = {
      id: 'b',
      state: 'approved',
      supersededBy: null,
      calls: [call('a', 'approved', '2026-11-02T07:30:00Z')]
    }
    expect(() => sendStep(bundle, ['a'], at('2026-11-02T07:35:00Z'))).toThrow(/expired/)
  })

  test('refuses a bundle that is not approved, such as a closed or a draft-only one (CAL-5, D23)', () => {
    for (const state of ['closed', 'needs_review'] as const) {
      const bundle: BundleSlot = {
        id: 'b',
        state,
        supersededBy: null,
        calls: [call('a', 'approved', '2026-11-02T07:45:00Z')]
      }
      expect(() => sendStep(bundle, ['a'], at('2026-11-02T07:35:00Z'))).toThrow(new RegExp(`bundle b is ${state}`))
    }
  })
})

describe('transitionStep', () => {
  const review: BundleSlot = {
    id: 'b',
    state: 'needs_review',
    supersededBy: null,
    calls: [call('a', 'drafted', '2026-11-02T07:45:00Z'), call('b', 'drafted', '2026-11-02T07:45:00Z')]
  }

  test("a closed bundle's calls never move, so a draft-only bundle can't be approved (CAL-5, D23)", () => {
    const closed: BundleSlot = { ...review, state: 'closed' }
    expect(() => transitionStep(closed, { calls: { a: 'approved' } })).toThrow(/bundle b is closed/)
  })

  test('approves a bundle only once every call still drafted is decided (TRD: per call approved, edited or rejected)', () => {
    expect(() => transitionStep(review, { bundle: 'approved', calls: { a: 'approved' } })).toThrow(/undecided: b$/)
    const next = transitionStep(review, { bundle: 'approved', calls: { a: 'approved', b: 'rejected' } })
    expect(next.state).toBe('approved')
    expect(next.calls.map((c) => c.state)).toEqual(['approved', 'rejected'])
  })
})
