import { describe, expect, test } from 'bun:test'
import {
  runEvidenceInbox,
  type EvidenceInboxCursor,
  type EvidenceInboxMessage,
  type EvidenceInboxPorts,
  type EvidenceMessagePage
} from './evidence.ts'
import type {
  EvidenceNoticeIntent,
  EvidenceNotificationPorts,
  EvidenceDraft,
  EvidenceSentMessage
} from './evidence-notification.ts'
import type { EvidenceStoredRows } from './evidence-projections.ts'
import type { Row } from './schema.ts'

const emptyRows = (): EvidenceStoredRows => ({
  readings: [],
  warnings: [],
  forecast: [],
  glossary: [],
  ledger: [],
  grades: [],
  windows: [],
  now: [],
  probation: []
})
const mail = (id: string, fields: Partial<EvidenceInboxMessage> = {}): EvidenceInboxMessage => ({
  id,
  receivedAt: '2026-11-07T10:00:01.600+08:00',
  fromAddress: 'requester@example.test',
  subject: 'evidence for 2 Nov 14:00–16:30',
  body: 'private requester text',
  inInbox: true,
  sentByOwner: false,
  mailerDaemon: false,
  ...fields
})

function fixture() {
  let instant = new Date('2026-11-07T10:00:00.500+08:00')
  let cursor: EvidenceInboxCursor | null = null
  const evidence: Row<'evidence'>[] = [],
    notifications: Row<'notifications'>[] = []
  const intents = new Map<string, EvidenceNoticeIntent>(),
    messages = new Map<string, EvidenceInboxMessage>()
  const drafts = new Map<string, EvidenceDraft>(),
    sent: EvidenceSentMessage[] = []
  const events: string[] = [],
    fetched: string[] = [],
    listed: EvidenceInboxCursor[] = []
  const subscribers: Row<'subscribers'>[] = []
  let rows = emptyRows(),
    packReads = 0,
    duty: string | null = 'approver@example.test'
  let appendFailure: 'before' | 'after' | null = null,
    cursorFailure = false,
    intentFailure = false
  let pages: (value: EvidenceInboxCursor) => EvidenceMessagePage = () => ({ messageIds: [...messages.keys()] })
  const notices: EvidenceNotificationPorts = {
    now: () => instant,
    intent: (id) => (intents.has(id) ? { ...intents.get(id)! } : null),
    saveIntent: (intent) => {
      events.push('intent')
      if (intentFailure) throw new Error('private intent failure')
      intents.set(intent.requestId, { ...intent })
    },
    removeIntent: (id) => {
      intents.delete(id)
    },
    intents: () => [...intents.values()].map((item) => ({ ...item })),
    evidence: (id) => evidence.find((row) => row.request_id === id) ?? null,
    notification: (id) => notifications.find((row) => row.ref === id) ?? null,
    requesterAddress: (id) => messages.get(id)?.fromAddress ?? null,
    dutyAt: () => duty,
    hashId: (id) => `hash-${id}`,
    workbookReference: () => 'https://docs.google.com/spreadsheets/d/test-workbook',
    createDraft: (value) => {
      events.push('draft')
      const draft = {
        ...value,
        id: `draft-${drafts.size}`,
        messageId: `draft-message-${drafts.size}`,
        threadId: 'thread'
      }
      drafts.set(draft.id, draft)
      return draft
    },
    draft: (id) => drafts.get(id) ?? null,
    sendDraft: (id) => {
      events.push('send')
      const draft = drafts.get(id)!
      const value = {
        to: draft.to,
        subject: draft.subject,
        body: draft.body,
        id: `sent-${sent.length}`,
        threadId: draft.threadId
      }
      sent.push(value)
      drafts.delete(id)
      return value
    },
    findSent: () => sent,
    appendNotification: (row) => {
      events.push('notification')
      notifications.push(row)
    }
  }
  const ports: EvidenceInboxPorts = {
    now: () => instant,
    ownerEmail: () => 'owner@example.test',
    projectSlug: () => 'test-project',
    cursor: () => (cursor ? structuredClone(cursor) : null),
    saveCursor: (value) => {
      events.push('cursor')
      if (cursorFailure) throw new Error('private cursor failure')
      cursor = structuredClone(value)
    },
    listMessages: (value) => {
      listed.push(structuredClone(value))
      return pages(value)
    },
    message: (id) => {
      fetched.push(id)
      return messages.get(id) ?? null
    },
    evidenceRows: () => evidence,
    packRows: () => {
      packReads++
      return rows
    },
    appendEvidence: (row) => {
      events.push('evidence')
      if (appendFailure === 'before') throw new Error('private append failure')
      evidence.push({ ...row })
      if (appendFailure === 'after') throw new Error('persisted then threw')
    },
    unsubscribe: (address, at) => {
      events.push('unsubscribe')
      for (const row of subscribers)
        if (String(row.email).toLowerCase() === address.toLowerCase() && !row.unsubscribed_at) row.unsubscribed_at = at
    },
    notices
  }
  return {
    ports,
    evidence,
    notifications,
    intents,
    messages,
    sent,
    events,
    fetched,
    listed,
    subscribers,
    get cursor() {
      return cursor
    },
    get packReads() {
      return packReads
    },
    set instant(value: Date) {
      instant = value
    },
    set rows(value: EvidenceStoredRows) {
      rows = value
    },
    set duty(value: string | null) {
      duty = value
    },
    set pages(value: typeof pages) {
      pages = value
    },
    set appendFailure(value: typeof appendFailure) {
      appendFailure = value
    },
    set cursorFailure(value: boolean) {
      cursorFailure = value
    },
    set intentFailure(value: boolean) {
      intentFailure = value
    },
    arm() {
      runEvidenceInbox(ports)
      instant = new Date('2026-11-07T10:00:05.750+08:00')
    }
  }
}

