import { describe, expect, test } from 'bun:test'
import {
  cameraEligibilityAt,
  decodeCameraProbationHistory,
  encodeCameraProbationHistory,
  recordCameraProbationDecision,
  type CameraProbationHistory
} from './camera-probation-history.ts'

const first = '2026-11-08T01:00:00.123Z'
const second = '2026-11-08T02:00:00.456Z'
const third = '2026-11-08T03:00:00.789Z'
const date = (at: string) => new Date(at)
const history = (): CameraProbationHistory => ({
  version: 1,
  spreadsheetId: 'sheet-1',
  decisions: [
    { at: first, sourceId: 'cam-1', passed: true },
    { at: second, sourceId: 'cam-1', passed: false }
  ]
})
const invalid = 'camera_probation_history_invalid'

describe('camera probation decision intervals', () => {
  test('absence and times before the first actual decision remain unknown', () => {
    expect(cameraEligibilityAt(null, 'cam-1', date(second))).toBe('unknown')
    expect(cameraEligibilityAt(history(), 'cam-1', date('2026-11-08T01:00:00.122Z'))).toBe('unknown')
    expect(cameraEligibilityAt(history(), 'cam-1', date(first))).toBe('passed')
    expect(cameraEligibilityAt(history(), 'cam-1', date('2026-11-08T01:30:00.000Z'))).toBe('passed')
    expect(cameraEligibilityAt(history(), 'cam-1', date(second))).toBe('probation')
    expect(cameraEligibilityAt(history(), 'cam-1', date(third))).toBe('probation')
  })

  test('equal clocks preserve append order and exact source identity', () => {
    let value = recordCameraProbationDecision(null, 'sheet-1', ' cam-1 ', true, date(first))
    value = recordCameraProbationDecision(value, 'sheet-1', 'cam-2', false, date(first))
    value = recordCameraProbationDecision(value, 'sheet-1', ' cam-1 ', false, date(first))
    expect(value.decisions).toEqual([
      { at: first, sourceId: ' cam-1 ', passed: true },
      { at: first, sourceId: 'cam-2', passed: false },
      { at: first, sourceId: ' cam-1 ', passed: false }
    ])
    expect(cameraEligibilityAt(value, ' cam-1 ', date(first))).toBe('probation')
    expect(cameraEligibilityAt(value, 'cam-1', date(first))).toBe('unknown')
    expect(cameraEligibilityAt(value, 'cam-2', date(first))).toBe('probation')
  })

  test('repeated status keeps its original boundary even across another source observation', () => {
    let value = recordCameraProbationDecision(null, 'sheet-1', 'cam-1', true, date(first))
    value = recordCameraProbationDecision(value, 'sheet-1', 'cam-2', false, date(second))
    const repeated = recordCameraProbationDecision(value, 'sheet-1', 'cam-1', true, date(third))
    expect(repeated).toEqual(value)
    expect(repeated).not.toBe(value)
    expect(repeated.decisions).not.toBe(value.decisions)
    expect(repeated.decisions[0]).not.toBe(value.decisions[0])
    expect(cameraEligibilityAt(repeated, 'cam-1', date(first))).toBe('passed')
  })

  test('recording and codecs detach all decisions without mutating previous state', () => {
    const previous = history()
    Object.freeze(previous.decisions[0])
    Object.freeze(previous.decisions[1])
    Object.freeze(previous.decisions)
    Object.freeze(previous)
    const next = recordCameraProbationDecision(previous, 'sheet-1', 'cam-1', true, date(third))
    expect(next.decisions).toHaveLength(3)
    expect(previous.decisions).toHaveLength(2)
    next.decisions[0]!.passed = false
    expect(previous.decisions[0]!.passed).toBe(true)
    const decoded = decodeCameraProbationHistory(encodeCameraProbationHistory(previous), 'sheet-1')
    decoded.decisions[0]!.passed = false
    expect(previous.decisions[0]!.passed).toBe(true)
  })

  test('rejects backward time before duplicate suppression and invalid recording/query clocks', () => {
    const value = history()
    expect(() => recordCameraProbationDecision(value, 'sheet-1', 'cam-1', false, date(first))).toThrow(invalid)
    expect(() => recordCameraProbationDecision(value, 'sheet-1', 'cam-2', true, date(first))).toThrow(invalid)
    expect(() => recordCameraProbationDecision(null, 'sheet-1', 'cam-1', true, new Date(NaN))).toThrow(invalid)
    expect(() => cameraEligibilityAt(null, 'cam-1', new Date(NaN))).toThrow(invalid)
  })
})

