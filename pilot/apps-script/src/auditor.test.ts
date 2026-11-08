import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { parseAuditRecipients, runAuditor, type AuditPendingEntry, type AuditorPorts } from './auditor.ts'
import type { AuditFamily, AuditInput } from './auditor-policy.ts'
import {
  auditTransitionKey,
  decodeAuditCredentialState,
  decodeAuditTransition,
  encodeAuditCredentialState,
  encodeAuditTransition,
  type AuditCredentialState,
  type AuditTransition
} from './auditor-state.ts'
import type { ControlledDraft, ControlledMail, ControlledSent } from './draft-delivery.ts'
import { parseJpsRainfall } from './jps.ts'
import type { Row } from './schema.ts'

const at = (clock: string) => new Date(`2026-11-05T${clock}+08:00`)
const captured: unknown = JSON.parse(
  readFileSync(new URL('../../fixtures/rainfall-graph-75-20261105T1312Z.json', import.meta.url), 'utf8')
)
const captureRows: Row<'readings'>[] = parseJpsRainfall(captured).map(({ observedAt, value }) => ({
  source_id: '0232901RF',
  source_kind: 'jps_rain',
  metric: 'rain_5m_mm',
  observed_at: observedAt,
  value,
  received_at: '2026-11-05T21:00:00+08:00'
}))
function input(overrides: Partial<AuditInput> = {}): AuditInput {
  return {
    sources: [{ source_id: '0232901RF', kind: 'jps_rain', stale_after_min: 10 }],
    readings: captureRows,
    polls: [],
    devices: [],
    crowdGrades: [],
    ledger: [],
    crossings: [],
    dayStart: null,
    dayEnd: null,
    refresh: { status: 'readable', value: '2026-11-05' },
    ...overrides
  }
}
function row(kind: string, time = at('21:10:00'), overrides: Row<'notifications'> = {}): Row<'notifications'> {
  return { at: time, kind, ref: '0232901RF', to: 'one@example.test', gmail_message_id: 'old-id', ...overrides }
}
type Operation =
  | 'pending'
  | 'history'
  | 'input'
  | 'save'
  | 'remove'
  | 'observerRead'
  | 'observerSave'
  | 'append'
  | 'create'
  | 'draft'
  | 'send'
  | 'search'
