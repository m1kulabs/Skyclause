import { AggregationTemporality, DataPointType, InMemoryMetricExporter } from '@opentelemetry/sdk-metrics'
import { startTelemetry, type Telemetry } from '@skyclause/config'
import { withTenant } from '@skyclause/db'
import { makeOrganization, makeProject } from '@skyclause/db/test/factories/index'
import { asLogin, memberOf } from '@skyclause/db/test/harness/index'
import { afterEach, describe, expect, it } from 'vitest'
import { handleAnalyticsIngest } from '../src/analytics'
import { hashIp } from '../src/middleware/rate-limit'
import { testDeps, type TestDeps } from './harness'

// #111's `POST /e`: public, CORS `*` without credentials, no cookie and no personal data stored.

const IP_KEY = 'test-only-ip-hash-key-for-the-harness'

function post(deps: TestDeps, body: string, headers: Record<string, string> = {}) {
  return handleAnalyticsIngest(
    new Request('https://skyclause.m1ku.tech/e', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body
    }),
    deps
  )
}

const validEvent = JSON.stringify({
  name: 'landing_window_set',
  props: { modes: ['normal'], inputs_fresh: 2, inputs_error: 0 }
})
const validVital = JSON.stringify({ type: 'vital', metric: 'LCP', value: 1834.2, route_group: 'public' })

async function rowCount() {
  return asLogin('postgres', async (client) => {
    const { rows } = await client.query('SELECT count(*) AS n FROM analytics_event')
    return Number(rows[0].n)
  })
}

let telemetry: Telemetry | undefined
let exporter: InMemoryMetricExporter

function startMetrics() {
  exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
  telemetry = startTelemetry('web', {
    env: {
      APP_ENV: 'test',
      IP_HASH_KEY: 'k'.repeat(48),
      BETTER_AUTH_SECRET: 's'.repeat(48),
      EMAIL_HASH_KEY: 'e'.repeat(48)
    },
    metricExporter: exporter,
    write: () => {}
  })
}

afterEach(async () => {
  await telemetry?.shutdown()
  telemetry = undefined
})

async function vitalMetrics() {
  await telemetry?.flush()
  return exporter
    .getMetrics()
    .flatMap((resource) => resource.scopeMetrics.flatMap((scope) => scope.metrics))
    .filter((metric) => metric.descriptor.name === 'skyclause.web_vitals')
}

