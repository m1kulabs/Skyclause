import { utf8ByteLength } from '../../shared/utf8.ts'

export const CAMERA_PROBATION_HISTORY_KEY = 'SKY_CAMERA_PROBATION_HISTORY_V1'

export interface CameraProbationDecision {
  at: string
  sourceId: string
  passed: boolean
}
export interface CameraProbationHistory {
  version: 1
  spreadsheetId: string
  decisions: CameraProbationDecision[]
}

function fail(): never {
  throw new Error('camera_probation_history_invalid')
}
function fields(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail()
  if (Object.keys(value).some((key) => !allowed.includes(key))) return fail()
  return value as Record<string, unknown>
}
function identity(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return fail()
  return value
}
function clock(value: Date): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return fail()
  return value.toISOString()
}
function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return fail()
  if (new Date(value).toISOString() !== value) return fail()
  return value
}
function bounded(raw: string): string {
  if (utf8ByteLength(raw) > 8192) throw new Error('camera_probation_history_overflow')
  return raw
}
function history(value: unknown, spreadsheetId: string): CameraProbationHistory {
  const row = fields(value, ['version', 'spreadsheetId', 'decisions'])
  if (row.version !== 1 || identity(row.spreadsheetId) !== identity(spreadsheetId)) return fail()
  if (
    !Array.isArray(row.decisions) ||
    Object.keys(row.decisions).length !== row.decisions.length ||
    Object.keys(row.decisions).some((key, index) => key !== String(index))
  )
    return fail()
  let lastTime = -Infinity
  const decisions = row.decisions.map((value): CameraProbationDecision => {
    const row = fields(value, ['at', 'sourceId', 'passed'])
    const at = timestamp(row.at)
    const time = Date.parse(at)
    if (time < lastTime || typeof row.passed !== 'boolean') return fail()
    lastTime = time
    return { at, sourceId: identity(row.sourceId), passed: row.passed }
  })
  return { version: 1, spreadsheetId, decisions }
}

export function decodeCameraProbationHistory(raw: string, spreadsheetId: string): CameraProbationHistory {
  bounded(raw)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return fail()
  }
  return history(parsed, spreadsheetId)
}
export function encodeCameraProbationHistory(value: CameraProbationHistory): string {
  return bounded(JSON.stringify(history(value, value?.spreadsheetId)))
}
export function recordCameraProbationDecision(
  previous: CameraProbationHistory | null,
  spreadsheetId: string,
  sourceId: string,
  passed: boolean,
  now: Date
): CameraProbationHistory {
  const at = clock(now)
  identity(spreadsheetId)
  identity(sourceId)
  if (typeof passed !== 'boolean') return fail()
  const result =
    previous === null ? { version: 1 as const, spreadsheetId, decisions: [] } : history(previous, spreadsheetId)
  const last = result.decisions.at(-1)
  // Check the whole history clock before suppressing a repeated source decision.
  if (last && Date.parse(at) < Date.parse(last.at)) return fail()
  const latest = result.decisions.filter((decision) => decision.sourceId === sourceId).at(-1)
  if (!latest || latest.passed !== passed) result.decisions.push({ at, sourceId, passed })
  encodeCameraProbationHistory(result)
  return result
}
export function cameraEligibilityAt(
  value: CameraProbationHistory | null,
  sourceId: string,
  at: Date
): 'passed' | 'probation' | 'unknown' {
  const time = Date.parse(clock(at))
  identity(sourceId)
  if (value === null) return 'unknown'
  const checked = history(value, value.spreadsheetId)
  encodeCameraProbationHistory(checked)
  let eligibility: 'passed' | 'probation' | 'unknown' = 'unknown'
  for (const decision of checked.decisions) {
    if (Date.parse(decision.at) > time) break
    if (decision.sourceId === sourceId) eligibility = decision.passed ? 'passed' : 'probation'
  }
  return eligibility
}
