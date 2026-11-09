import { z } from '@hono/zod-openapi'
import { describe, expect, expectTypeOf, it } from 'vitest'
import * as shared from '../src/api/shared'
import {
  BlockedInput,
  BundleState,
  CallState,
  InputValue,
  Notification,
  PackState,
  Page,
  PageQuery,
  Preferences,
  Problem
} from '../src/api/shared'

// Schema inputs are test doubles, not product examples or seeded records.
const at = '2026-11-06T00:00:00Z'
const input = {
  name: 'site.rain_60m_mm',
  value: null,
  unit: 'mm',
  state: 'stale',
  since: at,
  age_s: 600,
  source_ids: [],
  source_url: 'https://publicinfobanjir.water.gov.my/',
  reading_ids: [],
  observed_at: at
}

describe('shared wire schemas', () => {
  it('Reading carries a null unit or poll as stored: device rows without a poll, unitless records (#159)', () => {
    const reading = {
      id: 'r',
      source_id: 's',
      poll_id: null,
      metric: 'warning',
      unit: null,
      observed_at: at,
      received_at: at,
      value: null,
      value_text: 'text',
      value_json: null,
      device_time: null,
      item_key: null,
      revision: '0'
    }
    expect(shared.Reading.safeParse(reading).success).toBe(true)
  })

  it('Page is a typed schema factory with an explicit nullable next_cursor', () => {
    const schema = Page(z.number())
    expectTypeOf<z.infer<typeof schema>>().toEqualTypeOf<shared.Page<number>>()
    expect(schema.parse({ data: [1], next_cursor: null })).toEqual({ data: [1], next_cursor: null })
    expect(schema.safeParse({ data: [1], next_cursor: 'opaque' }).success).toBe(true)
    expect(schema.safeParse({ data: ['1'], next_cursor: null }).success).toBe(false)
    expect(schema.safeParse({ data: [] }).success).toBe(false)
    expect(schema.safeParse({ data: [], nextCursor: null }).success).toBe(false)
  })

  it('PageQuery uses TRD pagination limits and default', () => {
    expect(PageQuery.parse({})).toEqual({ limit: 50 })
    expect(PageQuery.parse({ limit: '200', cursor: 'opaque' })).toEqual({ limit: 200, cursor: 'opaque' })
    for (const limit of [0, 201, 1.5]) expect(PageQuery.safeParse({ limit }).success).toBe(false)
  })

  it('Problem requires all five RFC 9457 fields', () => {
    const problem = {
      type: 'https://docs.skyclause.m1ku.tech/problems/source-error',
      title: 'Source error',
      status: 503,
      detail: 'Source failed',
      instance: '/v1/projects'
    }
    expect(Problem.parse(problem)).toEqual(problem)
    const { detail: _detail, ...missing } = problem
    expect(Problem.safeParse(missing).success).toBe(false)
  })

  it('InputValue requires source_url and keeps stale values, ages and provenance explicit', () => {
    expect(InputValue.parse(input)).toEqual(input)
    expect(InputValue.safeParse({ ...input, source_url: null }).success).toBe(true)
    const { source_url: _sourceUrl, ...missing } = input
    expect(InputValue.safeParse(missing).success).toBe(false)
    expect(InputValue.safeParse({ ...input, age_s: 0.5 }).success).toBe(false)
    expect(InputValue.safeParse({ ...input, age_s: -1 }).success).toBe(false)
    expect(InputValue.safeParse({ ...input, observed_at: '2026-11-06T08:00:00+08:00' }).success).toBe(false)
    expect(InputValue.safeParse({ ...input, state: 'unknown' }).success).toBe(false)
    for (const value of [12, true, 'warning', [1, 2], null])
      expect(InputValue.safeParse({ ...input, value }).success).toBe(true)
    expect(BlockedInput.parse({ name: input.name, source_id: null, state: 'pending', since: at }).source_id).toBeNull()
  })

  it('PackState distinguishes an approved call, engine verdict and no approved call yet', () => {
    const state = { pack: 'sky', mode: null, watch: false, no_call: { inputs: [] }, call_id: null }
    for (const basis of ['approved_call', 'engine_verdict', null])
      expect(PackState.safeParse({ ...state, basis }).success).toBe(true)
    expect(PackState.safeParse({ ...state, basis: 'cached' }).success).toBe(false)
  })

  it('Preferences has SET-2 appearance and language fields with shortcuts enabled by default', () => {
    const preferences = {
      theme: 'system',
      high_contrast: false,
      density: 'comfortable',
      reduced_motion: true,
      language: 'ms'
    }
    expect(Preferences.parse(preferences)).toEqual({ ...preferences, shortcuts: true })
    expect(Preferences.parse({ ...preferences, shortcuts: false }).shortcuts).toBe(false)
    expect(Preferences.safeParse({ ...preferences, theme: 'auto' }).success).toBe(false)
    expect(Preferences.safeParse({ ...preferences, language: 'fr' }).success).toBe(false)
  })

  it('Notification has exactly the Spec §1 item keys, kinds and nullable project/read time', () => {
    const notification = {
      id: 'notification',
      kind: 'source_error',
      ref: { type: 'source', id: 'source' },
      project: null,
      recovered: false,
      created_at: at,
      read_at: null
    }
    expect(Notification.parse(notification)).toEqual(notification)
    expect(Object.keys(Notification.shape)).toEqual([
      'id',
      'kind',
      'ref',
      'project',
      'recovered',
      'created_at',
      'read_at'
    ])
    expect(shared.NotificationKind.options).toEqual([
      'needs_review',
      'escalated',
      'source_error',
      'review_item',
      'auditor'
    ])
    expect(
      Notification.parse({
        ...notification,
        recovered: true,
        project: { id: 'project', slug: 'bukit-jalil', org_slug: 'commons' },
        read_at: at
      }).recovered
    ).toBe(true)
    expect(Notification.safeParse({ ...notification, kind: 'call_sent' }).success).toBe(false)
  })

  it('keeps the bundle state machine distinct from per-call state', () => {
    expect(BundleState.options).toEqual([
      'drafted',
      'closed',
      'needs_review',
      'superseded',
      'expired',
      'reconfirm',
      'approved',
      'sending',
      'sent',
      'graded'
    ])
    expect(CallState.options).toEqual([
      'drafted',
      'approved',
      'edited',
      'rejected',
      'expired',
      'superseded',
      'sending',
      'sent',
      'failed'
    ])
  })

  it('uses the Spec §3 verification targets rather than display names', () => {
    expect(shared.Verification.shape.target.options).toEqual([
      'claude_ai',
      'claude_desktop',
      'claude_code',
      'chatgpt',
      'gemini_cli',
      'gemini_enterprise',
      'cursor',
      'vscode'
    ])
  })

  it('every exported schema emits snake_case keys and no invented OpenAPI examples', () => {
    const entries: Array<[string, unknown]> = Object.entries(shared)
    const schemas = entries.filter((entry): entry is [string, z.ZodType] => entry[1] instanceof z.ZodType)
    expect(schemas.length).toBeGreaterThan(30)
    for (const [name, schema] of schemas) {
      const json = z.toJSONSchema(schema)
      const walk = (value: unknown): void => {
        if (typeof value !== 'object' || value === null) return
        expect(value, name).not.toHaveProperty('example')
        expect(value, name).not.toHaveProperty('examples')
        if ('properties' in value) {
          for (const key of Object.keys(value.properties as object)) expect(key, name).toMatch(/^[a-z][a-z0-9_]*$/)
        }
        for (const child of Object.values(value)) walk(child)
      }
      walk(json)
    }
  })
})
