import { describe, expect, test } from 'bun:test'
import {
  deliverEvidenceNotice,
  type EvidenceNoticeIntent,
  type EvidenceNotificationPorts,
  type EvidenceDraft,
  type EvidenceSentMessage
} from './evidence-notification.ts'
import type { Row } from './schema.ts'

// Controlled test-only mail/store ports; sends mutate provider state before any injected failure.
function fixture() {
  let instant = new Date('2026-11-07T10:00:00+08:00')
  let duty: string | null = 'approver@example.test'
  let intent: EvidenceNoticeIntent | null = {
    requestId: 'req-1',
    routingAt: '2026-11-07T09:00:00+08:00',
    marker: 'evidence:abc123'
  }
  const evidence: Row<'evidence'> = {
    request_id: 'req-1',
    kind: 'evidence',
    span_start: '2026-11-02T14:00:00+08:00',
    span_end: '2026-11-02T16:30:00+08:00',
    status: 'parsed'
  }
  const notifications: Row<'notifications'>[] = []
  const drafts = new Map<string, EvidenceDraft>()
  const sent: EvidenceSentMessage[] = []
  const routed: string[] = []
  const events: string[] = []
  let createFails = false,
    loseSend = false,
    sendFails = false,
    logFails = false,
    saveSentFails = false,
    searchFails = false
  let creates = 0,
    sends = 0
  const ports: EvidenceNotificationPorts = {
    now: () => instant,
    intent: () => (intent ? { ...intent } : null),
    saveIntent: (value) => {
      if (saveSentFails && value.gmailMessageId) {
        saveSentFails = false
        throw new Error('private provider error')
      }
      intent = { ...value }
      events.push('save')
    },
    removeIntent: () => {
      intent = null
      events.push('remove')
    },
    intents: () => (intent ? [{ ...intent }] : []),
    evidence: () => evidence,
    notification: () => notifications[0] ?? null,
    requesterAddress: () => 'requester@example.test',
    dutyAt: (at) => {
      routed.push(at)
      return duty
    },
    hashId: () => 'abc123',
    workbookReference: () => 'https://docs.google.com/spreadsheets/d/test-workbook',
    createDraft: (mail) => {
      creates++
      events.push('create')
      if (createFails) throw new Error('private create failure')
      const draft = { ...mail, id: 'draft-1', messageId: 'draft-message-1', threadId: 'thread-1' }
      drafts.set(draft.id, draft)
      return draft
    },
    draft: (id) => drafts.get(id) ?? null,
    sendDraft: (id) => {
      sends++
      events.push('send')
      const draft = drafts.get(id)!
      if (sendFails) throw new Error('private unsent failure')
      const message = {
        id: 'sent-message-1',
        threadId: draft.threadId,
        to: draft.to,
        subject: draft.subject,
        body: draft.body
      }
      sent.push(message)
      drafts.delete(id)
      if (loseSend) throw new Error('private lost response')
      return message
    },
    findSent: () => {
      events.push('search')
      if (searchFails) throw new Error('incomplete provider scan')
      return sent
    },
    appendNotification: (row) => {
      events.push('log')
      notifications.push({ ...row })
      if (logFails) throw new Error('persisted but response lost')
    }
  }
  return {
    ports,
    evidence,
    notifications,
    drafts,
    sent,
    routed,
    events,
    get intent() {
      return intent
    },
    get creates() {
      return creates
    },
    get sends() {
      return sends
    },
    set duty(value: string | null) {
      duty = value
    },
    set instant(value: Date) {
      instant = value
    },
    set createFails(value: boolean) {
      createFails = value
    },
    set loseSend(value: boolean) {
      loseSend = value
    },
    set sendFails(value: boolean) {
      sendFails = value
    },
    set logFails(value: boolean) {
      logFails = value
    },
    set saveSentFails(value: boolean) {
      saveSentFails = value
    },
    set searchFails(value: boolean) {
      searchFails = value
    }
  }
}

