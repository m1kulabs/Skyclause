import { describe, expect, test } from 'bun:test'
import type { ScriptProperty } from './properties.ts'
import { TABS, columnsOf, toRow, type Cell } from './schema.ts'
import {
  CROWD_CLAUSE_DEFAULTS,
  runSetup,
  type ClausesPort,
  type DrivePort,
  type PropertyPort,
  type WorkbookPort
} from './setup.ts'
import type { TriggerEntry, TriggerPort } from './triggers.ts'

interface FakeFolder {
  name: string
  parent: string | null
}
interface FakeSheet {
  name: string
  folder: string
  tabs: { name: string; rows: Cell[][] }[]
}

// In-memory Drive, Sheets, Script Properties and triggers that log every change.
function fakeWorkspace() {
  const changes: string[] = []
  const props = new Map<ScriptProperty, string>()
  const folders = new Map<string, FakeFolder>()
  const sheets = new Map<string, FakeSheet>()
  const triggers: string[] = []
  let next = 1
  const id = (prefix: string) => `${prefix}-${next++}`
  const childFolder = (parent: string | null, name: string) =>
    [...folders].find(([, folder]) => folder.parent === parent && folder.name === name)?.[0] ?? null
  const tab = (sheetId: string, name: string) => {
    const found = sheets.get(sheetId)?.tabs.find((candidate) => candidate.name === name)
    if (!found) throw new Error(`no tab ${name}`)
    return found
  }

  const properties: PropertyPort = {
    get: (name) => props.get(name) ?? null,
    set: (name, value) => {
      props.set(name, value)
      changes.push(`set ${name}`)
    }
  }
  const drive: DrivePort = {
    findRootFolder: (name) => childFolder(null, name),
    createRootFolder: (name) => {
      const folderId = id('folder')
      folders.set(folderId, { name, parent: null })
      changes.push(`create folder ${name}`)
      return folderId
    },
    findFolder: (parentId, name) => childFolder(parentId, name),
    createFolder: (parentId, name) => {
      const folderId = id('folder')
      folders.set(folderId, { name, parent: parentId })
      changes.push(`create folder ${name}`)
      return folderId
    },
    findSpreadsheet: (folderId, name) =>
      [...sheets].find(([, sheet]) => sheet.folder === folderId && sheet.name === name)?.[0] ?? null,
    createSpreadsheet: (folderId, name, firstTab) => {
      const sheetId = id('sheet')
      sheets.set(sheetId, { name, folder: folderId, tabs: [{ name: firstTab, rows: [] }] })
      changes.push(`create spreadsheet ${name}`)
      return sheetId
    }
  }
  const workbooks: WorkbookPort = {
    tabNames: (sheetId) => sheets.get(sheetId)?.tabs.map((candidate) => candidate.name) ?? [],
    addTab: (sheetId, name) => {
      sheets.get(sheetId)?.tabs.push({ name, rows: [] })
      changes.push(`add tab ${name}`)
    },
    header: (sheetId, name) => tab(sheetId, name).rows[0]?.map(String) ?? [],
    writeHeader: (sheetId, name, columns) => {
      tab(sheetId, name).rows[0] = [...columns]
      changes.push(`write header ${name}`)
    }
  }
  const triggerPort: TriggerPort = {
    list: () => [],
    createTime: (handler) => void triggers.push(handler),
    createSpreadsheet: (handler) => void triggers.push(handler),
    remove: () => {}
  }
  const clauses: ClausesPort = {
    packs: () => {
      for (const sheet of sheets.values()) {
        const clausesTab = sheet.tabs.find((candidate) => candidate.name === 'clauses')
        if (!clausesTab) continue
        const packIndex = columnsOf('clauses').indexOf('pack')
        return clausesTab.rows.slice(1).map((row) => String(row[packIndex] ?? ''))
      }
      return []
    },
    append: (rows) => {
      // The live workbook only: SHEET_ID is ensured before setup seeds the defaults.
      const clausesTab = sheets.get(props.get('SHEET_ID') ?? '')?.tabs.find((candidate) => candidate.name === 'clauses')
      if (!clausesTab) throw new Error('no clauses tab on the live workbook')
      const columns = columnsOf('clauses')
      for (const row of rows) {
        clausesTab.rows.push(columns.map((column) => (row[column] ?? '') as string))
      }
      changes.push(`append ${rows.length} clauses rows`)
    }
  }
  const path = (folderId: string | undefined): string => {
    const folder = folderId === undefined ? undefined : folders.get(folderId)
    if (!folder) return ''
    return folder.parent === null ? folder.name : `${path(folder.parent)}/${folder.name}`
  }
  return { changes, props, folders, sheets, triggers, properties, drive, workbooks, clauses, triggerPort, path }
}

