import { describe, expect, test } from 'bun:test'
import type { ScriptProperty } from './properties.ts'
import { TABS } from './schema.ts'
import { runSetup, type DrivePort, type PropertyPort, type WorkbookPort } from './setup.ts'
import type { TriggerEntry, TriggerPort } from './triggers.ts'

interface FakeFolder {
  name: string
  parent: string | null
}
interface FakeSheet {
  name: string
  folder: string
  tabs: { name: string; rows: string[][] }[]
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
    header: (sheetId, name) => tab(sheetId, name).rows[0] ?? [],
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
  const path = (folderId: string | undefined): string => {
    const folder = folderId === undefined ? undefined : folders.get(folderId)
    if (!folder) return ''
    return folder.parent === null ? folder.name : `${path(folder.parent)}/${folder.name}`
  }
  return { changes, props, folders, sheets, triggers, properties, drive, workbooks, triggerPort, path }
}

const DEV = '1devScriptId'
const PILOT = '1pilotScriptId'
const registry: TriggerEntry[] = [{ kind: 'time', handler: 'pollJpsGauge', every: { minutes: 5 } }]

function setup(workspace: ReturnType<typeof fakeWorkspace>, scriptId = DEV) {
  const { properties, drive, workbooks, triggerPort } = workspace
  return runSetup({ properties, drive, workbooks, triggers: triggerPort, scriptId, pilotScriptId: PILOT, registry })
}

const schema = TABS.map((entry) => ({ name: entry.name, rows: [[...entry.columns]] }))

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
      expect(sheet?.tabs).toEqual(schema)
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
        expect(rows.length, `${sheet.name}/${name}`).toBe(id === sheetId && name === 'sources' ? 2 : 1)
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
})
