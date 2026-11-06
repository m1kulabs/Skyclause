import type { TriggerEntry } from './triggers.ts'

// Every trigger `setup()` installs on the pilot. Feature tickets add one line each; each handler must also be
// exported from main.ts so the build makes it a top-level function. Apps Script can't read a trigger's cadence, so
// changing the cadence of a handler that keeps its number of lines takes a manual delete of its old trigger.
export const triggerRegistry: TriggerEntry[] = [{ kind: 'time', handler: 'pollJps', every: { minutes: 5 } }]