class World implements AuditorPorts {
  clock = at('21:15:00')
  clockStep = 0
  data = input()
  audience: string | null = 'one@example.test'
  records = new Map<string, string>()
  observer: string | null = null
  rows: Row<'notifications'>[] = []
  drafts = new Map<string, ControlledDraft>()
  sent: ControlledSent[] = []
  trace: { op: Operation; value?: unknown }[] = []
  faults: { op: Operation; when: 'before' | 'after'; nth: number }[] = []
  counts = new Map<Operation, number>()
  onInput?: () => void
  onAppend?: () => void
  sequence = 0
  event = 0
  hashId(text: string): string {
    return createHash('sha256').update(text).digest('hex')
  }
  now(): Date {
    const value = new Date(this.clock)
    this.clock = new Date(this.clock.getTime() + this.clockStep)
    return value
  }
  newEventId(): string {
    return `event-${++this.event}`
  }
  teamAlertEmails(): string | null {
    return this.audience
  }
  key(family: AuditFamily = 'feed', ref = '0232901RF'): string {
    return auditTransitionKey(family, ref, (text) => this.hashId(text))
  }
  fail(op: Operation, when: 'before' | 'after', offset = 1): void {
    this.faults.push({ op, when, nth: (this.counts.get(op) ?? 0) + offset })
  }
  call<T>(op: Operation, value: unknown, action: () => T): T {
    const nth = (this.counts.get(op) ?? 0) + 1
    this.counts.set(op, nth)
    this.trace.push({ op, value })
    const fault = this.faults.find((item) => item.op === op && item.nth === nth)
    if (fault?.when === 'before') throw new Error('private detail one@example.test')
    const result = action()
    if (fault?.when === 'after') throw new Error('private detail one@example.test')
    return result
  }
  readInput(): AuditInput {
    return this.call('input', undefined, () => {
      this.onInput?.()
      return this.data
    })
  }
  notifications(): Row<'notifications'>[] {
    return this.call('history', undefined, () => this.rows.map((value) => ({ ...value })))
  }
  pending(): AuditPendingEntry[] {
    return this.call('pending', undefined, () =>
      [...this.records].map(([key, raw]) => {
        try {
          return { key, status: 'valid' as const, transition: decodeAuditTransition(raw) }
        } catch {
          return { key, status: 'invalid' as const, code: 'private-error' }
        }
      })
    )
  }
  saveTransition(value: AuditTransition): void {
    this.call('save', value, () => this.records.set(this.key(value.family, value.ref), encodeAuditTransition(value)))
  }
  removeTransition(family: AuditFamily, ref: string): void {
    this.call('remove', ref, () => this.records.delete(this.key(family, ref)))
  }
  credentialState(): AuditCredentialState | null {
    return this.call('observerRead', undefined, () => decodeAuditCredentialState(this.observer))
  }
  saveCredentialState(value: AuditCredentialState): void {
    this.call('observerSave', value, () => {
      this.observer = encodeAuditCredentialState(value)
    })
  }
  validRecords(): AuditTransition[] {
    return [...this.records.values()].flatMap((raw) => {
      try {
        return [decodeAuditTransition(raw)]
      } catch {
        return []
      }
    })
  }
  appendNotification(value: Row<'notifications'>): void {
    this.call('append', value, () => {
      const record = this.validRecords().find((item) => item.kind === value.kind && item.ref === value.ref)
      expect(
        record?.recipients.some(
          (recipient) => recipient.to === value.to && recipient.attempt.gmailMessageId === value.gmail_message_id
        )
      ).toBe(true)
      this.rows.push({ ...value })
      this.onAppend?.()
    })
  }
  createDraft(mail: ControlledMail): { id: string } {
    return this.call('create', mail, () => {
      const record = this.validRecords().find((item) =>
        item.recipients.some((recipient) => recipient.to === mail.to && mail.body.includes(recipient.marker))
      )!
      const recipient = record.recipients.find((item) => item.to === mail.to)!
      expect(recipient.attempt).toEqual({ recipient: mail.to, draftCreationAttempted: true })
      expect(mail.subject).toContain(recipient.marker)
      expect(mail.body).toContain(recipient.marker)
      const id = `draft-${++this.sequence}`
      this.drafts.set(id, { ...mail, id, messageId: `inner-${id}`, threadId: `thread-${id}` })
      return { id }
    })
  }
  draft(id: string): ControlledDraft | null {
    return this.call('draft', id, () => this.drafts.get(id) ?? null)
  }
  sendDraft(id: string): { id: string; threadId?: string } {
    return this.call('send', id, () => {
      const draft = this.drafts.get(id)!
      const sent = {
        to: draft.to,
        subject: draft.subject,
        body: draft.body,
        id: `actual-${++this.sequence}`,
        threadId: draft.threadId
      }
      this.sent.push(sent)
      this.drafts.delete(id)
      return { id: sent.id, threadId: sent.threadId }
    })
  }
  findSent(marker: string): ControlledSent[] {
    return this.call('search', marker, () => this.sent.filter((mail) => mail.body.includes(marker)))
  }
  fresh(): void {
    this.data = {
      ...this.data,
      readings: [...captureRows, { ...captureRows.at(-1)!, observed_at: at('21:21:00'), value: 0 }]
    }
    this.clock = at('21:22:00')
  }
}

describe('strict administrator configuration', () => {
  test('trims and case-deduplicates the whole audience', () =>
    expect(parseAuditRecipients(' One@example.test, two@example.test,ONE@EXAMPLE.TEST ')).toEqual([
      'one@example.test',
      'two@example.test'
    ]))
  test('rejects every partial, missing, grouped, injected or empty audience', () => {
    for (const raw of [
      null,
      '',
      ' ',
      'one@example.test,',
      ',one@example.test',
      'one@example.test,,two@example.test',
      'one@example.test,bad',
      'Name <one@example.test>',
      'one@example.test;two@example.test',
      'one@example.test\nBcc:two@example.test',
      'a..b@example.test',
      '.a@example.test',
      'a@-example.test'
    ])
      expect(() => parseAuditRecipients(raw)).toThrow()
  })
})

