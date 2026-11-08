import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createContext, runInContext } from 'node:vm'
import { createHash } from 'node:crypto'
import { build } from '../build.ts'
import * as gas from './gas.ts'
import { runApimsPoll, type ApimsPollPorts } from './apims.ts'
import { columnsOf, toRow, type Cell, type Row, type Tab } from './schema.ts'
import { triggerRegistry } from './registry.ts'
import { syncTriggers, type TriggerPort } from './triggers.ts'

const KEY = 'SKY_APIMS_BACKFILL_V1'
const capture = readFileSync(join(import.meta.dir, '../../fixtures/mapcaqm-20261105T1313Z.json'), 'utf8')
const originals = new Map<string, PropertyDescriptor | undefined>()
function install(name: string, value: unknown) {
  if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
}
afterEach(() => {
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete (globalThis as Record<string, unknown>)[key]
  }
  originals.clear()
})
function factory(evaluate: () => void = () => {}): ApimsPollPorts {
  const fn = (gas as Record<string, unknown>).apimsPollPorts
  expect(typeof fn).toBe('function')
  return (fn as (sheetId: string, evaluate: () => void) => ApimsPollPorts)('sheet-test', evaluate)
}
// Only native services are doubled: factories, poller, validation, lock and evaluation remain real.
function native() {
  const rows = new Map<Tab, Cell[][]>()
  const events: string[] = [],
    propertyReads: string[] = [],
    urls: string[] = []
  const reads: { tab: Tab; column: number; width: number }[] = []
  const props: Record<string, string> = { SHEET_ID: 'sheet-test', CAMERA_TOKEN: 'private-token' }
  let failPollFlush = false,
    failSourceWrite = false
  function seed<T extends Tab>(tab: T, records: Row<T>[]) {
    rows.set(
      tab,
      records.map((r) => toRow(tab, r))
    )
  }
  function records<T extends Tab>(tab: T): Row<T>[] {
    return (rows.get(tab) ?? []).map(
      (row) => Object.fromEntries(columnsOf(tab).map((c, i) => [c, row[i] ?? ''])) as Row<T>
    )
  }
  const services = {
    SpreadsheetApp: {
      flush: () => {
        events.push('flush')
        if (failPollFlush && events.at(-2) === 'write:polls') {
          failPollFlush = false
          throw new Error('persisted poll flush failure')
        }
      },
      openById: (id: string) => {
        expect(id).toBe('sheet-test')
        return {
          getSheetByName: (tab: Tab) => ({
            getLastRow: () => (rows.get(tab)?.length ?? 0) + 1,
            getRange: (row: number, column: number, height: number, width: number) => ({
              getValues: () => {
                reads.push({ tab, column, width })
                return Array.from({ length: height }, (_, r) =>
                  Array.from({ length: width }, (_, c) => rows.get(tab)?.[row - 2 + r]?.[column - 1 + c] ?? '')
                )
              },
              setValues: (values: Cell[][]) => {
                events.push('write:' + tab)
                if (failSourceWrite && tab === 'sources') throw new Error('source storage failure')
                const data = rows.get(tab) ?? []
                rows.set(tab, data)
                for (let r = 0; r < height; r++) {
                  const target = data[row - 2 + r] ?? Array(columnsOf(tab).length).fill('')
                  data[row - 2 + r] = target
                  for (let c = 0; c < width; c++) target[column - 1 + c] = values[r]![c]!
                }
              }
            })
          })
        }
      }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getKeys: () => {
          throw new Error('property enumeration forbidden')
        },
        getProperties: () => {
          throw new Error('bulk property values forbidden')
        },
        getProperty: (key: string) => {
          propertyReads.push(key)
          if (key === 'CAMERA_TOKEN') throw new Error('private token read')
          return props[key] ?? null
        },
        setProperty: (key: string, value: string) => {
          expect(key).toBe(KEY)
          const completed = (JSON.parse(value) as { requests: { completed: boolean }[] }).requests.filter(
            (r) => r.completed
          ).length
          events.push('checkpoint:' + completed)
          props[key] = value
        }
      })
    },
    UrlFetchApp: {
      fetch: (url: string, options: unknown) => {
        expect(options).toEqual({ muteHttpExceptions: true })
        urls.push(url)
        events.push('fetch')
        return {
          getResponseCode: () => 200,
          getContentText: () => (url.includes('mapcaqm') ? capture : '{"api_table_hourly":[]}')
        }
      }
    },
    DriveApp: {
      getFolderById: (id: string) => {
        expect(id).toBe('folder-test')
        return { getFiles: () => ({ hasNext: () => false }), createFile: () => events.push('crossing') }
      }
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: (ms: number) => {
          expect(ms).toBe(30000)
          events.push('lock')
        },
        releaseLock: () => events.push('unlock')
      })
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF-8' },
      computeDigest: (_algorithm: unknown, value: string) => [...createHash('sha256').update(value).digest()]
    }
  }
  return {
    rows,
    events,
    reads,
    props,
    propertyReads,
    urls,
    seed,
    records,
    services,
    install: () => {
      for (const [key, value] of Object.entries(services)) install(key, value)
    },
    failPollFlush: () => {
      failPollFlush = true
    },
    failSourceWrite: () => {
      failSourceWrite = true
    }
  }
}
function completed() {
  return JSON.stringify({ version: 1, requests: [] })
}

