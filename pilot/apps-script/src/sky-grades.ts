import { columnsOf, type Row } from './schema.ts'
import { skyClauseEvidenceRequirements, type SkyVerdictValue } from './clauses.ts'
import { skyEvidenceTimestamp as timestamp } from './indicators.ts'
import { evaluateSkyGradeEvidence, parseSkyGradeWindow } from './sky-grade-evidence.ts'
import { decodeSkyGradeBatch, encodeSkyGradeBatch, ownedSkyGradeCells } from './sky-grade-state.ts'
import type { DaylightWindow } from './indicators.ts'
import type { CameraProbationHistory } from './camera-probation-history.ts'
import type { SkyGradeVersion } from './sky-grade-evidence.ts'
import type { SkyGradeBatch, SkyGradeRow, StoredSkyGrade } from './sky-grade-state.ts'
export interface SkyGradeCrossing {
  fileId: string
  name: string
  text: string
}
export interface SkyGradeInputs {
  windows: readonly Row<'windows'>[]
  ledger: readonly Row<'ledger'>[]
  sources: readonly Row<'sources'>[]
  readings: readonly Row<'readings'>[]
  polls: readonly Row<'polls'>[]
  warnings: readonly Row<'warnings'>[]
  clauseVersions: readonly Row<'clause_versions'>[]
  crossings: readonly SkyGradeCrossing[]
  daylight: DaylightWindow | null
  cameraHistory: CameraProbationHistory | null
  cameraHistoryProblem?: string
}
export type SkyGradeVersionResult = { status: 'valid'; version: SkyGradeVersion } | { status: 'missing' | 'invalid' }
export function selectSkyGradeVersion(
  rows: readonly Row<'clause_versions'>[],
  close: Date,
  hashId: (text: string) => string
): SkyGradeVersionResult {
  let selected: Row<'clause_versions'> | null = null
  let latest = -Infinity
  for (const row of rows) {
    const at = timestamp(row.saved_at)
    if (at !== null && at <= close.getTime() && at >= latest) {
      selected = row
      latest = at
    }
  }
  if (!selected) return { status: 'missing' }
  try {
    const raw = selected.content_json
    const hash = selected.content_hash
    if (typeof raw !== 'string' || typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash) || hashId(raw) !== hash)
      return { status: 'invalid' }
    const parsed: unknown = JSON.parse(raw)
    const columns = columnsOf('clauses')
    if (
      !Array.isArray(parsed) ||
      !parsed.length ||
      parsed.some(
        (row) =>
          !record(row) ||
          Object.keys(row).length !== columns.length ||
          columns.some((key) => !Object.hasOwn(row, key)) ||
          Object.entries(row).some(
            ([key, value]) =>
              !(columns as readonly string[]).includes(key) ||
              !['string', 'number', 'boolean'].includes(typeof value) ||
              (typeof value === 'number' && !Number.isFinite(value))
          )
      )
    )
      return { status: 'invalid' }
    const clauses = parsed as Row<'clauses'>[]
    if (
      !clauses.some((row) => !text(row.pack) || text(row.pack).toLowerCase() === 'sky') ||
      skyClauseEvidenceRequirements(clauses).problems.length
    )
      return { status: 'invalid' }
    return { status: 'valid', version: { savedAt: new Date(latest).toISOString(), hash, clauses } }
  } catch {
    return { status: 'invalid' }
  }
}
export interface SkyGradeView {
  status: 'created' | 'ready' | 'updated'
  filterViewId: number
}
export interface SkyGraderPorts {
  now(): Date
  newGradeId(): string
  hashId(text: string): string
  gradeTarget(): { spreadsheetId: string; sheetId: number }
  ensureExplanationView(): SkyGradeView
  readInputs(): SkyGradeInputs
  readGrades(): StoredSkyGrade[]
  pendingBatch(): SkyGradeBatch | null
  prepareBatch(rows: readonly SkyGradeRow[]): SkyGradeBatch
  saveBatch(batch: SkyGradeBatch): void
  applyBatch(batch: SkyGradeBatch): void
  clearBatch(batchId: string): void
}
export interface SkyGraderReport {
  closedWindows: number
  plannedGrades: number
  appendedGrades: number
  reconciledGrades: number
  alreadyGradedWindows: number
  deferredWindows: number
  pendingBatch: boolean
  view: SkyGradeView | null
  budgetExhausted: boolean
  problems: Array<{ code: string; windowId?: string }>
}

