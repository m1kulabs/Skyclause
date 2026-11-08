import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createContext, runInContext } from 'node:vm'
import { build } from '../build.ts'
import * as gas from './gas.ts'
import { runMetPoll, verifyMetWarningText, type MetPollPorts } from './met.ts'
import { MET_WARNING_ENDPOINT, MET_FORECAST_ENDPOINT } from './met-parser.ts'
import { columnsOf, toRow, type Cell, type Row, type Tab } from './schema.ts'
import { triggerRegistry } from './registry.ts'
import { syncTriggers, type TriggerPort } from './triggers.ts'

const WARNING = 'SKY_MET_RECEIPT_WARNING_V1',
  FORECAST = 'SKY_MET_RECEIPT_FORECAST_V1'
const warning = readFileSync(join(import.meta.dir, '../../fixtures/weather-warning-20261105T1313Z.json'))
const forecast = readFileSync(join(import.meta.dir, '../../fixtures/weather-forecast-kl-20261108T014413Z.json'))
const originals = new Map<string, PropertyDescriptor | undefined>()
function install(name: string, value: unknown) {
  if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
}
afterEach(() => {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete (globalThis as Record<string, unknown>)[name]
  }
  originals.clear()
})
function factory(evaluate = () => {}): MetPollPorts {
  const fn = (gas as Record<string, unknown>).metPollPorts
  expect(typeof fn).toBe('function')
  return (fn as (s: string, f: string, e: () => void) => MetPollPorts)('sheet-test', 'raw-root', evaluate)
}
function native() {
  const rows = new Map<Tab, Cell[][]>(),
    files = new Map<string, number[]>()
  const receiptWrites: string[] = []
  const events: string[] = [],
    propertyReads: string[] = [],
    urls: string[] = []
  const reads: { tab: Tab; column: number; width: number }[] = []
  const writes: { tab: Tab; row: number; column: number; width: number }[] = []
  const props: Record<string, string> = { SHEET_ID: 'sheet-test', RAW_FOLDER_ID: 'raw-root', CAMERA_TOKEN: 'secret' }
  let status = 200,
    body = [...warning],
    folders = 0,
    fail = '',
    seq = 0,
    decodeFailure = false
  function seed<T extends Tab>(tab: T, data: Row<T>[]) {
    rows.set(
      tab,
      data.map((r) => toRow(tab, r))
    )
  }
  function records<T extends Tab>(tab: T): Row<T>[] {
    return (rows.get(tab) ?? []).map(
      (row) => Object.fromEntries(columnsOf(tab).map((key, i) => [key, row[i] ?? ''])) as Row<T>
    )
  }
  const iterator = <T>(values: T[]) => {
    let i = 0
    return { hasNext: () => i < values.length, next: () => values[i++]! }
  }
  const blob = (data: number[]) => ({
    getBytes: () => data.map((b) => (b > 127 ? b - 256 : b)),
    getDataAsString: (charset: string) => {
      expect(charset).toBe('UTF-8')
      if (decodeFailure) throw new Error('UTF-8 decode failure')
      return Buffer.from(data.map((b) => b & 255)).toString('utf8')
    }
  })
  const archive = {
    getId: () => 'met-owned',
    isTrashed: () => false,
    getFiles: () =>
      iterator(
        [...files].map(([id, bytes]) => ({ getId: () => id, isTrashed: () => false, getBlob: () => blob(bytes) }))
      ),
    createFile: (value: ReturnType<typeof blob> & { type?: string; name?: string }) => {
      expect(value.type).toBe('application/json')
      expect(value.name).toMatch(/^(warning|forecast)-\d{8}-\d{6}\.json$/)
      const id = 'raw-' + ++seq
      files.set(
        id,
        value.getBytes().map((b) => b & 255)
      )
      events.push('archive')
      return { getId: () => id }
    }
  }
  const services = {
    SpreadsheetApp: {
      flush: () => {
        events.push('flush')
        if (fail === 'poll' && events.at(-2) === 'write:polls') {
          fail = ''
          throw new Error('persisted poll failure')
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
                writes.push({ tab, row, column, width })
                if (fail === 'source' && tab === 'sources') throw new Error('source storage failure')
                const data = rows.get(tab) ?? []
                rows.set(tab, data)
                for (let r = 0; r < height; r++) {
                  const target = data[row - 2 + r] ?? Array(columnsOf(tab).length).fill('')
                  data[row - 2 + r] = target
                  for (let c = 0; c < width; c++) target[column - 1 + c] = values[r]![c]!
                  if (fail === 'partial' && tab === 'warnings') {
                    fail = ''
                    throw new Error('partial row failure')
                  }
                }
                if (fail === 'touch' && tab === 'warnings' && width === 1) {
                  fail = ''
                  throw new Error('persisted touch failure')
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
          throw new Error('private enumeration')
        },
        getProperties: () => {
          throw new Error('private enumeration')
        },
        getProperty: (key: string) => {
          propertyReads.push(key)
          if (key === 'CAMERA_TOKEN') throw new Error('private read')
          return props[key] ?? null
        },
        setProperty: (key: string, value: string) => {
          expect([WARNING, FORECAST]).toContain(key)
          events.push('receipt')
          receiptWrites.push(value)
          props[key] = value
        },
        deleteProperty: (key: string) => {
          expect([WARNING, FORECAST]).toContain(key)
          events.push('clear')
          delete props[key]
        }
      })
    },
    UrlFetchApp: {
      fetch: (url: string, options: unknown) => {
        expect(options).toEqual({
          muteHttpExceptions: true,
          followRedirects: false,
          headers: { 'Accept-Encoding': 'identity' }
        })
        urls.push(url)
        events.push('fetch')
        return { getResponseCode: () => status, getContent: () => body.map((b) => (b > 127 ? b - 256 : b)) }
      }
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF-8' },
      newBlob: (value: number[] | string, type?: string, name?: string) => {
        if (Array.isArray(value))
          expect(value.every((byte) => Number.isInteger(byte) && byte >= -128 && byte <= 127)).toBe(true)
        return { ...blob(typeof value === 'string' ? [...Buffer.from(value, 'utf8')] : value), type, name }
      },
      computeDigest: (_algorithm: unknown, value: number[] | string) => {
        if (Array.isArray(value)) expect(value.every((b) => Number.isInteger(b) && b >= -128 && b <= 127)).toBe(true)
        return [
          ...createHash('sha256')
            .update(typeof value === 'string' ? value : Buffer.from(value.map((b) => b & 255)))
            .digest()
        ].map((b) => (b > 127 ? b - 256 : b))
      }
    },
    DriveApp: {
      getFolderById: (id: string) => {
        events.push('folder:' + id)
        if (id === 'met-owned') return archive
        if (id === 'crossings-test')
          return {
            getFiles: () => iterator([]),
            createFile: () => {
              events.push('crossing')
            }
          }
        expect(id).toBe('raw-root')
        return {
          getFoldersByName: (name: string) => {
            expect(name).toBe('met')
            return iterator(Array.from({ length: folders }, () => archive))
          },
          createFolder: (name: string) => {
            expect(name).toBe('met')
            folders = 1
            events.push('create:met')
            return archive
          }
        }
      }
    },
    LockService: {
      getScriptLock: () => ({ waitLock: () => events.push('lock'), releaseLock: () => events.push('unlock') })
    }
  }
  return {
    rows,
    files,
    events,
    propertyReads,
    receiptWrites,
    urls,
    reads,
    writes,
    props,
    seed,
    records,
    services,
    response: (bytes: number[] | Buffer, code = 200) => {
      body = [...bytes]
      status = code
    },
    decodeFailure: () => {
      decodeFailure = true
    },
    fail: (point: string) => {
      fail = point
    },
    folders: (count: number) => {
      folders = count
    },
    install: () => {
      for (const [name, value] of Object.entries(services)) install(name, value)
    }
  }
}
function clock(ports: MetPollPorts, at = '2026-11-05T21:13:00+08:00') {
  let i = 0
  ports.now = () => new Date(at)
  ports.newPollId = () => 'poll-' + ++i
  return ports
}

