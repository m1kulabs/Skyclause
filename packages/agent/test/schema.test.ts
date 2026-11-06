import { expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { ProposedBundle } from '../src/schema'
import type { AgentInput } from '../src/schema'

const call = {
  window_id: '019a5300-0000-7000-8000-000000000001',
  mode: 'commute_disruption',
  watch: false,
  no_call: null,
  fired: [{ clause: 'storm_confirmed', inputs: ['w.rain_max_60m_mm'] }],
  recommendations: [],
  recipients: ['019a5300-0000-7000-8000-000000000002'],
  notices: [{ language: 'en', subject: 'Storm confirmed', body: 'Storm confirmed at the JPS gauge (Lebat class)' }],
  reason: 'Storm confirmed'
}

test('ProposedBundle accepts the TRD call and surge-night item shapes', () => {
  expect(ProposedBundle.safeParse({ pack: 'sky', calls: [call], items: [] }).success).toBe(true)
  expect(
    ProposedBundle.safeParse({
      pack: 'crowd',
      calls: [],
      items: [{ kind: 'surge_night_entry', night_id: '019a5300-0000-7000-8000-000000000003' }]
    }).success
  ).toBe(true)
  expect(
    ProposedBundle.safeParse({ pack: 'sky', calls: [{ ...call, mode: null, no_call: ['site.api_max'] }], items: [] })
      .success
  ).toBe(true)
})

test('ProposedBundle rejects unknown enums and malformed calls', () => {
  for (const changed of [
    { ...call, mode: 'cancelled' },
    { ...call, recommendations: ['cancel'] },
    { ...call, no_call: 'site.api_max' },
    { ...call, notices: [{ language: 'fr', subject: '', body: '' }] },
    { ...call, fired: [{ clause: 'storm_confirmed', inputs: [31] }] },
    { ...call, recipients: [123] }
  ]) {
    expect(ProposedBundle.safeParse({ pack: 'sky', calls: [changed], items: [] }).success).toBe(false)
  }
  expect(ProposedBundle.safeParse({ pack: 'other', calls: [], items: [] }).success).toBe(false)
})

test('ProposedBundle enforces the TRD notice and reason length limits', () => {
  const bounded = {
    ...call,
    reason: 'r'.repeat(1500),
    notices: [{ language: 'ms', subject: 's'.repeat(120), body: 'b'.repeat(2000) }]
  }
  expect(ProposedBundle.safeParse({ pack: 'sky', calls: [bounded], items: [] }).success).toBe(true)
  for (const changed of [
    { ...bounded, reason: 'r'.repeat(1501) },
    { ...bounded, notices: [{ language: 'en', subject: 's'.repeat(121), body: '' }] },
    { ...bounded, notices: [{ language: 'en', subject: '', body: 'b'.repeat(2001) }] }
  ]) {
    expect(ProposedBundle.safeParse({ pack: 'sky', calls: [changed], items: [] }).success).toBe(false)
  }
})

test('AgentInput adds the Malay-reader and link allow-lists without personal window fields', () => {
  expectTypeOf<AgentInput['malay_reader']>().toEqualTypeOf<boolean>()
  expectTypeOf<AgentInput['source_urls']>().toEqualTypeOf<string[]>()
  expectTypeOf<AgentInput['origins']>().toEqualTypeOf<string[]>()
  expectTypeOf<AgentInput['windows'][number]>().toEqualTypeOf<{ id: string; starts_at: string; ends_at: string }>()
  expectTypeOf<AgentInput>().not.toHaveProperty('shadow_verdict')
})

test('ProposedBundle has no invented schema examples', () => {
  expect(JSON.stringify(z.toJSONSchema(ProposedBundle))).not.toMatch(/"examples?":/)
})
