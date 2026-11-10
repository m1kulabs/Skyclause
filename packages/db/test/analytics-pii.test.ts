// #111's Analytics events criteria: catalogue schemas carry random IDs, counts and enums only — no emails,
// names, IPs, window titles or free text. A fast-check suite feeds every schema hostile strings; a meta-test fails
// if any prop is a free string rather than an enum. Coverage: a passing case per emitted event, `it.todo` per event
// with no `track()` call site or `/e` sender yet.
import * as fc from 'fast-check'
import { describe, expect, it, test } from 'vitest'
import { ANALYTICS_EVENT_TYPES, type AnalyticsProps } from '@skyclause/contracts'
import { ANALYTICS_PROPS, parseAnalyticsProps, track, withTenant, type Tx } from '../src'
import { asLogin, memberOf } from './harness'
import { makeOrganization } from './factories'

type Name = (typeof ANALYTICS_EVENT_TYPES)[number]

/** One valid sample per catalogue event; the type forces a sample when an event is added. */
const SAMPLES: { [N in Name]: AnalyticsProps<N> } = {
  landing_window_set: { modes: ['normal'], inputs_fresh: 2, inputs_error: 0 },
  guest_started: { bot_check: 'passed' },
  signed_up: { method: 'magic_link', from_guest: false },
  org_created: { plan: 'community' },
  project_created: { packs: ['sky'] },
  source_bound: { adapter: 'jps_rain', cadence_min: 300 },
  rota_set: { shifts: 3, conditional: true },
  channel_connected: { channel: 'email' },
  onboarding_step: { step: 'org_created', skipped: false },
  window_declared: { via: 'form', recurring: true },
  run_started: { pack: 'sky', trigger: 'schedule' },
  bundle_drafted: { pack: 'sky', calls: 4, non_normal: 1, disagreements: 0, no_call: false },
  bundle_approved: { pack: 'sky', minutes_to_approve: 9, edited: false, rejected: false, recheck_changed: true },
  bundle_escalated: { pack: 'crowd', level: 'admins' },
  approver_alerted: { channel: 'web_push', seconds: 12 },
  bundle_closed: { pack: 'sky', reason: 'superseded' },
  notice_sent: { channel: 'email', language: 'ms', pack: 'sky' },
  unsubscribed: { channel: 'email' },
  evidence_requested: { via: 'app' },
  evidence_replied: { minutes: 41, approval_needed: true },
  call_graded: { pack: 'sky', grade: 'hit' },
  clause_published: { pack: 'sky', clauses_changed: 2, replay_calls_changed: 1 },
  replay_run: { pack: 'crowd', days: 30 },
  share_link_created: { access: 'reviewer', expiry_days: 7 },
  mcp_connected: { client: 'claude' },
  mcp_tool_called: { tool: 'list_projects', scope: 'read', ok: true },
  api_key_created: { scopes: ['read'], expiry_days: 90 },
  cli_login: { os: 'linux' },
  embed_loaded: { component: 'skyclause-status', mode: 'normal' },
  export_requested: { scope: 'organisation' }
}

const PII = [
  'someone@example.test',
  'user+tag@mail.example.org',
  'https://sky.example.test/p/acme/bukit-jalil',
  'http://203.0.113.7/status',
  '203.0.113.7',
  '192.168.1.10',
  '2001:db8::1',
  'fe80::1',
  '+60123456789',
  '03-1234 5678',
  'Storm at Bukit Jalil 14:00–16:00',
  'My Math Class (T123)'
]

/** The whole sample with every leaf replaced by `probe`: any string anywhere must be refused. */
function probed(name: Name, probe: string): unknown {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return [probe]
    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(Object.entries(value).map(([key, leaf]) => [key, walk(leaf)]))
    }
    return probe
  }
  return walk(SAMPLES[name])
}

