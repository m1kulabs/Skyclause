// #150 acceptance: fast-check over the machine. Nothing reaches `sending` from `expired` or `superseded`, and replaying
// any task (an expiry timer, a supersession by the same newer bundle) changes nothing the first run didn't.
import fc from 'fast-check'
import { expect, test } from 'vitest'
import {
  expireStep,
  sendStep,
  supersedeStep,
  transitionStep,
  type BundleSlot,
  type CallState
} from '../../src/bundles/machine'

const T0 = Date.parse('2026-11-02T07:10:00Z')
const minutes = (n: number) => new Date(T0 + n * 60_000)

const op = fc.oneof(
  fc.record({ kind: fc.constant('expire' as const), call: fc.nat(3), at: fc.integer({ min: 0, max: 60 }) }),
  fc.record({ kind: fc.constant('supersede' as const), windows: fc.subarray([0, 1, 2, 3], { minLength: 1 }) }),
  fc.record({
    kind: fc.constant('decide' as const),
    call: fc.nat(3),
    to: fc.constantFrom('approved', 'edited', 'rejected')
  }),
  fc.record({ kind: fc.constant('approve' as const) }),
  fc.record({
    kind: fc.constant('send' as const),
    calls: fc.subarray([0, 1, 2, 3]),
    at: fc.integer({ min: 0, max: 60 })
  }),
  fc.record({ kind: fc.constant('deliver' as const), call: fc.nat(3), to: fc.constantFrom('sent', 'failed') })
)
type Op = typeof op extends fc.Arbitrary<infer T> ? T : never

const fresh = (expiries: number[], state: BundleSlot['state'] = 'needs_review'): BundleSlot => ({
  id: 'b',
  state,
  supersededBy: null,
  calls: expiries.map((m, i) => ({
    id: `c${i}`,
    state: 'drafted' as const,
    windowId: `w${i}`,
    nightId: null,
    expiresAt: minutes(m),
    supersededByCallId: null
  }))
})

/** One task or action; a refused move (the machine throws) leaves the bundle as it was, as a rolled-back tx would. */
function apply(bundle: BundleSlot, o: Op, n: number): BundleSlot {
  const id = (i: number) => `c${i % bundle.calls.length}`
  try {
    switch (o.kind) {
      case 'expire':
        return expireStep(bundle, id(o.call), minutes(o.at)).bundle
      case 'supersede':
        return supersedeStep(bundle, {
          id: `n${n}`,
          calls: o.windows.map((w) => ({ id: `n${n}-${w}`, windowId: `w${w % bundle.calls.length}`, nightId: null }))
        }).bundle
      case 'decide':
        return transitionStep(bundle, { calls: { [id(o.call)]: o.to as CallState } })
      case 'approve':
        return transitionStep(bundle, { bundle: 'approved' })
      case 'send':
        return sendStep(bundle, [...new Set(o.calls.map(id))], minutes(o.at))
      case 'deliver':
        return transitionStep(bundle, { calls: { [id(o.call)]: o.to as CallState } })
    }
  } catch {
    return bundle
  }
}

const expiries = fc.array(fc.integer({ min: 0, max: 60 }), { minLength: 1, maxLength: 4 })

test('no call reaches sending, sent or failed after it was expired or superseded', () => {
  fc.assert(
    fc.property(expiries, fc.array(op, { maxLength: 30 }), (start, ops) => {
      let bundle = fresh(start)
      const final = new Set<string>()
      ops.forEach((o, n) => {
        bundle = apply(bundle, o, n)
        for (const call of bundle.calls) {
          if (call.state === 'expired' || call.state === 'superseded') final.add(call.id)
          if (['sending', 'sent', 'failed'].includes(call.state)) expect(final.has(call.id)).toBe(false)
        }
      })
    })
  )
})

test('nothing in a closed bundle moves, so an all-Normal or draft-only bundle never sends (CAL-5, D23)', () => {
  fc.assert(
    fc.property(expiries, fc.array(op, { maxLength: 30 }), (start, ops) => {
      let bundle = fresh(start, 'closed')
      ops.forEach((o, n) => (bundle = apply(bundle, o, n)))
      expect(bundle.state).toBe('closed')
      expect(bundle.calls.every((call) => call.state === 'drafted')).toBe(true)
    })
  )
})

test('replaying an expiry task or a supersession by the same bundle changes nothing more', () => {
  fc.assert(
    fc.property(
      expiries,
      fc.array(op, { maxLength: 20 }),
      fc.nat(3),
      fc.integer({ min: 0, max: 60 }),
      (start, ops, c, at) => {
        let bundle = fresh(start)
        ops.forEach((o, n) => (bundle = apply(bundle, o, n)))
        const callId = `c${c % bundle.calls.length}`
        const once = expireStep(bundle, callId, minutes(at)).bundle
        const twice = expireStep(once, callId, minutes(at))
        expect(twice.bundle).toEqual(once)
        expect(twice.outcome).not.toBe('expired')

        const successor = { id: 'later', calls: [{ id: 'later-0', windowId: 'w0', nightId: null }] }
        const first = supersedeStep(bundle, successor).bundle
        const again = supersedeStep(first, successor)
        expect(again.bundle).toEqual(first)
        expect(again.supersededCallIds).toEqual([])
      }
    )
  )
})
