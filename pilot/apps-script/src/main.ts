// Apps Script entry points. The build turns every function exported here into a top-level function in dist/Code.js,
// so trigger handlers, doGet, doPost and functions run by hand in the editor must be exported from this file.
import { toMytIso } from '../../shared/time.ts'
import { defaultSkyClauseRows } from './clauses.ts'
import {
  apimsPollPorts,
  metPollPorts,
  appendReadings,
  appendRows,
  cameraRetentionStore,
  crowdForecastStore,
  crowdHistoryStore,
  crowdGradeStore,
  drive,
  evidenceInboxPorts,
  auditorPorts,
  fetchUrl,
  fetchWikiText,
  getProperty,
  formAnswers,
  optinStores,
  properties,
  readColumns,
  setupClausesStore,
  sweepStore,
  sha256HexDigest,
  saveLastClauseEditor,
  skyReplayPorts,
  triggers,
  windowFormPort,
  withLock,
  workbooks
} from './gas.ts'
import { runMetHandler, verifyMetWarningText as verifyStoredMetWarningText } from './met.ts'
import type { MetKind } from './met-parser.ts'
import { runApimsHandler } from './apims.ts'
import { buildHealth } from './health.ts'
import { runEvidenceInbox } from './evidence.ts'
import { runAuditor as executeAuditor, parseAuditRecipients } from './auditor.ts'
import { METADATA_URL, runCrowdGrading } from './crowd-grades.ts'
import { newUuidV7, runJpsHandler } from './jps.ts'
import { runCameraRetention } from './camera.ts'
import { ensureResponsesSheetId, runCreateWindowForm, runOptinSubmit } from './optin-form.ts'
import { columnsOf } from './schema.ts'
import { runSweep, verifyLedgerChain } from './sweep.ts'
import { triggerRegistry } from './registry.ts'
import { JPS_REPLAY_CAPTURE } from './replay-data.ts'
import { runSkyReplay as executeSkyReplay, selectReplaySubscriberIds, type SkyReplayResult } from './replay.ts'
import { handleGet, handlePost } from './router.ts'
import { getRoutes, postRoutes } from './routes.ts'
import { runSetup } from './setup.ts'
import { runClauseEditHandler } from './sky-runtime.ts'
import { executeEvaluationTick } from './tick.ts'
import { recordWeekndForecasts, runCrowdForecast } from './crowd-tick.ts'
import { runHistoryBuild } from './crowd-history.ts'

export { runEvaluationTick } from './tick.ts'

// Stamped by the build: CI passes the commit SHA and PILOT_SCRIPT_ID; a local build passes its HEAD and no ID.
declare const __BUILD_SHA__: string
declare const __BUILD_TIME__: string
declare const __PILOT_SCRIPT_ID__: string

const SUBSCRIBER_REPLAY_COLUMNS = ['subscriber_id', 'email', 'consent_at', 'unsubscribed_at'] as const

function json(value: unknown): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON)
}

function health() {
  const sheetId = getProperty('SHEET_ID')
  if (!sheetId) throw new Error('SHEET_ID is not set; run setup()')
  return buildHealth({
    stamp: { sha: __BUILD_SHA__, builtAt: __BUILD_TIME__ },
    now: new Date(),
    sources: readColumns(sheetId, 'sources', ['source_id', 'kind', 'freshness', 'state', 'stale_after_min']),
    polls: readColumns(sheetId, 'polls', ['poll_id', 'source_kind', 'source_id', 'outcome', 'received_at']),
    readings: readColumns(sheetId, 'readings', ['source_id', 'poll_id'])
  })
}

export function doGet(event: GoogleAppsScript.Events.DoGet) {
  const response = handleGet(event.parameter ?? {}, getRoutes, health, { getProperty })
  return 'html' in response ? HtmlService.createHtmlOutput(response.html) : json(response.json)
}

export function doPost(event: GoogleAppsScript.Events.DoPost) {
  return json(handlePost(event.postData?.contents, postRoutes, { getProperty, withLock }))
}

// The 5-minute sweeper (#62): crossing notifications, ledger sealing, the delay line and the post-check.
export function sweep(): void {
  const sheetId = getProperty('SHEET_ID')
  if (!sheetId) throw new Error('SHEET_ID is not set; run setup()')
  withLock(() => {
    console.log(JSON.stringify(runSweep(sweepStore(sheetId))))
  })
}