describe('ordered auditor transitions', () => {
  test('real capture sequence emits exactly one silence and recovery to each configured administrator', () => {
    const world = new World()
    world.audience = 'one@example.test,two@example.test'
    for (const clock of ['21:05:00', '21:15:00', '21:20:00']) {
      world.clock = at(clock)
      runAuditor(world)
    }
    world.fresh()
    runAuditor(world)
    runAuditor(world)
    for (const to of ['one@example.test', 'two@example.test']) {
      const sentKinds = world.rows.filter((item) => item.to === to).map((item) => item.kind)
      expect(sentKinds).toEqual(['feed_silent', 'feed_recovered'])
    }
    expect(world.rows.every((r) => typeof r.gmail_message_id === 'string' && r.gmail_message_id.length > 0)).toBe(true)
    expect(world.sent).toHaveLength(4)
    expect(world.records.size).toBe(0)
  })
  test('selects greatest valid as-of history then physical ties, isolated by kind and ref', () => {
    for (const tail of [
      row('feed_recovered', at('21:05:00')),
      row('evidence_request'),
      row('feed_recovered', at('21:14:00'), { ref: 'other' }),
      row('feed_recovered', at('21:16:00')),
      row('feed_recovered', at('21:14:00'), { gmail_message_id: ' ' }),
      row('feed_recovered', at('21:14:00'), { at: '2026-02-30T00:00:00Z' })
    ]) {
      const world = new World()
      world.rows = [row('feed_silent', at('21:10:00')), tail]
      expect(runAuditor(world).plannedTransitions).toBe(0)
      expect(world.sent).toHaveLength(0)
    }
    const tied = new World()
    tied.rows = [row('feed_silent'), row('feed_recovered')]
    expect(runAuditor(tied).plannedTransitions).toBe(1)
    expect(tied.sent).toHaveLength(1)
    const initial = new World()
    initial.clock = at('21:05:00')
    expect(runAuditor(initial).plannedTransitions).toBe(0)
  })
  test('freezes multi-admin event/content and finishes it before an opposite transition', () => {
    const world = new World()
    world.audience = 'one@example.test,two@example.test'
    world.fail('send', 'before', 2)
    const first = runAuditor(world)
    expect(first.sentMessages).toBe(1)
    expect(first.pendingTransitions).toBe(1)
    const frozen = decodeAuditTransition(world.records.get(world.key())!)
    expect(frozen.recipients.map((item) => item.to)).toEqual(['one@example.test', 'two@example.test'])
    world.audience = 'new@example.test'
    world.fresh()
    const second = runAuditor(world)
    expect(second.pendingTransitions).toBe(0)
    expect(world.sent.slice(0, 2).map((item) => item.to)).toEqual(['one@example.test', 'two@example.test'])
    expect(world.sent[1]!.subject).toBe(
      world.sent[0]!.subject.replace(frozen.recipients[0]!.marker, frozen.recipients[1]!.marker)
    )
    expect(world.rows.map((item) => item.kind)).toEqual(['feed_silent', 'feed_silent', 'feed_recovered'])
    expect(world.sent[2]!.to).toBe('new@example.test')
    expect(frozen.recipients[1]!.attempt.gmailMessageId).toBeUndefined()
  })
  test('fresh classification uses a later clock and facts after pending recovery', () => {
    const world = new World()
    world.fail('send', 'before')
    runAuditor(world)
    world.clock = at('21:19:00')
    world.onAppend = () => world.fresh()
    runAuditor(world)
    expect(world.rows.map((item) => item.kind)).toEqual(['feed_silent', 'feed_recovered'])
    expect(world.rows[0]!.at).toBe('2026-11-05T13:19:00.000Z')
    expect(world.rows[1]!.at).toBe('2026-11-05T13:22:00.000Z')
  })
})

