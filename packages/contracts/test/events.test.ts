import { expect, test } from 'vitest'
import { DOMAIN_EVENT_SCHEMAS, DomainEventSchema, EventEnvelopeSchema, WEBHOOK_EVENT_TYPES } from '../src/events'

const domainEventTypes = [
  'source.error',
  'source.stale',
  'source.recovered',
  'crossing.detected',
  'run.completed',
  'run.failed',
  'bundle.drafted',
  'bundle.needs_review',
  'bundle.superseded',
  'bundle.expired',
  'bundle.escalated',
  'bundle.approved',
  'call.sent',
  'call.graded',
  'night.graded',
  'review_item.opened',
  'listing.proposed',
  'listing.listed',
  'listing.changed',
  'evidence_request.answered',
  'window.created',
  'window.updated',
  'window.cancelled',
  'poll.recorded',
  'source.bound',
  'source.unbound',
  'clause_sheet.published'
] as const

test('defines one schema for every Spec §5 domain event', () => {
  expect(Object.keys(DOMAIN_EVENT_SCHEMAS)).toEqual(domainEventTypes)
  expect(Object.values(DOMAIN_EVENT_SCHEMAS).every((schema) => typeof schema.safeParse === 'function')).toBe(true)
})

test('uses the TRD webhook catalogue and excludes internal events', () => {
  expect(WEBHOOK_EVENT_TYPES).toEqual([
    'source.error',
    'source.stale',
    'source.recovered',
    'crossing.detected',
    'run.completed',
    'run.failed',
    'bundle.drafted',
    'bundle.needs_review',
    'bundle.escalated',
    'bundle.approved',
    'bundle.superseded',
    'bundle.expired',
    'call.sent',
    'call.graded',
    'listing.proposed',
    'listing.listed',
    'listing.changed',
    'night.graded',
    'review_item.opened',
    'evidence_request.answered'
  ])
})

test('validates the TRD event envelope and the event-specific data shape', () => {
  const event = {
    id: '0192a111-2222-7222-8222-222222222222',
    type: 'run.completed',
    created_at: '2026-11-06T00:00:00Z',
    org_id: '0192a111-2222-7222-8222-222222222222',
    project_id: '0192a111-2222-7222-8222-222222222222',
    data: {
      run_id: '0192a111-2222-7222-8222-222222222222',
      pack: 'sky',
      trigger: 'schedule',
      bundle_id: '0192a111-2222-7222-8222-222222222222',
      shadow_mode: false
    }
  }

  expect(EventEnvelopeSchema.safeParse(event).success).toBe(true)
  expect(DomainEventSchema.safeParse(event).success).toBe(true)
  expect(
    DomainEventSchema.safeParse({ ...event, data: { run_id: '0192a111-2222-7222-8222-222222222222' } }).success
  ).toBe(false)
  expect(DomainEventSchema.safeParse({ ...event, id: 'event-id' }).success).toBe(false)
})

test('call.sent carries a null mode for a No call', () => {
  const sent = {
    id: '0192a111-2222-7222-8222-222222222222',
    type: 'call.sent',
    created_at: '2026-11-06T00:00:00Z',
    org_id: '0192a111-2222-7222-8222-222222222222',
    project_id: '0192a111-2222-7222-8222-222222222222',
    data: { call_id: '0192a111-2222-7222-8222-222222222222', mode: null, outcome: 'sent' }
  }
  expect(DOMAIN_EVENT_SCHEMAS['call.sent'].safeParse(sent).success).toBe(true)
  expect(
    DOMAIN_EVENT_SCHEMAS['call.sent'].safeParse({ ...sent, data: { ...sent.data, mode: 'no_call' } }).success
  ).toBe(false)
})
