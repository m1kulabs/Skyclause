import { expect, test } from 'bun:test'
import {
  decodeSkyGradeBatch,
  encodeSkyGradeBatch,
  ownedSkyGradeCells,
  type SkyGradeBatch,
  type SkyGradeRow
} from './sky-grade-state.ts'
const id = '019a4df0-0000-7000-8000-000000000001'
function row(): SkyGradeRow {
  return {
    grade_id: id,
    window_id: 'wave',
    call_id: '',
    proposed_mode: '',
    decision: 'none',
    observed_mode: 'normal',
    outcome: 'correct_normal',
    mode_diff: '',
    shadow_fired_no_call: false,
    graded_at: '2026-11-08T00:00:00.000Z',
    clause_version_hash: 'a'.repeat(64)
  }
}
function batch(): SkyGradeBatch {
  return { version: 1, batchId: id, spreadsheetId: 'workbook', sheetId: 0, startRowIndex: 1, rows: [row()] }
}
test('round trips copied immutable intent and projects exactly A:I and K:L', () => {
  const input = batch()
  const result = decodeSkyGradeBatch(encodeSkyGradeBatch(input))
  input.rows[0]!.window_id = 'changed'
  expect(result.rows[0]!.window_id).toBe('wave')
  expect(Object.isFrozen(result.rows[0])).toBe(true)
  expect(Object.isFrozen(result.rows)).toBe(true)
  expect(ownedSkyGradeCells(result.rows[0]!)).toEqual([
    id,
    'wave',
    '',
    '',
    'none',
    'normal',
    'correct_normal',
    '',
    false,
    '2026-11-08T00:00:00.000Z',
    'a'.repeat(64)
  ])
})
test.each([
  { version: 2 },
  { batchId: 'bad' },
  { spreadsheetId: '' },
  { sheetId: -1 },
  { sheetId: 1.5 },
  { startRowIndex: 0 },
  { startRowIndex: 1.5 },
  { explanation: 'human' },
  { rows: [] }
])('rejects invalid batch %j', (patch) => {
  expect(() => encodeSkyGradeBatch({ ...batch(), ...patch } as SkyGradeBatch)).toThrow()
})
test.each([
  { grade_id: '019a4df0-0000-4000-8000-000000000001' },
  { window_id: '' },
  { call_id: 42 },
  { proposed_mode: 'unknown' },
  { decision: 'expired' },
  { observed_mode: '' },
  { outcome: 'unknown' },
  { mode_diff: null },
  { shadow_fired_no_call: 'TRUE' },
  { graded_at: '2026-02-30T00:00:00.000Z' },
  { graded_at: '2026-11-08' },
  { clause_version_hash: 'A'.repeat(64) },
  { explanation: 'human' }
])('rejects invalid grade %j', (patch) => {
  const b = batch()
  b.rows[0] = { ...row(), ...patch } as SkyGradeRow
  expect(() => encodeSkyGradeBatch(b)).toThrow()
})
test('rejects duplicate windows, grade IDs and a different batch ID', () => {
  const b = batch()
  b.rows.push({ ...row(), grade_id: '019a4df0-0000-7000-8000-000000000002' })
  expect(() => encodeSkyGradeBatch(b)).toThrow()
  b.rows[1] = { ...row(), window_id: 'two' }
  expect(() => encodeSkyGradeBatch(b)).toThrow()
  b.rows.pop()
  b.batchId = '019a4df0-0000-7000-8000-000000000002'
  expect(() => encodeSkyGradeBatch(b)).toThrow()
})
test('bounds actual UTF8 bytes on encode and decode without dropping a row', () => {
  const b = batch()
  b.rows[0]!.window_id = '漢'.repeat(2800)
  expect(JSON.stringify(b).length).toBeLessThan(8192)
  expect(() => encodeSkyGradeBatch(b)).toThrow('overflow')
  expect(() => decodeSkyGradeBatch(JSON.stringify(b))).toThrow('overflow')
  const raw = encodeSkyGradeBatch(batch())
  expect(() => decodeSkyGradeBatch(raw + ' '.repeat(8192))).toThrow('overflow')
})