describe('durable delivery and isolation', () => {
  test('recovers a successful send with a lost acknowledgement, without duplicate or early recovery', () => {
    const world = new World()
    world.fail('send', 'after')
    expect(runAuditor(world).pendingTransitions).toBe(1)
    expect(world.sent).toHaveLength(1)
    expect(world.rows).toHaveLength(0)
    world.fresh()
    const report = runAuditor(world)
    expect(report.reconciledMessages).toBe(1)
    expect(world.rows.map((item) => item.kind)).toEqual(['feed_silent', 'feed_recovered'])
    expect(world.sent).toHaveLength(2)
    expect(world.counts.get('create')).toBe(2)
  })
  test('retains exact durable IDs through every before/after save boundary', () => {
    for (const when of ['before', 'after'] as const)
      for (const nth of [1, 2, 3, 4, 5, 6]) {
        const world = new World()
        world.fail('save', when, nth)
        const first = runAuditor(world)
        expect(first.pendingTransitions).toBe(world.records.size)
        expect(world.rows).toHaveLength(0)
        const report = runAuditor(world)
        if ((when === 'before' && nth === 4) || (when === 'after' && nth === 3)) {
          expect(report.pendingTransitions).toBe(1)
          expect(world.sent).toHaveLength(0)
          expect(report.problems).toContainEqual({ code: 'draft_missing_no_sent_match', ref: '0232901RF' })
        } else {
          expect(report.pendingTransitions).toBe(0)
          expect(world.rows).toHaveLength(1)
          expect(world.rows[0]!.gmail_message_id).toBe(world.sent[0]!.id)
        }
        expect(world.counts.get('create') ?? 0).toBe(when === 'after' && nth === 3 ? 0 : 1)
        expect(world.sent.length).toBeLessThanOrEqual(1)
      }
  })
  test('recovers before/after append and cleanup failures without extra rows or messages', () => {
    for (const op of ['append', 'remove'] as const)
      for (const when of ['before', 'after'] as const) {
        const world = new World()
        world.fail(op, when)
        const first = runAuditor(world)
        expect(first.pendingTransitions).toBe(world.records.size)
        expect(world.sent).toHaveLength(1)
        runAuditor(world)
        runAuditor(world)
        expect(world.records.size).toBe(0)
        expect(world.rows).toHaveLength(1)
        expect(world.sent).toHaveLength(1)
      }
  })
  test('does not replace lost create acknowledgements or missing/edited drafts', () => {
    for (const mode of ['create-lost', 'missing', 'edited'] as const) {
      const world = new World()
      if (mode === 'create-lost') world.fail('create', 'after')
      else world.fail('send', 'before')
      runAuditor(world)
      if (mode === 'missing') world.drafts.clear()
      if (mode === 'edited') for (const draft of world.drafts.values()) draft.body += ' edited'
      const report = runAuditor(world)
      expect(report.pendingTransitions).toBe(1)
      expect(world.counts.get('create')).toBe(1)
      expect(world.sent).toHaveLength(0)
      expect(world.rows).toHaveLength(0)
      expect(report.problems).toContainEqual({
        code: mode === 'edited' ? 'draft_mismatch' : 'draft_missing_no_sent_match',
        ref: '0232901RF'
      })
    }
  })
  test('does not send through incomplete searches or distinct-ID ambiguous sent matches', () => {
    for (const mode of ['incomplete', 'ambiguous'] as const) {
      const world = new World()
      world.fail('send', 'after')
      runAuditor(world)
      if (mode === 'incomplete') world.fail('search', 'before')
      else world.sent.push({ ...world.sent[0]!, id: 'another-real-id' })
      const report = runAuditor(world)
      expect(report.pendingTransitions).toBe(1)
      expect(world.counts.get('create')).toBe(1)
      expect(world.counts.get('send')).toBe(1)
      expect(world.rows).toHaveLength(0)
      expect(report.problems).toContainEqual({
        code: mode === 'incomplete' ? 'sent_search_failed' : 'sent_ambiguous',
        ref: '0232901RF'
      })
    }
  })
  test('only the corresponding recipient actual ID satisfies a receipt', () => {
    const world = new World()
    world.audience = 'one@example.test,two@example.test'
    world.fail('append', 'before')
    runAuditor(world)
    const saved = decodeAuditTransition(world.records.get(world.key())!)
    const firstId = saved.recipients[0]!.attempt.gmailMessageId!
    const secondId = saved.recipients[1]!.attempt.gmailMessageId!
    world.rows = [
      row('feed_silent', at('21:15:00'), { to: 'one@example.test', gmail_message_id: secondId }),
      row('feed_silent', at('21:15:00'), { to: 'two@example.test', gmail_message_id: firstId }),
      row('feed_recovered', at('21:15:00'), { gmail_message_id: firstId }),
      row('feed_silent', at('21:15:00'), { ref: 'other', gmail_message_id: firstId })
    ]
    const report = runAuditor(world)
    expect(report.alreadyLoggedMessages).toBe(0)
    expect(
      world.rows.filter(
        (item) =>
          item.kind === 'feed_silent' &&
          item.ref === '0232901RF' &&
          item.to === 'one@example.test' &&
          item.gmail_message_id === firstId
      )
    ).toHaveLength(1)
    expect(
      world.rows.filter((item) => item.to === 'two@example.test' && item.gmail_message_id === secondId)
    ).toHaveLength(1)
    expect(world.sent).toHaveLength(2)
    expect(world.records.size).toBe(0)
  })
  test('isolates malformed state/key, blocks that ref, and continues unrelated Pi work', () => {
    const world = new World()
    world.records.set(world.key(), '{broken')
    world.records.set('SKY_AUDITOR_NOTICE_V1_bad-key', '{}')
    world.data = { ...world.data, devices: [{ device_id: 'pi-roof', kind: 'pi', last_heartbeat_at: at('20:00:00') }] }
    const report = runAuditor(world)
    expect(report.pendingTransitions).toBe(2)
    expect(report.deferredRefs).toBe(1)
    expect(report.problems).toContainEqual({ code: 'transition_invalid' })
    expect(world.records.get(world.key())).toBe('{broken')
    expect(world.rows.map((item) => item.kind)).toEqual(['pi_offline'])
    expect(JSON.stringify(report)).not.toContain('private-error')
  })
  test('unreadable input/history/pending and invalid admins return bounded problems without provider work', () => {
    for (const op of ['input', 'history', 'pending'] as const) {
      const world = new World()
      world.fail(op, 'before')
      const report = runAuditor(world)
      expect(report.problems.length).toBeGreaterThan(0)
      expect(report.observedRefs).toBe(0)
      expect(world.sent).toHaveLength(0)
      expect(world.drafts.size).toBe(0)
      expect(JSON.stringify(report)).not.toContain('one@example.test')
    }
    const world = new World()
    world.audience = 'one@example.test,bad'
    expect(runAuditor(world).problems).toContainEqual({ code: 'admin_configuration' })
    expect(world.counts.get('create')).toBeUndefined()
  })
  test('pending frozen mail can finish even while administrator config is invalid', () => {
    const world = new World()
    world.fail('send', 'before')
    runAuditor(world)
    world.audience = null
    const report = runAuditor(world)
    expect(report.problems).toContainEqual({ code: 'admin_configuration' })
    expect(world.sent).toHaveLength(1)
    expect(world.rows).toHaveLength(1)
    expect(world.records.size).toBe(0)
  })
})