describe('native APIMS persistence', () => {
  test('constructs lazily and rejects a missing workbook', () => {
    factory()
    const fn = (gas as Record<string, unknown>).apimsPollPorts as (id: string, evaluate: () => void) => ApimsPollPorts
    expect(() => fn(' ', () => {})).toThrow('SHEET_ID')
  })
  test('projects public source, revision and backfill metadata and normalizes native dates', () => {
    const f = native()
    f.install()
    f.seed('sources', [
      {
        source_id: 'CA16W',
        kind: 'apims',
        name: 'Cheras',
        cadence_min: 60,
        stale_after_min: 120,
        freshness: 'observed',
        licence: 'terms',
        url: 'url'
      }
    ])
    f.seed('readings', [
      {
        source_kind: 'apims',
        source_id: 'CA16W',
        metric: 'api',
        observed_at: new Date('2026-11-05T13:00:00Z'),
        value: 67,
        revision: 2,
        note: 'unneeded'
      }
    ])
    f.seed('polls', [
      {
        poll_id: 'history',
        source_kind: 'apims_backfill',
        source_id: 'apims:backfill:14:2026-11-05T21:00:00+08:00',
        outcome: 'error',
        raw_file_id: 'unneeded'
      }
    ])
    const ports = factory()
    expect(ports.readSources()[0]).toEqual({
      source_id: 'CA16W',
      kind: 'apims',
      name: 'Cheras',
      cadence_min: 60,
      stale_after_min: 120,
      freshness: 'observed',
      licence: 'terms',
      url: 'url'
    })
    expect(ports.readReadings()[0]).toEqual({
      source_kind: 'apims',
      source_id: 'CA16W',
      metric: 'api',
      observed_at: '2026-11-05T21:00:00+08:00',
      value: 67,
      revision: 2
    })
    expect(ports.readPolls()[0]).toEqual({
      poll_id: 'history',
      source_kind: 'apims_backfill',
      source_id: 'apims:backfill:14:2026-11-05T21:00:00+08:00',
      outcome: 'error'
    })
    expect(f.reads).toEqual([
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((column) => ({ tab: 'sources' as const, column, width: 1 })),
      ...[2, 3, 4, 5, 7, 12].map((column) => ({ tab: 'readings' as const, column, width: 1 })),
      ...[1, 2, 3, 8].map((column) => ({ tab: 'polls' as const, column, width: 1 }))
    ])
    expect(f.propertyReads).toEqual([])
  })
  test('uses only its strictly decoded owned property and writes literal cells', () => {
    const f = native()
    f.install()
    const ports = factory()
    expect(ports.readBackfillState()).toBeNull()
    ports.saveBackfillState({ version: 1, requests: [] })
    expect(ports.readBackfillState()).toEqual({ version: 1, requests: [] })
    f.props[KEY] = '{"version":1,"requests":[{"stationId":"CA16W"}]}'
    expect(() => ports.readBackfillState()).toThrow()
    expect(f.propertyReads).toEqual([KEY, KEY, KEY])
    ports.appendSources([{ source_id: '=literal', kind: 'apims' }])
    expect(f.rows.get('sources')![0]![0]).toBe("'=literal")
    expect(f.events.slice(-2)).toEqual(['write:sources', 'flush'])
    expect(f.props.CAMERA_TOKEN).toBe('private-token')
  })
  test('flushes source registration before fetching and data plus poll before completion checkpoints', () => {
    const f = native()
    f.install()
    let evaluations = 0
    const ports = factory(() => evaluations++)
    ports.now = () => new Date('2026-11-05T21:10:00+08:00')
    const report = runApimsPoll(ports)
    expect(report.newReadings).toHaveLength(3)
    expect(report.historyPolls).toHaveLength(9)
    expect(evaluations).toBe(1)
    expect(f.events.slice(0, 6)).toEqual(['write:sources', 'flush', 'fetch', 'write:readings', 'write:polls', 'flush'])
    for (let n = 1; n <= 9; n++) {
      const at = f.events.indexOf('checkpoint:' + n)
      expect(f.events.slice(at - 2, at)).toEqual(['write:polls', 'flush'])
    }
    expect(f.reads.every((r) => ['sources', 'readings', 'polls'].includes(r.tab))).toBe(true)
    expect(f.propertyReads.every((key) => key === KEY)).toBe(true)
    expect(f.records('readings').every((r) => r.received_at === '2026-11-05T21:10:00+08:00')).toBe(true)
  })
  test('persists captured history readings before each completion checkpoint and deduplicates a repeat', () => {
    const f = native()
    f.install()
    const manifest = JSON.parse(
      readFileSync(join(import.meta.dir, '../../fixtures/apims/apitablehourly-20261107-capture-manifest.json'), 'utf8')
    ) as { requests: { stateId: number; requestedThroughMyt: string; file: string }[] }
    const fetch = f.services.UrlFetchApp.fetch
    f.services.UrlFetchApp.fetch = (url, options) => {
      if (url.includes('mapcaqm')) return fetch(url, options)
      const query = new URL(url).searchParams
      const entry = manifest.requests.find(
        (r) => r.stateId === Number(query.get('stateid')) && r.requestedThroughMyt === query.get('datetime')
      )!
      expect(entry).toBeDefined()
      f.urls.push(url)
      f.events.push('fetch')
      return {
        getResponseCode: () => 200,
        getContentText: () => readFileSync(join(import.meta.dir, '../../fixtures/apims', entry.file), 'utf8')
      }
    }
    const ports = factory()
    ports.now = () => new Date('2026-11-03T23:10:00+08:00')
    expect(runApimsPoll(ports).newReadings).toHaveLength(222)
    expect(f.records('readings').filter((r) => r.source_id === 'CA16W')).toHaveLength(74)
    for (let n = 1; n <= 9; n++) {
      const at = f.events.indexOf('checkpoint:' + n)
      expect(f.events.slice(at - 3, at)).toEqual(['write:readings', 'write:polls', 'flush'])
    }
    const before = f.records('readings')
    expect(runApimsPoll(ports).newReadings).toEqual([])
    expect(f.urls.filter((url) => url.includes('apitablehourly'))).toHaveLength(9)
    expect(f.records('readings')).toEqual(before)
  })
  test('reconciles a persisted then thrown history poll without refetching its frozen request', () => {
    const f = native()
    f.install()
    const ports = factory()
    ports.now = () => new Date('2026-11-05T21:10:00+08:00')
    const fetch = f.services.UrlFetchApp.fetch
    f.services.UrlFetchApp.fetch = (url, options) => {
      if (url.includes('apitablehourly')) f.failPollFlush()
      return fetch(url, options)
    }
    expect(() => runApimsPoll(ports)).toThrow('persisted poll flush failure')
    expect(f.records('polls')).toHaveLength(2)
    expect(JSON.parse(f.props[KEY]!).requests.filter((r: { completed: boolean }) => r.completed)).toHaveLength(0)
    const frozen = f.urls[1]!
    f.services.UrlFetchApp.fetch = fetch
    expect(runApimsPoll(ports).pendingHistory).toBe(0)
    expect(f.urls.filter((url) => url === frozen)).toHaveLength(1)
    expect(f.records('readings')).toHaveLength(3)
  })
})

