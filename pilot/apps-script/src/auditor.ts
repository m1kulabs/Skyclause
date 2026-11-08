import { evaluateAudit, type AuditFamily, type AuditInput, type AuditProblem } from './auditor-policy.ts'
import {
  auditTransitionKey,
  decodeAuditCredentialState,
  encodeAuditCredentialState,
  decodeAuditTransition,
  encodeAuditTransition,
  type AuditCredentialState,
  type AuditTransition
} from './auditor-state.ts'
import {
  deliverControlledDraft,
  type ControlledDraft,
  type ControlledMail,
  type ControlledSent
} from './draft-delivery.ts'
import type { Row } from './schema.ts'

export type AuditPendingEntry =
  { key: string; status: 'valid'; transition: AuditTransition } | { key: string; status: 'invalid'; code: string }
export interface AuditorPorts {
  now(): Date
  newEventId(): string
  hashId(text: string): string
  teamAlertEmails(): string | null
  readInput(): AuditInput
  notifications(): Row<'notifications'>[]
  pending(): AuditPendingEntry[]
  saveTransition(value: AuditTransition): void
  removeTransition(family: AuditFamily, ref: string): void
  credentialState(): AuditCredentialState | null
  saveCredentialState(value: AuditCredentialState): void
  appendNotification(row: Row<'notifications'>): void
  createDraft(mail: ControlledMail): { id: string }
  draft(id: string): ControlledDraft | null
  sendDraft(id: string): { id: string; threadId?: string }
  findSent(marker: string): ControlledSent[]
}
export interface AuditorReport {
  observedRefs: number
  plannedTransitions: number
  sentMessages: number
  reconciledMessages: number
  alreadyLoggedMessages: number
  pendingTransitions: number
  deferredRefs: number
  problems: AuditProblem[]
  budgetExhausted: boolean
}
export function parseAuditRecipients(raw: string | null): string[] {
  if (typeof raw !== 'string' || /[\r\n]/.test(raw)) throw new Error('admin_configuration')
  const recipients = raw.split(',').map((value) => value.trim().toLowerCase())
  const valid =
    /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z](?:[a-z0-9-]*[a-z0-9])?$/
  if (
    recipients.some(
      (value) =>
        !valid.test(value) ||
        value.length > 254 ||
        value.split('@')[0]!.length > 64 ||
        value
          .split('@')
          .at(-1)!
          .split('.')
          .some((label) => label.length > 63)
    )
  )
    throw new Error('admin_configuration')
  return [...new Set(recipients)]
}

function historyTime(row: Row<'notifications'>, at: Date): number | null {
  const value = row.at
  if (
    !(value instanceof Date) &&
    (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
        value
      ))
  )
    return null
  const ms = value instanceof Date ? value.getTime() : Date.parse(value)
  if (typeof value === 'string') {
    const day = Date.parse(`${value.slice(0, 10)}T00:00:00Z`)
    if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== value.slice(0, 10)) return null
  }
  return Number.isFinite(ms) &&
    ms <= at.getTime() &&
    typeof row.gmail_message_id === 'string' &&
    row.gmail_message_id.trim()
    ? ms
    : null
}
function latestKind(rows: Row<'notifications'>[], ref: string, kinds: readonly string[], at: Date): string | null {
  let latest = -Infinity
  let kind: string | null = null
  for (const row of rows) {
    if (row.ref !== ref || typeof row.kind !== 'string' || !kinds.includes(row.kind)) continue
    const ms = historyTime(row, at)
    if (ms !== null && ms >= latest) {
      latest = ms
      kind = row.kind
    }
  }
  return kind
}