// The ledger integrity check (#62 LED-1), run by hand in the editor: recomputes the chain and names the
// first bad row. Paste both the sealed and the edited results for the live checks.
export function verifyLedger(): void {
  const sheetId = getProperty('SHEET_ID')
  if (!sheetId) throw new Error('SHEET_ID is not set; run setup()')
  console.log(JSON.stringify(verifyLedgerChain(readColumns(sheetId, 'ledger', columnsOf('ledger')), sha256HexDigest)))
}

export function pollJps(): void {
  const sheetId = getProperty('SHEET_ID')
  if (!sheetId) throw new Error('SHEET_ID is not set; run setup()')
  runJpsHandler({
    withLock,
    ports: {
      now: () => new Date(),
      newPollId: () => newUuidV7(),
      fetch: fetchUrl,
      readSources: () => readColumns(sheetId, 'sources', ['source_id']),
      appendSource: (row) => appendRows(sheetId, 'sources', [row]),
      readReadings: () => readColumns(sheetId, 'readings', ['source_id', 'metric', 'observed_at', 'value', 'revision']),
      appendReadings: (rows) => appendReadings(sheetId, rows),
      appendPoll: (row) => appendRows(sheetId, 'polls', [row]),
      evaluate: executeEvaluationTick
    }
  })
}

export function pollApims(): void {
  const sheetId = getProperty('SHEET_ID')
  if (!sheetId || !sheetId.trim()) throw new Error('SHEET_ID is not set; run setup()')
  const report = runApimsHandler({ withLock, ports: apimsPollPorts(sheetId, executeEvaluationTick) })
  console.log(
    JSON.stringify({
      polls: 1 + report.historyPolls.length,
      newReadings: report.newReadings.length,
      pendingHistory: report.pendingHistory
    })
  )
}

function metPorts() {
  const sheetId = getProperty('SHEET_ID')
  if (!sheetId?.trim()) throw new Error('SHEET_ID is not set; run setup()')
  const rawFolderId = getProperty('RAW_FOLDER_ID')
  if (!rawFolderId?.trim()) throw new Error('RAW_FOLDER_ID is not set; run setup()')
  return metPollPorts(sheetId, rawFolderId, executeEvaluationTick)
}
function pollMet(kind: MetKind): void {
  const report = runMetHandler({ kind, withLock, ports: metPorts() })
  console.log(
    JSON.stringify({
      polls: 1 + report.recoveredPollIds.length,
      outcome: report.poll.outcome,
      appendedRows: report.appendedRows,
      touchedWarnings: report.touchedWarnings,
      recoveredPolls: report.recoveredPollIds.length,
      rawCreated: report.rawCreated
    })
  )
}
export function pollMetWarnings(): void {
  pollMet('warning')
}
export function pollMetForecast(): void {
  pollMet('forecast')
}
export function verifyMetWarningText(): void {
  const ports = metPorts()
  withLock(() => console.log(JSON.stringify(verifyStoredMetWarningText(ports))))
}

// The Crowd D+1 grader (#70), every 30 minutes: grades every night from 3
// November 2026 once D+1 has begun, or pends it on the metadata's next_update.
export function gradeCrowd(): void {
  const sheetId = getProperty('SHEET_ID')
  if (!sheetId) throw new Error('SHEET_ID is not set; run setup()')
  withLock(() => {
    const summary = runCrowdGrading({
      store: crowdGradeStore(sheetId),
      fetchMetadata: (url) => {
        if (url !== METADATA_URL) throw new Error(`the grader fetches only ${METADATA_URL}`)
        const response = fetchUrl(url)
        return { status: response.status, text: response.body }
      },
      now: () => new Date(),
      newPollId: () => newUuidV7()
    })
    console.log(JSON.stringify(summary))
    if (summary.kill.fired)
      console.log('Kill criterion fired: both Weeknd nights out of band above 40%; comment on #74')
  })
}

// The daily frame retention job (AUD-5, NFR-14); installed by the trigger registry.
export function retainCameraFrames(): void {
  const sheetId = getProperty('SHEET_ID')
  if (!sheetId) throw new Error('SHEET_ID is not set; run setup()')
  runCameraRetention(cameraRetentionStore(sheetId), {
    now: () => new Date(),
    semesterEndsOn: getProperty('SEMESTER_ENDS_ON'),
    log: (line) => console.log(line),
    error: (line) => console.error(line)
  })
}

