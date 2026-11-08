import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { beforeAll, describe, expect, test } from 'vitest'
import { createServer, defineRegistry, runJob, type WorkerPart } from '../src/server'

const audience = 'https://worker-413187272599.asia-southeast1.run.app'
const invoker = 'worker-invoker@skyclause.iam.gserviceaccount.com'

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey']
let jwks: ReturnType<typeof createLocalJWKSet>

beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  privateKey = pair.privateKey
  jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'test', alg: 'RS256' }] })
})

function token(claims: { aud?: string; email?: string } = {}) {
  return new SignJWT({ email: claims.email ?? invoker, email_verified: true })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer('https://accounts.google.com')
    .setAudience(claims.aud ?? audience)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)
}

function server(...parts: WorkerPart[]) {
  return createServer({ registry: defineRegistry(parts), audience, invoker, jwks, heartbeat: () => {} })
}

function push(data: unknown) {
  return JSON.stringify({
    message: {
      data: Buffer.from(JSON.stringify(data)).toString('base64'),
      attributes: {},
      messageId: '1',
      publishTime: '2026-11-06T00:00:00Z'
    },
    subscription: 'projects/skyclause/subscriptions/test'
  })
}

async function post(app: ReturnType<typeof server>, path: string, init: { bearer?: string; body?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (init.bearer) headers.authorization = `Bearer ${init.bearer}`
  return app.request(path, { method: 'POST', headers, body: init.body ?? '{}' })
}

describe('worker OIDC', () => {
  test('a call without a token is 401', async () => {
    const res = await post(server(), '/pubsub/readings-updated', { body: push({}) })
    expect(res.status).toBe(401)
  })

  test('a token for another audience is 401', async () => {
    const res = await post(server(), '/pubsub/readings-updated', {
      bearer: await token({ aud: 'https://elsewhere.example' }),
      body: push({})
    })
    expect(res.status).toBe(401)
  })

  test('a token from another service account is 403', async () => {
    const bearer = await token({ email: 'someone-else@skyclause.iam.gserviceaccount.com' })
    const res = await post(server(), '/pubsub/readings-updated', { bearer, body: push({}) })
    expect(res.status).toBe(403)
  })

  test('a valid token reaches the topic handler with the decoded message', async () => {
    const received: unknown[] = []
    const app = server({ owner: 'test', topics: { 'readings-updated': async (m) => void received.push(m.data) } })
    const res = await post(app, '/pubsub/readings-updated', {
      bearer: await token(),
      body: push({ source_id: 'source-1' })
    })
    expect(res.status).toBe(204)
    expect(received).toEqual([{ source_id: 'source-1' }])
  })
})

describe('worker dispatch', () => {
  test('an unknown topic is 404', async () => {
    const res = await post(server(), '/pubsub/no-such-topic', { bearer: await token(), body: push({}) })
    expect(res.status).toBe(404)
  })

  test('a malformed push envelope or task body is 400', async () => {
    const app = server({ owner: 'test', topics: { t: async () => {} }, queues: { q: async () => {} } })
    const bearer = await token()
    for (const body of [
      'not json',
      '{}',
      JSON.stringify({ message: { data: Buffer.from('not json').toString('base64') } })
    ]) {
      expect((await post(app, '/pubsub/t', { bearer, body })).status, body).toBe(400)
    }
    expect((await post(app, '/tasks/q', { bearer, body: 'not json' })).status).toBe(400)
  })

  test('a throwing topic handler is 500, so Pub/Sub redelivers', async () => {
    const app = server({
      owner: 'test',
      topics: { 'readings-updated': () => Promise.reject(new Error('database down')) }
    })
    const res = await post(app, '/pubsub/readings-updated', { bearer: await token(), body: push({}) })
    expect(res.status).toBe(500)
  })

  test('a Cloud Tasks call reaches its queue handler with the body and task name', async () => {
    const received: unknown[] = []
    const app = server({
      owner: 'test',
      queues: { 'bundle-timers': async (t) => void received.push([t.name, t.body]) }
    })
    const res = await app.request('/tasks/bundle-timers', {
      method: 'POST',
      headers: { authorization: `Bearer ${await token()}`, 'x-cloudtasks-taskname': 'sla-1-1' },
      body: JSON.stringify({ bundle_id: '1' })
    })
    expect(res.status).toBe(204)
    expect(received).toEqual([['sla-1-1', { bundle_id: '1' }]])
  })

  test('an unknown queue is 404 and tasks need a token', async () => {
    expect((await post(server(), '/tasks/no-such-queue', { bearer: await token() })).status).toBe(404)
    expect((await post(server(), '/tasks/no-such-queue')).status).toBe(401)
  })
})

describe('worker minute tick', () => {
  test('records the minute_tick heartbeat and runs every tick handler', async () => {
    const heartbeats: string[] = []
    const ran: string[] = []
    const app = createServer({
      registry: defineRegistry([
        { owner: 'a', ticks: { evaluator: async () => void ran.push('evaluator') } },
        { owner: 'b', ticks: { auditor: async () => void ran.push('auditor') } }
      ]),
      audience,
      invoker,
      jwks,
      heartbeat: (name) => void heartbeats.push(name)
    })
    const res = await post(app, '/ticks/minute', { bearer: await token() })
    expect(res.status).toBe(204)
    expect(heartbeats).toEqual(['minute_tick'])
    expect(ran.sort()).toEqual(['auditor', 'evaluator'])
  })

  test('one failing tick handler does not stop the others, and the tick reports it', async () => {
    const ran: string[] = []
    const app = server(
      { owner: 'a', ticks: { evaluator: () => Promise.reject(new Error('boom')) } },
      { owner: 'b', ticks: { auditor: async () => void ran.push('auditor') } }
    )
    const res = await post(app, '/ticks/minute', { bearer: await token() })
    expect(ran).toEqual(['auditor'])
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ failed: ['evaluator'] })
  })

  test('the tick needs a token', async () => {
    expect((await post(server(), '/ticks/minute')).status).toBe(401)
  })
})

