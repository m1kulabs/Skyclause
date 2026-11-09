import { utf8ByteLength } from '../../shared/utf8.ts'
import { skyEvidenceTimestamp } from './indicators.ts'
import type { SkyVerdictValue } from './clauses.ts'
import type { Cell } from './schema.ts'
export interface SkyGradeRow {
  grade_id: string
  window_id: string
  call_id: string
  proposed_mode: SkyVerdictValue | ''
  decision: 'approved' | 'edited' | 'rejected' | 'none'
  observed_mode: SkyVerdictValue
  outcome: 'hit' | 'miss' | 'false_alarm' | 'correct_normal' | 'no_call'
  mode_diff: string
  shadow_fired_no_call: boolean
  graded_at: string
  clause_version_hash: string
}
export const SKY_GRADE_BATCH_KEY = 'SKY_GRADE_BATCH_V1'
export interface SkyGradeBatch {
  version: 1
  batchId: string
  spreadsheetId: string
  sheetId: number
  startRowIndex: number
  rows: SkyGradeRow[]
}
export interface StoredSkyGrade {
  rowIndex: number
  cells: readonly Cell[]
}

const ROW_FIELDS = [
  'grade_id',
  'window_id',
  'call_id',
  'proposed_mode',
  'decision',
  'observed_mode',
  'outcome',
  'mode_diff',
  'shadow_fired_no_call',
  'graded_at',
  'clause_version_hash'
] as const
const MODES = ['', 'normal', 'outdoor_limited', 'commute_disruption', 'hybrid_recommended', 'no_call']
const UUID7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
function invalid(): never {
  throw new Error('sky_grade_batch_invalid')
}
function fields(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    return invalid()
  return value as Record<string, unknown>
}
function identity(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}
function checkedRow(value: unknown): SkyGradeRow {
  const row = fields(value, ROW_FIELDS)
  if (ROW_FIELDS.some((key) => key !== 'shadow_fired_no_call' && typeof row[key] !== 'string')) return invalid()
  if (
    !UUID7.test(row.grade_id as string) ||
    !identity(row.window_id) ||
    !MODES.includes(row.proposed_mode as string) ||
    !MODES.slice(1).includes(row.observed_mode as string) ||
    !['approved', 'edited', 'rejected', 'none'].includes(row.decision as string) ||
    !['hit', 'miss', 'false_alarm', 'correct_normal', 'no_call'].includes(row.outcome as string) ||
    typeof row.shadow_fired_no_call !== 'boolean' ||
    !/^[0-9a-f]{64}$/.test(row.clause_version_hash as string) ||
    skyEvidenceTimestamp(row.graded_at) === null
  )
    return invalid()
  return Object.freeze({ ...row }) as unknown as SkyGradeRow
}
function checked(value: unknown): SkyGradeBatch {
  const b = fields(value, ['version', 'batchId', 'spreadsheetId', 'sheetId', 'startRowIndex', 'rows'])
  if (
    b.version !== 1 ||
    !identity(b.spreadsheetId) ||
    !Number.isSafeInteger(b.sheetId) ||
    (b.sheetId as number) < 0 ||
    !Number.isSafeInteger(b.startRowIndex) ||
    (b.startRowIndex as number) < 1 ||
    !Array.isArray(b.rows) ||
    !b.rows.length ||
    Object.keys(b.rows).length !== b.rows.length
  )
    return invalid()
  const rows = b.rows.map(checkedRow)
  if (
    b.batchId !== rows[0]!.grade_id ||
    new Set(rows.map((r) => r.grade_id)).size !== rows.length ||
    new Set(rows.map((r) => r.window_id)).size !== rows.length ||
    !Number.isSafeInteger((b.startRowIndex as number) + rows.length)
  )
    return invalid()
  return Object.freeze({
    version: 1,
    batchId: b.batchId,
    spreadsheetId: b.spreadsheetId,
    sheetId: b.sheetId,
    startRowIndex: b.startRowIndex,
    rows: Object.freeze(rows)
  }) as SkyGradeBatch
}
function bounded(raw: string): string {
  if (utf8ByteLength(raw) > 8192) throw new Error('sky_grade_batch_overflow')
  return raw
}
export function encodeSkyGradeBatch(batch: SkyGradeBatch): string {
  return bounded(JSON.stringify(checked(batch)))
}
export function decodeSkyGradeBatch(raw: string): SkyGradeBatch {
  bounded(raw)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return invalid()
  }
  return checked(parsed)
}
export function ownedSkyGradeCells(row: SkyGradeRow): readonly Cell[] {
  const valid = checkedRow(row)
  return Object.freeze(ROW_FIELDS.map((key) => valid[key]))
}
