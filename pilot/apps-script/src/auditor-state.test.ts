import { describe, expect, test } from 'bun:test'
import {
  auditTransitionKey,
  decodeAuditCredentialState,
  decodeAuditTransition,
  encodeAuditCredentialState,
  encodeAuditTransition,
  type AuditTransition
} from './auditor-state.ts'

export function transition(): AuditTransition {
  return {
    version: 1,
    eventId: 'event-1',
    family: 'feed',
    ref: '0232901RF',
    kind: 'feed_silent',
    detectedAt: '2026-11-05T13:15:00.000Z',
    subject: 'Feed silent',
    body: 'A stored observation is stale.',
    recipients: [{ to: 'one@example.test', marker: 'audit:' + 'a'.repeat(64), attempt: {} }]
  }
}
function invalid(value: unknown): void {
  expect(() => decodeAuditTransition(JSON.stringify(value))).toThrow()
}

describe('auditor private transition codec', () => {
  test('round trips independently without widening owned fields', () => {
    const original = transition()
    const decoded = decodeAuditTransition(encodeAuditTransition(original))
    decoded.recipients[0]!.attempt.draftCreationAttempted = true
    expect(original.recipients[0]!.attempt).toEqual({})
    invalid({ ...original, private: 'unowned' })
    invalid({ ...original, recipients: [{ ...original.recipients[0], private: 'unowned' }] })
    invalid({ ...original, recipients: [{ ...original.recipients[0], attempt: { private: true } }] })
  })
  test('rejects wrong versions, enums, arrays, scalar coercion and timestamps', () => {
    const valid = transition()
    for (const patch of [
      { version: 2 },
      { version: '1' },
      { family: 'other' },
      { family: 'pi' },
      { kind: 'evidence_request' },
      { eventId: '' },
      { ref: ' ' },
      { subject: 2 },
      { body: null },
      { recipients: {} },
      { recipients: [] },
      { detectedAt: '2026-02-30T13:15:00Z' },
      { detectedAt: '2026-11-05' },
      { lastAttemptAt: 'yesterday' }
    ])
      invalid({ ...valid, ...patch })
    for (const value of [null, [], 2, true, 'x']) invalid(value)
    for (const patch of [
      { to: 'bad' },
      { to: ' One@example.test' },
      { marker: 'audit:x' },
      { marker: 'evidence:' + 'a'.repeat(64) },
      { attempt: [] },
      { attempt: null },
      { attempt: { recipient: 'other@example.test', draftCreationAttempted: true } },
      { attempt: { draftCreationAttempted: 'true' } },
      { attempt: { draftId: 'draft' } },
      { attempt: { gmailMessageId: ' ' } },
      { attempt: { recipient: 'one@example.test' } }
    ])
      invalid({ ...valid, recipients: [{ ...valid.recipients[0], ...patch }] })
    invalid({ ...valid, recipients: [valid.recipients[0], valid.recipients[0]] })
    invalid({ ...valid, recipients: [valid.recipients[0], { ...valid.recipients[0], to: 'two@example.test' }] })
  })
  test('accepts complete immutable attempt replacements and all family kinds', () => {
    const valid = transition()
    valid.recipients[0]!.attempt = {
      recipient: 'one@example.test',
      draftCreationAttempted: true,
      draftId: 'draft',
      threadId: 'thread',
      gmailMessageId: 'actual-id'
    }
    expect(decodeAuditTransition(encodeAuditTransition(valid))).toEqual(valid)
    for (const [family, kind] of [
      ['feed', 'feed_recovered'],
      ['pi', 'pi_offline'],
      ['pi', 'pi_recovered'],
      ['crossing', 'no_bundle_20min'],
      ['credentials', 'credentials_day12']
    ] as const)
      expect(decodeAuditTransition(encodeAuditTransition({ ...valid, family, kind })).kind).toBe(kind)
  })
  test('bounds every serialized replacement by UTF8 bytes including receipt growth', () => {
    for (const unit of ['x', 'é', '😀']) {
      const valid = transition()
      const overhead = Buffer.byteLength(JSON.stringify({ ...valid, body: '' }), 'utf8')
      const size = Buffer.byteLength(unit, 'utf8')
      const count = Math.floor((8192 - overhead) / size)
      valid.body = unit.repeat(count) + 'x'.repeat((8192 - overhead) % size)
      const encoded = encodeAuditTransition(valid)
      expect(Buffer.byteLength(encoded, 'utf8')).toBe(8192)
      expect(decodeAuditTransition(encoded)).toEqual(valid)
      expect(() => encodeAuditTransition({ ...valid, body: valid.body + 'x' })).toThrow()
      expect(() => decodeAuditTransition(JSON.stringify({ ...valid, body: valid.body + 'x' }))).toThrow()
      valid.recipients[0]!.attempt = {
        recipient: 'one@example.test',
        draftCreationAttempted: true,
        gmailMessageId: 'final-id'
      }
      expect(() => encodeAuditTransition(valid)).toThrow()
    }
  })
  test('uses separated family/ref identity beneath the owned prefix', () => {
    const seen: string[] = []
    const key = auditTransitionKey('feed', 'abc', (value) => {
      seen.push(value)
      return 'a'.repeat(64)
    })
    expect(key).toBe('SKY_AUDITOR_NOTICE_V1_' + 'a'.repeat(64))
    expect(seen).toEqual(['feed\0abc'])
  })
})

