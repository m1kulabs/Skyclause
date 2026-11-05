// Apps Script entry points. The build turns every function exported here into a top-level function in dist/Code.js,
// so trigger handlers, doGet, doPost and functions run by hand in the editor must be exported from this file.
import { getProperty, properties, drive, readColumns, triggers, withLock, workbooks } from './gas.ts'
import { buildHealth } from './health.ts'
import { triggerRegistry } from './registry.ts'
import { handleGet, handlePost } from './router.ts'
import { getRoutes, postRoutes } from './routes.ts'
import { runSetup } from './setup.ts'

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
    sources: readColumns(sheetId, 'sources', ['source_id', 'state', 'stale_after_min']),
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

// Run once in the editor per project: it grants the manifest's scopes and makes the folders, workbooks and tabs.
// Only the script whose ID CI stamped gets triggers.
export function setup() {
  const report = runSetup({
    properties,
    drive,
    workbooks,
    triggers,
    scriptId: ScriptApp.getScriptId(),
    pilotScriptId: __PILOT_SCRIPT_ID__,
    registry: triggerRegistry
  })
  console.log(JSON.stringify(report, null, 2))
}