describe('durable evidence notices', () => {
  test('sends controlled content only to the duty recipient and logs the final provider ID', () => {
    const f = fixture()
    expect(deliverEvidenceNotice('req-1', f.ports)).toEqual({ status: 'sent', gmailMessageId: 'sent-message-1' })
    expect(f.sent).toHaveLength(1)
    expect(f.sent[0]!.to).toBe('approver@example.test')
    expect(f.sent[0]!.body).toBe(
      'Request: req-1\nKind: evidence\nSpan: 2026-11-02T14:00:00+08:00 – 2026-11-02T16:30:00+08:00\nWorkbook: https://docs.google.com/spreadsheets/d/test-workbook\n[evidence:abc123]'
    )
    expect(f.sent[0]!.subject).toBe('Evidence request [evidence:abc123]')
    expect(f.notifications).toEqual([
      {
        at: '2026-11-07T10:00:00+08:00',
        kind: 'evidence_request',
        to: 'approver@example.test',
        ref: 'req-1',
        gmail_message_id: 'sent-message-1'
      }
    ])
    expect(f.intent).toBeNull()
  })

  test('accepts sparse create/send IDs, hydrates before send and retains the real final ID', () => {
    const f = fixture()
    const create = f.ports.createDraft
    const send = f.ports.sendDraft
    f.ports.createDraft = (mail) => ({ id: create(mail).id })
    f.ports.sendDraft = (id) => ({ id: send(id).id })
    const read = f.ports.draft
    f.ports.draft = (id) => {
      expect(f.intent!.draftId).toBe(id)
      f.events.push('hydrate')
      return read(id)
    }
    f.ports.appendNotification = (row) => {
      expect(f.intent!.gmailMessageId).toBe('sent-message-1')
      expect(f.intent!.threadId).toBe('thread-1')
      f.notifications.push(row)
    }
    expect(deliverEvidenceNotice('req-1', f.ports).status).toBe('sent')
    expect(f.events.indexOf('hydrate')).toBeLessThan(f.events.indexOf('send'))
    expect(f.sent[0]!.to).toBe('approver@example.test')
    expect(f.notifications[0]!.gmail_message_id).toBe('sent-message-1')
  })

  test('keeps the known container after hydrate failure and recovers without creating again', () => {
    const f = fixture()
    const read = f.ports.draft
    f.ports.draft = () => {
      throw new Error('unavailable')
    }
    expect(deliverEvidenceNotice('req-1', f.ports)).toEqual({ status: 'pending', code: 'draft_read_failed' })
    expect(f.intent!.draftId).toBe('draft-1')
    expect(f.sends).toBe(0)
    f.ports.draft = read
    expect(deliverEvidenceNotice('req-1', f.ports).status).toBe('sent')
    expect(f.creates).toBe(1)
    expect(f.sends).toBe(1)
    expect(f.sent[0]!.to).toBe('approver@example.test')
  })

  test.each(['create', 'send'])('rejects an empty %s acknowledgement ID', (stage) => {
    const f = fixture()
    if (stage === 'create') f.ports.createDraft = () => ({ id: '' })
    else f.ports.sendDraft = () => ({ id: '' })
    expect(deliverEvidenceNotice('req-1', f.ports).status).toBe('pending')
    expect(f.notifications).toHaveLength(0)
    expect(f.intent!.gmailMessageId).toBeUndefined()
  })

  test.each([null, 'requester@example.test', 'REQUESTER@example.test', 'bad\naddress@example.test'])(
    'keeps unsuitable duty %s pending without a send',
    (duty) => {
      const f = fixture()
      f.duty = duty
      const result = deliverEvidenceNotice('req-1', f.ports)
      expect(result.status).toBe('pending')
      expect(JSON.stringify(result)).not.toContain('@')
      expect(f.sends).toBe(0)
      expect(f.creates).toBe(0)
      expect(f.intent).not.toBeNull()
    }
  )

  test('repairs a missing rota using the original processing instant', () => {
    const f = fixture()
    f.duty = null
    deliverEvidenceNotice('req-1', f.ports)
    f.instant = new Date('2026-11-08T14:00:00+08:00')
    f.duty = 'approver@example.test'
    expect(deliverEvidenceNotice('req-1', f.ports).status).toBe('sent')
    expect(f.routed).toEqual(['2026-11-07T09:00:00+08:00', '2026-11-07T09:00:00+08:00'])
  })

  test('reuses the verified unsent draft across shifts after searching Sent', () => {
    const f = fixture()
    f.sendFails = true
    expect(deliverEvidenceNotice('req-1', f.ports).status).toBe('pending')
    f.sendFails = false
    f.duty = 'next-shift@example.test'
    expect(deliverEvidenceNotice('req-1', f.ports).status).toBe('sent')
    expect(f.creates).toBe(1)
    expect(f.sent[0]!.to).toBe('approver@example.test')
    expect(f.routed).toHaveLength(1)
    expect(f.events.lastIndexOf('search')).toBeLessThan(f.events.lastIndexOf('send'))
  })

  test('reconciles a lost send response without sending again', () => {
    const f = fixture()
    f.loseSend = true
    expect(deliverEvidenceNotice('req-1', f.ports).status).toBe('pending')
    expect(f.notifications).toHaveLength(0)
    expect(deliverEvidenceNotice('req-1', f.ports)).toEqual({ status: 'reconciled', gmailMessageId: 'sent-message-1' })
    expect(f.sends).toBe(1)
    expect(f.intent).toBeNull()
  })

  test('retains returned provider ID before logging, then recovers a failed log', () => {
    const f = fixture()
    f.ports.appendNotification = () => {
      throw new Error('write unavailable')
    }
    expect(deliverEvidenceNotice('req-1', f.ports).status).toBe('pending')
    expect(f.intent!.gmailMessageId).toBe('sent-message-1')
    f.ports.findSent = () => {
      throw new Error('must not search known ID')
    }
    f.ports.appendNotification = (row) => {
      f.notifications.push(row)
    }
    expect(deliverEvidenceNotice('req-1', f.ports)).toEqual({ status: 'reconciled', gmailMessageId: 'sent-message-1' })
    expect(f.sends).toBe(1)
  })

  test('finishes a known successful send log after the original requester disappears', () => {
    const f = fixture()
    f.ports.appendNotification = () => {
      throw new Error('notification storage unavailable')
    }
    expect(deliverEvidenceNotice('req-1', f.ports).status).toBe('pending')
    expect(f.intent!.gmailMessageId).toBe('sent-message-1')
    expect(f.intent!.recipient).toBe('approver@example.test')
    f.ports.requesterAddress = () => null
    f.ports.dutyAt = () => {
      throw new Error('no new routing needed')
    }
    f.ports.findSent = () => {
      throw new Error('known real ID needs no provider search')
    }
    f.ports.appendNotification = (row) => {
      f.notifications.push(row)
    }
    expect(deliverEvidenceNotice('req-1', f.ports)).toEqual({ status: 'reconciled', gmailMessageId: 'sent-message-1' })
    expect(f.notifications).toEqual([
      {
        at: '2026-11-07T10:00:00+08:00',
        kind: 'evidence_request',
        to: 'approver@example.test',
        ref: 'req-1',
        gmail_message_id: 'sent-message-1'
      }
    ])
    expect(f.sends).toBe(1)
    expect(f.intent).toBeNull()
  })

  test('uses the durable log after an append persisted then threw', () => {
    const f = fixture()
    f.logFails = true
    expect(deliverEvidenceNotice('req-1', f.ports).status).toBe('pending')
    expect(f.intent).not.toBeNull()
    expect(deliverEvidenceNotice('req-1', f.ports)).toEqual({
      status: 'already_logged',
      gmailMessageId: 'sent-message-1'
    })
    expect(f.notifications).toHaveLength(1)
    expect(f.sends).toBe(1)
    expect(f.intent).toBeNull()
  })

  test('recovers if saving the returned send ID failed', () => {
    const f = fixture()
    f.saveSentFails = true
    expect(deliverEvidenceNotice('req-1', f.ports).status).toBe('pending')
    expect(deliverEvidenceNotice('req-1', f.ports).status).toBe('reconciled')
    expect(f.sends).toBe(1)
  })

  test.each(['missing', 'ambiguous', 'wrong recipient', 'wrong subject', 'wrong body', 'incomplete search'])(
    'does not resend an unresolved %s draft',
    (scenario) => {
      const f = fixture()
      f.loseSend = true
      deliverEvidenceNotice('req-1', f.ports)
      if (scenario === 'missing') f.sent.length = 0
      if (scenario === 'ambiguous') f.sent.push({ ...f.sent[0]!, id: 'sent-message-2' })
      if (scenario === 'wrong recipient') f.sent[0]!.to = 'requester@example.test'
      if (scenario === 'wrong subject') f.sent[0]!.subject += ' extra'
      if (scenario === 'wrong body') f.sent[0]!.body += ' extra'
      if (scenario === 'incomplete search') f.searchFails = true
      const result = deliverEvidenceNotice('req-1', f.ports)
      expect(result.status).toBe('pending')
      expect(JSON.stringify(result)).not.toContain('@')
      expect(f.creates).toBe(1)
      expect(f.sends).toBe(1)
      expect(f.notifications).toHaveLength(0)
    }
  )

  test('deduplicates repeated provider hits for one verified message', () => {
    const f = fixture()
    f.loseSend = true
    deliverEvidenceNotice('req-1', f.ports)
    f.sent.push({ ...f.sent[0]! })
    expect(deliverEvidenceNotice('req-1', f.ports).status).toBe('reconciled')
  })

  test('does not send a mutated unsent draft', () => {
    const f = fixture()
    f.sendFails = true
    deliverEvidenceNotice('req-1', f.ports)
    f.drafts.get('draft-1')!.to = 'requester@example.test'
    f.sendFails = false
    expect(deliverEvidenceNotice('req-1', f.ports).status).toBe('pending')
    expect(f.sends).toBe(1)
    expect(f.notifications).toHaveLength(0)
  })

  test('keeps failed draft creation durable without an unchecked replacement', () => {
    const f = fixture()
    f.createFails = true
    expect(deliverEvidenceNotice('req-1', f.ports).status).toBe('pending')
    f.createFails = false
    expect(deliverEvidenceNotice('req-1', f.ports).status).toBe('pending')
    expect(f.creates).toBe(1)
    expect(f.sends).toBe(0)
    expect(f.notifications).toHaveLength(0)
  })

  test.each(['unparseable', 'unsubscribe'])('cancels a leftover intent for persisted %s', (kind) => {
    const f = fixture()
    f.evidence.kind = kind
    expect(deliverEvidenceNotice('req-1', f.ports)).toEqual({ status: 'skipped' })
    expect(f.intent).toBeNull()
    expect(f.sends).toBe(0)
  })

  test('waits for durable evidence and never invents a message ID from a blank log', () => {
    const f = fixture()
    f.ports.evidence = () => null
    expect(deliverEvidenceNotice('req-1', f.ports).status).toBe('pending')
    expect(f.creates).toBe(0)
    f.ports.evidence = () => f.evidence
    f.notifications.push({ kind: 'evidence_request', ref: 'req-1', gmail_message_id: '' })
    expect(deliverEvidenceNotice('req-1', f.ports).status).toBe('sent')
    expect(f.notifications[1]!.gmail_message_id).toBe('sent-message-1')
  })
})
