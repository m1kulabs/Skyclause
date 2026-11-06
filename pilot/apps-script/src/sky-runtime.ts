import { toMytIso } from '../../shared/time.ts'
import { defaultSkyClauseRows, evaluateSkyClauses, type SkyVerdict } from './clauses.ts'
import {
  planSkyCrossings,
  type PlannedSkyCrossingFile,
  type SkyCrossingDocument,
  type SkyCrossingPlan
} from './crossings.ts'
import type { SkySnapshot } from './indicators.ts'
import { columnsOf, type Cell, type Column, type Row } from './schema.ts'

export type SkyClauseReadTab = 'clauses' | 'clause_versions' | 'shadow_state' | 'ledger'
export type SkyClauseAppendTab = 'clauses' | 'clause_versions' | 'ledger'
export type SkyClauseReplaceTab = 'shadow' | 'shadow_state'

export interface SkyClauseStorePort {
  readRows<T extends SkyClauseReadTab>(tab: T): readonly Row<T>[]
  appendRows<T extends SkyClauseAppendTab>(tab: T, rows: readonly Row<T>[]): void
  replaceRows<T extends SkyClauseReplaceTab>(tab: T, rows: readonly Row<T>[]): void
}

export interface SkyClauseRuntimePorts {
  store: SkyClauseStorePort
  canonicalJson(value: unknown): string
  sha256(text: string): string
  listCrossings(): readonly PlannedSkyCrossingFile[]
  createCrossing(file: PlannedSkyCrossingFile): void
}

export interface SkyClauseTickInput {
  tEval: string
  recordedAt: string
  editor: string | null
  snapshot: SkySnapshot
  windows: readonly Row<'windows'>[]
  trigger?: 'schedule' | 'request'
}

export interface SkyClauseTickResult {
  version: Row<'clause_versions'>
  verdicts: SkyVerdict[]
  plan: SkyCrossingPlan
  fileCreated: boolean
  fileReused: boolean
}

export interface ClauseEditEventInput {
  workbookId: string
  sheetName: string
  editor: string | null
}

export interface ClauseEditHandlerPorts {
  configuredSheetId: string
  withLock<T>(action: () => T): T
  saveEditor(editor: string): void
}

const CLAUSE_COLUMNS: readonly Column<'clauses'>[] = columnsOf('clauses')
const CROSSING_FILENAME_RE = /^crossing-(\d{8}-\d{4})-(\d+)\.json$/
const CROSSING_ID_RE = /^X-(\d{8}-\d{4})-(\d+)$/

function normalizeTimestamp(raw: string, label: string): string {
  if (typeof raw !== 'string') {
    throw new Error(`Invalid ${label} timestamp: ${String(raw)}`)
  }
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error(`Invalid ${label} timestamp: ${String(raw)}`)
  }
  const ms = Date.parse(trimmed)
  if (!Number.isFinite(ms)) {
    throw new Error(`Invalid ${label} timestamp: ${String(raw)}`)
  }
  return toMytIso(new Date(ms))
}

function normalizeOptionalIso(cell: Cell | undefined | null): string | null {
  if (cell instanceof Date) {
    const ms = cell.getTime()
    return Number.isFinite(ms) ? toMytIso(cell) : null
  }
  if (typeof cell !== 'string') return null
  const trimmed = cell.trim()
  if (!trimmed) return null
  const ms = Date.parse(trimmed)
  if (!Number.isFinite(ms)) return null
  return toMytIso(new Date(ms))
}

function normalizeEditor(editor: string | null | undefined): string {
  if (typeof editor !== 'string') return 'unknown'
  const trimmed = editor.trim()
  return trimmed.length > 0 ? trimmed : 'unknown'
}

function canonicalizeCell(cell: Cell | undefined | null): string | number | boolean {
  if (cell === undefined || cell === null) return ''
  if (cell instanceof Date) {
    const ms = cell.getTime()
    return Number.isFinite(ms) ? toMytIso(cell) : ''
  }
  return cell
}

function canonicalizeClauseRows(
  rows: readonly Row<'clauses'>[]
): Array<Record<Column<'clauses'>, string | number | boolean>> {
  return rows.map((row) => {
    const canonicalRow = {} as Record<Column<'clauses'>, string | number | boolean>
    for (const column of CLAUSE_COLUMNS) {
      canonicalRow[column] = canonicalizeCell(row[column])
    }
    return canonicalRow
  })
}