// The WIN-1 form-submit handler, installed on the responses workbook by the
// registry. Runs under the script lock; a reject writes its reason and nothing else.
export function onWindowFormSubmit(event: GoogleAppsScript.Events.SheetsOnFormSubmit): void {
  const sheetId = getProperty('SHEET_ID')
  if (!sheetId) throw new Error('SHEET_ID is not set; run setup()')
  const responsesId = getProperty('RESPONSES_SHEET_ID')
  if (!responsesId) throw new Error('RESPONSES_SHEET_ID is not set; run createWindowForm()')
  const values = formAnswers(event.range)
  withLock(() => {
    runOptinSubmit(
      { rowNumber: event.range.getRow(), values, submittedAt: new Date() },
      optinStores(sheetId, responsesId)
    )
  })
}

// Run once in the editor per project: creates the WIN-1 form on the responses
// workbook (or reuses its linked form) and grants the manifest's scopes.
export function createWindowForm(): void {
  const responsesId = ensureResponsesSheetId({ properties, drive })
  const report = runCreateWindowForm(windowFormPort(responsesId), properties.get('TEAM_ALERT_EMAILS') ?? '{team inbox}')
  console.log(JSON.stringify(report, null, 2))
}

// The hourly Crowd forecast tick (#69): frozen forecasts, crowd_shadow and crossing files.
export function forecastCrowd(): void {
  const sheetId = getProperty('SHEET_ID')
  if (!sheetId) throw new Error('SHEET_ID is not set; run setup()')
  withLock(() => {
    console.log(JSON.stringify(runCrowdForecast(crowdForecastStore(sheetId), new Date())))
  })
}

// One-off, run by hand in the editor: the current Wikipedia revisions become `history` rows.
export function buildCrowdHistory(): void {
  const sheetId = getProperty('SHEET_ID')
  if (!sheetId) throw new Error('SHEET_ID is not set; run setup()')
  withLock(() => {
    const today = toMytIso(new Date()).slice(0, 10)
    const store = crowdHistoryStore(sheetId)
    console.log(
      JSON.stringify(
        runHistoryBuild(
          {
            fetch: (url) => fetchWikiText(url),
            readHistory: () => store.readHistory(),
            appendHistory: (rows) => store.appendHistory(rows)
          },
          today
        )
      )
    )
  })
}

// One-off, run by hand in the editor: the two frozen Weeknd forecasts, idempotently.
export function recordWeekndForecastsOnce(): void {
  const sheetId = getProperty('SHEET_ID')
  if (!sheetId) throw new Error('SHEET_ID is not set; run setup()')
  withLock(() => {
    console.log(JSON.stringify(recordWeekndForecasts(crowdForecastStore(sheetId))))
  })
}

export function on_edit_clauses(event?: GoogleAppsScript.Events.SheetsOnEdit): void {
  if (!event) return
  const configuredSheetId = getProperty('SHEET_ID')
  if (!configuredSheetId || !configuredSheetId.trim()) return

  const rangeSheet = typeof event.range?.getSheet === 'function' ? event.range.getSheet() : null
  const workbookId =
    typeof event.source?.getId === 'function'
      ? event.source.getId()
      : typeof rangeSheet?.getParent === 'function' && typeof rangeSheet.getParent()?.getId === 'function'
        ? rangeSheet.getParent().getId()
        : ''

  const sheetName =
    typeof rangeSheet?.getName === 'function'
      ? rangeSheet.getName()
      : typeof event.source?.getActiveSheet === 'function' &&
          typeof event.source.getActiveSheet()?.getName === 'function'
        ? event.source.getActiveSheet().getName()
        : ''

  const rawUser = (event as { user?: unknown }).user
  const editor =
    typeof event.user?.getEmail === 'function' ? event.user.getEmail() : typeof rawUser === 'string' ? rawUser : null

  runClauseEditHandler(
    {
      workbookId,
      sheetName,
      editor
    },
    {
      configuredSheetId,
      withLock,
      saveEditor: saveLastClauseEditor
    }
  )
}

