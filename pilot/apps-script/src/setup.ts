import type { ScriptProperty } from './properties.ts'
import { TABS, type Row } from './schema.ts'
import { syncTriggers, type SyncResult, type TriggerEntry, type TriggerPort } from './triggers.ts'

export interface PropertyPort {
  get(name: ScriptProperty): string | null
  set(name: ScriptProperty, value: string): void
}

// Folders and spreadsheets in the running account's My Drive, found by name or created.
export interface DrivePort {
  findRootFolder(name: string): string | null
  createRootFolder(name: string): string
  findFolder(parentId: string, name: string): string | null
  createFolder(parentId: string, name: string): string
  findSpreadsheet(folderId: string, name: string): string | null
  // A new spreadsheet in the folder whose only tab is named `firstTab`.
  createSpreadsheet(folderId: string, name: string, firstTab: string): string
}

export interface WorkbookPort {
  tabNames(spreadsheetId: string): string[]
  addTab(spreadsheetId: string, name: string): void
  // Row 1 without trailing blanks; empty for an empty tab.
  header(spreadsheetId: string, tab: string): string[]
  writeHeader(spreadsheetId: string, tab: string, columns: readonly string[]): void
}

export interface SetupPorts {
  properties: PropertyPort
  drive: DrivePort
  workbooks: WorkbookPort
  clauses: ClausesPort
  triggers: TriggerPort
  scriptId: string
  pilotScriptId: string
  registry: TriggerEntry[]
}

// What setup reads and writes on the `clauses` tab: only the pack column to check
// for existing Crowd rows, and the six default rows when none exist.
export interface ClausesPort {
  packs(): string[]
  append(rows: Row<'clauses'>[]): void
}

// The six PRD Crowd clause rows (#69). "Fires when (default)" and "Proposes" are
// verbatim PRD text; wording_en repeats Proposes until the wording pass.
export const CROWD_CLAUSE_DEFAULTS: Row<'clauses'>[] = [
  {
    pack: 'crowd',
    Clause: 'Surge night',
    Reads: 'site.night.uplift',
    'Fires when (default)': 'Forecast at least 5,000 exits above baseline',
    Proposes: 'Surge night; an entry on the conditions calendar',
    key: 'surge_night',
    requires: 'site.night.uplift',
    span_from: '',
    span_to: '',
    threshold: 5000,
    op: '>=',
    proposes_key: 'surge_night',
    rank: '',
    wording_en: 'Surge night; an entry on the conditions calendar',
    enabled: true
  },
  {
    pack: 'crowd',
    Clause: 'Arrival clash',
    Reads: 'window end, arrival period',
    'Fires when (default)': 'A window ends inside the arrival period',
    Proposes: 'Shift the end out of the arrival period, or leave before doors',
    key: 'arrival_clash',
    requires: 'window_end',
    span_from: '',
    span_to: '',
    threshold: '',
    op: '',
    proposes_key: 'shift_end',
    rank: '',
    wording_en: 'Shift the end out of the arrival period, or leave before doors',
    enabled: true
  },
  {
    pack: 'crowd',
    Clause: 'Exit clash',
    Reads: 'window end, exit period',
    'Fires when (default)': 'A window ends inside the exit period',
    Proposes: 'Shift the end out of the exit period, or keep with an advisory',
    key: 'exit_clash',
    requires: 'window_end',
    span_from: '',
    span_to: '',
    threshold: '',
    op: '',
    proposes_key: 'shift_end',
    rank: '',
    wording_en: 'Shift the end out of the exit period, or keep with an advisory',
    enabled: true
  },
  {
    pack: 'crowd',
    Clause: 'After the last shuttle',
    Reads: 'window end',
    'Fires when (default)': 'A window ends after 19:15, when the next runs are 20:45 and 21:45 with limited space',
    Proposes: 'Ask the shuttle desk for a run',
    key: 'after_last_shuttle',
    requires: 'window_end',
    span_from: '',
    span_to: '',
    threshold: '',
    op: '',
    proposes_key: 'ask_shuttle',
    rank: '',
    wording_en: 'Ask the shuttle desk for a run',
    enabled: true
  },
  {
    pack: 'crowd',
    Clause: 'Single-source listing',
    Reads: 'listing sources',
    'Fires when (default)': 'A listing comes from one undocumented source only',
    Proposes: 'Flag it in the bundle; the approver confirms',
    key: 'single_source_listing',
    requires: 'single_source',
    span_from: '',
    span_to: '',
    threshold: '',
    op: '',
    proposes_key: 'keep_with_advisory',
    rank: '',
    wording_en: 'Flag it in the bundle; the approver confirms',
    enabled: true
  },
  {
    pack: 'crowd',
    Clause: 'Silent input',
    Reads: 'rapidrail_od',
    'Fires when (default)': 'A Crowd input has no reading for two intervals, or an error row (added for No call)',
    Proposes: 'No call for clauses needing it',
    key: 'silent_input',
    requires: 'rapidrail_od',
    span_from: '',
    span_to: '',
    threshold: '',
    op: '',
    proposes_key: '',
    rank: '',
    wording_en: 'No call for clauses needing it',
    enabled: true
  }
]