describe('worker 15-minute batch', () => {
  test('runs every batch handler at the same instant', async () => {
    const ran: Array<[string, Date]> = []
    const app = server(
      { owner: 'a-observability', batch: { sli: async (now) => void ran.push(['sli', now]) } },
      { owner: 'b-auditor', batch: { auditor: async (now) => void ran.push(['auditor', now]) } }
    )
    const res = await post(app, '/ticks/batch', { bearer: await token() })
    expect(res.status).toBe(204)
    expect(ran.map(([name]) => name).sort()).toEqual(['auditor', 'sli'])
    expect(ran[0]?.[1]).toBe(ran[1]?.[1])
  })

  test('the batch needs a valid token from the invoker, and runs nothing without one', async () => {
    const ran: string[] = []
    const app = server({ owner: 'a-observability', batch: { sli: async () => void ran.push('sli') } })
    expect((await post(app, '/ticks/batch')).status).toBe(401)
    expect(
      (await post(app, '/ticks/batch', { bearer: await token({ aud: 'https://elsewhere.example' }) })).status
    ).toBe(401)
    const stranger = await token({ email: 'someone-else@skyclause.iam.gserviceaccount.com' })
    expect((await post(app, '/ticks/batch', { bearer: stranger })).status).toBe(403)
    expect(ran).toEqual([])
  })

  test('one failing batch handler does not stop the others, and the batch names it', async () => {
    const ran: string[] = []
    const app = server(
      { owner: 'a-observability', batch: { sli: () => Promise.reject(new Error('database asleep')) } },
      { owner: 'b-auditor', batch: { auditor: async () => void ran.push('auditor') } }
    )
    const res = await post(app, '/ticks/batch', { bearer: await token() })
    expect(ran).toEqual(['auditor'])
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ failed: ['sli'] })
  })

  test('a handler that throws before returning a promise stops none of the others', async () => {
    const ran: string[] = []
    const app = server(
      {
        owner: 'a-observability',
        batch: {
          sli: () => {
            throw new Error('not configured')
          }
        }
      },
      { owner: 'b-auditor', batch: { auditor: async () => void ran.push('auditor') } }
    )
    const res = await post(app, '/ticks/batch', { bearer: await token() })
    expect(ran).toEqual(['auditor'])
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ failed: ['sli'] })
  })

  test('a batch with no handlers is 204', async () => {
    expect((await post(server(), '/ticks/batch', { bearer: await token() })).status).toBe(204)
  })

  test('the minute tick runs no batch handler, and the batch no tick handler', async () => {
    const ran: string[] = []
    const app = server({
      owner: 'test',
      ticks: { evaluator: async () => void ran.push('tick') },
      batch: { sli: async () => void ran.push('batch') }
    })
    const bearer = await token()
    await post(app, '/ticks/minute', { bearer })
    expect(ran).toEqual(['tick'])
    await post(app, '/ticks/batch', { bearer })
    expect(ran).toEqual(['tick', 'batch'])
  })
})

describe('worker routes', () => {
  test('GET /health is 200 without a token', async () => {
    expect((await server().request('/health')).status).toBe(200)
  })

  test('an internal route needs a token and reaches its handler with path params', async () => {
    const app = server({
      owner: 'test',
      internal: { '/ai-keys/:id/test': async (_req, params) => Response.json(params) }
    })
    expect((await post(app, '/internal/ai-keys/k1/test')).status).toBe(401)
    const res = await post(app, '/internal/ai-keys/k1/test', { bearer: await token() })
    expect(await res.json()).toEqual({ id: 'k1' })
  })

  test('an /ses route skips Google OIDC, since its owner checks the SNS signature', async () => {
    const app = server({ owner: 'test', ses: { '/events': async () => new Response(null, { status: 204 }) } })
    expect((await post(app, '/ses/events')).status).toBe(204)
  })
})

describe('worker registry', () => {
  test('two owners claiming one name is refused', () => {
    expect(() =>
      defineRegistry([
        { owner: 'a', topics: { 'readings-updated': async () => {} } },
        { owner: 'b', topics: { 'readings-updated': async () => {} } }
      ])
    ).toThrow(/readings-updated.*a.*b/)
  })

  test('a batch handler registered by two owners is refused, naming both', () => {
    expect(() =>
      defineRegistry([
        { owner: 'a-observability', batch: { sli: async () => {} } },
        { owner: 'b-auditor', batch: { sli: async () => {} } }
      ])
    ).toThrow('batch sli is registered by a-observability and b-auditor')
  })

  test('collects onEvent consumers for the domain-events dispatch', () => {
    const consumer = { consumer: 'webhooks', types: ['call.sent'], handler: async () => {} }
    expect(defineRegistry([{ owner: 'e-webhooks', events: [consumer] }]).events).toEqual([consumer])
  })
})

describe('worker jobs', () => {
  test('runs the named job with its arguments', async () => {
    const ran: string[][] = []
    await runJob(
      defineRegistry([{ owner: 'test', jobs: { migrate: async (args) => void ran.push(args) } }]),
      'migrate',
      ['--dry-run']
    )
    expect(ran).toEqual([['--dry-run']])
  })

  test('an unknown job is refused, naming it', async () => {
    await expect(runJob(defineRegistry([]), 'no-such-job', [])).rejects.toThrow(/no-such-job/)
  })
})