export function runSkyReplay(): SkyReplayResult {
  return withLock(() => {
    const liveSheetId = getProperty('SHEET_ID')?.trim() ?? ''
    const replaySheetId = getProperty('REPLAY_SHEET_ID')?.trim() ?? ''
    const skyFolderId = getProperty('CROSSINGS_SKY_FOLDER_ID')?.trim() ?? ''
    const crowdFolderId = getProperty('CROSSINGS_CROWD_FOLDER_ID')?.trim() ?? ''
    const replayFolderId = getProperty('CROSSINGS_REPLAY_FOLDER_ID')?.trim() ?? ''
    const teamAlertEmails = getProperty('TEAM_ALERT_EMAILS') ?? ''
    const dayStart = getProperty('CAMERA_DAY_START')?.trim() || '07:15'
    const dayEnd = getProperty('CAMERA_DAY_END')?.trim() || '19:00'

    if (!liveSheetId) throw new Error('SHEET_ID is not set; run setup()')
    if (!replaySheetId) throw new Error('REPLAY_SHEET_ID is not set; run setup()')
    if (!skyFolderId) throw new Error('CROSSINGS_SKY_FOLDER_ID is not set; run setup()')
    if (!replayFolderId) throw new Error('CROSSINGS_REPLAY_FOLDER_ID is not set; run setup()')

    if (
      replaySheetId === liveSheetId ||
      replayFolderId === skyFolderId ||
      (crowdFolderId.length > 0 && replayFolderId === crowdFolderId)
    ) {
      throw new Error('Replay storage must be separate from live storage')
    }

    const subscriberRows = readColumns(liveSheetId, 'subscribers', SUBSCRIBER_REPLAY_COLUMNS)
    const subscriberIds = selectReplaySubscriberIds(teamAlertEmails, subscriberRows)

    const storedClauses = readColumns(liveSheetId, 'clauses', columnsOf('clauses'))
    const clauses = storedClauses.length > 0 ? storedClauses : defaultSkyClauseRows()

    return executeSkyReplay(
      {
        capture: JPS_REPLAY_CAPTURE,
        subscriberIds,
        recordedAt: toMytIso(new Date()),
        daylight: { start: dayStart, end: dayEnd },
        clauses
      },
      skyReplayPorts(replaySheetId, replayFolderId)
    )
  })
}

// Run once in the editor per project: it grants the manifest's scopes and makes the folders, workbooks and tabs.
// Only the script whose ID CI stamped gets triggers.
export function setup() {
  const report = runSetup({
    properties,
    drive,
    workbooks,
    // SHEET_ID is ensured above the clause seeding inside runSetup, so this resolves it lazily.
    clauses: {
      packs: () => setupClausesStore(getProperty('SHEET_ID') ?? '').packs(),
      append: (rows) => setupClausesStore(getProperty('SHEET_ID') ?? '').append(rows)
    },
    triggers,
    scriptId: ScriptApp.getScriptId(),
    pilotScriptId: __PILOT_SCRIPT_ID__,
    registry: triggerRegistry
  })
  console.log(JSON.stringify(report, null, 2))
}

// #58 materializes public packs and retries private duty notices under one orchestration lock.
export function pollEvidenceInbox(): void {
  const sheetId = getProperty('SHEET_ID')
  if (!sheetId) throw new Error('SHEET_ID is not set; run setup()')
  const projectSlug = getProperty('PROJECT_SLUG')
  if (!projectSlug) throw new Error('PROJECT_SLUG is not set')
  withLock(() => {
    const ports = evidenceInboxPorts(sheetId, projectSlug)
    // Prove Gmail access before activation, without scanning old messages or sending mail.
    ports.ownerEmail()
    console.log(JSON.stringify(runEvidenceInbox(ports)))
  })
}

export function runAuditor(): void {
  withLock(() => {
    const sheetId = getProperty('SHEET_ID')?.trim() ?? ''
    const skyFolderId = getProperty('CROSSINGS_SKY_FOLDER_ID')?.trim() ?? ''
    const crowdFolderId = getProperty('CROSSINGS_CROWD_FOLDER_ID')?.trim() ?? ''
    parseAuditRecipients(getProperty('TEAM_ALERT_EMAILS'))
    const report = executeAuditor(auditorPorts(sheetId, skyFolderId, crowdFolderId))
    console.log(JSON.stringify({ ...report, problems: report.problems.map((problem) => problem.code) }))
  })
}