function findLatestClauseVersion(
  versions: readonly Row<'clause_versions'>[]
): { row: Row<'clause_versions'>; versionN: number } | null {
  let latestRow: Row<'clause_versions'> | null = null
  let latestVersionN = 0
  for (const row of versions) {
    const parsed = typeof row.version_n === 'number' ? row.version_n : Number(String(row.version_n ?? '').trim())
    if (Number.isInteger(parsed) && parsed >= 1 && parsed >= latestVersionN) {
      latestVersionN = parsed
      latestRow = row
    }
  }
  if (!latestRow) return null
  return { row: { ...latestRow }, versionN: latestVersionN }
}

function collectMissingVersionLedgerRows(
  durableVersions: readonly Row<'clause_versions'>[],
  knownLedgerEntryIds: Set<string>,
  recordedAtIso: string,
  canonicalJson: (value: unknown) => string
): Row<'ledger'>[] {
  const ordered = durableVersions
    .map((row) => {
      const versionN = typeof row.version_n === 'number' ? row.version_n : Number(String(row.version_n ?? '').trim())
      const contentHash = String(row.content_hash ?? '').trim()
      return { versionN, contentHash }
    })
    .filter((item) => Number.isInteger(item.versionN) && item.versionN >= 1 && item.contentHash.length > 0)
    .sort((a, b) => a.versionN - b.versionN)

  const missing: Row<'ledger'>[] = []
  for (const { versionN, contentHash } of ordered) {
    const entryId = `CV-${versionN}-${contentHash}`
    if (knownLedgerEntryIds.has(entryId)) continue
    knownLedgerEntryIds.add(entryId)
    missing.push({
      entry_id: entryId,
      kind: 'clause_version',
      pack: 'sky',
      source_ref: '',
      body: canonicalJson({
        version_n: versionN,
        content_hash: contentHash
      }),
      recorded_at: recordedAtIso
    })
  }
  return missing
}

function formatEvalStampToken(tEvalIso: string): string {
  const yyyyMMdd = `${tEvalIso.slice(0, 4)}${tEvalIso.slice(5, 7)}${tEvalIso.slice(8, 10)}`
  const HHmm = `${tEvalIso.slice(11, 13)}${tEvalIso.slice(14, 16)}`
  return `${yyyyMMdd}-${HHmm}`
}

function parseSameStampSequence(file: PlannedSkyCrossingFile, tEvalIso: string, stampToken: string): number | null {
  const docEvalIso = normalizeOptionalIso(file.document?.t_eval)
  if (docEvalIso !== null && docEvalIso !== tEvalIso) {
    return null
  }

  const filenameMatch = CROSSING_FILENAME_RE.exec(String(file.filename ?? '').trim())
  const idMatch = CROSSING_ID_RE.exec(String(file.document?.crossing_id ?? '').trim())

  const fileStamp = filenameMatch?.[1] ?? idMatch?.[1] ?? null
  const seqText = filenameMatch?.[2] ?? idMatch?.[2] ?? null

  if (fileStamp !== stampToken || !seqText) {
    return null
  }

  const seq = Number.parseInt(seqText, 10)
  if (!Number.isInteger(seq) || seq < 1) {
    return null
  }
  return seq
}

function canonicalCrossingIdentity(document: SkyCrossingDocument, canonicalJson: (value: unknown) => string): string {
  const { crossing_id: _ignored, ...rest } = document
  return canonicalJson(rest)
}