export function runAuditor(ports: AuditorPorts): AuditorReport {
  const report: AuditorReport = {
    observedRefs: 0,
    plannedTransitions: 0,
    sentMessages: 0,
    reconciledMessages: 0,
    alreadyLoggedMessages: 0,
    pendingTransitions: 0,
    deferredRefs: 0,
    problems: [],
    budgetExhausted: false
  }
  const problems = new Set<string>()
  const problem = (code: string, ref?: string) => {
    const key = `${code}\0${ref ?? ''}`
    if (!problems.has(key)) {
      problems.add(key)
      report.problems.push(ref === undefined ? { code } : { code, ref })
    }
  }
  const keyFor = (family: AuditFamily, ref: string): string =>
    auditTransitionKey(family, ref, (text) => ports.hashId(text))
  const remaining = new Set<string>()
  const deferred = new Set<string>()
  const startedAt = ports.now().getTime()
  let attempts = 0
  const exhausted = (): boolean => {
    if (ports.now().getTime() - startedAt >= 240_000) report.budgetExhausted = true
    return report.budgetExhausted
  }
  const defer = (key: string): void => {
    deferred.add(key)
    report.deferredRefs = deferred.size
  }
  const finish = (): AuditorReport => {
    try {
      report.pendingTransitions = new Set(ports.pending().map((entry) => entry.key)).size
    } catch {
      report.pendingTransitions = remaining.size
      problem('pending_read_failed')
    }
    exhausted()
    return report
  }
  let history: Row<'notifications'>[]
  try {
    history = ports.notifications()
  } catch {
    problem('notification_read_failed')
    return finish()
  }
  const save = (value: AuditTransition): AuditTransition => {
    const encoded = encodeAuditTransition(value)
    ports.saveTransition(decodeAuditTransition(encoded))
    return decodeAuditTransition(encoded)
  }
  const deliver = (value: AuditTransition, fromPending: boolean): void => {
    let current = value
    const key = keyFor(current.family, current.ref)
    if (exhausted() && (!fromPending || attempts > 0)) {
      defer(key)
      return
    }
    try {
      current = save({ ...current, lastAttemptAt: ports.now().toISOString() })
    } catch {
      problem('transition_save_failed', current.ref)
      return
    }
    let complete = true
    for (let index = 0; index < current.recipients.length; index++) {
      const recipient = current.recipients[index]!
      const logged = () =>
        history.some(
          (row) =>
            row.kind === current.kind &&
            row.ref === current.ref &&
            typeof row.to === 'string' &&
            row.to.toLowerCase() === recipient.to &&
            typeof recipient.attempt.gmailMessageId === 'string' &&
            row.gmail_message_id === recipient.attempt.gmailMessageId &&
            historyTime(row, ports.now()) !== null
        )
      if (logged()) {
        report.alreadyLoggedMessages++
        continue
      }
      if (exhausted() && (!fromPending || attempts > 0)) {
        complete = false
        defer(key)
        break
      }
      attempts++
      const mail: ControlledMail = {
        to: recipient.to,
        subject: `${current.subject} [${recipient.marker}]`,
        body: `${current.body}\n\n${recipient.marker}`
      }
      const result = deliverControlledDraft(recipient.attempt, recipient.marker, mail, {
        saveAttempt(next) {
          current = save({
            ...current,
            recipients: current.recipients.map((item, itemIndex) =>
              itemIndex === index ? { ...item, attempt: next } : item
            )
          })
        },
        createDraft: (mail) => ports.createDraft(mail),
        draft: (id) => ports.draft(id),
        sendDraft: (id) => ports.sendDraft(id),
        findSent: (marker) => ports.findSent(marker)
      })
      if (result.status === 'pending') {
        complete = false
        problem(result.code, current.ref)
        continue
      }
      if (result.status === 'sent') report.sentMessages++
      else report.reconciledMessages++
      const row: Row<'notifications'> = {
        at: ports.now().toISOString(),
        kind: current.kind,
        to: recipient.to,
        ref: current.ref,
        gmail_message_id: result.gmailMessageId
      }
      try {
        ports.appendNotification(row)
        history.push(row)
      } catch {
        complete = false
        problem('notification_append_failed', current.ref)
      }
    }
    if (complete) {
      try {
        ports.removeTransition(current.family, current.ref)
        remaining.delete(key)
      } catch {
        problem('transition_cleanup_failed', current.ref)
      }
    }
  }
  let pending: AuditPendingEntry[]
  try {
    pending = ports.pending()
  } catch {
    problem('pending_read_failed')
    return finish()
  }
  for (const entry of pending) remaining.add(entry.key)
  const ready: AuditTransition[] = []
  const invalidRefs = new Set<string>()
  for (const entry of pending) {
    if (entry.status === 'invalid') {
      problem('transition_invalid')
      continue
    }
    let value: AuditTransition
    try {
      value = decodeAuditTransition(encodeAuditTransition(entry.transition))
    } catch {
      problem('transition_invalid')
      continue
    }
    const expectedKey = keyFor(value.family, value.ref)
    if (
      entry.key !== expectedKey ||
      value.recipients.some(
        (recipient) => recipient.marker !== `audit:${ports.hashId(`${value.eventId}\0${recipient.to}`)}`
      )
    ) {
      invalidRefs.add(expectedKey)
      remaining.add(expectedKey)
      problem('transition_invalid')
      continue
    }
    ready.push(value)
  }
  for (const value of ready) {
    if (!invalidRefs.has(keyFor(value.family, value.ref))) deliver(value, true)
  }
  let input: AuditInput
  try {
    input = ports.readInput()
  } catch {
    problem('input_unavailable')
    return finish()
  }
  const at = ports.now()
  try {
    history = ports.notifications()
  } catch {
    problem('notification_read_failed')
    return finish()
  }
  let policy
  try {
    policy = evaluateAudit(input, at)
  } catch {
    problem('input_unavailable')
    return finish()
  }
  for (const item of policy.problems) problem(item.code, item.ref)
  report.observedRefs = policy.observations.length + policy.oneShots.length + 1
  let audience: string[] | null = null
  try {
    audience = parseAuditRecipients(ports.teamAlertEmails())
  } catch {
    problem('admin_configuration')
  }
  type Plan = Pick<AuditTransition, 'family' | 'ref' | 'kind' | 'subject' | 'body'>
  const plans: Plan[] = []
  for (const observation of policy.observations) {
    if (observation.state !== 'active' && observation.state !== 'clear') continue
    const key = keyFor(observation.family, observation.ref)
    if (remaining.has(key)) {
      defer(key)
      continue
    }
    const active = observation.family === 'feed' ? 'feed_silent' : 'pi_offline'
    const recovered = observation.family === 'feed' ? 'feed_recovered' : 'pi_recovered'
    const previous = latestKind(history, observation.ref, [active, recovered], at)
    const kind =
      observation.state === 'active' ? (previous === active ? null : active) : previous === active ? recovered : null
    if (kind !== null)
      plans.push({
        family: observation.family,
        ref: observation.ref,
        kind,
        subject: observation.subject,
        body: observation.body
      })
  }
  for (const item of policy.oneShots) {
    plans.push({ ...item, kind: 'no_bundle_20min' })
  }
  let observer: AuditCredentialState | null = null
  let observerAvailable = true
  try {
    const value = ports.credentialState()
    observer = value === null ? null : decodeAuditCredentialState(encodeAuditCredentialState(value))
  } catch {
    observerAvailable = false
    problem('credential_state_unavailable')
  }
  if (observerAvailable) {
    const credentials = policy.credentials
    const generation =
      credentials.state === 'unavailable' && observer?.availability !== 'unavailable'
        ? (observer?.generation ?? 0) + 1
        : (observer?.generation ?? 0)
    const next: AuditCredentialState =
      credentials.state === 'valid'
        ? { version: 1, availability: 'valid', generation, lastValue: credentials.rawValue }
        : {
            version: 1,
            availability: 'unavailable',
            generation,
            ...(observer?.lastValue === undefined ? {} : { lastValue: observer.lastValue })
          }
    try {
      const encoded = encodeAuditCredentialState(next)
      if (observer === null || encodeAuditCredentialState(observer) !== encoded)
        ports.saveCredentialState(decodeAuditCredentialState(encoded)!)
      if (credentials.state === 'unavailable') {
        plans.push({
          family: 'credentials',
          ref: `GE_SCHEDULES_REFRESHED_AT:unavailable:${generation}`,
          kind: 'credentials_day12',
          subject: 'Credential refresh status unavailable',
          body: 'GE_SCHEDULES_REFRESHED_AT is unavailable. Verify the recorded refresh status before relying on scheduled delivery.'
        })
      } else if (credentials.due) {
        plans.push({
          family: 'credentials',
          ref: credentials.rawValue,
          kind: 'credentials_day12',
          subject: 'Credential refresh reminder',
          body: `The recorded credential refresh expires on ${credentials.expiresOn} MYT. Refresh credentials and update GE_SCHEDULES_REFRESHED_AT after completion.`
        })
      }
    } catch {
      problem('credential_state_save_failed')
    }
  }
  if (audience === null) return finish()
  for (const plan of plans) {
    const key = keyFor(plan.family, plan.ref)
    if (remaining.has(key)) {
      defer(key)
      continue
    }
    if (
      (plan.family === 'crossing' || plan.family === 'credentials') &&
      latestKind(history, plan.ref, [plan.kind], at) !== null
    )
      continue
    if (exhausted()) {
      defer(key)
      continue
    }
    const eventId = ports.newEventId()
    const value: AuditTransition = {
      version: 1,
      eventId,
      ...plan,
      detectedAt: at.toISOString(),
      recipients: audience.map((to) => ({ to, marker: `audit:${ports.hashId(`${eventId}\0${to}`)}`, attempt: {} }))
    }
    remaining.add(key)
    try {
      const saved = save(value)
      report.plannedTransitions++
      deliver(saved, false)
    } catch {
      problem('transition_save_failed', value.ref)
    }
  }
  return finish()
}