describe('credential observer codec', () => {
  test('preserves absence and truthful valid/unavailable episodes', () => {
    expect(decodeAuditCredentialState(null)).toBeNull()
    for (const value of [
      { version: 1, availability: 'valid', generation: 0, lastValue: '2026-11-05' },
      { version: 1, availability: 'unavailable', generation: 1 },
      { version: 1, availability: 'unavailable', generation: 2, lastValue: '2026-11-05' }
    ] as const)
      expect(decodeAuditCredentialState(encodeAuditCredentialState(value))).toEqual(value)
  })
  test('rejects malformed observers and unknown fields without coercion', () => {
    for (const value of [
      null,
      [],
      {},
      { version: 2, availability: 'valid', generation: 0, lastValue: '2026-11-05' },
      { version: 1, availability: 'other', generation: 0 },
      { version: 1, availability: 'valid', generation: 0 },
      { version: 1, availability: 'valid', generation: 0, lastValue: ' ' },
      ...[-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '1'].map((generation) => ({
        version: 1,
        availability: 'unavailable',
        generation
      })),
      { version: 1, availability: 'unavailable', generation: 1, secret: true }
    ])
      expect(() => decodeAuditCredentialState(JSON.stringify(value))).toThrow()
  })
  test('bounds UTF8 observer encodings too', () => {
    expect(() =>
      encodeAuditCredentialState({ version: 1, availability: 'valid', generation: 0, lastValue: '😀'.repeat(3000) })
    ).toThrow()
  })
})

describe('direct encoder inputs', () => {
  test('rejects sparse audiences rather than serializing missing recipients as null', () => {
    const value = transition()
    value.recipients.length = 2
    expect(() => encodeAuditTransition(value)).toThrow()
  })
  test('rejects invalid observer values and an unavailable zero generation', () => {
    for (const value of [
      { version: 1, availability: 'unavailable', generation: 0 },
      { version: 1, availability: 'valid', generation: 0, lastValue: 'bad-date' },
      { version: 1, availability: 'unavailable', generation: 1, lastValue: '2026-02-30' }
    ])
      expect(() => decodeAuditCredentialState(JSON.stringify(value))).toThrow()
    const value = {
      version: 1 as const,
      availability: 'valid' as const,
      generation: 0,
      lastValue: '2026-11-05T21:00+08:00'
    }
    expect(decodeAuditCredentialState(encodeAuditCredentialState(value))).toEqual(value)
  })
})
