import type { AuditFamily } from './auditor-policy.ts'
import type { DraftAttemptState } from './draft-delivery.ts'

export interface AuditRecipient {
  to: string
  marker: string
  attempt: DraftAttemptState
}
export interface AuditTransition {
  version: 1
  eventId: string
  family: AuditFamily
  ref: string
  kind: 'feed_silent' | 'feed_recovered' | 'pi_offline' | 'pi_recovered' | 'no_bundle_20min' | 'credentials_day12'
  detectedAt: string
  subject: string
  body: string
  recipients: AuditRecipient[]
  lastAttemptAt?: string
}
export interface AuditCredentialState {
  version: 1
  availability: 'valid' | 'unavailable'
  generation: number
  lastValue?: string
}
const PREFIX = 'SKY_AUDITOR_NOTICE_V1_'
const LIMIT = 8192
const KINDS: Record<AuditFamily, readonly AuditTransition['kind'][]> = {
  feed: ['feed_silent', 'feed_recovered'],
  pi: ['pi_offline', 'pi_recovered'],
  crossing: ['no_bundle_20min'],
  credentials: ['credentials_day12']
}

function fail(): never {
  throw new Error('audit_state_invalid')
}
function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail()
  if (Object.keys(value).some((key) => !fields.includes(key))) return fail()
  return value as Record<string, unknown>
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return fail()
  return value
}
function timestamp(value: unknown): string {
  const raw = text(value)
  const match =
    /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(raw)
  if (!match || !Number.isFinite(Date.parse(raw))) return fail()
  if (new Date(Date.parse(`${match[1]}T00:00:00Z`)).toISOString().slice(0, 10) !== match[1]) return fail()
  return raw
}
function email(value: unknown): string {
  const raw = text(value)
  if (
    raw !== raw.toLowerCase() ||
    raw.length > 254 ||
    raw.split('@')[0]!.length > 64 ||
    raw
      .split('@')
      .at(-1)!
      .split('.')
      .some((label) => label.length > 63) ||
    !/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z](?:[a-z0-9-]*[a-z0-9])?$/.test(
      raw
    )
  )
    return fail()
  return raw
}
function utf8(value: string): number {
  let bytes = 0
  for (const character of value) {
    const point = character.codePointAt(0)!
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4
  }
  return bytes
}
function bounded(raw: string): string {
  if (utf8(raw) > LIMIT) throw new Error('audit_state_overflow')
  return raw
}
function attempt(value: unknown, to: string): DraftAttemptState {
  const fields = record(value, ['recipient', 'draftCreationAttempted', 'draftId', 'threadId', 'gmailMessageId'])
  const result: DraftAttemptState = {}
  if ('draftCreationAttempted' in fields) {
    if (typeof fields.draftCreationAttempted !== 'boolean') return fail()
    result.draftCreationAttempted = fields.draftCreationAttempted
  }
  if ('recipient' in fields) {
    if (fields.recipient !== to || fields.draftCreationAttempted !== true) return fail()
    result.recipient = to
  }
  if (fields.draftCreationAttempted === true && fields.recipient !== to) return fail()
  for (const key of ['draftId', 'threadId', 'gmailMessageId'] as const) {
    if (key in fields) {
      if (fields.draftCreationAttempted !== true || fields.recipient !== to) return fail()
      result[key] = text(fields[key])
    }
  }
  return result
}
function transition(value: unknown): AuditTransition {
  const fields = record(value, [
    'version',
    'eventId',
    'family',
    'ref',
    'kind',
    'detectedAt',
    'subject',
    'body',
    'recipients',
    'lastAttemptAt'
  ])
  if (fields.version !== 1 || typeof fields.family !== 'string' || !Object.hasOwn(KINDS, fields.family)) return fail()
  const family = fields.family as AuditFamily
  if (!KINDS[family].includes(fields.kind as AuditTransition['kind'])) return fail()
  if (
    !Array.isArray(fields.recipients) ||
    fields.recipients.length === 0 ||
    Object.keys(fields.recipients).length !== fields.recipients.length
  )
    return fail()
  const addresses = new Set<string>()
  const markers = new Set<string>()
  const recipients = fields.recipients.map((value): AuditRecipient => {
    const recipient = record(value, ['to', 'marker', 'attempt'])
    const to = email(recipient.to)
    const marker = text(recipient.marker)
    if (!/^audit:[a-f0-9]{64}$/.test(marker) || addresses.has(to) || markers.has(marker)) return fail()
    addresses.add(to)
    markers.add(marker)
    return { to, marker, attempt: attempt(recipient.attempt, to) }
  })
  const result: AuditTransition = {
    version: 1,
    eventId: text(fields.eventId),
    family,
    ref: text(fields.ref),
    kind: fields.kind as AuditTransition['kind'],
    detectedAt: timestamp(fields.detectedAt),
    subject: text(fields.subject),
    body: text(fields.body),
    recipients
  }
  if ('lastAttemptAt' in fields) result.lastAttemptAt = timestamp(fields.lastAttemptAt)
  return result
}
function credentials(value: unknown): AuditCredentialState {
  const fields = record(value, ['version', 'availability', 'generation', 'lastValue'])
  if (
    fields.version !== 1 ||
    (fields.availability !== 'valid' && fields.availability !== 'unavailable') ||
    typeof fields.generation !== 'number' ||
    !Number.isSafeInteger(fields.generation) ||
    fields.generation < 0 ||
    (fields.availability === 'unavailable' && fields.generation === 0)
  )
    return fail()
  const result: AuditCredentialState = { version: 1, availability: fields.availability, generation: fields.generation }
  if ('lastValue' in fields) {
    const raw = text(fields.lastValue)
    timestamp(
      /^\d{4}-\d{2}-\d{2}$/.test(raw)
        ? `${raw}T00:00:00+08:00`
        : raw.replace(/(T\d{2}:\d{2})(Z|[+-]\d{2}:\d{2})$/, '$1:00$2')
    )
    result.lastValue = raw
  }
  if (result.availability === 'valid' && result.lastValue === undefined) return fail()
  return result
}

export function decodeAuditTransition(raw: string): AuditTransition {
  return transition(JSON.parse(bounded(raw)))
}
export function encodeAuditTransition(value: AuditTransition): string {
  return bounded(JSON.stringify(transition(value)))
}
export function decodeAuditCredentialState(raw: string | null): AuditCredentialState | null {
  return raw === null ? null : credentials(JSON.parse(bounded(raw)))
}
export function encodeAuditCredentialState(value: AuditCredentialState): string {
  return bounded(JSON.stringify(credentials(value)))
}
export function auditTransitionKey(family: AuditFamily, ref: string, hashId: (x: string) => string): string {
  if (!Object.hasOwn(KINDS, family)) return fail()
  return PREFIX + hashId(`${family}\0${text(ref)}`)
}
