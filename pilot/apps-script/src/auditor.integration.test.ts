import { afterAll, afterEach, beforeAll, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createContext, runInContext } from 'node:vm'
import { build } from '../build.ts'
import * as gas from './gas.ts'
import { runAuditor, type AuditorPorts } from './auditor.ts'
import { auditTransitionKey, type AuditTransition } from './auditor-state.ts'
import { columnsOf, toRow, type Cell, type Row, type Tab } from './schema.ts'

const PREFIX = 'SKY_AUDITOR_NOTICE_V1_',
  OBSERVER = 'SKY_AUDITOR_CREDENTIALS_V1'
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const original = new Map<string, PropertyDescriptor | undefined>()
afterEach(() => {
  for (const [name, descriptor] of original) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete (globalThis as Record<string, unknown>)[name]
  }
  original.clear()
})
function native() {
  const rows = new Map<Tab, Cell[][]>(),
    reads: { tab: Tab; column: string }[] = []
  const events: string[] = [],
    propertyReads: string[] = [],
    urls: string[] = [],
    folders: string[] = []
  const props: Record<string, string> = {
    SHEET_ID: 'sheet',
    CROSSINGS_SKY_FOLDER_ID: 'sky',
    CROSSINGS_CROWD_FOLDER_ID: 'crowd',
    TEAM_ALERT_EMAILS: 'admin@example.com',
    GE_SCHEDULES_REFRESHED_AT: new Date().toISOString(),
    CAMERA_TOKEN: 'private',
    SKY_EVIDENCE_NOTICE_private: 'private'
  }
  type File = { id: string; name: string; text: string; created: Date; trashed?: boolean }
  const files: Record<string, File[]> = { sky: [], crowd: [] }
  const drafts = new Map<string, { id: string; message: Record<string, unknown> }>()
  const sent = new Map<string, Record<string, unknown>>()
  let sequence = 0,
    fail = '',
    failSaveAt = 0,
    saveCount = 0
  const iterator = <T>(values: T[]) => {
    let index = 0
    return {
      hasNext: () => {
        if (fail === 'iteration') throw Error('private iteration')
        return index < values.length
      },
      next: () => values[index++]!
    }
  }
  function seed<T extends Tab>(tab: T, data: Row<T>[]) {
    rows.set(
      tab,
      data.map((row) => toRow(tab, row))
    )
  }
  function records<T extends Tab>(tab: T): Row<T>[] {
    return (rows.get(tab) ?? []).map(
      (row) => Object.fromEntries(columnsOf(tab).map((column, n) => [column, row[n] ?? ''])) as Row<T>
    )
  }
  const response = (value: unknown, status = 200) => ({
    getResponseCode: () => status,
    getContentText: () => JSON.stringify(value)
  })
  const services = {
    SpreadsheetApp: {
      flush() {
        events.push('flush')
        if (fail === 'flush') {
          fail = ''
          throw Error('private flush')
        }
      },
      openById(id: string) {
        expect(id).toBe('sheet')
        if (fail === 'sheet') throw Error('private sheet')
        return {
          getSheetByName(tab: Tab) {
            return {
              getLastRow: () => (rows.get(tab)?.length ?? 0) + 1,
              getRange(row: number, column: number, height: number, width: number) {
                return {
                  getValues() {
                    reads.push({ tab, column: columnsOf(tab)[column - 1]! })
                    if (fail === 'read') throw Error('private read')
                    return Array.from({ length: height }, (_, r) =>
                      Array.from({ length: width }, (_, c) => rows.get(tab)?.[row - 2 + r]?.[column - 1 + c] ?? '')
                    )
                  },
                  setValues(values: Cell[][]) {
                    expect(tab).toBe('notifications')
                    events.push('append')
                    const pending = Object.entries(props)
                      .filter(([key]) => key.startsWith(PREFIX))
                      .map(([, value]) => JSON.parse(value) as AuditTransition)
                    expect(
                      pending.some((value) =>
                        value.recipients.some((recipient) => recipient.attempt.gmailMessageId === values[0]?.[4])
                      )
                    ).toBe(true)
                    if (fail === 'append-before') {
                      fail = ''
                      throw Error('private append')
                    }
                    const data = rows.get(tab) ?? []
                    rows.set(tab, data)
                    for (let n = 0; n < height; n++) data[row - 2 + n] = [...values[n]!]
                    if (fail === 'append-after') {
                      fail = ''
                      throw Error('private append')
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getKeys() {
          events.push('keys')
          if (fail === 'keys') throw Error('private keys')
          return Object.keys(props)
        },
        getProperties() {
          throw Error('forbidden bulk properties')
        },
        getProperty(key: string) {
          propertyReads.push(key)
          if (key === 'CAMERA_TOKEN' || key.startsWith('SKY_EVIDENCE_')) throw Error('private property')
          if (fail === 'refresh' && key === 'GE_SCHEDULES_REFRESHED_AT') throw Error('private refresh')
          if (fail === 'pending-read' && key.startsWith(PREFIX)) throw Error('private pending')
          return props[key] ?? null
        },
        setProperty(key: string, value: string) {
          expect(key === OBSERVER || key.startsWith(PREFIX)).toBe(true)
          events.push('save:' + key)
          if (key.startsWith(PREFIX) && ++saveCount === failSaveAt && fail === 'save-before')
            throw Error('private save')
          props[key] = value
          if (key.startsWith(PREFIX) && saveCount === failSaveAt && fail === 'save-after') throw Error('private save')
        },
        deleteProperty(key: string) {
          expect(key.startsWith(PREFIX)).toBe(true)
          events.push('delete')
          delete props[key]
        }
      })
    },
    DriveApp: {
      getFolderById(id: string) {
        folders.push(id)
        expect(['sky', 'crowd']).toContain(id)
        if (fail === 'folder') throw Error('private folder')
        return {
          getFiles: () =>
            iterator(
              files[id]!.map((file) => ({
                isTrashed: () => !!file.trashed,
                getId: () => file.id,
                getName: () => file.name,
                getDateCreated: () => file.created,
                getBlob: () => ({
                  getDataAsString: (charset: string) => {
                    expect(charset).toBe('UTF-8')
                    if (fail === 'blob') throw Error('private blob')
                    return file.text
                  }
                })
              }))
            )
        }
      }
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha' },
      Charset: { UTF_8: 'UTF-8' },
      computeDigest: (_algorithm: string, text: string) => [...Buffer.from(hash(text), 'hex')],
      base64Encode: (text: string) => Buffer.from(text).toString('base64'),
      base64EncodeWebSafe: (text: string) => Buffer.from(text).toString('base64url'),
      base64Decode: (text: string) => [...Buffer.from(text, 'base64')],
      base64DecodeWebSafe: (text: string) => [...Buffer.from(text, 'base64url')],
      newBlob: (bytes: number[]) => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') })
    },
    ScriptApp: { getOAuthToken: () => 'test-only-token' },
    LockService: {
      getScriptLock: () => ({ waitLock: () => events.push('lock'), releaseLock: () => events.push('unlock') })
    },
    UrlFetchApp: {
      fetch(url: string, options: { payload?: string }) {
        urls.push(url)
        const path = new URL(url).pathname.replace('/gmail/v1/users/me', '')
        if (path === '/profile') return response({ emailAddress: 'owner@example.com' })
        if (path === '/drafts') {
          const raw = Buffer.from(JSON.parse(options.payload!).message.raw, 'base64url').toString('utf8')
          const [head, encoded] = raw.split('\r\n\r\n')
          const unfolded = head!.replace(/\r\n /g, ' ')
          const headers = [...unfolded.matchAll(/^([^:\r\n]+): (.*)$/gm)].map((match) => ({
            name: match[1]!,
            value: match[2]!.replace(/\r$/, '')
          }))
          const id = 'draft-' + ++sequence
          const message = {
            id: 'message-' + sequence,
            threadId: 'thread-' + sequence,
            payload: {
              mimeType: 'text/plain',
              headers,
              body: { data: Buffer.from(encoded!.replace(/\s/g, ''), 'base64').toString('base64url') }
            }
          }
          drafts.set(id, { id, message })
          events.push('create')
          return response({ id })
        }
        if (path === '/drafts/send') {
          const id = JSON.parse(options.payload!).id,
            draft = drafts.get(id)!
          const message = { ...draft.message, id: 'sent-' + sequence, labelIds: ['SENT'] }
          sent.set(message.id, message)
          drafts.delete(id)
          events.push('send')
          return response({ id: message.id })
        }
        if (path.startsWith('/drafts/'))
          return drafts.has(path.slice(8)) ? response(drafts.get(path.slice(8))) : response({}, 404)
        if (path === '/messages') {
          expect(new URL(url).searchParams.get('labelIds')).toBe('SENT')
          return response({ messages: [...sent.keys()].map((id) => ({ id })) })
        }
        if (path.startsWith('/messages/')) return response(sent.get(path.slice(10)))
        throw Error('forbidden inbox operation ' + path)
      }
    }
  }
  for (const [name, value] of Object.entries(services)) {
    if (!original.has(name)) original.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  }
  function active() {
    seed('devices', [{ device_id: 'pi-a', kind: 'pi', last_heartbeat_at: new Date(Date.now() - 61 * 60_000) }])
  }
  return {
    services,
    rows,
    reads,
    events,
    propertyReads,
    props,
    files,
    folders,
    drafts,
    sent,
    seed,
    records,
    active,
    urls,
    fail: (value: string, at = 0) => {
      fail = value
      failSaveAt = at
      saveCount = 0
    }
  }
}
function factory(sheet = 'sheet', sky = 'sky', crowd = 'crowd'): AuditorPorts {
  const fn = (gas as Record<string, unknown>).auditorPorts
  expect(typeof fn).toBe('function')
  return (fn as (sheet: string, sky: string, crowd: string) => AuditorPorts)(sheet, sky, crowd)
}

test('constructs lazily, validates required distinct storage IDs and preserves native cells and physical order', () => {
  const n = native(),
    date = new Date('2026-11-05T13:00:00Z')
  n.seed('readings', [
    { source_id: 'first', observed_at: date, value: 0 },
    { source_id: 'second', observed_at: date, value: false }
  ])
  const ports = factory()
  expect(n.events).toEqual([])
  expect(n.reads).toEqual([])
  expect(n.folders).toEqual([])
  for (const ids of [
    ['', 'sky', 'crowd'],
    ['sheet', ' ', 'crowd'],
    ['sheet', 'sky', ''],
    ['sheet', 'sky', 'sky'],
    ['sheet', 'sheet', 'crowd']
  ])
    expect(() => factory(...(ids as [string, string, string]))).toThrow()
  const input = ports.readInput()
  expect(input.readings.map((row) => row.source_id)).toEqual(['first', 'second'])
  expect(input.readings[0]?.observed_at).toBe(date)
  expect(input.readings.map((row) => row.value)).toEqual([0, false])
  expect(gas.readColumns('sheet', 'readings', ['observed_at'])[0]?.observed_at).toBe('2026-11-05T21:00:00+08:00')
  expect(n.propertyReads).not.toContain('CAMERA_DAY_START')
})

test('reads only exact necessary projections, live folders and conditional daylight; refresh read failure is explicit', () => {
  const n = native()
  for (const tab of ['sources', 'readings', 'polls', 'devices', 'crowd_grades', 'ledger', 'notifications'] as const)
    n.seed(tab, [{}])
  n.seed('sources', [{ source_id: 'cam-1', kind: 'camera' }])
  const date = new Date('2026-11-05T13:05:00Z')
  n.files.sky!.push(
    { id: 'actual', name: 'actual.json', text: '{"t_eval":"old"}', created: date },
    { id: 'trash', name: 'trash', text: 'private', created: date, trashed: true }
  )
  n.files.crowd!.push({ id: 'crowd-file', name: 'crowd.json', text: '{}', created: date })
  const ports = factory(),
    input = ports.readInput()
  ports.notifications()
  expect(input.crossings).toEqual([
    { fileId: 'actual', name: 'actual.json', text: '{"t_eval":"old"}', writtenAt: date, pack: 'sky' },
    { fileId: 'crowd-file', name: 'crowd.json', text: '{}', writtenAt: date, pack: 'crowd' }
  ])
  expect(n.folders).toEqual(['sky', 'crowd'])
  expect(n.reads.map((read) => `${read.tab}:${read.column}`).sort()).toEqual(
    [
      ...['source_id', 'kind', 'stale_after_min'].map((key) => 'sources:' + key),
      ...['source_kind', 'source_id', 'metric', 'observed_at', 'received_at', 'value'].map((key) => 'readings:' + key),
      ...['source_kind', 'source_id', 'started_at', 'received_at', 'outcome', 'http_status'].map(
        (key) => 'polls:' + key
      ),
      ...['device_id', 'kind', 'last_heartbeat_at'].map((key) => 'devices:' + key),
      ...['night_id', 'outcome', 'next_update', 'graded_at'].map((key) => 'crowd_grades:' + key),
      ...['source_ref'].map((key) => 'ledger:' + key),
      ...['at', 'kind', 'to', 'ref', 'gmail_message_id'].map((key) => 'notifications:' + key)
    ].sort()
  )
  expect(n.propertyReads).toEqual(['CAMERA_DAY_START', 'CAMERA_DAY_END', 'GE_SCHEDULES_REFRESHED_AT'])
  n.fail('refresh')
  expect(ports.readInput().refresh).toEqual({ status: 'unreadable' })
  for (const fail of ['folder', 'iteration', 'blob', 'sheet', 'read']) {
    n.fail(fail)
    expect(() => ports.readInput()).toThrow()
  }
})

test('isolates owned corrupt state, never enumerates private values, and rejects invalid replacement before writes', () => {
  const n = native(),
    ports = factory()
  n.props[PREFIX + 'broken'] = '{'
  expect(ports.pending()).toEqual([{ key: PREFIX + 'broken', status: 'invalid', code: 'transition_invalid' }])
  expect(n.propertyReads).toEqual([PREFIX + 'broken'])
  expect(n.events[0]).toBe('keys')
  expect(ports.credentialState()).toBe(null)
  expect(() => ports.saveCredentialState({ version: 1, availability: 'unavailable', generation: 0 })).toThrow()
  expect(() => ports.saveTransition({} as AuditTransition)).toThrow()
  expect(n.events.filter((event) => event.startsWith('save:'))).toEqual([])
  n.fail('pending-read')
  expect(() => ports.pending()).toThrow()
})

test('keeps a codec-valid wrong-key record and blocks its derived ref while an unrelated device progresses', () => {
  const n = native(),
    ports = factory()
  n.seed(
    'devices',
    ['pi-a', 'pi-b'].map((device_id) => ({
      device_id,
      kind: 'pi',
      last_heartbeat_at: new Date(Date.now() - 61 * 60_000)
    }))
  )
  const eventId = 'event-frozen',
    to = 'admin@example.com'
  const value: AuditTransition = {
    version: 1,
    eventId,
    family: 'pi',
    ref: 'pi-a',
    kind: 'pi_offline',
    detectedAt: new Date().toISOString(),
    subject: 'Frozen subject',
    body: 'Frozen body',
    recipients: [{ to, marker: `audit:${hash(`${eventId}\0${to}`)}`, attempt: {} }]
  }
  const wrongKey = PREFIX + 'a'.repeat(64),
    raw = JSON.stringify(value)
  n.props[wrongKey] = raw
  expect(ports.pending()).toEqual([{ key: wrongKey, status: 'valid', transition: value }])
  const result = runAuditor(ports)
  expect(result.problems.map((problem) => problem.code)).toContain('transition_invalid')
  expect(n.props[wrongKey]).toBe(raw)
  expect(n.props[auditTransitionKey('pi', 'pi-a', hash)]).toBeUndefined()
  expect(n.records('notifications').map((row) => row.ref)).toEqual(['pi-b'])
  const writes = n.events.filter((event) => event.startsWith('save:')).length
  expect(() => ports.saveTransition({ ...value, body: '😺'.repeat(3000) })).toThrow('overflow')
  expect(() =>
    ports.saveTransition({ ...value, recipients: [{ to, marker: `audit:${'a'.repeat(64)}`, attempt: {} }] })
  ).toThrow('binding')
  expect(n.events.filter((event) => event.startsWith('save:'))).toHaveLength(writes)
})

test('notification acknowledgement follows flush and native state read failures stay explicit', () => {
  const n = native()
  n.active()
  const ports = factory(),
    report = runAuditor(ports)
  expect(report.sentMessages).toBe(1)
  const append = n.events.indexOf('append')
  expect(n.events.slice(append, append + 3)).toEqual(['append', 'flush', 'delete'])
  n.fail('keys')
  expect(() => ports.pending()).toThrow()
  n.props[OBSERVER] = '{'
  expect(() => ports.credentialState()).toThrow()
  n.fail('read')
  expect(() => factory().notifications()).toThrow()
})

test.each(['append-before', 'append-after', 'flush'])(
  'reconciles %s without duplicate provider IDs or rows and rereads invalidated cache',
  (failure) => {
    const n = native()
    n.active()
    n.fail(failure)
    const ports = factory(),
      first = runAuditor(ports)
    expect(first.problems.map((problem) => problem.code)).toContain('notification_append_failed')
    expect(n.sent.size).toBe(1)
    expect(n.events.indexOf('append')).toBeGreaterThan(n.events.indexOf('send'))
    expect(ports.notifications()).toHaveLength(failure === 'append-before' ? 0 : 1)
    const second = runAuditor(ports)
    expect(second.pendingTransitions).toBe(0)
    expect(n.sent.size).toBe(1)
    expect(n.records('notifications')).toHaveLength(1)
    expect(n.events.filter((event) => event === 'create')).toHaveLength(1)
    expect(n.events.at(-1)).not.toBe('append')
  }
)

test.each(['save-before', 'save-after'])(
  'preserves %s partial native state and frozen audience/content across restart',
  (failure) => {
    const n = native()
    n.active()
    n.props.TEAM_ALERT_EMAILS = 'admin@example.com,second@example.com'
    n.fail(failure, 4)
    const first = runAuditor(factory())
    expect(first.problems.map((problem) => problem.code)).toContain('intent_save_failed')
    const key = auditTransitionKey('pi', 'pi-a', hash),
      frozen = JSON.parse(n.props[key]!) as AuditTransition
    expect(frozen.recipients[1]?.attempt).toEqual({})
    n.props.TEAM_ALERT_EMAILS = 'changed@example.com'
    n.seed('devices', [])
    n.fail('')
    runAuditor(factory())
    const stored = n.props[key] ? (JSON.parse(n.props[key]!) as AuditTransition) : null
    if (failure === 'save-before') {
      expect(n.sent.size).toBe(1)
      expect(stored?.recipients[0]?.attempt.draftCreationAttempted).toBe(true)
    } else {
      expect(n.sent.size).toBe(2)
      expect(n.records('notifications').map((row) => row.to)).toEqual(['admin@example.com', 'second@example.com'])
      expect(n.props[key]).toBeUndefined()
    }
    for (const message of n.sent.values()) {
      const payload = message.payload as { headers: { name: string; value: string }[]; body: { data: string } }
      expect(payload.headers.find((header) => header.name === 'To')?.value).not.toBe('changed@example.com')
      const text = Buffer.from(payload.body.data, 'base64url').toString('utf8')
      const recipient = frozen.recipients.find(
        (recipient) => recipient.to === payload.headers.find((header) => header.name === 'To')?.value
      )!
      expect(text).toBe(`${frozen.body}\n\n${recipient.marker}`)
      const subject = payload.headers
        .find((header) => header.name === 'Subject')!
        .value.replace(/\?=\s+(?==\?)/g, '?=')
        .replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_, data: string) => Buffer.from(data, 'base64').toString('utf8'))
      expect(subject).toBe(`${frozen.subject} [${recipient.marker}]`)
    }
    expect(n.urls.every((url) => !url.includes('INBOX'))).toBe(true)
  }
)

let outdir = '',
  code = ''
beforeAll(async () => {
  outdir = mkdtempSync(join(tmpdir(), 'auditor-native-'))
  await build({ outdir, sha: 'test', builtAt: '2026-11-08T00:00:00Z', pilotScriptId: '' })
  code = readFileSync(join(outdir, 'Code.js'), 'utf8')
})
afterAll(() => rmSync(outdir, { recursive: true, force: true }))
test('built main requires actual config, holds one lock and emits compact codes without private content', () => {
  const n = native()
  n.active()
  const logs: string[] = [],
    context = createContext({ Date, ...n.services, console: { log: (line: string) => logs.push(line) } })
  runInContext(code, context)
  expect(typeof context.runAuditor).toBe('function')
  context.runAuditor()
  expect(n.events.filter((event) => event === 'lock')).toHaveLength(1)
  expect(n.events.at(-1)).toBe('unlock')
  expect(logs).toHaveLength(1)
  expect(logs[0]).not.toMatch(/admin@|pi-a|body|subject|private/)
  expect(JSON.parse(logs[0]!).sentMessages).toBe(1)
  delete n.props.CROSSINGS_SKY_FOLDER_ID
  expect(() => context.runAuditor()).toThrow()
  n.props.CROSSINGS_SKY_FOLDER_ID = 'sky'
  n.props.TEAM_ALERT_EMAILS = ''
  expect(() => context.runAuditor()).toThrow()
})
test('built main releases the outer lock after native failure and performs no unchecked provider work', () => {
  const n = native()
  n.fail('sheet')
  const context = createContext({ Date, ...n.services, console: { log() {} } })
  runInContext(code, context)
  expect(typeof context.runAuditor).toBe('function')
  context.runAuditor()
  expect(n.events.at(-1)).toBe('unlock')
  expect(n.urls).toEqual([])
})