export function runSkyClauseTick(input: SkyClauseTickInput, ports: SkyClauseRuntimePorts): SkyClauseTickResult {
  const tEvalIso = normalizeTimestamp(input.tEval, 'tEval')
  const recordedAtIso = normalizeTimestamp(input.recordedAt, 'recordedAt')

  const existingClauses = ports.store.readRows('clauses').map((row) => ({ ...row }))
  const hasSkyRows = existingClauses.some(
    (row) =>
      String(row.pack ?? '')
        .trim()
        .toLowerCase() === 'sky'
  )

  let clauseRows = existingClauses
  let bootstrappedDefaults = false
  if (!hasSkyRows) {
    const defaults = defaultSkyClauseRows().map((row) => ({ ...row }))
    ports.store.appendRows('clauses', defaults)
    clauseRows = [...existingClauses, ...defaults]
    bootstrappedDefaults = true
  }

  const canonicalRows = canonicalizeClauseRows(clauseRows)
  const contentJson = ports.canonicalJson(canonicalRows)
  const contentHash = ports.sha256(contentJson)

  const existingVersions = ports.store.readRows('clause_versions')
  const latestVersion = findLatestClauseVersion(existingVersions)

  let activeVersionRow: Row<'clause_versions'>
  let activeVersionN: number
  let durableVersions: readonly Row<'clause_versions'>[]

  if (latestVersion && String(latestVersion.row.content_hash ?? '').trim() === contentHash) {
    activeVersionRow = latestVersion.row
    activeVersionN = latestVersion.versionN
    durableVersions = existingVersions
  } else {
    activeVersionN = latestVersion ? latestVersion.versionN + 1 : 1
    const editor = bootstrappedDefaults ? 'system' : normalizeEditor(input.editor)
    activeVersionRow = {
      version_n: activeVersionN,
      saved_at: recordedAtIso,
      editor,
      content_hash: contentHash,
      content_json: contentJson
    }
    ports.store.appendRows('clause_versions', [activeVersionRow])
    durableVersions = [...existingVersions, activeVersionRow]
  }

  const ledgerRows = ports.store.readRows('ledger')
  const knownLedgerEntryIds = new Set(
    ledgerRows.map((row) => String(row.entry_id ?? '').trim()).filter((id) => id.length > 0)
  )
  const missingVersionLedgerRows = collectMissingVersionLedgerRows(
    durableVersions,
    knownLedgerEntryIds,
    recordedAtIso,
    ports.canonicalJson
  )
  if (missingVersionLedgerRows.length > 0) {
    ports.store.appendRows('ledger', missingVersionLedgerRows)
  }

  const previousState = ports.store.readRows('shadow_state')
  const ledgerSourceRefs = ledgerRows.map((row) => String(row.source_ref ?? '').trim()).filter((ref) => ref.length > 0)

  const verdicts = evaluateSkyClauses({
    tEval: tEvalIso,
    snapshot: input.snapshot,
    clauses: clauseRows,
    windows: input.windows,
    clauseVersion: activeVersionN
  })

  const baseCrossingInput = {
    tEval: tEvalIso,
    verdicts,
    previousState,
    ledgerSourceRefs,
    windows: input.windows
  }

  let plan = planSkyCrossings({
    ...baseCrossingInput,
    sequence: 1
  })

  ports.store.replaceRows('shadow', plan.shadowRows)

  let fileCreated = false
  let fileReused = false

  if (plan.crossing !== null) {
    const existingCrossings = ports.listCrossings()
    const stampToken = formatEvalStampToken(tEvalIso)
    const targetIdentity = canonicalCrossingIdentity(plan.crossing.document, ports.canonicalJson)

    let matchedSeq: number | null = null
    let maxSameStampSeq = 0

    for (const existing of existingCrossings) {
      const seq = parseSameStampSequence(existing, tEvalIso, stampToken)
      if (seq === null) continue
      if (seq > maxSameStampSeq) {
        maxSameStampSeq = seq
      }
      if (
        matchedSeq === null &&
        existing.document &&
        canonicalCrossingIdentity(existing.document, ports.canonicalJson) === targetIdentity
      ) {
        matchedSeq = seq
      }
    }

    if (matchedSeq !== null) {
      if (matchedSeq !== 1) {
        plan = planSkyCrossings({
          ...baseCrossingInput,
          sequence: matchedSeq
        })
      }
      fileReused = true
    } else {
      const nextSeq = maxSameStampSeq + 1
      if (nextSeq !== 1) {
        plan = planSkyCrossings({
          ...baseCrossingInput,
          sequence: nextSeq
        })
      }
      ports.createCrossing(plan.crossing!)
      fileCreated = true
    }
  }

  ports.store.replaceRows('shadow_state', plan.stateRows)

  return {
    version: activeVersionRow,
    verdicts,
    plan,
    fileCreated,
    fileReused
  }
}

export function runClauseEditHandler(input: ClauseEditEventInput, ports: ClauseEditHandlerPorts): boolean {
  const configuredSheetId = String(ports.configuredSheetId ?? '').trim()
  const workbookId = String(input.workbookId ?? '').trim()
  const sheetName = String(input.sheetName ?? '').trim()

  if (!configuredSheetId || workbookId !== configuredSheetId || sheetName !== 'clauses') {
    return false
  }

  const editor = normalizeEditor(input.editor)
  ports.withLock(() => {
    ports.saveEditor(editor)
  })
  return true
}
