import type { TriggerEntry } from './triggers.ts'

// Every trigger `setup()` installs on the pilot. Feature tickets add one line each; each handler must also be
// exported from main.ts so the build makes it a top-level function. Apps Script can't read a trigger's cadence, so
// changing the cadence of a handler that keeps its number of lines takes a manual delete of its old trigger.
export const triggerRegistry: TriggerEntry[] = [
  { kind: 'time', handler: 'pollEvidenceInbox', every: { minutes: 1 } },
  { kind: 'time', handler: 'runAuditor', every: { minutes: 5 } },
  { kind: 'time', handler: 'pollJps', every: { minutes: 5 } },
  { kind: 'time', handler: 'pollApims', every: { minutes: 15 } },
  { kind: 'time', handler: 'pollMetWarnings', every: { minutes: 10 } },
  { kind: 'time', handler: 'pollMetForecast', every: { hours: 6 } },
  { kind: 'time', handler: 'retainCameraFrames', every: { atHour: 3, nearMinute: 0 } },
  { kind: 'on_form_submit', handler: 'onWindowFormSubmit', spreadsheet: 'RESPONSES_SHEET_ID' },
  { kind: 'time', handler: 'sweep', every: { minutes: 5 } },
  { kind: 'time', handler: 'forecastCrowd', every: { hours: 1 } },
  { kind: 'time', handler: 'gradeCrowd', every: { minutes: 30 } },
  { kind: 'time', handler: 'gradeSky', every: { atHour: 23, nearMinute: 55 } },
  { kind: 'time', handler: 'gradeSky', every: { atHour: 6, nearMinute: 0 } },
  { kind: 'on_edit', handler: 'on_edit_clauses', spreadsheet: 'SHEET_ID' }
]
