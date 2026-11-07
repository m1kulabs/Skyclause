import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createContext, runInContext } from 'node:vm'
import { createHash } from 'node:crypto'
import { build } from '../build.ts'
import * as gas from './gas.ts'
import { runEvidenceInbox, type EvidenceInboxPorts } from './evidence.ts'
import { columnsOf, toRow, type Cell, type Row, type Tab } from './schema.ts'
import { triggerRegistry } from './registry.ts'
import { syncTriggers, type TriggerPort } from './triggers.ts'

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
function factory(): EvidenceInboxPorts {
  const fn = (gas as Record<string, unknown>).evidenceInboxPorts
  expect(typeof fn).toBe('function')
  return (fn as (sheetId: string, slug: string) => EvidenceInboxPorts)('sheet-test', 'project-test')
}
function storage() {
  const rows = new Map<Tab, Cell[][]>()
  const ranges: { tab: string; row: number; column: number; height: number; width: number; action: string }[] = []
  const events: string[] = []
  const props: Record<string, string> = { CAMERA_TOKEN: 'never-read-this' }
  const propertyReads: string[] = [],
    propertyWrites: string[] = []
  let failFlush = false
  function seed<T extends Tab>(tab: T, records: Row<T>[]) {
    rows.set(
      tab,
      records.map((r) => toRow(tab, r))
    )
  }
  install('SpreadsheetApp', {
    flush: () => {
      events.push('flush')
      if (failFlush) {
        failFlush = false
        throw new Error('flush failure')
      }
    },
    openById: () => ({
      getSheetByName: (tab: Tab) => ({
        getLastRow: () => (rows.get(tab)?.length ?? 0) + 1,
        getRange: (row: number, column: number, height: number, width: number) => ({
          getValues: () => {
            ranges.push({ tab, row, column, height, width, action: 'read' })
            return Array.from({ length: height }, (_, r) =>
              Array.from({ length: width }, (_, c) => rows.get(tab)?.[row - 2 + r]?.[column - 1 + c] ?? '')
            )
          },
          setValues: (values: Cell[][]) => {
            ranges.push({ tab, row, column, height, width, action: 'write' })
            events.push('write:' + tab)
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
    })
  })
  install('PropertiesService', {
    getScriptProperties: () => ({
      getKeys: () => Object.keys(props),
      getProperties: () => {
        throw new Error('forbidden bulk token read')
      },
      getProperty: (key: string) => {
        propertyReads.push(key)
        if (key === 'CAMERA_TOKEN') throw new Error('forbidden token read')
        return props[key] ?? null
      },
      setProperty: (key: string, value: string) => {
        propertyWrites.push(key)
        props[key] = value
      },
      deleteProperty: (key: string) => {
        propertyWrites.push(key)
        delete props[key]
      }
    })
  })
  return {
    rows,
    seed,
    ranges,
    events,
    props,
    propertyReads,
    propertyWrites,
    failNextFlush: () => {
      failFlush = true
    }
  }
}

describe('native evidence persistence', () => {
  test('factory is lazy with no native services and exposes project context', () => {
    const ports = factory()
    expect(ports.projectSlug()).toBe('project-test')
    expect(ports.notices.workbookReference()).toBe('https://docs.google.com/spreadsheets/d/sheet-test')
  })

  test('reads contiguous public projections, only constrained clause bodies, and normalizes real dates/time cells', () => {
    const f = storage()
    f.seed('windows', [
      {
        window_id: 'w1',
        date: new Date('2026-11-07T00:00:00+08:00'),
        start_myt: new Date('1899-12-30T08:00:00+08:00'),
        end_myt: '10:00:00',
        title: 'private title'
      }
    ])
    f.seed('ledger', [
      {
        entry_id: 'l1',
        kind: 'clause_version',
        body: JSON.stringify({ version_n: 2, content_hash: 'abc123', secret: 'private' }),
        approver_on_duty: 'private name',
        recipient_ids: 'private recipient',
        calendar_event_url: 'private-url'
      },
      { entry_id: 'l2', kind: 'call', body: 'private body' }
    ])
    f.seed('grades', [{ grade_id: 'g1', explanation: 'private explanation' }])
    f.seed('readings', [{ source_id: 'source' }])
    f.seed('warnings', [{ warning_key: 'key' }])
    f.seed('forecast', [{ date: new Date('2026-11-07T00:00:00+08:00') }])
    f.seed('glossary', [{ ms_phrase: 'phrase' }])
    f.seed('now', [{ scope: 'sky' }])
    f.seed('probation', [{ frame_file_id: 'frame', label_a: 'private' }])
    const data = factory().packRows()
    expect(data.windows[0]!.date).toBe('2026-11-07')
    expect(data.windows[0]!.start_myt).toBe('08:00')
    expect(data.windows[0]!.end_myt).toBe('10:00')
    expect(data.forecast[0]!.date).toBe('2026-11-07')
    expect(data.ledger[0]!.body).toBe('{"version_n":2,"content_hash":"abc123"}')
    expect(JSON.stringify(data)).not.toContain('private')
    const reads = f.ranges.filter((r) => r.action === 'read')
    expect(reads).toContainEqual({ tab: 'windows', row: 2, column: 1, height: 1, width: 9, action: 'read' })
    for (const r of reads) {
      const covered = Array.from({ length: r.width }, (_, n) => r.column + n)
      if (r.tab === 'windows' || r.tab === 'grades') expect(covered).not.toContain(10)
      if (r.tab === 'ledger') for (const c of [17, 18, 19, 20]) expect(covered).not.toContain(c)
      if (r.tab === 'ledger' && covered.includes(21)) {
        expect(r.row).toBe(2)
        expect(r.height).toBe(1)
      }
    }
  })

  test('metadata lookups skip pack JSON and workflow cells, and appends flush then invalidate caches', () => {
    const f = storage()
    f.seed('evidence', [{ request_id: 'old', kind: 'call', pack_json: 'private large pack', approved_at: 'later' }])
    const ports = factory()
    expect(ports.evidenceRows()[0]!.request_id).toBe('old')
    expect(ports.notices.evidence('old')!.kind).toBe('call')
    expect(f.ranges).toEqual([
      { tab: 'evidence', row: 2, column: 1, height: 1, width: 5, action: 'read' },
      { tab: 'evidence', row: 2, column: 7, height: 1, width: 1, action: 'read' }
    ])
    ports.appendEvidence({ request_id: '=literal', kind: 'unparseable', pack_json: '{}' })
    expect(f.events).toEqual(['write:evidence', 'flush'])
    expect(f.rows.get('evidence')![1]![0]).toBe("'=literal")
    expect(ports.evidenceRows()).toHaveLength(2)
    f.failNextFlush()
    expect(() =>
      ports.notices.appendNotification({ kind: 'evidence_request', ref: 'new', gmail_message_id: 'sent-real' })
    ).toThrow('flush failure')
    expect(ports.notices.notification('new')!.gmail_message_id).toBe('sent-real')
    expect(f.events.slice(-2)).toEqual(['write:notifications', 'flush'])
    expect(
      f.ranges
        .filter((r) => r.tab === 'notifications' && r.action === 'read')
        .every((r) => !(r.column <= 3 && r.column + r.width > 3))
    ).toBe(true)
  })

  test('unsubscribe stamps only blank matching cells and flushes before evidence can append', () => {
    const f = storage()
    f.seed('subscribers', [
      { subscriber_id: 'a', email: 'Requester@example.test', role: 'teacher' },
      { subscriber_id: 'b', email: 'requester@example.test', unsubscribed_at: 'prior' },
      { subscriber_id: 'c', email: 'other@example.test' }
    ])
    const before = structuredClone(f.rows.get('subscribers')!)
    const ports = factory()
    ports.unsubscribe('requester@example.test', '2026-11-07T10:00:00.123+08:00')
    ports.appendEvidence({ request_id: 'm1', kind: 'unsubscribe' })
    const after = f.rows.get('subscribers')!
    before[0]![5] = '2026-11-07T10:00:00.123+08:00'
    expect(after).toEqual(before)
    expect(f.ranges.filter((r) => r.action === 'write' && r.tab === 'subscribers')).toEqual([
      { tab: 'subscribers', row: 2, column: 6, height: 1, width: 1, action: 'write' }
    ])
    expect(f.events).toEqual(['write:subscribers', 'flush', 'write:evidence', 'flush'])
    ports.unsubscribe('requester@example.test', 'later')
    expect(after).toEqual(before)
  })

  test('owned properties preserve exact cursor/page/intent state without reading token values', () => {
    const f = storage(),
      ports = factory()
    const cursor = {
      activatedAt: '2026-11-07T10:00:00.123+08:00',
      lowerBound: '2026-11-07T10:00:00.123+08:00',
      upperBound: '2026-11-07T10:00:02.456+08:00',
      pageToken: 'page',
      page: { remainingIds: ['one', 'two'], nextPageToken: 'next' }
    }
    ports.saveCursor(cursor)
    expect(ports.cursor()).toEqual(cursor)
    const intent = {
      requestId: 'one',
      routingAt: '2026-11-07T10:00:01.123+08:00',
      lastAttemptAt: '2026-11-07T10:00:02.456+08:00',
      marker: 'evidence:abc123',
      recipient: 'approver@example.test',
      draftCreationAttempted: true,
      draftId: 'container',
      threadId: 'thread',
      gmailMessageId: 'final'
    }
    ports.notices.saveIntent(intent)
    expect(ports.notices.intent('one')).toEqual(intent)
    expect(ports.notices.intents()).toEqual([intent])
    ports.notices.removeIntent('one')
    expect(ports.notices.intents()).toEqual([])
    expect(f.props.CAMERA_TOKEN).toBe('never-read-this')
    expect(
      [...f.propertyReads, ...f.propertyWrites].every(
        (key) => key === 'SKY_EVIDENCE_INBOX_CURSOR' || key.startsWith('SKY_EVIDENCE_NOTICE_')
      )
    ).toBe(true)
    expect(JSON.stringify(f.props)).not.toContain('approver@')
  })

  test('materializes only post-activation milliseconds, flushes a private-free pack and skips recorded body reads on retry', () => {
    const f = storage(),
      reads: string[] = []
    install('Utilities', {
      Charset: { UTF_8: 'UTF-8' },
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      computeDigest: (_algorithm: unknown, value: string) => [...createHash('sha256').update(value).digest()],
      base64DecodeWebSafe: (value: string) => [...Buffer.from(value, 'base64url')],
      newBlob: (bytes: number[]) => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') })
    })
    install('ScriptApp', { getOAuthToken: () => 'test-only-token' })
    install('UrlFetchApp', {
      fetch: (url: string) => {
        reads.push(url)
        const parsed = new URL(url)
        let result: unknown
        if (parsed.pathname.endsWith('/profile')) result = { emailAddress: 'owner@example.test' }
        else if (parsed.pathname.endsWith('/messages')) result = { messages: [{ id: 'before' }, { id: 'after' }] }
        else {
          const id = parsed.pathname.split('/').at(-1)!
          const payload = {
            mimeType: 'text/plain',
            headers: [
              { name: 'From', value: 'requester@example.test' },
              { name: 'Subject', value: 'evidence for 2 Nov 14:00–16:30' }
            ],
            body: { data: Buffer.from('private request text').toString('base64url') }
          }
          if (parsed.searchParams.get('format') === 'metadata')
            result = { payload: { headers: [{ name: 'From', value: 'requester@example.test' }] } }
          else
            result = {
              id,
              internalDate: String(
                Date.parse(id === 'before' ? '2026-11-07T10:00:00.121+08:00' : '2026-11-07T10:00:00.125+08:00')
              ),
              labelIds: ['INBOX'],
              payload
            }
        }
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify(result) }
      }
    })
    const ports = factory()
    let now = new Date('2026-11-07T10:00:00.123+08:00')
    ports.now = () => now
    ports.notices.now = () => now
    expect(runEvidenceInbox(ports).initialized).toBe(true)
    expect(reads).toEqual([])
    now = new Date('2026-11-07T10:00:00.500+08:00')
    const report = runEvidenceInbox(ports)
    expect(report.processed).toEqual(['after'])
    expect(report.skipped).toEqual(['before'])
    expect(report.pendingNoticeIds).toEqual(['after'])
    expect(report.errors).toContainEqual({ requestId: 'after', code: 'duty_unavailable' })
    expect(f.events).toEqual(['write:evidence', 'flush'])
    const row = f.rows.get('evidence')![0]!
    expect(row[1]).toBe('2026-11-07T10:00:00.125+08:00')
    const pack = JSON.parse(String(row[5]))
    expect(pack.header.span_start).toBe('2026-11-02T14:00:00+08:00')
    expect(pack.warnings).toBe('No warning record for this window')
    expect(JSON.stringify(pack)).not.toContain('@')
    expect(JSON.stringify(pack)).not.toContain('private request text')
    now = new Date('2026-11-07T10:00:01.500+08:00')
    expect(runEvidenceInbox(ports).processed).toEqual([])
    expect(f.rows.get('evidence')).toHaveLength(1)
    expect(reads.filter((url) => url.includes('/messages/after?format=full'))).toHaveLength(1)
  })

  test('duty routing normalizes native date/time cells and excludes the private approver name', () => {
    const f = storage()
    f.seed('rota', [
      {
        date: new Date('2026-11-07T00:00:00+08:00'),
        start: new Date('1899-12-30T08:00:00+08:00'),
        end: new Date('1899-12-30T22:00:00+08:00'),
        approver: 'private name',
        email: 'approver@example.test',
        malay_reader: true
      }
    ])
    const ports = factory()
    expect(ports.notices.dutyAt('2026-11-07T10:00:00.123+08:00')).toBe('approver@example.test')
    expect(ports.notices.dutyAt('2026-11-08T10:00:00+08:00')).toBeNull()
    expect(f.ranges.every((r) => !(r.column <= 4 && r.column + r.width > 4))).toBe(true)
  })
})

describe('evidence handler wiring', () => {
  test('registers exactly one minute trigger guarded to the pilot', () => {
    expect(triggerRegistry.filter((entry) => entry.handler === 'pollEvidenceInbox')).toEqual([
      { kind: 'time', handler: 'pollEvidenceInbox', every: { minutes: 1 } }
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
    const config = { pilotScriptId: 'pilot', getProperty: () => 'sheet-test' }
    syncTriggers(triggerRegistry, port, { ...config, scriptId: 'dev' })
    expect(created).toEqual([])
    syncTriggers(triggerRegistry, port, { ...config, scriptId: 'pilot' })
    expect(created.filter((handler) => handler === 'pollEvidenceInbox')).toHaveLength(1)
  })

  test('preflights Gmail before arming, leaving failed access unarmed under one outer lock', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'evidence-build-'))
    try {
      const exports = await build({
        outdir: dir,
        sha: 'a'.repeat(40),
        builtAt: '2026-11-07T10:00:00+08:00',
        pilotScriptId: ''
      })
      expect(exports).toContain('pollEvidenceInbox')
      const events: string[] = [],
        props: Record<string, string> = { SHEET_ID: 'sheet-test', PROJECT_SLUG: 'real-test-context' }
      let status = 403
      const context = createContext({
        console: { log: () => {} },
        ScriptApp: { getOAuthToken: () => 'test-only-token' },
        UrlFetchApp: {
          fetch: (url: string) => {
            expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/profile')
            events.push('profile')
            return {
              getResponseCode: () => status,
              getContentText: () => JSON.stringify({ emailAddress: 'owner@example.test' })
            }
          }
        },
        PropertiesService: {
          getScriptProperties: () => ({
            getProperty: (key: string) => props[key] ?? null,
            setProperty: (key: string, value: string) => {
              events.push('cursor')
              props[key] = value
            },
            getKeys: () => Object.keys(props)
          })
        },
        LockService: {
          getScriptLock: () => ({ waitLock: () => events.push('lock'), releaseLock: () => events.push('unlock') })
        }
      })
      runInContext(readFileSync(join(dir, 'Code.js'), 'utf8'), context)
      expect((await import('./main.ts')).pollEvidenceInbox.length).toBe(0)
      expect(() => (context.pollEvidenceInbox as () => void)()).toThrow('gmail_http_403')
      expect(props.SKY_EVIDENCE_INBOX_CURSOR).toBeUndefined()
      expect(events).toEqual(['lock', 'profile', 'unlock'])
      status = 200
      events.length = 0
      ;(context.pollEvidenceInbox as () => void)()
      expect(events).toEqual(['lock', 'profile', 'cursor', 'unlock'])
      expect(props.SKY_EVIDENCE_INBOX_CURSOR).toContain('+08:00')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