describe('one-shots and credential episodes', () => {
  test('suppresses valid exact crossing kind/ref once, ignoring unrelated and invalid history', () => {
    const world = new World()
    world.data = input({
      sources: [],
      crossings: [
        {
          fileId: 'file-1',
          name: 'crossing.json',
          pack: 'sky',
          writtenAt: at('20:00:00'),
          text: JSON.stringify({
            crossing_id: 'crossing-1',
            pack: 'sky',
            replay: false,
            changes: [{ to: 'commute_disruption' }]
          })
        }
      ]
    })
    world.rows = [
      row('evidence_request', at('21:10:00'), { ref: 'crossing-1' }),
      row('no_bundle_20min', at('21:10:00'), { ref: 'other' }),
      row('no_bundle_20min', at('21:10:00'), { ref: 'crossing-1', gmail_message_id: '' })
    ]
    expect(runAuditor(world).plannedTransitions).toBe(1)
    expect(world.rows.at(-1)!.kind).toBe('no_bundle_20min')
    expect(world.rows.at(-1)!.ref).toBe('crossing-1')
    expect(runAuditor(world).plannedTransitions).toBe(0)
    expect(world.sent).toHaveLength(1)
  })
  test('persists distinct unavailable repeat, repair, and rebreak episodes before their notices', () => {
    const world = new World()
    world.data = input({ sources: [], refresh: { status: 'readable', value: null } })
    const first = runAuditor(world)
    expect(first.plannedTransitions).toBe(1)
    expect(world.rows.map((item) => item.ref)).toEqual(['GE_SCHEDULES_REFRESHED_AT:unavailable:1'])
    expect(decodeAuditCredentialState(world.observer)).toEqual({
      version: 1,
      availability: 'unavailable',
      generation: 1
    })
    world.data = { ...world.data, refresh: { status: 'unreadable' } }
    expect(runAuditor(world).plannedTransitions).toBe(0)
    world.data = { ...world.data, refresh: { status: 'readable', value: '2026-11-05' } }
    expect(runAuditor(world).plannedTransitions).toBe(0)
    expect(decodeAuditCredentialState(world.observer)).toEqual({
      version: 1,
      availability: 'valid',
      generation: 1,
      lastValue: '2026-11-05'
    })
    world.data = { ...world.data, refresh: { status: 'readable', value: 'bad-date' } }
    expect(runAuditor(world).plannedTransitions).toBe(1)
    expect(world.rows.map((item) => item.ref)).toEqual([
      'GE_SCHEDULES_REFRESHED_AT:unavailable:1',
      'GE_SCHEDULES_REFRESHED_AT:unavailable:2'
    ])
    expect(
      world.sent.every(
        (item) =>
          item.body.includes('unavailable') && !item.body.includes('expires on') && !item.body.includes('bad-date')
      )
    ).toBe(true)
    const beforeFirstSave = world.trace.findIndex((item) => item.op === 'observerSave')
    const beforeFirstCreate = world.trace.findIndex((item) => item.op === 'create')
    expect(beforeFirstSave).toBeLessThan(beforeFirstCreate)
  })
  test('notifies each valid raw refresh value once on day12 or later, including catch-up', () => {
    const world = new World()
    world.data = input({ sources: [], refresh: { status: 'readable', value: '2026-10-24' } })
    world.clock = new Date('2026-11-05T00:00:00+08:00')
    expect(runAuditor(world).plannedTransitions).toBe(1)
    expect(world.rows[0]!.ref).toBe('2026-10-24')
    expect(world.sent[0]!.body).toContain('2026-11-07')
    world.clock = new Date('2026-11-10T21:00:00+08:00')
    expect(runAuditor(world).plannedTransitions).toBe(0)
    world.data = { ...world.data, refresh: { status: 'readable', value: '2026-10-25T00:00:00+08:00' } }
    expect(runAuditor(world).plannedTransitions).toBe(1)
    expect(world.rows[1]!.ref).toBe('2026-10-25T00:00:00+08:00')
    expect(world.rows.every((item) => item.kind === 'credentials_day12')).toBe(true)
  })
  test('observer persistence failure or corruption cannot guess an unavailable generation', () => {
    for (const when of ['before', 'after'] as const) {
      const world = new World()
      world.data = input({ sources: [], refresh: { status: 'unreadable' } })
      world.fail('observerSave', when)
      const report = runAuditor(world)
      expect(report.problems).toContainEqual({ code: 'credential_state_save_failed' })
      expect(world.sent).toHaveLength(0)
      expect(world.records.size).toBe(0)
      expect(runAuditor(world).plannedTransitions).toBe(1)
      expect(world.rows[0]!.ref).toBe('GE_SCHEDULES_REFRESHED_AT:unavailable:1')
    }
    const corrupt = new World()
    corrupt.observer = '{invalid'
    corrupt.data = input({ refresh: { status: 'unreadable' } })
    const report = runAuditor(corrupt)
    expect(report.problems).toContainEqual({ code: 'credential_state_unavailable' })
    expect(corrupt.rows.map((item) => item.kind)).toEqual(['feed_silent'])
    expect(corrupt.observer).toBe('{invalid')
  })
})