const DEV = '1devScriptId'
const PILOT = '1pilotScriptId'
const registry: TriggerEntry[] = [{ kind: 'time', handler: 'pollJpsGauge', every: { minutes: 5 } }]

function setup(workspace: ReturnType<typeof fakeWorkspace>, scriptId = DEV) {
  const { properties, drive, workbooks, clauses, triggerPort } = workspace
  return runSetup({
    properties,
    drive,
    workbooks,
    clauses,
    triggers: triggerPort,
    scriptId,
    pilotScriptId: PILOT,
    registry
  })
}

const schema = TABS.map((entry) => ({ name: entry.name, rows: [[...entry.columns]] }))

// The live workbook carries the six seeded Crowd clause rows below the header;
// the replay workbook keeps headers only.
const liveSchema = TABS.map((entry) => ({
  name: entry.name,
  rows:
    entry.name === 'clauses'
      ? [[...entry.columns], ...CROWD_CLAUSE_DEFAULTS.map((row) => toRow('clauses', row))]
      : [[...entry.columns]]
}))

describe('runSetup', () => {
  test('creates the folder tree, both workbooks with header rows only, and the camera defaults', () => {
    const workspace = fakeWorkspace()
    setup(workspace)
    const { props, path, sheets } = workspace

    const shown = [...props].map(([name, value]) => [name, name.endsWith('FOLDER_ID') ? path(value) : value])
    expect(Object.fromEntries(shown)).toEqual({
      ROOT_FOLDER_ID: 'Skyclause pilot',
      CROSSINGS_SKY_FOLDER_ID: 'Skyclause pilot/crossings/sky',
      CROSSINGS_CROWD_FOLDER_ID: 'Skyclause pilot/crossings/crowd',
      CROSSINGS_REPLAY_FOLDER_ID: 'Skyclause pilot/crossings-replay/sky',
      FRAMES_FOLDER_ID: 'Skyclause pilot/frames',
      RAW_FOLDER_ID: 'Skyclause pilot/raw/met',
      GRADES_FOLDER_ID: 'Skyclause pilot/grades/crowd',
      LISTINGS_FOLDER_ID: 'Skyclause pilot/listings',
      SHEET_ID: expect.any(String),
      REPLAY_SHEET_ID: expect.any(String),
      CAMERA_DAY_START: '07:15',
      CAMERA_DAY_END: '19:00'
    })
    for (const [property, name] of [
      ['SHEET_ID', 'Skyclause pilot'],
      ['REPLAY_SHEET_ID', 'Skyclause replay']
    ] as const) {
      const sheet = sheets.get(props.get(property) ?? '')
      expect(sheet?.name).toBe(name)
      expect(path(sheet?.folder)).toBe('Skyclause pilot')
      expect(sheet?.tabs).toEqual(name === 'Skyclause pilot' ? liveSchema : schema)
    }
  })

  test('changes nothing on a second run', () => {
    const workspace = fakeWorkspace()
    setup(workspace)
    workspace.changes.length = 0
    setup(workspace)
    expect(workspace.changes).toEqual([])
  })

  test('adopts an existing folder and workbook by name and never writes below the header', () => {
    const workspace = fakeWorkspace()
    const rootId = workspace.drive.createRootFolder('Skyclause pilot')
    const sheetId = workspace.drive.createSpreadsheet(rootId, 'Skyclause pilot', 'sources')
    const sources = workspace.sheets.get(sheetId)?.tabs[0]
    const sourcesRow = ['0232901RF', 'jps_rain', 'Sg. Kuyoh di LRT Bukit Jalil', '5', '10']
    sources?.rows.push([...(TABS[0]?.columns ?? [])], sourcesRow)
    workspace.changes.length = 0

    const report = setup(workspace)
    expect(workspace.props.get('ROOT_FOLDER_ID')).toBe(rootId)
    expect(workspace.props.get('SHEET_ID')).toBe(sheetId)
    expect(workspace.changes.filter((change) => change.startsWith('create'))).not.toContain(
      'create folder Skyclause pilot'
    )
    expect(report.headersWritten).not.toContain('Skyclause pilot/sources')
    expect(report.headersWritten).toContain('Skyclause pilot/polls')
    expect(sources?.rows[1]).toEqual(sourcesRow)
    for (const [id, sheet] of workspace.sheets) {
      for (const { name, rows } of sheet.tabs) {
        // The adopted sources row and the live workbook's six seeded Crowd clause rows
        // survive below their headers; the replay workbook keeps headers only.
        const expected = id === sheetId && name === 'sources' ? 2 : id === sheetId && name === 'clauses' ? 7 : 1
        expect(rows.length, `${sheet.name}/${name}`).toBe(expected)
      }
    }
  })

  test('keeps an ID that is already set', () => {
    const workspace = fakeWorkspace()
    setup(workspace)
    const sheetId = workspace.props.get('SHEET_ID')
    workspace.props.delete('ROOT_FOLDER_ID')
    workspace.changes.length = 0
    setup(workspace)
    expect(workspace.changes).toEqual(['set ROOT_FOLDER_ID'])
    expect(workspace.props.get('SHEET_ID')).toBe(sheetId)
  })

  test('stops on a header that differs from the schema', () => {
    const workspace = fakeWorkspace()
    setup(workspace)
    const sheet = workspace.sheets.get(workspace.props.get('SHEET_ID') ?? '')
    const polls = sheet?.tabs.find((candidate) => candidate.name === 'polls')
    if (polls) polls.rows[0] = ['poll_id', 'source_id', 'source_kind']
    expect(() => setup(workspace)).toThrow('polls header differs from the schema')
  })

  test('installs the trigger registry on the stamped pilot only', () => {
    const dev = fakeWorkspace()
    expect(setup(dev, DEV).triggers.pilot).toBe(false)
    expect(dev.triggers).toEqual([])

    const pilot = fakeWorkspace()
    expect(setup(pilot, PILOT).triggers.pilot).toBe(true)
    expect(pilot.triggers).toEqual(['pollJpsGauge'])
  })

  test('seeds the six PRD Crowd clause rows once', () => {
    const workspace = fakeWorkspace()
    const first = setup(workspace)
    expect(first.crowdClausesSeeded).toBe(true)
    expect(CROWD_CLAUSE_DEFAULTS).toHaveLength(6)
    expect(CROWD_CLAUSE_DEFAULTS.map((row) => row.key)).toEqual([
      'surge_night',
      'arrival_clash',
      'exit_clash',
      'after_last_shuttle',
      'single_source_listing',
      'silent_input'
    ])
    expect(CROWD_CLAUSE_DEFAULTS.every((row) => row.pack === 'crowd' && row.enabled === true)).toBe(true)
    const surge = CROWD_CLAUSE_DEFAULTS.find((row) => row.key === 'surge_night')!
    expect(surge.requires).toBe('site.night.uplift')
    expect(surge.op).toBe('>=')
    expect(surge.threshold).toBe(5000)
    // "Fires when (default)" and "Proposes" are verbatim PRD text.
    expect(surge['Fires when (default)']).toBe('Forecast at least 5,000 exits above baseline')
    expect(surge.Proposes).toBe('Surge night; an entry on the conditions calendar')
    expect(CROWD_CLAUSE_DEFAULTS.find((row) => row.key === 'arrival_clash')!['Fires when (default)']).toBe(
      'A window ends inside the arrival period'
    )
    expect(CROWD_CLAUSE_DEFAULTS.find((row) => row.key === 'arrival_clash')!.Proposes).toBe(
      'Shift the end out of the arrival period, or leave before doors'
    )
    expect(CROWD_CLAUSE_DEFAULTS.find((row) => row.key === 'exit_clash')!['Fires when (default)']).toBe(
      'A window ends inside the exit period'
    )
    expect(CROWD_CLAUSE_DEFAULTS.find((row) => row.key === 'exit_clash')!.Proposes).toBe(
      'Shift the end out of the exit period, or keep with an advisory'
    )
    expect(CROWD_CLAUSE_DEFAULTS.find((row) => row.key === 'after_last_shuttle')!['Fires when (default)']).toBe(
      'A window ends after 19:15, when the next runs are 20:45 and 21:45 with limited space'
    )
    expect(CROWD_CLAUSE_DEFAULTS.find((row) => row.key === 'after_last_shuttle')!.Proposes).toBe(
      'Ask the shuttle desk for a run'
    )
    expect(CROWD_CLAUSE_DEFAULTS.find((row) => row.key === 'single_source_listing')!['Fires when (default)']).toBe(
      'A listing comes from one undocumented source only'
    )
    expect(CROWD_CLAUSE_DEFAULTS.find((row) => row.key === 'single_source_listing')!.Proposes).toBe(
      'Flag it in the bundle; the approver confirms'
    )
    expect(CROWD_CLAUSE_DEFAULTS.find((row) => row.key === 'silent_input')!['Fires when (default)']).toBe(
      'A Crowd input has no reading for two intervals, or an error row (added for No call)'
    )
    expect(CROWD_CLAUSE_DEFAULTS.find((row) => row.key === 'silent_input')!.Proposes).toBe(
      'No call for clauses needing it'
    )

    workspace.changes.length = 0
    const second = setup(workspace)
    expect(second.crowdClausesSeeded).toBe(false)
    expect(workspace.changes).toEqual([])
  })

  test('leaves existing Crowd clause rows alone', () => {
    const workspace = fakeWorkspace()
    setup(workspace)
    workspace.changes.length = 0
    const report = setup(workspace)
    expect(report.crowdClausesSeeded).toBe(false)
  })
})