describe('evidence inbox orchestration', () => {
  test('first run only arms an exact activation boundary', () => {
    const f = fixture()
    f.messages.set('old', mail('old'))
    expect(runEvidenceInbox(f.ports)).toEqual({
      initialized: true,
      processed: [],
      skipped: [],
      pendingNoticeIds: [],
      pageComplete: true,
      errors: []
    })
    expect(f.cursor).toEqual({
      activatedAt: '2026-11-07T10:00:00.500+08:00',
      lowerBound: '2026-11-07T10:00:00.500+08:00'
    })
    expect(f.listed).toHaveLength(0)
    expect(f.evidence).toHaveLength(0)
  })

  test('materializes real parser/pack output before a duty-only notification, preserving later workflow cells', () => {
    const f = fixture()
    f.arm()
    f.messages.set('one', mail('one'))
    const result = runEvidenceInbox(f.ports)
    expect(result.processed).toEqual(['one'])
    expect(result.errors).toEqual([])
    expect(f.evidence[0]).toEqual({
      request_id: 'one',
      received_at: '2026-11-07T10:00:01.600+08:00',
      kind: 'evidence',
      span_start: '2026-11-02T14:00:00+08:00',
      span_end: '2026-11-02T16:30:00+08:00',
      pack_json: expect.any(String),
      status: 'parsed',
      drafted_at: '',
      approved_at: '',
      replied_at: ''
    })
    const pack = JSON.parse(String(f.evidence[0]!.pack_json))
    expect(pack.warnings).toBe('No warning record for this window')
    expect(pack.frames).toBe('No frames held for this window')
    expect(JSON.stringify(pack)).not.toContain('requester')
    expect(JSON.stringify(pack)).not.toContain('private')
    expect(f.events.indexOf('intent')).toBeLessThan(f.events.indexOf('evidence'))
    expect(f.events.indexOf('evidence')).toBeLessThan(f.events.indexOf('send'))
    expect(f.sent.map((value) => value.to)).toEqual(['approver@example.test'])
    Object.assign(f.evidence[0]!, {
      status: 'replied',
      drafted_at: 'drafted',
      approved_at: 'approved',
      replied_at: 'replied'
    })
    runEvidenceInbox(f.ports)
    expect(f.evidence).toHaveLength(1)
    expect(f.evidence[0]!.status).toBe('replied')
    expect(f.evidence[0]!.approved_at).toBe('approved')
    expect(f.fetched).toEqual(['one'])
    expect(f.sent).toHaveLength(1)
  })

  test('classifies unrelated and decode-failed mail as header-only unparseable without intents', () => {
    const f = fixture()
    f.arm()
    f.messages.set('unrelated', mail('unrelated', { subject: 'ordinary mail', body: 'private text' }))
    f.messages.set('malformed', mail('malformed', { decodeError: 'mime_invalid' }))
    expect(runEvidenceInbox(f.ports).processed).toEqual(['unrelated', 'malformed'])
    for (const row of f.evidence) {
      expect(row.kind).toBe('unparseable')
      expect(Object.keys(JSON.parse(String(row.pack_json)))).toEqual(['header'])
    }
    expect(f.intents.size).toBe(0)
    expect(f.sent).toHaveLength(0)
    expect(f.packReads).toBe(0)
  })

  test('skips owner, SENT, mailer-daemon, non-INBOX and deleted mail', () => {
    const f = fixture()
    f.arm()
    f.messages.set('owner', mail('owner', { fromAddress: 'OWNER@example.test' }))
    f.messages.set('sent', mail('sent', { sentByOwner: true }))
    f.messages.set('daemon', mail('daemon', { mailerDaemon: true }))
    f.messages.set('archived', mail('archived', { inInbox: false }))
    f.pages = () => ({ messageIds: ['owner', 'sent', 'daemon', 'archived', 'deleted'] })
    expect(runEvidenceInbox(f.ports).skipped).toEqual(['owner', 'sent', 'daemon', 'archived', 'deleted'])
    expect(f.evidence).toHaveLength(0)
    expect(f.sent).toHaveLength(0)
  })

  test('enforces exact millisecond activation and frozen upper boundaries', () => {
    const f = fixture()
    f.arm()
    for (const [id, receivedAt] of [
      ['before', '2026-11-07T10:00:00.499+08:00'],
      ['activation', '2026-11-07T10:00:00.500+08:00'],
      ['after', '2026-11-07T10:00:00.501+08:00'],
      ['upper', '2026-11-07T10:00:05.750+08:00'],
      ['future', '2026-11-07T10:00:05.751+08:00']
    ])
      f.messages.set(id!, mail(id!, { receivedAt }))
    expect(runEvidenceInbox(f.ports).processed).toEqual(['after', 'upper'])
    f.instant = new Date('2026-11-07T10:00:07+08:00')
    expect(runEvidenceInbox(f.ports).processed).toEqual(['future'])
  })

  test('freezes pagination against later arrivals and advances only drained page tokens', () => {
    const f = fixture()
    f.arm()
    f.messages.set('one', mail('one'))
    f.messages.set('arrival', mail('arrival', { receivedAt: '2026-11-07T10:00:06+08:00' }))
    f.pages = (cursor) =>
      cursor.pageToken ? { messageIds: ['arrival'] } : { messageIds: ['one'], nextPageToken: 'page-2' }
    expect(runEvidenceInbox(f.ports).pageComplete).toBe(true)
    expect(f.cursor!.pageToken).toBe('page-2')
    expect(f.cursor!.upperBound).toBe('2026-11-07T10:00:05.750+08:00')
    f.instant = new Date('2026-11-07T10:00:10+08:00')
    expect(runEvidenceInbox(f.ports).processed).toEqual([])
    expect(f.listed[1]!.upperBound).toBe('2026-11-07T10:00:05.750+08:00')
    f.pages = () => ({ messageIds: ['arrival'] })
    expect(runEvidenceInbox(f.ports).processed).toEqual(['arrival'])
  })

  test('checkpoints exact remaining IDs so five skipped IDs cannot starve the sixth', () => {
    const f = fixture()
    f.arm()
    for (let n = 0; n < 6; n++) f.messages.set(String(n), mail(String(n), n < 5 ? { sentByOwner: true } : {}))
    expect(runEvidenceInbox(f.ports).pageComplete).toBe(false)
    expect(f.fetched).toEqual(['0', '1', '2', '3', '4'])
    expect(f.cursor!.pageToken).toBeUndefined()
    expect(f.cursor!.page!.remainingIds).toEqual(['5'])
    f.pages = () => {
      throw new Error('must use saved snapshot')
    }
    expect(runEvidenceInbox(f.ports).processed).toEqual(['5'])
    expect(f.fetched).toEqual(['0', '1', '2', '3', '4', '5'])
  })

  test('retains a failed remaining ID and never advances past a failed append', () => {
    const f = fixture()
    f.arm()
    for (let n = 0; n < 7; n++) f.messages.set(String(n), mail(String(n)))
    runEvidenceInbox(f.ports)
    f.appendFailure = 'before'
    const result = runEvidenceInbox(f.ports)
    expect(result.pageComplete).toBe(false)
    expect(f.evidence).toHaveLength(5)
    expect(f.cursor!.page!.remainingIds).toEqual(['5', '6'])
    expect(result.errors).toContainEqual({ requestId: '5', code: 'evidence_append_failed' })
    f.appendFailure = null
    expect(runEvidenceInbox(f.ports).processed).toEqual(['5', '6'])
    expect(f.evidence).toHaveLength(7)
  })

  test('stops starting work after the elapsed budget but always allows first progress', () => {
    const f = fixture()
    f.arm()
    f.messages.set('one', mail('one'))
    f.messages.set('two', mail('two'))
    const realAppend = f.ports.appendEvidence
    f.ports.appendEvidence = (row) => {
      realAppend(row)
      f.instant = new Date('2026-11-07T10:00:26+08:00')
    }
    const result = runEvidenceInbox(f.ports)
    expect(result.processed).toEqual(['one'])
    expect(result.pageComplete).toBe(false)
    expect(f.cursor!.page!.remainingIds).toEqual(['two'])
  })

  test('cursor save failure reports an address-free error and does no further work', () => {
    const f = fixture()
    f.arm()
    f.messages.set('one', mail('one'))
    f.cursorFailure = true
    const result = runEvidenceInbox(f.ports)
    expect(result.errors).toContainEqual({ code: 'cursor_save_failed' })
    expect(result.pageComplete).toBe(false)
    expect(f.evidence).toHaveLength(0)
    expect(f.cursor!.upperBound).toBeUndefined()
    f.cursorFailure = false
    expect(runEvidenceInbox(f.ports).processed).toEqual(['one'])
  })

  test('a cursor failure after handling a skipped message safely replays without dropping the remainder', () => {
    const f = fixture()
    f.arm()
    f.messages.set('skip', mail('skip', { sentByOwner: true }))
    f.messages.set('one', mail('one'))
    const save = f.ports.saveCursor
    let saves = 0
    f.ports.saveCursor = (cursor) => {
      if (++saves === 2) throw new Error('checkpoint unavailable')
      save(cursor)
    }
    expect(runEvidenceInbox(f.ports).pageComplete).toBe(false)
    expect(f.evidence).toHaveLength(0)
    f.ports.saveCursor = save
    expect(runEvidenceInbox(f.ports).processed).toEqual(['one'])
  })

  test('rejects oversized provider pages without advancing the cursor', () => {
    const f = fixture()
    f.arm()
    f.pages = () => ({ messageIds: Array.from({ length: 26 }, (_, n) => String(n)) })
    expect(runEvidenceInbox(f.ports).errors).toContainEqual({ code: 'message_page_too_large' })
    expect(f.fetched).toHaveLength(0)
    expect(f.cursor!.lowerBound).toBe('2026-11-07T10:00:00.500+08:00')
  })

  test('unsubscribes matching unstamped rows at receipt time before a persisted-then-thrown append', () => {
    const f = fixture()
    f.arm()
    f.subscribers.push(
      { subscriber_id: 'a', email: 'REQUESTER@example.test', consent_at: 'consent', unsubscribed_at: '' },
      { subscriber_id: 'b', email: 'requester@example.test', unsubscribed_at: 'old' },
      { subscriber_id: 'c', email: 'other@example.test', unsubscribed_at: '' }
    )
    f.messages.set('unsub', mail('unsub', { subject: 'unsubscribe' }))
    f.appendFailure = 'after'
    runEvidenceInbox(f.ports)
    expect(f.subscribers).toEqual([
      {
        subscriber_id: 'a',
        email: 'REQUESTER@example.test',
        consent_at: 'consent',
        unsubscribed_at: '2026-11-07T10:00:01.600+08:00'
      },
      { subscriber_id: 'b', email: 'requester@example.test', unsubscribed_at: 'old' },
      { subscriber_id: 'c', email: 'other@example.test', unsubscribed_at: '' }
    ])
    expect(f.events.indexOf('unsubscribe')).toBeLessThan(f.events.indexOf('evidence'))
    f.appendFailure = null
    runEvidenceInbox(f.ports)
    f.messages.set('unsub2', mail('unsub2', { subject: 'unsubscribe', receivedAt: '2026-11-07T10:00:05+08:00' }))
    runEvidenceInbox(f.ports)
    expect(f.subscribers[0]!.unsubscribed_at).toBe('2026-11-07T10:00:01.600+08:00')
    expect(f.evidence).toHaveLength(2)
    expect(f.sent).toHaveLength(0)
    expect(f.intents.size).toBe(0)
  })

  test('drains an intent after evidence persisted then threw even after the message leaves INBOX', () => {
    const f = fixture()
    f.arm()
    f.messages.set('one', mail('one'))
    f.appendFailure = 'after'
    expect(runEvidenceInbox(f.ports).errors).toContainEqual({ requestId: 'one', code: 'evidence_append_failed' })
    expect(f.evidence).toHaveLength(1)
    expect(f.intents.size).toBe(1)
    expect(f.sent).toHaveLength(0)
    expect(f.intents.get('one')!.routingAt).toBe('2026-11-07T10:00:05.750+08:00')
    expect(JSON.stringify([...f.intents.values()])).not.toContain('private')
    f.messages.get('one')!.inInbox = false
    f.pages = () => ({ messageIds: [] })
    f.appendFailure = null
    runEvidenceInbox(f.ports)
    expect(f.sent.map((item) => item.to)).toEqual(['approver@example.test'])
    expect(f.evidence).toHaveLength(1)
  })

  test('an intent save failure prevents the evidence append and all sends', () => {
    const f = fixture()
    f.arm()
    f.messages.set('one', mail('one'))
    f.intentFailure = true
    expect(runEvidenceInbox(f.ports).errors).toContainEqual({ requestId: 'one', code: 'intent_save_failed' })
    expect(f.evidence).toHaveLength(0)
    expect(f.sent).toHaveLength(0)
  })

  test('missing duty remains pending without blocking other materialization or cursor progress', () => {
    const f = fixture()
    f.arm()
    f.duty = null
    f.messages.set('one', mail('one'))
    f.messages.set('two', mail('two', { subject: 'call for today' }))
    const result = runEvidenceInbox(f.ports)
    expect(result.processed).toEqual(['one', 'two'])
    expect(result.pendingNoticeIds).toEqual(['one', 'two'])
    expect(result.pageComplete).toBe(true)
    expect(result.errors).toEqual([
      { requestId: 'one', code: 'duty_unavailable' },
      { requestId: 'two', code: 'duty_unavailable' }
    ])
    expect(f.sent).toHaveLength(0)
  })

  test('pending routing errors cannot permanently occupy five recovery slots ahead of a deliverable intent', () => {
    const f = fixture()
    f.arm()
    for (let n = 0; n < 6; n++) {
      const id = `old-${n}`
      f.messages.set(id, mail(id, { inInbox: false }))
      f.evidence.push({
        request_id: id,
        kind: 'call',
        span_start: '2026-11-07T00:00:00+08:00',
        span_end: '2026-11-08T00:00:00+08:00',
        status: 'parsed'
      })
      f.intents.set(id, { requestId: id, routingAt: `2026-11-07T09:0${n}:00+08:00`, marker: `evidence:${id}` })
    }
    f.ports.notices.dutyAt = (at) => (at === '2026-11-07T09:05:00+08:00' ? 'approver@example.test' : null)
    f.pages = () => ({ messageIds: [] })
    const result = runEvidenceInbox(f.ports)
    expect(f.sent.map((value) => value.to)).toEqual(['approver@example.test'])
    expect(result.pendingNoticeIds).toEqual(['old-0', 'old-1', 'old-2', 'old-3', 'old-4'])
  })

  test('durable attempt ordering lets a later notice progress after an older provider attempt exhausts the budget', () => {
    const f = fixture()
    f.arm()
    for (let n = 0; n < 2; n++) {
      const id = `old-${n}`
      f.messages.set(id, mail(id, { inInbox: false }))
      f.evidence.push({
        request_id: id,
        kind: 'call',
        span_start: '2026-11-07T00:00:00+08:00',
        span_end: '2026-11-08T00:00:00+08:00',
        status: 'parsed'
      })
      f.intents.set(id, { requestId: id, routingAt: `2026-11-07T09:0${n}:00+08:00`, marker: `evidence:${id}` })
    }
    let slowAttempts = 0
    f.ports.notices.dutyAt = (at) => {
      if (at === '2026-11-07T09:00:00+08:00') {
        // The first provider attempt consumes the budget; another invocation must reach old-1 first.
        f.instant = new Date(++slowAttempts === 1 ? '2026-11-07T10:00:26+08:00' : '2026-11-07T10:00:51+08:00')
        return null
      }
      return 'approver@example.test'
    }
    f.messages.set('new', mail('new'))
    f.pages = () => ({ messageIds: ['new'] })
    expect(runEvidenceInbox(f.ports).processed).toEqual(['new'])
    expect(f.notifications.map((row) => row.ref)).toEqual(['new'])
    expect(f.intents.get('old-0')!.lastAttemptAt).toBe('2026-11-07T10:00:05.750+08:00')
    f.instant = new Date('2026-11-07T10:00:30+08:00')
    runEvidenceInbox(f.ports)
    expect(f.notifications.map((row) => row.ref)).toEqual(['new', 'old-1'])
    expect(f.intents.get('old-0')!.lastAttemptAt).toBe('2026-11-07T10:00:30+08:00')
    expect(f.evidence.filter((row) => row.request_id === 'new')).toHaveLength(1)
    expect(f.sent.every((message) => message.to === 'approver@example.test')).toBe(true)
  })

  test('oversize final kinds have exact error packs and cancel unused earlier intents', () => {
    const f = fixture()
    f.arm()
    f.messages.set('one', mail('one'))
    f.rows = {
      ...emptyRows(),
      warnings: [
        {
          warning_key: 'warning',
          issued: '2026-11-02T13:00:00+08:00',
          valid_from: '2026-11-02T14:00:00+08:00',
          valid_to: '2026-11-02T17:00:00+08:00',
          title_en: 'Kuala Lumpur',
          names_kl: true,
          text_en: 'x'.repeat(51000),
          first_seen_at: '2026-11-02T13:00:00+08:00'
        }
      ]
    }
    f.intents.set('one', { requestId: 'one', routingAt: '2026-11-07T10:00:02+08:00', marker: 'evidence:old' })
    runEvidenceInbox(f.ports)
    expect(f.evidence[0]!.kind).toBe('unparseable')
    expect(f.evidence[0]!.pack_json).toBe('{"error":"pack too large"}')
    expect(f.evidence[0]!.status).toBe('parsed')
    expect(f.intents.size).toBe(0)
    expect(f.sent).toHaveLength(0)
  })
})
