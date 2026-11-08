import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { build } from '../build.ts'
import * as gas from './gas.ts'
import { runCrowdForecast } from './crowd-tick.ts'
import { computeSkySnapshot } from './indicators.ts'
import type { ScriptProperty } from './properties.ts'
import { triggerRegistry } from './registry.ts'
import type { Row } from './schema.ts'
import { runSkyClauseTick, type SkyClauseRuntimePorts } from './sky-runtime.ts'
import {
  MAX_TRIGGERS,
  syncTriggers,
  type Cadence,
  type InstalledTrigger,
  type SpreadsheetEvent,
  type TriggerPort
} from './triggers.ts'

type SkyClauseRuntimePortsFactory = (spreadsheetId: string, crossingFolderId: string) => SkyClauseRuntimePorts

function getRuntimePortsFactory(): SkyClauseRuntimePortsFactory {
  const candidate = (gas as Record<string, unknown>).skyClauseRuntimePorts
  expect(typeof candidate).toBe('function')
  return candidate as SkyClauseRuntimePortsFactory
}

describe('Sky clause runtime integration (#55)', () => {
  test('live factories defer new native reads and allocate distinct IDs in both serial pack orders', () => {
    const originals = new Map(
      ['DriveApp', 'PropertiesService'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
    )
    const propertyReads: string[] = []
    const folderReads: string[] = []
    const folders = new Map<string, { name: string; text: string }[]>([
      ['sky', []],
      ['crowd', []]
    ])
    const props: Record<string, string> = {
      CROSSINGS_SKY_FOLDER_ID: 'sky',
      CROSSINGS_CROWD_FOLDER_ID: 'crowd',
      CROSSINGS_REPLAY_FOLDER_ID: 'replay-must-not-be-read'
    }
    Object.defineProperty(globalThis, 'PropertiesService', {
      configurable: true,
      value: {
        getScriptProperties: () => ({
          getProperty: (key: string) => {
            propertyReads.push(key)
            return props[key] ?? null
          }
        })
      }
    })
    Object.defineProperty(globalThis, 'DriveApp', {
      configurable: true,
      value: {
        getFolderById: (id: string) => {
          folderReads.push(id)
          const entries = folders.get(id)
          if (!entries) throw new Error(`Unexpected folder: ${id}`)
          return {
            getFiles: () => {
              let index = 0
              return {
                hasNext: () => index < entries.length,
                next: () => {
                  const file = entries[index++]!
                  return {
                    isTrashed: () => false,
                    getId: () => file.name,
                    getName: () => file.name,
                    getBlob: () => ({ getDataAsString: () => file.text })
                  }
                }
              }
            },
            createFile: (name: string, text: string) => entries.push({ name, text })
          }
        }
      }
    })
    try {
      const sky = gas.skyClauseRuntimePorts('sheet', 'sky')
      expect(propertyReads).toEqual([])
      const crowd = gas.crowdForecastStore('sheet')
      expect(propertyReads).toEqual(['CROSSINGS_CROWD_FOLDER_ID'])
      expect(folderReads).toEqual([])
      folders
        .get('crowd')!
        .push({ name: 'crossing-20261102-1505-01.json', text: '{"crossing_id":"X-20261102-1505-03"}' })
      expect([...sky.reservedCrossingNames()].sort()).toEqual([
        'crossing-20261102-1505-01.json',
        'crossing-20261102-1505-03.json'
      ])
      folders.get('sky')!.push({ name: 'crossing-20261102-1505-02.json', text: '{"crossing_id":"X-20261102-1505-04"}' })
      expect([...crowd.reservedCrossingNames()].sort()).toEqual([
        'crossing-20261102-1505-02.json',
        'crossing-20261102-1505-04.json'
      ])

      const tEval = '2026-11-02T15:05:00+08:00'
      for (const order of ['sky-first', 'crowd-first']) {
        folders.set('sky', [])
        folders.set('crowd', [])
        const liveSky = gas.skyClauseRuntimePorts('sheet', 'sky')
        const tables = { clauses: [], clause_versions: [], ledger: [], shadow_state: [], shadow: [] } as {
          [T in 'clauses' | 'clause_versions' | 'ledger' | 'shadow_state' | 'shadow']: Row<T>[]
        }
        liveSky.sha256 = (text) => createHash('sha256').update(text).digest('hex')
        liveSky.store = {
          readRows: (tab) => tables[tab],
          appendRows: (tab, rows) => {
            ;(tables[tab] as Row<typeof tab>[]).push(...rows)
          },
          replaceRows: (tab, rows) => {
            tables[tab] = [...rows]
          }
        }
        const liveCrowd = gas.crowdForecastStore('sheet')
        Object.assign(liveCrowd, {
          readReadings: () => [],
          readPolls: () => [],
          readHistory: () => [],
          readForecasts: () => [],
          readClauses: () => [],
          readListings: () => [
            {
              listing_id: 'L-integration',
              night_date: '2026-11-03',
              state: 'listed',
              class: 'other',
              doors_myt: '18:00',
              show_myt: '20:00'
            }
          ],
          appendForecast: () => {},
          replaceCrowdShadow: () => {}
        })
        const runSky = () =>
          runSkyClauseTick(
            {
              tEval,
              recordedAt: tEval,
              editor: null,
              windows: [],
              snapshot: computeSkySnapshot({
                tEval,
                sources: [],
                readings: [],
                polls: [],
                warnings: [],
                forecast: [],
                windows: [],
                daylight: { start: '07:15', end: '19:00' }
              })
            },
            liveSky
          )
        const runCrowd = () => runCrowdForecast(liveCrowd, new Date(tEval))
        if (order === 'sky-first') {
          runSky()
          runCrowd()
        } else {
          runCrowd()
          runSky()
        }
        const skyDocument = JSON.parse(folders.get('sky')![0]!.text)
        const crowdDocument = JSON.parse(folders.get('crowd')![0]!.text)
        expect(skyDocument.crossing_id).toBe(`X-20261102-1505-${order === 'sky-first' ? '01' : '02'}`)
        expect(crowdDocument.crossing_id).toBe(`X-20261102-1505-${order === 'sky-first' ? '02' : '01'}`)
        expect(crowdDocument.changes[0].from).toBe('normal')
      }
      props.CROSSINGS_CROWD_FOLDER_ID = 'sky'
      expect(() => sky.reservedCrossingNames()).toThrow(/separate/i)
      props.CROSSINGS_CROWD_FOLDER_ID = 'unreadable'
      expect(() => sky.reservedCrossingNames()).toThrow('Unexpected folder: unreadable')
      props.CROSSINGS_CROWD_FOLDER_ID = 'crowd'
      props.CROSSINGS_SKY_FOLDER_ID = 'crowd'
      expect(() => crowd.reservedCrossingNames()).toThrow(/separate/i)
      props.CROSSINGS_SKY_FOLDER_ID = 'unreadable'
      expect(() => crowd.reservedCrossingNames()).toThrow('Unexpected folder: unreadable')
      expect(propertyReads).not.toContain('CROSSINGS_REPLAY_FOLDER_ID')
      expect(folderReads).not.toContain('replay-must-not-be-read')
    } finally {
      for (const [key, original] of originals) {
        if (original) Object.defineProperty(globalThis, key, original)
        else delete (globalThis as Record<string, unknown>)[key]
      }
    }
  })

  test('triggerRegistry includes on_edit_clauses and pollJps within MAX_TRIGGERS, and syncTriggers honors pilot/dev guard', () => {
    expect(triggerRegistry.length).toBeLessThanOrEqual(MAX_TRIGGERS)
    expect(triggerRegistry).toContainEqual({
      kind: 'time',
      handler: 'pollJps',
      every: { minutes: 5 }
    })
    expect(triggerRegistry).toContainEqual({
      kind: 'on_edit',
      handler: 'on_edit_clauses',
      spreadsheet: 'SHEET_ID'
    })

    const installed: InstalledTrigger[] = []
    const createdTime: Array<{ handler: string; every: Cadence }> = []
    const createdSpreadsheet: Array<{ handler: string; kind: SpreadsheetEvent; spreadsheetId: string }> = []
    const removedIds: string[] = []

    const port: TriggerPort = {
      list: () => installed.map((t) => ({ ...t })),
      createTime: (handler, every) => {
        createdTime.push({ handler, every })
        installed.push({
          id: `time-${installed.length + 1}`,
          handler,
          kind: 'time',
          sourceId: null
        })
      },
      createSpreadsheet: (handler, kind, spreadsheetId) => {
        createdSpreadsheet.push({ handler, kind, spreadsheetId })
        installed.push({
          id: `sheet-${installed.length + 1}`,
          handler,
          kind,
          sourceId: spreadsheetId
        })
      },
      remove: (id) => {
        removedIds.push(id)
        const idx = installed.findIndex((t) => t.id === id)
        if (idx >= 0) installed.splice(idx, 1)
      }
    }

    const getProperty = (name: ScriptProperty): string | null => (name === 'SHEET_ID' ? 'sheet-pilot-01' : null)

    const devResult = syncTriggers(triggerRegistry, port, {
      scriptId: 'dev-script-id',
      pilotScriptId: 'pilot-script-id',
      getProperty
    })
    expect(devResult).toEqual({
      pilot: false,
      created: [],
      removed: [],
      skipped: []
    })
    expect(createdTime).toHaveLength(0)
    expect(createdSpreadsheet).toHaveLength(0)

    const pilotResult = syncTriggers(triggerRegistry, port, {
      scriptId: 'pilot-script-id',
      pilotScriptId: 'pilot-script-id',
      getProperty
    })
    expect(pilotResult.pilot).toBe(true)
    expect(pilotResult.created).toEqual(expect.arrayContaining(['pollJps', 'on_edit_clauses']))
    expect(pilotResult.removed).toEqual([])
    expect(createdTime).toEqual(expect.arrayContaining([{ handler: 'pollJps', every: { minutes: 5 } }]))
    expect(createdSpreadsheet).toEqual(
      expect.arrayContaining([{ handler: 'on_edit_clauses', kind: 'on_edit', spreadsheetId: 'sheet-pilot-01' }])
    )
    expect(removedIds).toEqual([])
  })

  test('build() exports on_edit_clauses alongside the existing five entry-point functions', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'skyclause-build-test-'))
    try {
      const entryPoints = await build({
        outdir: tempDir,
        sha: '0123456789abcdef0123456789abcdef01234567',
        builtAt: '2026-11-02T15:05:00+08:00',
        pilotScriptId: 'pilot-script-id'
      })

      expect(entryPoints).toEqual(
        expect.arrayContaining(['doGet', 'doPost', 'pollJps', 'runEvaluationTick', 'setup', 'on_edit_clauses'])
      )
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('skyClauseRuntimePorts is lazy and canonicalJson orders keys lexicographically (10 before 2) with zero, false, null, nested objects, and Unicode', () => {
    const skyClauseRuntimePorts = getRuntimePortsFactory()
    const ports = skyClauseRuntimePorts('sheet-lazy-id', 'folder-lazy-id')

    const serialized = ports.canonicalJson({
      '2': 'two',
      '10': 'ten',
      z: null,
      a: {
        flag: false,
        count: 0,
        greeting: 'Amaran ribut petir — 暴雨 ⚡',
        list: [null, false, 0, { '2': 'b', '10': 'a' }]
      }
    })

    expect(serialized).toBe(
      '{"10":"ten","2":"two","a":{"count":0,"flag":false,"greeting":"Amaran ribut petir — 暴雨 ⚡","list":[null,false,0,{"10":"a","2":"b"}]},"z":null}'
    )
  })

  test('skyClauseRuntimePorts.sha256 converts signed Utilities digest bytes to lower-hex accurately', () => {
    const originalUtilities = Object.getOwnPropertyDescriptor(globalThis, 'Utilities')
    Object.defineProperty(globalThis, 'Utilities', {
      configurable: true,
      writable: true,
      value: {
        DigestAlgorithm: { SHA_256: 'SHA_256' },
        Charset: { UTF_8: 'UTF_8' },
        computeDigest(algorithm: unknown, input: string, charset: unknown = 'UTF_8'): number[] {
          if (algorithm !== 'SHA_256' || charset !== 'UTF_8') throw new Error('Unsupported digest or encoding')
          const digest = createHash('sha256').update(String(input), 'utf8').digest()
          return Array.from(digest, (byte) => (byte >= 128 ? byte - 256 : byte))
        }
      }
    })

    try {
      const skyClauseRuntimePorts = getRuntimePortsFactory()
      const ports = skyClauseRuntimePorts('sheet-hash-id', 'folder-hash-id')

      expect(ports.sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
      expect(ports.sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
      expect(ports.sha256('暴雨 ⚡')).toBe('a9c9a7b6c658efe2a6e76fdd6b1b3904d4fb550c5d66095f3600edd2dfe35a6f')
    } finally {
      if (originalUtilities) {
        Object.defineProperty(globalThis, 'Utilities', originalUtilities)
      } else {
        delete (globalThis as Record<string, unknown>).Utilities
      }
    }
  })
})

describe('Sky replay and crossing reader hardening (#55 Stage 5)', () => {
  test('main.runSkyReplay is parameterless and rejects identical live/replay sheet or folder IDs before SpreadsheetApp/DriveApp access', async () => {
    const main = (await import('./main.ts')) as Record<string, unknown>
    expect(typeof main.runSkyReplay).toBe('function')
    const runSkyReplay = main.runSkyReplay as () => unknown
    expect(runSkyReplay.length).toBe(0)

    const originalPropertiesService = Object.getOwnPropertyDescriptor(globalThis, 'PropertiesService')
    const originalLockService = Object.getOwnPropertyDescriptor(globalThis, 'LockService')
    const originalSpreadsheetApp = Object.getOwnPropertyDescriptor(globalThis, 'SpreadsheetApp')
    const originalDriveApp = Object.getOwnPropertyDescriptor(globalThis, 'DriveApp')

    let currentProps: Record<string, string> = {}
    let nativeAccessCount = 0

    Object.defineProperty(globalThis, 'PropertiesService', {
      configurable: true,
      writable: true,
      value: {
        getScriptProperties: () => ({
          getProperty: (key: string) => currentProps[key] ?? null,
          getProperties: () => ({ ...currentProps }),
          setProperty: (key: string, val: string) => {
            currentProps[key] = val
          }
        })
      }
    })

    Object.defineProperty(globalThis, 'LockService', {
      configurable: true,
      writable: true,
      value: {
        getScriptLock: () => ({
          waitLock: () => {},
          tryLock: () => true,
          releaseLock: () => {},
          hasLock: () => true
        })
      }
    })

    Object.defineProperty(globalThis, 'SpreadsheetApp', {
      configurable: true,
      writable: true,
      value: {
        openById: () => {
          nativeAccessCount += 1
          throw new Error('Unexpected SpreadsheetApp.openById access')
        }
      }
    })

    Object.defineProperty(globalThis, 'DriveApp', {
      configurable: true,
      writable: true,
      value: {
        getFolderById: () => {
          nativeAccessCount += 1
          throw new Error('Unexpected DriveApp.getFolderById access')
        }
      }
    })

    try {
      const collidingConfigs: Array<Record<string, string>> = [
        {
          SHEET_ID: 'sheet-same-id',
          REPLAY_SHEET_ID: 'sheet-same-id',
          CROSSINGS_SKY_FOLDER_ID: 'folder-sky-live',
          CROSSINGS_CROWD_FOLDER_ID: 'folder-crowd-live',
          CROSSINGS_REPLAY_FOLDER_ID: 'folder-replay-isolated',
          TEAM_ALERT_EMAILS: 'ops@example.com'
        },
        {
          SHEET_ID: 'sheet-live-id',
          REPLAY_SHEET_ID: 'sheet-replay-id',
          CROSSINGS_SKY_FOLDER_ID: 'folder-same-sky',
          CROSSINGS_CROWD_FOLDER_ID: 'folder-crowd-live',
          CROSSINGS_REPLAY_FOLDER_ID: 'folder-same-sky',
          TEAM_ALERT_EMAILS: 'ops@example.com'
        },
        {
          SHEET_ID: 'sheet-live-id',
          REPLAY_SHEET_ID: 'sheet-replay-id',
          CROSSINGS_SKY_FOLDER_ID: 'folder-sky-live',
          CROSSINGS_CROWD_FOLDER_ID: 'folder-same-crowd',
          CROSSINGS_REPLAY_FOLDER_ID: 'folder-same-crowd',
          TEAM_ALERT_EMAILS: 'ops@example.com'
        }
      ]

      for (const config of collidingConfigs) {
        currentProps = { ...config, CAMERA_DAY_START: '07:15', CAMERA_DAY_END: '19:00' }
        nativeAccessCount = 0
        expect(() => runSkyReplay()).toThrow(/replay storage must (?:be|stay) separate from live storage/i)
        expect(nativeAccessCount).toBe(0)
      }
    } finally {
      if (originalPropertiesService) {
        Object.defineProperty(globalThis, 'PropertiesService', originalPropertiesService)
      } else {
        delete (globalThis as Record<string, unknown>).PropertiesService
      }
      if (originalLockService) {
        Object.defineProperty(globalThis, 'LockService', originalLockService)
      } else {
        delete (globalThis as Record<string, unknown>).LockService
      }
      if (originalSpreadsheetApp) {
        Object.defineProperty(globalThis, 'SpreadsheetApp', originalSpreadsheetApp)
      } else {
        delete (globalThis as Record<string, unknown>).SpreadsheetApp
      }
      if (originalDriveApp) {
        Object.defineProperty(globalThis, 'DriveApp', originalDriveApp)
      } else {
        delete (globalThis as Record<string, unknown>).DriveApp
      }
    }
  })

  test('skyClauseRuntimePorts.listCrossings rejects null, non-object, or structurally unusable JSON under a valid crossing filename', () => {
    const originalDriveApp = Object.getOwnPropertyDescriptor(globalThis, 'DriveApp')
    let fileContent = 'null'

    Object.defineProperty(globalThis, 'DriveApp', {
      configurable: true,
      writable: true,
      value: {
        getFolderById: () => ({
          getFiles: () => {
            let done = false
            return {
              hasNext: () => !done,
              next: () => {
                done = true
                return {
                  getName: () => 'crossing-20261102-1505-01.json',
                  isTrashed: () => false,
                  getBlob: () => ({
                    getDataAsString: () => fileContent
                  })
                }
              }
            }
          }
        })
      }
    })

    try {
      const skyClauseRuntimePorts = getRuntimePortsFactory()
      const ports = skyClauseRuntimePorts('sheet-id', 'folder-id')

      for (const unusableJson of [
        'null',
        '[]',
        '42',
        '"not-an-object"',
        '{"crossing_id":"X-20261102-1505-01"}',
        '{"crossing_id":"","pack":"sky","t_eval":"2026-11-02T15:05:00+08:00","snapshot_id":"2026-11-02T15:05:00+08:00","changes":"not-an-array"}'
      ]) {
        fileContent = unusableJson
        expect(() => ports.listCrossings()).toThrow()
      }
    } finally {
      if (originalDriveApp) {
        Object.defineProperty(globalThis, 'DriveApp', originalDriveApp)
      } else {
        delete (globalThis as Record<string, unknown>).DriveApp
      }
    }
  })
})

test('skyReplayPorts is lazy and exposes only isolated replay capabilities', () => {
  const factory = (gas as Record<string, unknown>).skyReplayPorts
  expect(typeof factory).toBe('function')
  const ports = (factory as (sheetId: string, folderId: string) => Record<string, unknown>)(
    'replay-sheet',
    'replay-folder'
  )
  expect(Object.keys(ports).sort()).toEqual([
    'canonicalJson',
    'createCrossing',
    'nextSequence',
    'replaceClauses',
    'replaceWindows',
    'report',
    'sha256'
  ])
})