describe('bounded work', () => {
  test('uses actual clock for the 240000ms budget and counts fresh deferred refs', () => {
    const world = new World()
    world.clockStep = 120_001
    const report = runAuditor(world)
    expect(report.budgetExhausted).toBe(true)
    expect(report.deferredRefs).toBe(1)
    expect(report.pendingTransitions).toBe(0)
    expect(world.sent).toHaveLength(0)
    expect(world.counts.get('create')).toBeUndefined()
  })
  test('attempts at least one eligible pending delivery, then defers other refs accurately', () => {
    const world = new World()
    world.data = {
      ...world.data,
      devices: [
        { device_id: 'pi-a', kind: 'pi', last_heartbeat_at: at('20:00:00') },
        { device_id: 'pi-b', kind: 'pi', last_heartbeat_at: at('20:00:00') }
      ]
    }
    world.fail('send', 'before', 1)
    world.fail('send', 'before', 2)
    world.fail('send', 'before', 3)
    expect(runAuditor(world).pendingTransitions).toBe(3)
    world.clockStep = 240_000
    const report = runAuditor(world)
    expect(report.budgetExhausted).toBe(true)
    expect(report.sentMessages).toBe(1)
    expect(report.pendingTransitions).toBe(2)
    expect(report.deferredRefs).toBe(2)
    expect(world.sent).toHaveLength(1)
    expect(world.rows).toHaveLength(1)
  })
})