describe('POST /e', () => {
  it('answers a valid browser event with 204 and one row, over either content type sendBeacon uses', async () => {
    for (const contentType of ['application/json', 'text/plain;charset=UTF-8']) {
      const deps = testDeps()
      const before = await rowCount()
      const response = await post(deps, validEvent, { 'Content-Type': contentType })
      expect(response.status).toBe(204)
      expect(await response.text()).toBe('')
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull()
      expect(response.headers.get('Set-Cookie')).toBeNull()
      expect(await rowCount()).toBe(before + 1)
    }
  })

  it('stores no IP, user agent, referrer or account ID even when a session cookie is sent', async () => {
    const deps = testDeps()
    const response = await post(deps, validEvent, {
      Cookie: 'better-auth.session_token=abc123',
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://example.test/private',
      'X-Forwarded-For': '203.0.113.7'
    })
    expect(response.status).toBe(204)
    expect(response.headers.get('Set-Cookie')).toBeNull()
    const rows = await asLogin('postgres', async (client) => {
      const { rows } = await client.query(
        'SELECT row_to_json(analytics_event) AS row FROM analytics_event ORDER BY at DESC LIMIT 1'
      )
      return rows as Array<{ row: Record<string, unknown> }>
    })
    expect(Object.keys(rows[0]!.row).sort()).toEqual(['at', 'id', 'name', 'org_id', 'project_id', 'props'])
    expect(rows[0]!.row).toMatchObject({
      name: 'landing_window_set',
      org_id: null,
      project_id: null,
      props: { modes: ['normal'], inputs_fresh: 2, inputs_error: 0 }
    })
  })

  it('resolves a public project to its IDs, and drops a private or unknown project', async () => {
    const org = await makeOrganization({ slug: 'acme-club' })
    const open = await withTenant({ orgId: org.id, principal: memberOf(org.id) }, (tx) =>
      makeProject(tx, { public: true, slug: 'bukit-jalil' })
    )
    const closed = await withTenant({ orgId: org.id, principal: memberOf(org.id) }, (tx) =>
      makeProject(tx, { slug: 'members-only' })
    )
    const ref = `${org.slug}/${open.slug}`
    const response = await post(
      testDeps(),
      JSON.stringify({
        name: 'embed_loaded',
        props: { component: 'skyclause-status', mode: 'normal' },
        project: ref
      })
    )
    expect(response.status).toBe(204)
    const found = await asLogin('postgres', async (client) => {
      const { rows } = await client.query(
        "SELECT org_id, project_id FROM analytics_event WHERE name = 'embed_loaded' ORDER BY at DESC LIMIT 1"
      )
      return rows[0] as { org_id: string; project_id: string }
    })
    expect(found).toEqual({ org_id: org.id, project_id: open.id })

    for (const project of [`${org.slug}/${closed.slug}`, `${org.slug}/no-such-project`]) {
      const dropped = await post(
        testDeps(),
        JSON.stringify({ name: 'embed_loaded', props: { component: 'skyclause-status', mode: 'normal' }, project })
      )
      expect(dropped.status, project).toBe(204)
    }
    const nulls = await asLogin('postgres', async (client) => {
      const { rows } = await client.query(
        "SELECT count(*) AS n FROM analytics_event WHERE name = 'embed_loaded' AND org_id IS NULL AND project_id IS NULL"
      )
      return Number(rows[0].n)
    })
    expect(nulls).toBe(2)
  })

  it('records a valid vital as one histogram point with metric and route_group, and no row', async () => {
    startMetrics()
    const deps = testDeps()
    const before = await rowCount()
    const response = await post(deps, validVital, { 'Content-Type': 'text/plain;charset=UTF-8' })
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(await rowCount()).toBe(before)
    const latest = (await vitalMetrics()).at(-1)
    expect(latest?.dataPointType).toBe(DataPointType.HISTOGRAM)
    expect(latest?.dataPoints.map((point) => [point.attributes, (point.value as { count: number }).count])).toEqual([
      [{ metric: 'LCP', route_group: 'public' }, 1]
    ])
  })

  it.each([
    ['an unknown name', JSON.stringify({ name: 'window_opened', props: {} }), '/name'],
    ['a vital-shaped event', JSON.stringify({ name: 'LCP', props: {} }), '/name'],
    [
      'an extra prop',
      JSON.stringify({
        name: 'embed_loaded',
        props: { component: 'skyclause-status', mode: 'normal', title: 'Storm at Bukit Jalil' }
      }),
      '/props'
    ],
    [
      'an email in props',
      JSON.stringify({
        name: 'embed_loaded',
        props: { component: 'skyclause-status', mode: 'normal', contact: 'someone@example.test' }
      }),
      '/props'
    ],
    [
      'a wrong enum',
      JSON.stringify({ name: 'landing_window_set', props: { modes: ['tornado'], inputs_fresh: 1, inputs_error: 0 } }),
      '/props/modes/0'
    ],
    ['a missing prop', JSON.stringify({ name: 'landing_window_set', props: { modes: ['normal'] } }), '/props'],
    [
      'a bad project ref',
      JSON.stringify({
        name: 'embed_loaded',
        props: { component: 'skyclause-status', mode: 'normal' },
        project: 'not a ref'
      }),
      '/project'
    ],
    [
      'a bad vital metric',
      JSON.stringify({ type: 'vital', metric: 'FID', value: 1, route_group: 'public' }),
      '/metric'
    ],
    ['a NaN vital', '{"type":"vital","metric":"CLS","value":NaN,"route_group":"public"}', ''],
    [
      'a vital past an hour',
      JSON.stringify({ type: 'vital', metric: 'LCP', value: 1e12, route_group: 'public' }),
      '/value'
    ],
    ['malformed JSON', '{oops', ''],
    [
      'an oversize body',
      JSON.stringify({
        name: 'embed_loaded',
        props: { component: 'skyclause-status', mode: 'normal', note: 'x'.repeat(3000) }
      }),
      ''
    ]
  ])('answers %s with validation-failed and no row', async (_label, body, pointer) => {
    const deps = testDeps()
    const before = await rowCount()
    const response = await post(deps, body)
    expect(response.status).toBe(422)
    const problem = (await response.json()) as {
      type: string
      status: number
      title: string
      detail: string
      instance: string
      errors: unknown[]
    }
    expect(problem).toMatchObject({
      type: 'https://docs.skyclause.m1ku.tech/problems/validation-failed',
      status: 422,
      instance: '/e'
    })
    expect(problem.errors.length).toBeGreaterThan(0)
    if (pointer) expect(JSON.stringify(problem)).toContain(pointer)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(await rowCount()).toBe(before)
  })

  it('refuses a body over 2 KB even when it would otherwise validate', async () => {
    const deps = testDeps()
    const big = JSON.stringify({
      name: 'landing_window_set',
      props: { modes: Array(400).fill('normal'), inputs_fresh: 1, inputs_error: 0 }
    })
    expect(new TextEncoder().encode(big).length).toBeGreaterThan(2048)
    const response = await post(deps, big)
    expect(response.status).toBe(422)
    expect(((await response.json()) as { type: string }).type).toContain('validation-failed')
  })

  it('refuses a body whose Content-Length is over 2 KB before reading it, and stops reading one that runs past', async () => {
    const declared = await handleAnalyticsIngest(
      new Request('https://skyclause.m1ku.tech/e', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'Content-Length': '1048576' },
        body: validEvent
      }),
      testDeps()
    )
    expect(declared.status).toBe(422)
    // A body with no length that streams on: read no further than the limit, then refused.
    let pulled = 0
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1
        controller.enqueue(new Uint8Array(1024).fill(32))
      }
    })
    const streamed = await handleAnalyticsIngest(
      new Request('https://skyclause.m1ku.tech/e', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: endless,
        duplex: 'half'
      } as RequestInit),
      testDeps()
    )
    expect(streamed.status).toBe(422)
    expect(pulled).toBeLessThan(10)
  })

  it('refuses another content type with validation-failed', async () => {
    const response = await post(testDeps(), validEvent, { 'Content-Type': 'text/html' })
    expect(response.status).toBe(422)
  })

  it('answers 429 with Retry-After over the per-IP limit, without writing rows', async () => {
    const deps = testDeps()
    const forwarded = '198.51.100.9'
    const bucket = `e:${hashIp(forwarded, IP_KEY)}`
    for (let i = 0; i < 120; i += 1) {
      await deps.rateLimits.hit({ bucket, windowS: 60, now: deps.now() })
    }
    const before = await rowCount()
    const response = await post(deps, validEvent, { 'X-Forwarded-For': forwarded })
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toMatch(/^[1-9]\d*$/)
    const problem = (await response.json()) as { type: string }
    expect(problem.type).toBe('https://docs.skyclause.m1ku.tech/problems/rate-limited')
    expect(await rowCount()).toBe(before)
  })

  it('answers a preflight from any origin with * and no credentials', async () => {
    const response = await handleAnalyticsIngest(
      new Request('https://skyclause.m1ku.tech/e', {
        method: 'OPTIONS',
        headers: { Origin: 'https://embed.example.test', 'Access-Control-Request-Method': 'POST' }
      }),
      testDeps()
    )
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull()
  })

  it('answers another method with not-found', async () => {
    const response = await handleAnalyticsIngest(new Request('https://skyclause.m1ku.tech/e'), testDeps())
    expect(response.status).toBe(404)
  })
})
