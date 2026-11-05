import type { GetProperty, ScriptProperty } from './properties.ts'

// Apps Script's limit per user per script.
export const MAX_TRIGGERS = 20

export type Cadence =
  { minutes: 1 | 5 | 10 | 15 | 30 } | { hours: 1 | 2 | 4 | 6 | 8 | 12 } | { atHour: number; nearMinute: number }

export type SpreadsheetEvent = 'on_form_submit' | 'on_edit'

// One registry line: a top-level handler and when it runs. Event triggers name the Script Property holding their
// spreadsheet's ID.
export type TriggerEntry =
  | { kind: 'time'; handler: string; every: Cadence }
  | { kind: SpreadsheetEvent; handler: string; spreadsheet: ScriptProperty }

// What Apps Script tells us about an installed trigger. It can't tell a time trigger's cadence.
export interface InstalledTrigger {
  id: string
  handler: string
  kind: 'time' | SpreadsheetEvent | 'other'
  sourceId: string | null
}

export interface TriggerPort {
  list(): InstalledTrigger[]
  createTime(handler: string, every: Cadence): void
  createSpreadsheet(handler: string, kind: SpreadsheetEvent, spreadsheetId: string): void
  remove(id: string): void
}

export interface SyncResult {
  pilot: boolean
  created: string[]
  removed: string[]
  skipped: string[]
}

// Installs the registry only in the script whose ID CI stamped into the build; anywhere else it touches nothing.
// Time triggers end up exactly the registry's: a handler whose count of time triggers already matches keeps them,
// any other handler's are removed and recreated. Event triggers are added when missing and never removed.
export function syncTriggers(
  registry: TriggerEntry[],
  port: TriggerPort,
  { scriptId, pilotScriptId, getProperty }: { scriptId: string; pilotScriptId: string; getProperty: GetProperty }
): SyncResult {
  const result: SyncResult = { pilot: false, created: [], removed: [], skipped: [] }
  if (!pilotScriptId || scriptId !== pilotScriptId) return result
  if (registry.length > MAX_TRIGGERS) {
    throw new Error(`the trigger registry has ${registry.length} entries; Apps Script allows ${MAX_TRIGGERS}`)
  }
  result.pilot = true
  const installed = port.list()

  const wanted = new Map<string, Cadence[]>()
  for (const entry of registry) {
    if (entry.kind === 'time') wanted.set(entry.handler, [...(wanted.get(entry.handler) ?? []), entry.every])
  }
  const timeTriggers = installed.filter((trigger) => trigger.kind === 'time')
  const handlers = new Set([...wanted.keys(), ...timeTriggers.map((trigger) => trigger.handler)])
  for (const handler of handlers) {
    const current = timeTriggers.filter((trigger) => trigger.handler === handler)
    const cadences = wanted.get(handler) ?? []
    if (current.length === cadences.length) continue
    for (const trigger of current) {
      port.remove(trigger.id)
      result.removed.push(handler)
    }
    for (const every of cadences) {
      port.createTime(handler, every)
      result.created.push(handler)
    }
  }

  for (const entry of registry) {
    if (entry.kind === 'time') continue
    const spreadsheetId = getProperty(entry.spreadsheet)
    if (!spreadsheetId) {
      result.skipped.push(`${entry.handler}: ${entry.spreadsheet} is not set`)
      continue
    }
    const present = installed.some(
      (trigger) =>
        trigger.handler === entry.handler && trigger.kind === entry.kind && trigger.sourceId === spreadsheetId
    )
    if (present) continue
    port.createSpreadsheet(entry.handler, entry.kind, spreadsheetId)
    result.created.push(entry.handler)
  }
  return result
}