describe('closed state and recovery edges', () => {
  function pending(world: World, overrides: Partial<AuditTransition> = {}): AuditTransition {
    const eventId = 'persisted-event'
    return {
      version: 1,
      eventId,
      family: 'feed',
      ref: '0232901RF',
      kind: 'feed_silent',
      detectedAt: at('21:15:00').toISOString(),
      subject: 'Frozen subject',
      body: 'Frozen body',
      recipients: [
        { to: 'one@example.test', marker: `audit:${world.hashId(`${eventId}\0one@example.test`)}`, attempt: {} }
      ],
      ...overrides
    }
  }
  test('a valid record under a mismatched owned key blocks its own deterministic ref', () => {
    const world = new World()
    const value = pending(world)
    const wrongKey = 'SKY_AUDITOR_NOTICE_V1_' + '0'.repeat(64)
    world.records.set(wrongKey, encodeAuditTransition(value))
    const report = runAuditor(world)
    expect(report.problems).toContainEqual({ code: 'transition_invalid' })
    expect(report.pendingTransitions).toBe(1)
    expect(report.deferredRefs).toBe(1)
    expect(world.counts.get('create')).toBeUndefined()
    expect(world.records.get(wrongKey)).toBe(encodeAuditTransition(value))
  })
  test('invalid marker ownership stays isolated and cannot be replaced', () => {
    const world = new World()
    const value = pending(world)
    value.recipients[0]!.marker = 'audit:' + 'f'.repeat(64)
    world.records.set(world.key(), encodeAuditTransition(value))
    const report = runAuditor(world)
    expect(report.problems).toContainEqual({ code: 'transition_invalid' })
    expect(report.pendingTransitions).toBe(1)
    expect(world.counts.get('create')).toBeUndefined()
  })
  test('late final-ID byte growth preserves attempted state and cannot resend or log', () => {
    const world = new World()
    const value = pending(world, { lastAttemptAt: at('21:15:00').toISOString() })
    value.recipients[0]!.attempt = {
      recipient: 'one@example.test',
      draftCreationAttempted: true,
      draftId: 'draft-stored',
      threadId: 'thread-stored'
    }
    value.body = 'x'.repeat(8190 - Buffer.byteLength(JSON.stringify({ ...value, body: '' }), 'utf8'))
    const saved = encodeAuditTransition(value)
    world.records.set(world.key(), saved)
    world.drafts.set('draft-stored', {
      id: 'draft-stored',
      messageId: 'inner-stored',
      threadId: 'thread-stored',
      to: 'one@example.test',
      subject: `${value.subject} [${value.recipients[0]!.marker}]`,
      body: `${value.body}\n\n${value.recipients[0]!.marker}`
    })
    for (let index = 0; index < 2; index++) {
      const report = runAuditor(world)
      expect(report.pendingTransitions).toBe(1)
      expect(report.problems).toContainEqual({ code: 'intent_save_failed', ref: '0232901RF' })
      expect(world.sent).toHaveLength(1)
      expect(world.rows).toHaveLength(0)
      expect(world.counts.get('create')).toBeUndefined()
      expect(
        decodeAuditTransition(world.records.get(world.key())!).recipients[0]!.attempt.gmailMessageId
      ).toBeUndefined()
    }
  })
  test('overflow state fails before provider work and leaves unrelated refs operational', () => {
    const world = new World()
    const value = pending(world)
    value.body = '😀'.repeat(3000)
    world.records.set(world.key(), JSON.stringify(value))
    world.data = { ...world.data, devices: [{ device_id: 'pi-only', kind: 'pi', last_heartbeat_at: at('20:00:00') }] }
    const report = runAuditor(world)
    expect(report.pendingTransitions).toBe(1)
    expect(world.sent).toHaveLength(1)
    expect(world.rows[0]!.kind).toBe('pi_offline')
    expect(world.records.get(world.key())).toBe(JSON.stringify(value))
  })
  test('does not accept calendar-normalized history or future-only histories as prior state', () => {
    for (const invalidAt of ['2026-11-04T24:00:00+08:00', '2026-11-05T20:99:00+08:00', '2026-11-05T21:16:00+08:00']) {
      const world = new World()
      world.rows = [row('feed_silent', at('21:10:00'), { at: invalidAt })]
      expect(runAuditor(world).plannedTransitions).toBe(1)
      expect(world.sent).toHaveLength(1)
    }
  })
  test('fresh recipient limit errors never create a partial audience', () => {
    const world = new World()
    world.audience = Array.from({ length: 100 }, (_, index) => `admin-${index}@example.test`).join(',')
    const report = runAuditor(world)
    expect(report.problems).toContainEqual({ code: 'transition_save_failed', ref: '0232901RF' })
    expect(report.pendingTransitions).toBe(0)
    expect(world.counts.get('create')).toBeUndefined()
    expect(world.records.size).toBe(0)
  })
})

describe('administrator and observer guard edges', () => {
  test('rejects oversized mailbox/domain components as a whole', () => {
    for (const invalid of [
      `${'a'.repeat(65)}@example.test`,
      `a@${'a'.repeat(64)}.test`,
      `a@${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.test`
    ]) {
      expect(() => parseAuditRecipients(`one@example.test,${invalid}`)).toThrow()
    }
  })
  test('cannot increment a maximum-safe observer generation and continues other refs', () => {
    const world = new World()
    world.observer = encodeAuditCredentialState({
      version: 1,
      availability: 'valid',
      generation: Number.MAX_SAFE_INTEGER,
      lastValue: '2026-11-05'
    })
    world.data = { ...world.data, refresh: { status: 'unreadable' } }
    const report = runAuditor(world)
    expect(report.problems).toContainEqual({ code: 'credential_state_save_failed' })
    expect(world.rows.map((item) => item.kind)).toEqual(['feed_silent'])
  })
})

