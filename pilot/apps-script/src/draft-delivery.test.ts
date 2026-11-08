import { describe, expect, test } from 'bun:test'
import {
  deliverControlledDraft,
  type ControlledDraft,
  type ControlledDraftPorts,
  type ControlledMail,
  type ControlledSent,
  type DraftAttemptState
} from './draft-delivery.ts'

const marker = 'controlled:notice-1'
const mail: ControlledMail = {
  to: 'approver@example.test',
  subject: `Controlled notice [${marker}]`,
  body: `Controlled body\n[${marker}]`
}

// External store and provider state survive retries, including lost operation responses.
function fixture(initial: DraftAttemptState = {}) {
  const input = Object.freeze({ ...initial })
  let durable: DraftAttemptState = { ...initial }
  const drafts = new Map<string, ControlledDraft>()
  const sent: ControlledSent[] = []
  const saves: DraftAttemptState[] = []
  const events: string[] = []
  let createCalls = 0
  let sendCalls = 0
  const ports: ControlledDraftPorts = {
    saveAttempt(next) {
      durable = { ...next }
      saves.push({ ...next })
      events.push('save')
    },
    createDraft(value) {
      createCalls++
      events.push('create')
      expect(durable).toEqual({ recipient: mail.to, draftCreationAttempted: true })
      drafts.set('draft-1', { ...value, id: 'draft-1', messageId: 'draft-message-1', threadId: 'thread-1' })
      return { id: 'draft-1' }
    },
    draft(id) {
      events.push('hydrate')
      expect(durable.draftId).toBe(id)
      return drafts.get(id) ?? null
    },
    sendDraft(id) {
      sendCalls++
      events.push('send')
      const draft = drafts.get(id)!
      const message = { ...draft, id: 'sent-1' }
      sent.push(message)
      drafts.delete(id)
      return { id: message.id }
    },
    findSent(value) {
      events.push('search')
      expect(value).toBe(marker)
      return sent
    }
  }
  return {
    input,
    ports,
    drafts,
    sent,
    saves,
    events,
    get durable() {
      return durable
    },
    get createCalls() {
      return createCalls
    },
    get sendCalls() {
      return sendCalls
    },
    deliver: () => deliverControlledDraft(input, marker, mail, ports),
    retry: () => deliverControlledDraft({ ...durable }, marker, mail, ports)
  }
}