let outdir = '',
  code = ''
beforeAll(async () => {
  outdir = mkdtempSync(join(tmpdir(), 'apims-build-'))
  await build({ outdir, sha: 'a'.repeat(40), builtAt: '2026-11-07T10:00:00+08:00', pilotScriptId: '' })
  code = readFileSync(join(outdir, 'Code.js'), 'utf8')
})
afterAll(() => rmSync(outdir, { recursive: true, force: true }))
function script(f: ReturnType<typeof native>) {
  const logs: string[] = []
  const context = createContext({
    ...f.services,
    console: { log: (line: string) => logs.push(line) },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (content: string) => ({ setMimeType: () => ({ content }) })
    }
  })
  runInContext(code, context)
  return { run: () => (context.pollApims as () => void)(), context, logs }
}
describe('APIMS handler and pilot trigger', () => {
  test('installs exactly the 15-minute APIMS trigger only on the pilot', () => {
    expect(triggerRegistry.filter((entry) => entry.handler === 'pollApims')).toEqual([
      { kind: 'time', handler: 'pollApims', every: { minutes: 15 } }
    ])
    const created: string[] = []
    const port: TriggerPort = {
      list: () => [],
      createTime: (handler) => {
        created.push(handler)
      },
      createSpreadsheet: () => {},
      remove: () => {}
    }
    syncTriggers(triggerRegistry, port, { pilotScriptId: 'pilot', scriptId: 'dev', getProperty: () => 'sheet-test' })
    expect(created).toEqual([])
    syncTriggers(triggerRegistry, port, { pilotScriptId: 'pilot', scriptId: 'pilot', getProperty: () => 'sheet-test' })
    expect(created.filter((handler) => handler === 'pollApims')).toHaveLength(1)
  })
  test('requires SHEET_ID before locking and exposes a parameterless main handler', async () => {
    const f = native()
    delete f.props.SHEET_ID
    const handler = ((await import('./main.ts')) as Record<string, unknown>).pollApims
    expect(typeof handler).toBe('function')
    expect((handler as () => void).length).toBe(0)
    expect(() => script(f).run()).toThrow('SHEET_ID')
    expect(f.events).toEqual([])
  })
  test('rejects a malformed owned property under the lock before HTTP or workbook writes', () => {
    const f = native()
    f.props[KEY] = '{"version":2,"requests":[]}'
    expect(() => script(f).run()).toThrow('Invalid APIMS backfill state')
    expect(f.events).toEqual(['lock', 'unlock'])
    expect(f.propertyReads).toEqual(['SHEET_ID', KEY])
  })
  test('releases its single lock on storage failure before evaluation or HTTP', () => {
    const f = native()
    f.failSourceWrite()
    expect(() => script(f).run()).toThrow('source storage failure')
    expect(f.events).toEqual(['lock', 'write:sources', 'unlock'])
    expect(f.urls).toEqual([])
  })
  test('completes a real evaluation once under one lock and logs only a compact count report', () => {
    const f = native()
    Object.assign(f.props, {
      CAMERA_DAY_START: '07:15',
      CAMERA_DAY_END: '19:00',
      CROSSINGS_SKY_FOLDER_ID: 'folder-test'
    })
    f.seed('polls', [
      {
        poll_id: 'jps-prior',
        source_kind: 'jps_rain',
        source_id: '0232901RF',
        started_at: '2026-11-05T21:10:00+08:00',
        received_at: '2026-11-05T21:10:01+08:00',
        outcome: 'ok'
      }
    ])
    const app = script(f)
    app.run()
    expect(f.events.filter((e) => e === 'lock')).toHaveLength(1)
    expect(f.events.filter((e) => e === 'unlock')).toHaveLength(1)
    expect(f.propertyReads.filter((k) => k === 'CAMERA_DAY_START')).toHaveLength(1)
    expect(f.events.filter((e) => e === 'write:now')).toHaveLength(1)
    expect(f.records('now').length).toBeGreaterThan(0)
    expect(app.logs.map((line) => JSON.parse(line))).toEqual([{ polls: 10, newReadings: 3, pendingHistory: 0 }])
  })
  test('health reads only the public join columns and exposes only the established response fields', () => {
    const f = native()
    f.seed('sources', [
      {
        source_id: 'CA16W',
        kind: 'apims',
        freshness: 'observed',
        state: 'fresh',
        stale_after_min: 120,
        probation: 'unneeded'
      },
      { source_id: 'CA19B', kind: 'apims', freshness: 'observed', state: 'unknown', stale_after_min: 120 }
    ])
    f.seed('polls', [
      {
        poll_id: 'shared',
        source_kind: 'apims',
        source_id: 'apims',
        outcome: 'ok',
        received_at: '2026-11-06T15:10:00+08:00',
        raw_file_id: 'unneeded'
      }
    ])
    f.seed('readings', [{ source_id: 'CA16W', poll_id: 'shared', note: 'unneeded' }])
    const app = script(f)
    const response = (app.context.doGet as (event: unknown) => { content: string })({ parameter: { health: '1' } })
    const health = JSON.parse(response.content)
    expect(Object.keys(health).sort()).toEqual(['built_at', 'ok', 'sha', 'sources'])
    expect(Object.keys(health.sources[0]).sort()).toEqual([
      'age_min',
      'received_at',
      'source_id',
      'stale_after_min',
      'state'
    ])
    expect(health.sources[0].received_at).toBe('2026-11-06T15:10:00+08:00')
    expect(health.sources[1].received_at).toBeNull()
    expect(f.reads).toEqual([
      ...[1, 2, 6, 9, 5].map((column) => ({ tab: 'sources' as const, column, width: 1 })),
      ...[1, 2, 3, 8, 5].map((column) => ({ tab: 'polls' as const, column, width: 1 })),
      ...[3, 11].map((column) => ({ tab: 'readings' as const, column, width: 1 }))
    ])
    expect(f.propertyReads).toEqual(['SHEET_ID'])
  })
  test('runs the unlocked evaluation once and releases the outer lock when evaluation fails', () => {
    const f = native()
    f.props[KEY] = completed()
    expect(() => script(f).run()).toThrow('CAMERA_DAY_START')
    expect(f.events.filter((e) => e === 'lock')).toHaveLength(1)
    expect(f.events.at(-1)).toBe('unlock')
    expect(f.propertyReads.filter((k) => k === 'CAMERA_DAY_START')).toHaveLength(1)
    expect(f.records('polls')).toHaveLength(10)
  })
})