const ROOT_FOLDER = 'Skyclause pilot'

// The #47 spec "Drive layout"; `frames/{yyyy-MM-dd}/` folders are made by ingest.
const FOLDERS: [ScriptProperty, string[]][] = [
  ['CROSSINGS_SKY_FOLDER_ID', ['crossings', 'sky']],
  ['CROSSINGS_CROWD_FOLDER_ID', ['crossings', 'crowd']],
  ['CROSSINGS_REPLAY_FOLDER_ID', ['crossings-replay', 'sky']],
  ['FRAMES_FOLDER_ID', ['frames']],
  ['RAW_FOLDER_ID', ['raw', 'met']],
  ['GRADES_FOLDER_ID', ['grades', 'crowd']],
  ['LISTINGS_FOLDER_ID', ['listings']]
]

// The live workbook and the replay workbook share one schema (#47 spec "Replays").
const WORKBOOKS: [ScriptProperty, string][] = [
  ['SHEET_ID', 'Skyclause pilot'],
  ['REPLAY_SHEET_ID', 'Skyclause replay']
]

const DEFAULTS: [ScriptProperty, string][] = [
  ['CAMERA_DAY_START', '07:15'],
  ['CAMERA_DAY_END', '19:00']
]

export interface SetupReport {
  stored: ScriptProperty[]
  headersWritten: string[]
  crowdClausesSeeded: boolean
  triggers: SyncResult
}

// Idempotent: every ID still unset is found by name or created and stored, every missing tab and header row is
// written, the Crowd clause defaults go in once, and nothing else. It writes no other data rows.
// Triggers go in only on the stamped pilot script.
export function runSetup(ports: SetupPorts): SetupReport {
  const { properties, drive, workbooks } = ports
  const stored: ScriptProperty[] = []
  const headersWritten: string[] = []
  const ensure = (name: ScriptProperty, make: () => string): string => {
    const existing = properties.get(name)
    if (existing) return existing
    const value = make()
    properties.set(name, value)
    stored.push(name)
    return value
  }

  const root = ensure('ROOT_FOLDER_ID', () => drive.findRootFolder(ROOT_FOLDER) ?? drive.createRootFolder(ROOT_FOLDER))
  for (const [name, path] of FOLDERS) {
    ensure(name, () =>
      path.reduce((parent, folder) => drive.findFolder(parent, folder) ?? drive.createFolder(parent, folder), root)
    )
  }

  const firstTab = TABS[0].name
  for (const [name, title] of WORKBOOKS) {
    const sheetId = ensure(
      name,
      () => drive.findSpreadsheet(root, title) ?? drive.createSpreadsheet(root, title, firstTab)
    )
    const present = workbooks.tabNames(sheetId)
    for (const tab of TABS) {
      if (!present.includes(tab.name)) workbooks.addTab(sheetId, tab.name)
      const header = workbooks.header(sheetId, tab.name)
      if (header.length === 0) {
        workbooks.writeHeader(sheetId, tab.name, tab.columns)
        headersWritten.push(`${title}/${tab.name}`)
      } else if (header.join('\u0000') !== tab.columns.join('\u0000')) {
        throw new Error(`${tab.name} header differs from the schema in ${title}: ${header.join(', ')}`)
      }
    }
  }

  for (const [name, value] of DEFAULTS) ensure(name, () => value)

  const crowdClausesSeeded = !ports.clauses.packs().includes('crowd')
  if (crowdClausesSeeded) ports.clauses.append(CROWD_CLAUSE_DEFAULTS)

  const triggers = syncTriggers(ports.registry, ports.triggers, {
    scriptId: ports.scriptId,
    pilotScriptId: ports.pilotScriptId,
    getProperty: (name) => properties.get(name)
  })
  return { stored, headersWritten, crowdClausesSeeded, triggers }
}