const MODES = ['normal', 'outdoor_limited', 'commute_disruption', 'hybrid_recommended', 'no_call'] as const
function text(value: unknown): string {
  return String(value ?? '').trim()
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function mode(value: unknown): SkyVerdictValue | null {
  return typeof value === 'string' && (MODES as readonly string[]).includes(value) ? (value as SkyVerdictValue) : null
}
function above(value: SkyVerdictValue | null): boolean {
  return value !== null && value !== 'normal' && value !== 'no_call'
}
function liveCrossings(files: readonly SkyGradeCrossing[]): Set<string> {
  const windows = new Set<string>()
  for (const file of files) {
    const doc: unknown = JSON.parse(file.text)
    if (!record(doc) || typeof doc.pack !== 'string') throw Error('crossing_invalid')
    if (doc.pack !== 'sky' || doc.replay === true) continue
    if (
      doc.replay !== false ||
      typeof doc.crossing_id !== 'string' ||
      !doc.crossing_id.trim() ||
      !Object.hasOwn(doc, 'clause_version') ||
      !(
        doc.clause_version === null ||
        (typeof doc.clause_version === 'string' && doc.clause_version.trim()) ||
        (typeof doc.clause_version === 'number' && Number.isFinite(doc.clause_version))
      ) ||
      timestamp(doc.t_eval) === null ||
      timestamp(doc.snapshot_id) === null ||
      !Array.isArray(doc.changes)
    )
      throw Error('crossing_invalid')
    for (const change of doc.changes) {
      if (
        !record(change) ||
        typeof change.scope !== 'string' ||
        !change.scope.trim() ||
        !mode(change.from) ||
        !mode(change.to) ||
        !Array.isArray(change.fired) ||
        !Array.isArray(change.blocked) ||
        !Array.isArray(change.inputs)
      )
        throw Error('crossing_invalid')
      if (change.scope === 'site') {
        if (change.window !== null) throw Error('crossing_invalid')
        continue
      }
      if (
        !record(change.window) ||
        typeof change.window.kind !== 'string' ||
        !parseSkyGradeWindow({
          window_id: change.scope,
          date: change.window.date as string,
          start_myt: change.window.start_myt as string,
          end_myt: change.window.end_myt as string
        }).window
      )
        throw Error('crossing_invalid')
      if (above(mode(change.to)) && change.from !== change.to) windows.add(change.scope.trim())
    }
  }
  return windows
}
function callDecision(kind: string): SkyGradeRow['decision'] {
  switch (kind) {
    case 'call_approved':
      return 'approved'
    case 'call_edited':
      return 'edited'
    case 'call_rejected':
      return 'rejected'
    default:
      return 'none'
  }
}
function callFor(
  rows: readonly Row<'ledger'>[],
  windowId: string
): {
  callId: string
  proposal: SkyVerdictValue | ''
  decision: SkyGradeRow['decision']
  sent: SkyVerdictValue | null
  anyApproved: boolean
} {
  const calls = rows
    .filter((r) => text(r.pack).toLowerCase() === 'sky' && text(r['window_id or night_id']) === windowId)
    .map((row) => ({ row, decision: callDecision(text(row.kind)) }))
    .filter((call) => call.decision !== 'none')
  const anyApproved = calls.some((call) => call.decision === 'approved' || call.decision === 'edited')
  const selected = calls.at(-1)
  if (!selected) return { callId: '', proposal: '', decision: 'none', sent: null, anyApproved }
  const { row, decision } = selected
  const proposal = mode(text(row.mode))
  const callId = text(row.call_id)
  if (!proposal || !callId) throw Error('call_invalid')
  let sent: SkyVerdictValue | null = null
  if (decision !== 'rejected') {
    if (typeof row.body !== 'string') throw Error('call_invalid')
    const body: unknown = JSON.parse(row.body)
    if (!record(body)) throw Error('call_invalid')
    sent = mode(body.mode)
    if (
      body.mode === null &&
      Array.isArray(body.no_call) &&
      body.no_call.length &&
      body.no_call.every((v) => typeof v === 'string' && v.trim())
    )
      sent = 'no_call'
    if (!sent) throw Error('call_invalid')
  }
  return { callId, proposal, decision, sent, anyApproved }
}
function outcome(
  observed: SkyVerdictValue,
  proposal: SkyVerdictValue | '',
  sent: SkyVerdictValue | null
): SkyGradeRow['outcome'] {
  if (observed === 'no_call' || proposal === 'no_call' || sent === 'no_call') return 'no_call'
  return above(observed) ? (above(sent) ? 'hit' : 'miss') : above(sent) ? 'false_alarm' : 'correct_normal'
}
function receiptState(batch: SkyGradeBatch, grades: readonly StoredSkyGrade[]): 'empty' | 'exact' | 'conflict' {
  const reserved = new Set(batch.rows.map((_, i) => batch.startRowIndex + i))
  const ids = new Set(batch.rows.map((r) => r.grade_id))
  const windows = new Set(batch.rows.map((r) => r.window_id))
  if (grades.some((g) => !reserved.has(g.rowIndex) && (ids.has(text(g.cells[0])) || windows.has(text(g.cells[1])))))
    return 'conflict'
  let exact = 0
  for (const [i, row] of batch.rows.entries()) {
    const matches = grades.filter((g) => g.rowIndex === batch.startRowIndex + i)
    if (matches.length > 1) return 'conflict'
    const cells = matches[0]?.cells ?? []
    if (!cells.length || cells.every((c) => c === '' || c === undefined || c === null)) continue
    const owned = ownedSkyGradeCells(row)
    if (cells.length !== owned.length || cells.some((cell, j) => cell !== owned[j])) return 'conflict'
    exact++
  }
  return exact === batch.rows.length ? 'exact' : exact ? 'conflict' : 'empty'
}
export function runSkyGrading(ports: SkyGraderPorts): SkyGraderReport {
  const report: SkyGraderReport = {
    closedWindows: 0,
    plannedGrades: 0,
    appendedGrades: 0,
    reconciledGrades: 0,
    alreadyGradedWindows: 0,
    deferredWindows: 0,
    pendingBatch: false,
    view: null,
    budgetExhausted: false,
    problems: []
  }
  const started = ports.now()
  const problem = (code: string, windowId?: string) => {
    report.problems.push({ code, ...(windowId ? { windowId } : {}) })
  }
  const admitted = () => {
    if (ports.now().getTime() - started.getTime() >= 240000) report.budgetExhausted = true
    return !report.budgetExhausted
  }
  const confirmed = new Set<string>()
  const gradeIds = new Set<string>()
  let cursor = 1
  const targetMatches = (b: SkyGradeBatch) => {
    const target = ports.gradeTarget()
    return target.spreadsheetId === b.spreadsheetId && target.sheetId === b.sheetId
  }
  const finish = (batch: SkyGradeBatch, reconciled: boolean): boolean => {
    batch.rows.forEach((r) => {
      confirmed.add(r.window_id)
      gradeIds.add(r.grade_id)
    })
    cursor = Math.max(cursor, batch.startRowIndex + batch.rows.length)
    if (reconciled) report.reconciledGrades += batch.rows.length
    else report.appendedGrades += batch.rows.length
    try {
      const pending = ports.pendingBatch()
      if (!pending || encodeSkyGradeBatch(pending) !== encodeSkyGradeBatch(batch)) {
        problem('batch_cleanup_identity')
        return false
      }
      ports.clearBatch(batch.batchId)
      report.pendingBatch = false
      return true
    } catch {
      problem('batch_cleanup_failed')
      return false
    }
  }
  const apply = (batch: SkyGradeBatch): boolean => {
    try {
      if (!targetMatches(batch)) {
        problem('batch_target_changed')
        return false
      }
      ports.applyBatch(batch)
    } catch {
      problem('batch_apply_unknown')
      return false
    }
    return finish(batch, false)
  }
  // Recovery is admitted once even if a slow initial property/target read spends the budget.
  try {
    const pending = ports.pendingBatch()
    if (pending) {
      report.pendingBatch = true
      const batch = decodeSkyGradeBatch(encodeSkyGradeBatch(pending))
      if (!targetMatches(batch)) {
        problem('batch_target_changed')
        return report
      }
      const receipts = receiptState(batch, ports.readGrades())
      if (receipts === 'conflict') {
        problem('batch_receipt_conflict')
        return report
      }
      if (!(receipts === 'exact' ? finish(batch, true) : apply(batch))) return report
    }
  } catch {
    report.pendingBatch = true
    problem('batch_recovery_failed')
    return report
  }
  if (!admitted()) return report
  try {
    report.view = ports.ensureExplanationView()
  } catch {
    problem('view_failed')
    return report
  }
  if (!admitted()) return report
  let grades: StoredSkyGrade[]
  try {
    grades = ports.readGrades()
  } catch {
    problem('grades_unreadable')
    return report
  }
  for (const g of grades) {
    if (text(g.cells[0])) gradeIds.add(text(g.cells[0]))
    if (text(g.cells[1])) confirmed.add(text(g.cells[1]))
    if (Number.isSafeInteger(g.rowIndex)) cursor = Math.max(cursor, g.rowIndex + 1)
  }
  if (!admitted()) return report
  let inputs: SkyGradeInputs
  try {
    inputs = ports.readInputs()
  } catch {
    problem('inputs_unreadable')
    return report
  }
  if (!admitted()) return report
  let crossingWindows: Set<string>
  try {
    crossingWindows = liveCrossings(inputs.crossings)
  } catch {
    problem('crossing_invalid')
    return report
  }
  const groups = new Map<string, Row<'windows'>[]>()
  for (const row of inputs.windows) {
    const id = text(row.window_id)
    if (!id) {
      problem('window_invalid')
      continue
    }
    const group = groups.get(id) ?? []
    group.push(row)
    groups.set(id, group)
  }
  const planned: SkyGradeRow[] = []
  for (const [id, rows] of groups) {
    if (!admitted()) break
    const parsed = rows.map(parseSkyGradeWindow)
    const first = parsed[0]!.window
    const publicKey = (row: Row<'windows'>) =>
      JSON.stringify(
        columnsOf('windows')
          .slice(0, 9)
          .map((k) => row[k] ?? '')
      )
    if (
      !first ||
      parsed.some((p) => !p.window) ||
      parsed.some((p) => publicKey(p.window!.row) !== publicKey(first.row))
    ) {
      problem('window_invalid_or_conflicting', id)
      report.deferredWindows++
      continue
    }
    if (first.spanTo.getTime() >= started.getTime()) continue
    report.closedWindows++
    if (confirmed.has(id)) {
      report.alreadyGradedWindows++
      continue
    }
    const selected = selectSkyGradeVersion(inputs.clauseVersions, first.spanTo, (s) => ports.hashId(s))
    if (selected.status !== 'valid') {
      problem(`version_${selected.status}`, id)
      report.deferredWindows++
      continue
    }
    if (!admitted()) {
      report.deferredWindows++
      break
    }
    try {
      const call = callFor(inputs.ledger, id)
      const evidence = evaluateSkyGradeEvidence({
        spreadsheetId: ports.gradeTarget().spreadsheetId,
        knownAt: started,
        window: first,
        version: selected.version,
        sources: inputs.sources,
        readings: inputs.readings,
        polls: inputs.polls,
        warnings: inputs.warnings,
        daylight: inputs.daylight,
        cameraHistory: inputs.cameraHistory,
        ...(inputs.cameraHistoryProblem ? { cameraHistoryProblem: inputs.cameraHistoryProblem } : {})
      })
      evidence.problems.forEach((code) => problem(code, id))
      const observed = evidence.observedMode
      const gradeId = ports.newGradeId()
      if (gradeIds.has(gradeId)) {
        problem('grade_id_conflict', id)
        report.deferredWindows++
        continue
      }
      gradeIds.add(gradeId)
      planned.push({
        grade_id: gradeId,
        window_id: id,
        call_id: call.callId,
        proposed_mode: call.proposal,
        decision: call.decision,
        observed_mode: observed,
        outcome: outcome(observed, call.proposal, call.sent),
        mode_diff: above(call.sent) && above(observed) && call.sent !== observed ? `${call.sent}→${observed}` : '',
        shadow_fired_no_call: crossingWindows.has(id) && !call.anyApproved,
        graded_at: started.toISOString(),
        clause_version_hash: selected.version.hash
      })
      report.plannedGrades++
    } catch {
      problem('call_or_evidence_invalid', id)
      report.deferredWindows++
    }
  }
  if (!planned.length || !admitted()) {
    report.deferredWindows += planned.length
    return report
  }
  let prepared: SkyGradeBatch
  try {
    planned.forEach(Object.freeze)
    Object.freeze(planned)
    prepared = ports.prepareBatch(planned)
    if (
      !targetMatches(prepared) ||
      JSON.stringify(prepared.rows) !== JSON.stringify(planned) ||
      prepared.batchId !== planned[0]!.grade_id ||
      prepared.version !== 1 ||
      !Number.isSafeInteger(prepared.startRowIndex) ||
      prepared.startRowIndex < 1
    )
      throw Error('invalid')
    prepared = { ...prepared, startRowIndex: Math.max(cursor, prepared.startRowIndex), rows: planned }
  } catch {
    problem('batch_prepare_invalid')
    report.deferredWindows += planned.length
    return report
  }
  let index = 0
  while (index < planned.length) {
    if (!admitted()) {
      report.deferredWindows += planned.length - index
      break
    }
    let batch: SkyGradeBatch | null = null
    let count = 0
    for (let length = 1; index + length <= planned.length; length++) {
      const candidate = {
        ...prepared,
        batchId: planned[index]!.grade_id,
        startRowIndex: cursor > prepared.startRowIndex ? cursor : prepared.startRowIndex,
        rows: planned.slice(index, index + length)
      }
      try {
        batch = decodeSkyGradeBatch(encodeSkyGradeBatch(candidate))
        count = length
      } catch {
        break
      }
    }
    if (!batch) {
      problem('grade_batch_invalid_or_oversized', planned[index]!.window_id)
      report.deferredWindows++
      index++
      continue
    }
    try {
      if (!targetMatches(batch)) throw Error('target')
      // Fresh snapshots may be cached, so also retain confirmed coordinates and IDs locally.
      const state = receiptState(batch, grades)
      if (state !== 'empty') throw Error('conflict')
      if (ports.pendingBatch() !== null) throw Error('pending')
    } catch {
      problem('batch_reservation_conflict')
      report.deferredWindows += planned.length - index
      return report
    }
    if (!admitted()) {
      report.deferredWindows += planned.length - index
      break
    }
    report.pendingBatch = true
    try {
      ports.saveBatch(batch)
    } catch {
      problem('batch_save_unknown')
      report.deferredWindows += planned.length - index - count
      return report
    }
    if (!apply(batch)) {
      report.deferredWindows += planned.length - index - count
      return report
    }
    index += count
  }
  return report
}