describe('controlled draft delivery', () => {
  test('freezes recipient and attempt together before create, hydrates before send and saves real IDs', () => {
    const f = fixture()
    expect(f.deliver()).toEqual({
      status: 'sent',
      gmailMessageId: 'sent-1',
      attempt: {
        recipient: mail.to,
        draftCreationAttempted: true,
        draftId: 'draft-1',
        threadId: 'thread-1',
        gmailMessageId: 'sent-1'
      }
    })
    expect(f.events).toEqual(['save', 'create', 'save', 'hydrate', 'save', 'send', 'save'])
    expect(f.saves[0]).toEqual({ recipient: mail.to, draftCreationAttempted: true })
    expect(f.sent[0]).toMatchObject(mail)
    expect(f.input).toEqual({})
  })

  test('returns a known durable final ID without saving or provider work', () => {
    const f = fixture({ recipient: mail.to, gmailMessageId: 'known-final' })
    expect(f.deliver()).toEqual({
      status: 'reconciled',
      gmailMessageId: 'known-final',
      attempt: f.input
    })
    expect(f.events).toEqual([])
  })

  test.each([1, 2, 3, 4])('does not expose speculative caller state when save %s throws', (failAt) => {
    const f = fixture()
    const save = f.ports.saveAttempt
    let calls = 0
    f.ports.saveAttempt = (next) => {
      if (++calls === failAt) throw new Error('private storage failure')
      save(next)
    }
    expect(f.deliver()).toEqual({ status: 'pending', code: 'intent_save_failed' })
    expect(f.input).toEqual({})
    expect(f.saves).toHaveLength(failAt - 1)
    expect(f.durable).toEqual(f.saves.at(-1) ?? {})
    expect(f.durable.gmailMessageId).toBeUndefined()
    expect(f.createCalls).toBe(failAt === 1 ? 0 : 1)
    expect(f.sendCalls).toBe(failAt === 4 ? 1 : 0)
  })

  test('recovers a lost create response without creating an unchecked replacement', () => {
    const f = fixture()
    const create = f.ports.createDraft
    f.ports.createDraft = (value) => {
      create(value)
      throw new Error('lost create response')
    }
    expect(f.deliver()).toEqual({ status: 'pending', code: 'draft_create_failed' })
    expect(f.durable).toEqual({ recipient: mail.to, draftCreationAttempted: true })
    expect(f.retry()).toEqual({ status: 'pending', code: 'draft_missing_no_sent_match' })
    expect(f.createCalls).toBe(1)
    expect(f.sendCalls).toBe(0)
  })

  test('reconciles the real sent ID after saving its acknowledgement failed', () => {
    const f = fixture()
    const save = f.ports.saveAttempt
    f.ports.saveAttempt = (next) => {
      if (next.gmailMessageId) throw new Error('final ID not persisted')
      save(next)
    }
    expect(f.deliver()).toEqual({ status: 'pending', code: 'intent_save_failed' })
    expect(f.durable.gmailMessageId).toBeUndefined()
    expect(f.sent).toHaveLength(1)
    f.ports.saveAttempt = save
    expect(f.retry()).toMatchObject({ status: 'reconciled', gmailMessageId: 'sent-1' })
    expect(f.sendCalls).toBe(1)
    expect(f.createCalls).toBe(1)
  })

  test('keeps a Sent reconciliation save failure pending without a speculative final ID', () => {
    const f = fixture({ recipient: mail.to, draftCreationAttempted: true })
    f.sent.push({ ...mail, id: 'sent-1', threadId: 'thread-1' })
    f.ports.saveAttempt = () => {
      throw new Error('reconciliation storage unavailable')
    }
    expect(f.deliver()).toEqual({ status: 'pending', code: 'intent_save_failed' })
    expect(f.durable).toEqual(f.input)
    expect(f.input.gmailMessageId).toBeUndefined()
    expect(f.events).toEqual(['search'])
    expect(f.createCalls).toBe(0)
    expect(f.sendCalls).toBe(0)
  })

  test('does not replace a missing attempted draft after a complete empty Sent search', () => {
    const f = fixture({ recipient: mail.to, draftCreationAttempted: true, draftId: 'missing' })
    const result = f.deliver()
    const createCalls = f.createCalls
    const sendCalls = f.sendCalls
    expect(result).toEqual({ status: 'pending', code: 'draft_missing_no_sent_match' })
    expect(createCalls).toBe(0)
    expect(sendCalls).toBe(0)
    expect(f.events).toEqual(['search', 'hydrate'])
  })

  test('reuses a verified draft only after complete Sent search', () => {
    const f = fixture({ recipient: mail.to, draftId: 'draft-1' })
    f.drafts.set('draft-1', { ...mail, id: 'draft-1', messageId: 'draft-message-1', threadId: 'thread-1' })
    expect(f.deliver().status).toBe('sent')
    expect(f.events).toEqual(['search', 'hydrate', 'send', 'save'])
    expect(f.createCalls).toBe(0)
    expect(f.sendCalls).toBe(1)
  })

  test('reconciles a lost send response with exact content and case-insensitive recipient', () => {
    const f = fixture()
    const send = f.ports.sendDraft
    f.ports.sendDraft = (id) => {
      send(id)
      throw new Error('lost send response')
    }
    expect(f.deliver()).toEqual({ status: 'pending', code: 'send_ambiguous' })
    f.sent[0]!.to = mail.to.toUpperCase()
    f.sent.push({ ...f.sent[0]! })
    expect(f.retry()).toEqual({
      status: 'reconciled',
      gmailMessageId: 'sent-1',
      attempt: { ...f.durable, gmailMessageId: 'sent-1', threadId: 'thread-1' }
    })
    expect(f.createCalls).toBe(1)
    expect(f.sendCalls).toBe(1)
  })

  test.each(['to', 'subject', 'body', 'id'] as const)('rejects a Sent candidate with changed %s', (field) => {
    const f = fixture({ recipient: mail.to, draftCreationAttempted: true })
    f.sent.push({ ...mail, id: 'sent-1', threadId: 'thread-1', [field]: field === 'id' ? '' : 'changed' })
    expect(f.deliver()).toEqual({ status: 'pending', code: 'draft_missing_no_sent_match' })
    expect(f.createCalls).toBe(0)
    expect(f.sendCalls).toBe(0)
  })

  test('rejects multiple distinct exact Sent matches', () => {
    const f = fixture({ recipient: mail.to, draftCreationAttempted: true })
    f.sent.push({ ...mail, id: 'sent-1', threadId: 'thread-1' }, { ...mail, id: 'sent-2', threadId: 'thread-2' })
    expect(f.deliver()).toEqual({ status: 'pending', code: 'sent_ambiguous' })
    expect(f.events).toEqual(['search'])
  })

  test('does not accept partial search results when the provider scan throws', () => {
    const f = fixture({ recipient: mail.to, draftCreationAttempted: true })
    f.sent.push({ ...mail, id: 'sent-1', threadId: 'thread-1' })
    f.ports.findSent = () => {
      throw new Error('later page unavailable')
    }
    expect(f.deliver()).toEqual({ status: 'pending', code: 'sent_search_failed' })
    expect(f.createCalls).toBe(0)
    expect(f.sendCalls).toBe(0)
    expect(f.saves).toHaveLength(0)
  })

  test.each(['new', 'recovery'])('keeps thrown %s draft reads distinct from returned missing drafts', (stage) => {
    const f = fixture(stage === 'new' ? {} : { recipient: mail.to, draftId: 'draft-1' })
    f.ports.draft = () => {
      throw new Error('private read failure')
    }
    expect(f.deliver()).toEqual({ status: 'pending', code: 'draft_read_failed' })
    expect(f.sendCalls).toBe(0)
    expect(f.input).toEqual(stage === 'new' ? {} : { recipient: mail.to, draftId: 'draft-1' })
  })

  test.each(['missing', 'id', 'messageId', 'to', 'subject', 'body'])(
    'rejects a newly hydrated draft with invalid %s',
    (field) => {
      const f = fixture()
      const read = f.ports.draft
      f.ports.draft = (id) => {
        const value = read(id)!
        if (field === 'missing') return null
        return { ...value, [field]: field === 'messageId' ? '' : 'changed' }
      }
      expect(f.deliver()).toEqual({ status: 'pending', code: 'draft_mismatch' })
      expect(f.sendCalls).toBe(0)
    }
  )

  test.each(['id', 'to', 'subject', 'body'])('rejects a mutated recovery draft %s', (field) => {
    const f = fixture({ recipient: mail.to, draftId: 'draft-1' })
    f.drafts.set('draft-1', {
      ...mail,
      id: 'draft-1',
      messageId: 'draft-message-1',
      threadId: 'thread-1',
      [field]: 'changed'
    })
    expect(f.deliver()).toEqual({ status: 'pending', code: 'draft_mismatch' })
    expect(f.sendCalls).toBe(0)
    expect(f.createCalls).toBe(0)
  })

  test.each(['', '  ', 42])('returns draft_mismatch for a returned malformed create ID %s', (id) => {
    const f = fixture()
    f.ports.createDraft = () => ({ id }) as { id: string }
    expect(f.deliver()).toEqual({ status: 'pending', code: 'draft_mismatch' })
    expect(f.events).toEqual(['save'])
  })

  test.each(['', '  ', 42])('returns sent_response_invalid for a returned malformed send ID %s', (id) => {
    const f = fixture()
    f.ports.sendDraft = () => ({ id }) as { id: string }
    expect(f.deliver()).toEqual({ status: 'pending', code: 'sent_response_invalid' })
    expect(f.durable.gmailMessageId).toBeUndefined()
  })

  test('retains the provider send thread when it differs from the hydrated draft thread', () => {
    const f = fixture()
    const send = f.ports.sendDraft
    f.ports.sendDraft = (id) => ({ ...send(id), threadId: 'sent-thread' })
    expect(f.deliver()).toMatchObject({ status: 'sent', attempt: { threadId: 'sent-thread' } })
  })
})