test('no catalogue schema accepts personal data in any field or beside it, and each sample is valid', () => {
  for (const name of ANALYTICS_EVENT_TYPES) expect(() => parseAnalyticsProps(name, SAMPLES[name]), name).not.toThrow()
  fc.assert(
    fc.property(fc.constantFrom(...ANALYTICS_EVENT_TYPES), fc.constantFrom(...PII), (name, pii) => {
      expect(() => parseAnalyticsProps(name, probed(name, pii)), `${name} takes ${pii}`).toThrow()
      expect(
        () => parseAnalyticsProps(name, { ...(SAMPLES[name] as object), email: pii }),
        `${name} plus email`
      ).toThrow()
    })
  )
  fc.assert(
    fc.property(fc.constantFrom(...ANALYTICS_EVENT_TYPES), fc.string({ maxLength: 120 }), (name, probe) => {
      // No free strings anywhere in the catalogue, so any string in any field is refused.
      expect(() => parseAnalyticsProps(name, probed(name, probe)), `${name} takes ${JSON.stringify(probe)}`).toThrow()
    })
  )
})

test('no catalogue prop is a free string: every leaf is an enum, a count or amount, a boolean or an array of enums', () => {
  const describeLeaf = (schema: unknown, path: string): string[] => {
    const def =
      (schema as { _zod?: { def: Record<string, unknown> }; _def?: Record<string, unknown> })._zod?.def ??
      (schema as { _def?: Record<string, unknown> })._def
    const type = def?.type as string | undefined
    if (type === 'optional' || type === 'default' || type === 'readonly' || type === 'nonoptional') {
      return describeLeaf((def as { innerType: unknown }).innerType, path)
    }
    if (type === 'array') return describeLeaf((def as { element: unknown }).element, `${path}[]`)
    if (type === 'enum' || type === 'number' || type === 'boolean' || type === 'literal') return []
    const shape = (def as { shape?: unknown })?.shape
    if (type === 'object' && shape && typeof shape === 'object') {
      return Object.entries(shape).flatMap(([key, field]) => describeLeaf(field, path ? `${path}.${key}` : key))
    }
    return [`${path || '(root)'} is ${type ?? 'unrecognised'}`]
  }
  const problems = (Object.keys(ANALYTICS_PROPS) as Name[]).flatMap((name) => describeLeaf(ANALYTICS_PROPS[name], name))
  expect(problems).toEqual([])
})

/** Events with a `track()` call site or an `/e` sender: `track()` writes a row each. */
const EMITTED: Name[] = [
  'project_created',
  'run_started',
  'bundle_drafted',
  'bundle_approved',
  'bundle_escalated',
  'approver_alerted',
  'bundle_closed',
  'notice_sent',
  'call_graded',
  'channel_connected',
  'evidence_replied',
  'evidence_requested',
  'unsubscribed'
]

/** Every catalogue event is either emitted (passing case below) or listed as `it.todo`. */
const TODO: Name[] = (ANALYTICS_EVENT_TYPES as readonly string[]).filter(
  (name): name is Name => !EMITTED.includes(name as Name)
)

test('every catalogue event is either emitted or todo, so a new event joins one list', () => {
  expect([...EMITTED, ...TODO].sort()).toEqual([...ANALYTICS_EVENT_TYPES].sort())
})

describe('emitted events', () => {
  it.each(EMITTED)('%s writes one row through track()', async (name) => {
    const orgId = (await makeOrganization()).id
    const txOf = (tx: Tx) => track(tx, name, SAMPLES[name])
    await withTenant({ orgId, principal: memberOf(orgId) }, txOf)
    const count = await asLogin('postgres', async (client) => {
      const { rows } = await client.query('SELECT count(*) AS n FROM analytics_event WHERE org_id = $1 AND name = $2', [
        orgId,
        name
      ])
      return Number(rows[0].n)
    })
    expect(count).toBe(1)
  })

  for (const name of TODO) {
    it.todo(`${name} is emitted when its owning ticket merges`, () => {})
  }
})