describe('closed bounded camera history codec', () => {
  test('round trips only its version, workbook and ordered exact decisions', () => {
    const value = history()
    expect(decodeCameraProbationHistory(encodeCameraProbationHistory(value), 'sheet-1')).toEqual(value)
    expect(decodeCameraProbationHistory('{"version":1,"spreadsheetId":"sheet-1","decisions":[]}', 'sheet-1')).toEqual({
      version: 1,
      spreadsheetId: 'sheet-1',
      decisions: []
    })
    expect(() => decodeCameraProbationHistory(encodeCameraProbationHistory(value), 'sheet-2')).toThrow(invalid)
    expect(() => recordCameraProbationDecision(value, 'sheet-2', 'cam-1', true, date(third))).toThrow(invalid)
  })

  const malformed: unknown[] = [
    null,
    [],
    {},
    { ...history(), version: 2 },
    { ...history(), spreadsheetId: '' },
    { ...history(), extra: true },
    { ...history(), decisions: {} },
    { ...history(), decisions: [null] },
    { ...history(), decisions: [{ at: first, sourceId: '', passed: true }] },
    { ...history(), decisions: [{ at: first, sourceId: 'cam-1', passed: 'true' }] },
    { ...history(), decisions: [{ at: first, sourceId: 'cam-1', passed: true, extra: 1 }] },
    { ...history(), decisions: [{ at: first, sourceId: 'cam-1' }] },
    { ...history(), decisions: [...history().decisions].reverse() }
  ]
  test.each(malformed.map((value, i) => [i, value] as const))('rejects malformed owned data case %s', (_, value) => {
    expect(() => decodeCameraProbationHistory(JSON.stringify(value), 'sheet-1')).toThrow(invalid)
    expect(() => encodeCameraProbationHistory(value as CameraProbationHistory)).toThrow(invalid)
  })

  test.each([
    '2026-11-08T01:00:00Z',
    '2026-11-08T01:00:00.1230Z',
    '2026-11-08T09:00:00.123+08:00',
    '2026-02-30T01:00:00.123Z',
    '2026-11-08T25:00:00.123Z',
    'invalid'
  ])('rejects timestamps outside exact UTC ISO output: %s', (at) => {
    expect(() =>
      encodeCameraProbationHistory({ ...history(), decisions: [{ at, sourceId: 'cam-1', passed: true }] })
    ).toThrow(invalid)
  })

  test('rejects sparse arrays, malformed JSON, empty identities and scalar coercion', () => {
    expect(() => encodeCameraProbationHistory({ ...history(), decisions: Array(1) })).toThrow(invalid)
    const entries = history().decisions
    Object.assign(entries, { extra: true })
    expect(() => encodeCameraProbationHistory({ ...history(), decisions: entries })).toThrow(invalid)
    expect(() => decodeCameraProbationHistory('{token-secret', 'sheet-1')).toThrow(invalid)
    expect(() => recordCameraProbationDecision(null, ' ', 'cam-1', true, date(first))).toThrow(invalid)
    expect(() => recordCameraProbationDecision(null, 'sheet-1', ' ', true, date(first))).toThrow(invalid)
    expect(() => recordCameraProbationDecision(null, 'sheet-1', 'cam-1', 1 as unknown as boolean, date(first))).toThrow(
      invalid
    )
  })

  test('a sparse array cannot disguise a missing decision with an extra field', () => {
    const decisions = Array(1)
    Object.assign(decisions, { extra: true })
    expect(() => encodeCameraProbationHistory({ ...history(), decisions })).toThrow(invalid)
  })

  test('admits exactly 8192 UTF-8 bytes and rejects the next byte without dropping events', () => {
    // The 115-byte ASCII envelope leaves 8077 bytes: 2692 three-byte characters and one ASCII byte.
    const sourceId = '界'.repeat(2692) + 'a'
    const value: CameraProbationHistory = {
      version: 1,
      spreadsheetId: 'sheet-1',
      decisions: [{ at: first, sourceId, passed: true }]
    }
    expect(new TextEncoder().encode(JSON.stringify(value)).length).toBe(8192)
    const encoded = encodeCameraProbationHistory(value)
    expect(decodeCameraProbationHistory(encoded, 'sheet-1')).toEqual(value)
    const overflow = { ...value, decisions: [{ at: first, sourceId: sourceId + 'a', passed: true }] }
    expect(() => encodeCameraProbationHistory(overflow)).toThrow('camera_probation_history_overflow')
    expect(() => decodeCameraProbationHistory(JSON.stringify(overflow), 'sheet-1')).toThrow(
      'camera_probation_history_overflow'
    )
    expect(() => recordCameraProbationDecision(value, 'sheet-1', sourceId, false, date(second))).toThrow(
      'camera_probation_history_overflow'
    )
    expect(value.decisions).toHaveLength(1)
  })
})