describe('configuration-independent observation', () => {
  test('persists a valid credential repair even while fresh delivery has no valid audience', () => {
    const world = new World()
    world.data = input({ sources: [], refresh: { status: 'unreadable' } })
    runAuditor(world)
    world.audience = null
    world.data = { ...world.data, refresh: { status: 'readable', value: '2026-11-05' } }
    const repair = runAuditor(world)
    expect(repair.problems).toContainEqual({ code: 'admin_configuration' })
    expect(decodeAuditCredentialState(world.observer)).toEqual({
      version: 1,
      availability: 'valid',
      generation: 1,
      lastValue: '2026-11-05'
    })
    world.audience = 'one@example.test'
    world.data = { ...world.data, refresh: { status: 'unreadable' } }
    runAuditor(world)
    expect(world.rows.map((item) => item.ref)).toEqual([
      'GE_SCHEDULES_REFRESHED_AT:unavailable:1',
      'GE_SCHEDULES_REFRESHED_AT:unavailable:2'
    ])
  })
  test('binds port hash calls to their provided receiver', () => {
    const world = new World()
    const original = world.hashId
    world.hashId = function (text: string): string {
      expect(this === world).toBe(true)
      return original(text)
    }
    const report = runAuditor(world)
    expect(report.sentMessages).toBe(1)
    expect(report.pendingTransitions).toBe(0)
  })
})

test('reports elapsed budget even when fresh observations need no delivery', () => {
  const world = new World()
  world.data = input({ sources: [] })
  world.onInput = () => {
    world.clock = new Date(world.clock.getTime() + 240_000)
  }
  const report = runAuditor(world)
  expect(report.budgetExhausted).toBe(true)
  expect(report.deferredRefs).toBe(0)
  expect(report.plannedTransitions).toBe(0)
  expect(report.pendingTransitions).toBe(0)
  expect(world.sent).toHaveLength(0)
})

describe('multi-recipient ambiguous save recovery', () => {
  for (const [boundary, saveNumber] of [
    ['draft ID', 4],
    ['final ID', 6]
  ] as const) {
    test(`preserves an after-persistence ${boundary} save across another recipient and unrelated ref`, () => {
      const world = new World()
      world.audience = 'one@example.test,two@example.test'
      world.data = {
        ...world.data,
        devices: [{ device_id: 'pi-independent', kind: 'pi', last_heartbeat_at: at('20:00:00') }]
      }
      world.fail('save', 'after', saveNumber)

      const first = runAuditor(world)
      const durable = decodeAuditTransition(world.records.get(world.key())!)
      const firstRecipient = durable.recipients[0]!
      expect(firstRecipient.attempt.draftId).toBe('draft-1')
      if (boundary === 'final ID') expect(firstRecipient.attempt.gmailMessageId).toBe('actual-2')
      expect(durable.recipients[1]!.attempt).toEqual({})
      expect(first.problems).toContainEqual({ code: 'intent_save_failed', ref: '0232901RF' })
      expect(first.pendingTransitions).toBe(1)
      expect(world.rows.map((item) => item.kind)).toEqual(['pi_offline', 'pi_offline'])
      expect(world.counts.get('create')).toBe(3)
      if (boundary === 'draft ID') {
        expect(firstRecipient.attempt.gmailMessageId).toBeUndefined()
        expect(world.drafts.has('draft-1')).toBe(true)
        expect(world.sent).toHaveLength(2)
      } else {
        expect(firstRecipient.attempt.gmailMessageId).toBe('actual-2')
        expect(firstRecipient.attempt.gmailMessageId).toBe(world.sent[0]!.id)
        expect(world.sent).toHaveLength(3)
      }

      const recovered = runAuditor(world)
      expect(recovered.problems).toEqual([])
      expect(recovered.pendingTransitions).toBe(0)
      expect(world.records.size).toBe(0)
      expect(world.drafts.size).toBe(0)
      expect(world.counts.get('create')).toBe(4)
      expect(world.sent).toHaveLength(4)
      expect(world.rows).toHaveLength(4)
      for (const to of ['one@example.test', 'two@example.test']) {
        const receipt = world.rows.filter((item) => item.kind === 'feed_silent' && item.to === to)
        const message = world.sent.filter(
          (item) => item.to === to && item.body.includes(durable.recipients.find((item) => item.to === to)!.marker)
        )
        expect(receipt).toHaveLength(1)
        expect(message).toHaveLength(1)
        expect(receipt[0]!.gmail_message_id).toBe(message[0]!.id)
      }
      expect(world.rows.map((item) => item.kind)).toEqual(['pi_offline', 'pi_offline', 'feed_silent', 'feed_silent'])
      runAuditor(world)
      expect(world.counts.get('create')).toBe(4)
      expect(world.sent).toHaveLength(4)
      expect(world.rows).toHaveLength(4)
    })
  }
})