describe('native MET bytes and persistence', () => {
  test('constructs lazily and requires both IDs', () => {
    factory()
    const fn = (gas as Record<string, unknown>).metPollPorts as (s: string, f: string, e: () => void) => MetPollPorts
    expect(() => fn(' ', 'raw', () => {})).toThrow('SHEET_ID')
    expect(() => fn('sheet', ' ', () => {})).toThrow('RAW_FOLDER_ID')
  })
  test('keeps signed native bytes exact, checks the actual capture hash and rejects invalid UTF-8', () => {
    const f = native()
    f.install()
    const ports = factory()
    const response = ports.fetch(MET_WARNING_ENDPOINT)
    expect(response).toEqual({ status: 200, bytes: [...warning], text: warning.toString('utf8') })
    expect(ports.hashBytes(response.bytes)).toBe(createHash('sha256').update(warning).digest('hex'))
    expect(f.events).not.toContain('create:met')
    f.response([0xc3, 0x28], 429)
    expect(ports.fetch(MET_WARNING_ENDPOINT)).toEqual({ status: 429, bytes: [0xc3, 0x28], text: null })
    f.response(Buffer.from('é雨😀'))
    expect(ports.fetch(MET_WARNING_ENDPOINT).text).toBe('é雨😀')
  })
  test('preserves HTTP status and bytes when native UTF-8 decoding throws', () => {
    const f = native()
    f.install()
    f.decodeFailure()
    f.response([0xff], 200)
    expect(factory().fetch(MET_WARNING_ENDPOINT)).toEqual({ status: 200, bytes: [255], text: null })
  })
  test('projects public columns, retains physical rows/types, normalizes dates, validates and literalizes', () => {
    const f = native()
    f.install()
    const ports = factory()
    f.seed('warnings', [
      {},
      { warning_key: 'k', first_seen_at: new Date('2026-11-05T13:00:00Z'), http_status: 200, text_en: '=literal' }
    ])
    expect(ports.readWarnings()[0]).toEqual({
      rowNumber: 3,
      row: expect.objectContaining({
        warning_key: 'k',
        http_status: 200,
        text_en: '=literal',
        first_seen_at: '2026-11-05T21:00:00+08:00'
      })
    })
    ports.updateLastSeen(3, '2026-11-05T21:13:00+08:00')
    expect(f.writes).toEqual([{ tab: 'warnings', row: 3, column: 14, width: 1 }])
    expect(f.records('warnings')[1]!.first_seen_at).toEqual(new Date('2026-11-05T13:00:00Z'))
    f.seed('forecast', [{ date: new Date('2026-11-05T16:00:00Z'), min_temp: 23, max_temp: 32 }])
    expect(ports.readForecast()[0]).toMatchObject({ date: '2026-11-06', min_temp: 23, max_temp: 32 })
    f.seed('sources', [{}, { source_id: 's', state: 'private-unused', cadence_min: 10 }])
    ports.readSources()
    ports.readGlossary()
    ports.readPolls()
    expect(f.reads.filter((r) => r.tab === 'sources').map((r) => r.column)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(f.reads.every((r) => ['warnings', 'forecast', 'sources', 'glossary', 'polls'].includes(r.tab))).toBe(true)
    expect(() => ports.appendWarnings([{ warning_key: 'invalid' }])).toThrow('Invalid MET warning')
    ports.appendSources([{ source_id: '=literal' }])
    expect(f.rows.get('sources')!.at(-1)![0]).toBe("'=literal")
  })
  test('owns exactly one decoded property per kind and never stores a body', () => {
    const f = native()
    f.install()
    const ports = factory()
    expect(ports.readPending('warning')).toBeNull()
    expect(ports.readPending('forecast')).toBeNull()
    f.props[WARNING] = '{}'
    expect(() => ports.readPending('warning')).toThrow()
    expect(f.propertyReads).toEqual([WARNING, FORECAST, WARNING])
    delete f.props[WARNING]
    runMetPoll('warning', clock(ports))
    expect(f.props[WARNING]).toBeUndefined()
    expect(Object.keys(JSON.parse(f.receiptWrites[0]!)).sort()).toEqual([
      'kind',
      'poll',
      'rawFileId',
      'sha256',
      'version'
    ])
    expect(f.receiptWrites[0]!.length).toBeLessThan(1000)
    expect(f.props.CAMERA_TOKEN).toBe('secret')
    expect(f.propertyReads.every((k) => [WARNING, FORECAST].includes(k))).toBe(true)
    const receipt = f.events.indexOf('receipt')
    expect(f.events.slice(receipt - 1, receipt + 1)).toEqual(['archive', 'receipt'])
    expect(f.events.slice(-3)).toEqual(['write:polls', 'flush', 'clear'])
    expect(f.events.slice(0, 5)).toEqual(['write:sources', 'flush', 'write:glossary', 'flush', 'fetch'])
    expect(f.urls).toEqual([MET_WARNING_ENDPOINT])
    expect([...f.files.values()][0]).toEqual([...warning])
    expect(verifyMetWarningText(ports).status).toBe('match')
    const valid = f.records('warnings')[0]!
    ports.appendWarnings([{ ...valid, heading_en: '=literal' }])
    expect(f.rows.get('warnings')!.at(-1)![6]).toBe("'=literal")
  })
  test('recovers partial native rows and persisted polls with original provenance without duplicates', () => {
    for (const point of ['partial', 'poll']) {
      const f = native()
      f.install()
      const ports = clock(factory())
      f.fail(point)
      expect(() => runMetPoll('warning', ports)).toThrow()
      const pending = JSON.parse(f.props[WARNING]!)
      expect(pending.poll.received_at).toBe('2026-11-05T21:13:00+08:00')
      f.response(warning, 429)
      ports.now = () => new Date('2026-11-05T22:00:00+08:00')
      const report = runMetPoll('warning', ports)
      expect(report.recoveredPollIds).toEqual(['poll-1'])
      expect(f.records('polls').map((r) => r.poll_id)).toEqual(['poll-1', 'poll-2'])
      expect(f.records('warnings')).toHaveLength(JSON.parse(warning.toString()).length)
      expect(
        f.records('warnings').every((r) => r.poll_id === 'poll-1' && r.first_seen_at === pending.poll.received_at)
      ).toBe(true)
      expect(f.files.size).toBe(1)
      expect(f.urls).toHaveLength(2)
      expect(f.props[WARNING]).toBeUndefined()
    }
  })
  test('finishes pending active-only touches at original receipt time before fresh HTTP429', () => {
    const f = native()
    f.install()
    const ports = clock(factory())
    runMetPoll('warning', ports)
    const original = f.records('warnings')
    const changed = JSON.parse(warning.toString())
    changed[0].text_en += ' changed'
    f.response(Buffer.from(JSON.stringify(changed)))
    ports.now = () => new Date('2026-11-05T21:20:00+08:00')
    runMetPoll('warning', ports)
    const before = f.records('warnings')
    f.fail('touch')
    ports.now = () => new Date('2026-11-05T21:30:00+08:00')
    expect(() => runMetPoll('warning', ports)).toThrow('persisted touch failure')
    const pending = JSON.parse(f.props[WARNING]!)
    f.response(warning, 429)
    ports.now = () => new Date('2026-11-05T22:00:00+08:00')
    const report = runMetPoll('warning', ports)
    const after = f.records('warnings')
    expect(report.recoveredPollIds).toEqual(['poll-3'])
    expect(report.touchedWarnings).toBe(original.length - 1)
    expect(report.appendedRows).toBe(0)
    expect(report.poll.http_status).toBe(429)
    expect(after[0]).toEqual(before[0])
    expect(after[0]!.last_seen_at).toBe(original[0]!.last_seen_at)
    for (const row of after.slice(1)) expect(row.last_seen_at).toBe(pending.poll.received_at)
    expect(after.map((r) => r.first_seen_at)).toEqual(before.map((r) => r.first_seen_at))
    expect(after.map((r) => r.poll_id)).toEqual(before.map((r) => r.poll_id))
    expect(f.records('polls').filter((r) => r.poll_id === 'poll-3')).toEqual([expect.objectContaining(pending.poll)])
    expect(f.files.size).toBe(2)
    expect(f.records('polls')).toHaveLength(4)
  })
  test('uses the exact forecast URL and deduplicates normalized native forecast dates', () => {
    const f = native()
    f.install()
    f.response(forecast)
    const ports = clock(factory())
    runMetPoll('forecast', ports)
    const before = f.records('forecast')
    expect(before).toHaveLength(7)
    f.seed(
      'forecast',
      before.map((r) => ({ ...r, date: new Date(String(r.date) + 'T00:00:00+08:00') }))
    )
    expect(runMetPoll('forecast', ports).appendedRows).toBe(0)
    expect(f.urls).toEqual([MET_FORECAST_ENDPOINT, MET_FORECAST_ENDPOINT])
    expect(f.files.size).toBe(1)
    expect(f.propertyReads.every((k) => k === FORECAST)).toBe(true)
  })
  test('rejects corrupt archived bytes on native recovery before fresh HTTP or data writes', () => {
    const f = native()
    f.install()
    const ports = clock(factory())
    f.fail('partial')
    expect(() => runMetPoll('warning', ports)).toThrow('partial row failure')
    const pending = JSON.parse(f.props[WARNING]!)
    f.files.set(pending.rawFileId, [0xff])
    const before = JSON.stringify(f.records('warnings'))
    const requests = f.urls.length
    expect(() => runMetPoll('warning', ports)).toThrow('MET storage')
    expect(f.urls.length).toBe(requests)
    expect(JSON.stringify(f.records('warnings'))).toBe(before)
    expect(f.props[WARNING]).toBeDefined()
  })
  test('source failures leave archives/data untouched and archive ownership failures propagate', () => {
    const f = native()
    f.install()
    const ports = clock(factory())
    for (const [bytes, status] of [
      [[0xc3, 0x28], 200],
      [[123, 125], 200],
      [[1], 302],
      [[1], 429]
    ] as [number[], number][]) {
      f.response(bytes, status)
      const poll = runMetPoll('warning', ports).poll
      expect(poll.outcome).toBe('error')
      expect(poll.http_status).toBe(status)
    }
    expect(f.files.size).toBe(0)
    expect(f.rows.has('warnings')).toBe(false)
    expect(f.events).not.toContain('create:met')
    expect(f.events.some((event) => event.startsWith('folder:'))).toBe(false)
    f.response(warning)
    f.folders(2)
    expect(() => runMetPoll('warning', ports)).toThrow('ambiguous')
    f.folders(1)
    expect(() => ports.readRaw('missing')).toThrow('missing raw')
  })
})

let outdir = '',
  code = ''
beforeAll(async () => {
  outdir = mkdtempSync(join(tmpdir(), 'met-build-'))
  await build({ outdir, sha: 'a'.repeat(40), builtAt: '2026-11-08T10:00:00+08:00', pilotScriptId: '' })
  code = readFileSync(join(outdir, 'Code.js'), 'utf8')
})
afterAll(() => rmSync(outdir, { recursive: true, force: true }))
function script(f: ReturnType<typeof native>) {
  const logs: string[] = []
  const context = createContext({ ...f.services, console: { log: (s: string) => logs.push(s) } })
  runInContext(code, context)
  return { run: (name: string) => (context[name] as () => void)(), logs }
}
describe('native MET main handlers', () => {
  test('registers exact pilot-only schedules', () => {
    const entries = triggerRegistry.filter((e) => ['pollMetWarnings', 'pollMetForecast'].includes(e.handler))
    expect(entries).toEqual([
      { kind: 'time', handler: 'pollMetWarnings', every: { minutes: 10 } },
      { kind: 'time', handler: 'pollMetForecast', every: { hours: 6 } }
    ])
    const created: string[] = []
    const port: TriggerPort = {
      list: () => [],
      createTime: (h) => {
        created.push(h)
      },
      createSpreadsheet: () => {},
      remove: () => {}
    }
    syncTriggers(entries, port, { pilotScriptId: 'p', scriptId: 'd', getProperty: () => '' })
    expect(created).toEqual([])
    syncTriggers(entries, port, { pilotScriptId: 'p', scriptId: 'p', getProperty: () => '' })
    expect(created).toEqual(['pollMetWarnings', 'pollMetForecast'])
  })
  test('requires IDs and exports parameterless source handlers', async () => {
    const main = (await import('./main.ts')) as Record<string, unknown>
    for (const name of ['pollMetWarnings', 'pollMetForecast', 'verifyMetWarningText'])
      expect((main[name] as () => void).length).toBe(0)
    for (const key of ['SHEET_ID', 'RAW_FOLDER_ID']) {
      const f = native()
      delete f.props[key]
      expect(() => script(f).run('pollMetWarnings')).toThrow(key)
      expect(f.events).toEqual([])
    }
  })
  test('uses one lock, one unlocked evaluation and compact logs for both handlers', () => {
    for (const handler of ['pollMetWarnings', 'pollMetForecast', 'warning429']) {
      const f = native()
      if (handler === 'pollMetForecast') f.response(forecast)
      if (handler === 'warning429') f.response(warning, 429)
      Object.assign(f.props, {
        CAMERA_DAY_START: '07:15',
        CAMERA_DAY_END: '19:00',
        CROSSINGS_SKY_FOLDER_ID: 'crossings-test'
      })
      f.seed('polls', [
        {
          poll_id: 'jps-clock',
          source_kind: 'jps_rain',
          source_id: '0232901RF',
          started_at: '2026-11-05T21:10:00+08:00',
          received_at: '2026-11-05T21:10:01+08:00',
          outcome: 'ok'
        }
      ])
      const app = script(f)
      app.run(handler === 'warning429' ? 'pollMetWarnings' : handler)
      expect(f.events.filter((e) => e === 'lock')).toHaveLength(1)
      expect(f.events.at(-1)).toBe('unlock')
      expect(f.propertyReads.filter((k) => k === 'CAMERA_DAY_START')).toHaveLength(1)
      expect(app.logs).toHaveLength(1)
      expect(Object.keys(JSON.parse(app.logs[0]!)).sort()).toEqual([
        'appendedRows',
        'outcome',
        'polls',
        'rawCreated',
        'recoveredPolls',
        'touchedWarnings'
      ])
    }
  })
  test('releases lock on storage failure and verifies read-only under one lock', () => {
    const f = native()
    f.fail('source')
    expect(() => script(f).run('pollMetWarnings')).toThrow('source storage failure')
    expect(f.events).toEqual(['lock', 'write:sources', 'unlock'])
    expect(f.urls).toEqual([])
    const g = native()
    const app = script(g)
    app.run('verifyMetWarningText')
    expect(g.events).toEqual(['lock', 'unlock'])
    expect(JSON.parse(app.logs[0]!)).toEqual({
      status: 'no_data',
      rowsChecked: 0,
      comparedFields: 0,
      matchedFields: 0,
      problems: []
    })
  })
})
