// Apps Script entry points. The build turns every function exported here into a top-level function in dist/Code.js,
// so trigger handlers, doGet, doPost and functions run by hand in the editor must be exported from this file.
import {
  appendReadings,
  appendRows,
  cameraRetentionStore,
  crowdForecastStore,
  crowdHistoryStore,
  crowdGradeStore,
  drive,
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
  triggers,
  windowFormPort,
  withLock,
  workbooks
} from './gas.ts'
import { buildHealth } from './health.ts'
import { METADATA_URL, runCrowdGrading } from './crowd-grades.ts'
import { newUuidV7, runJpsHandler } from './jps.ts'
import { runCameraRetention } from './camera.ts'
import { ensureResponsesSheetId, runCreateWindowForm, runOptinSubmit } from './optin-form.ts'
import { columnsOf } from './schema.ts'
import { runSweep, verifyLedgerChain } from './sweep.ts'
import { triggerRegistry } from './registry.ts'
import { handleGet, handlePost } from './router.ts'
import { getRoutes, postRoutes } from './routes.ts'
import { runSetup } from './setup.ts'
import { executeEvaluationTick } from './tick.ts'
import { recordWeekndForecasts, runCrowdForecast } from './crowd-tick.ts'
import { runHistoryBuild } from './crowd-history.ts'
import { toMytIso } from '../../shared/time.ts'

export { runEvaluationTick } from './tick.ts'

// Stamped by the build: CI passes the commit SHA and PILOT_SCRIPT_ID; a local build passes its HEAD and no ID.
declare const __BUILD_SHA__: string
declare const __BUILD_TIME__: string
declare const __PILOT_SCRIPT_ID__: string

function json(value: unknown): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON)
}

function health() {
  const sheetId = getProperty('SHEET_ID')
  if (!sheetId) throw new Error('SHEET_ID is not set; run setup()')
  return buildHealth({
    stamp: { sha: __BUILD_SHA__, builtAt: __BUILD_TIME__ },
    now: new Date(),
    sources: readColumns(sheetId, 'sources', ['source_id', 'freshness', 'state', 'stale_after_min']),
    polls: readColumns(sheetId, 'polls', ['source_id', 'outcome', 'received_at'])
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
