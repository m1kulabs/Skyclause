import { trace } from '@opentelemetry/api'
import { log as telemetryLog } from '@skyclause/config'
import type { HeartbeatName } from '@skyclause/contracts'
import { shareSystemConnection } from '@skyclause/db'
import { Hono, type MiddlewareHandler } from 'hono'
import { routePath } from 'hono/route'
import { jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose'

/** A Pub/Sub push message, `data` decoded from base64 JSON. */
export interface PushMessage {
  data: unknown
  attributes: Record<string, string>
  messageId: string
  publishTime: string
}

export type TopicHandler = (message: PushMessage) => Promise<void>

/** A Cloud Tasks HTTP call, `body` parsed as JSON. */
export interface Task {
  name: string | null
  retryCount: number
  body: unknown
}

export type QueueHandler = (task: Task) => Promise<void>

export type TickHandler = (now: Date) => Promise<void>

export type BatchHandler = (now: Date) => Promise<void>

export type RouteHandler = (request: Request, params: Record<string, string>) => Promise<Response>

export type JobHandler = (args: string[]) => Promise<void>

/** An `onEvent` consumer; #92 dispatches `domain-events` to these. */
export interface EventConsumer {
  consumer: string
  types: string[]
  handler: (event: unknown) => Promise<void>
}

/** One owner's handlers; `registry.ts` lists one part per owner. */
export interface WorkerPart {
  owner: string
  /** Pub/Sub push subscriptions, `POST /pubsub/<topic>`. */
  topics?: Record<string, TopicHandler>
  /** Cloud Tasks queues, `POST /tasks/<queue>`. */
  queues?: Record<string, QueueHandler>
  /** Run on every Cloud Scheduler `POST /ticks/minute`, keyed by a name for logs. */
  ticks?: Record<string, TickHandler>
  /**
   * Run on every Cloud Scheduler `POST /ticks/batch`, every 15 minutes (D45), keyed by a name for logs. A run's
   * handlers take turns on one connection, which only `withSystem` and `withTenant` for a system principal share, called
   * as `shareSystemConnection` says; await every call before the handler settles.
   */
  batch?: Record<string, BatchHandler>
  /** `POST /internal<path>`, with Hono path params such as `/ai-keys/:id/test`. */
  internal?: Record<string, RouteHandler>
  /** `POST /ses<path>`, without Google OIDC: the handler checks the SNS signature. */
  ses?: Record<string, RouteHandler>
  /** Cloud Run jobs, `node main.js job <name> [args]`. */
  jobs?: Record<string, JobHandler>
  events?: EventConsumer[]
}

type KeyedKind = 'topics' | 'queues' | 'ticks' | 'batch' | 'internal' | 'ses' | 'jobs'

export type Registry = { [K in KeyedKind]: NonNullable<WorkerPart[K]> } & { events: EventConsumer[] }

const KEYED_KINDS: KeyedKind[] = ['topics', 'queues', 'ticks', 'batch', 'internal', 'ses', 'jobs']

export function defineRegistry(parts: WorkerPart[]): Registry {
  const registry: Registry = {
    topics: {},
    queues: {},
    ticks: {},
    batch: {},
    internal: {},
    ses: {},
    jobs: {},
    events: []
  }
  const owners = new Map<string, string>()
  const claim = (key: string, owner: string) => {
    const previous = owners.get(key)
    if (previous) throw new Error(`${key} is registered by ${previous} and ${owner}`)
    owners.set(key, owner)
  }
  for (const part of parts) {
    for (const kind of KEYED_KINDS) {
      for (const [name, handler] of Object.entries(part[kind] ?? {})) {
        claim(`${kind} ${name}`, part.owner)
        ;(registry[kind] as Record<string, unknown>)[name] = handler
      }
    }
    for (const consumer of part.events ?? []) {
      claim(`events ${consumer.consumer}`, part.owner)
      registry.events.push(consumer)
    }
  }
  return registry
}

export async function runJob(registry: Registry, name: string, args: string[]) {
  const job = registry.jobs[name]
  if (!job) throw new Error(`unknown job ${name}; registered: ${Object.keys(registry.jobs).join(', ') || 'none'}`)
  await job(args)
}

export interface ServerOptions {
  registry: Registry
  /** Expected `aud`: `WORKER_URL`. */
  audience: string
  /** Expected `email`: `WORKER_INVOKER_SA`. */
  invoker: string
  jwks: JWTVerifyGetKey
  /** Records `skyclause.heartbeat{name}`: `main.ts` passes telemetry's gauge; defaults to a log line. */
  heartbeat?: (name: HeartbeatName) => void
}

/** Redacted and linked to the active trace (#114). */
export function log(severity: 'INFO' | 'ERROR', message: string, fields: Record<string, unknown> = {}) {
  if (severity === 'ERROR') telemetryLog.error(message, fields)
  else telemetryLog.info(message, fields)
}

export function logHeartbeat(name: string) {
  log('INFO', 'heartbeat', { metric: 'skyclause.heartbeat', name })
}

/** Decodes a Pub/Sub push body; throws on anything that isn't one. */
function decodePush(text: string): PushMessage {
  const { message } = JSON.parse(text) as {
    message?: { data?: string; attributes?: Record<string, string>; messageId?: string; publishTime?: string }
  }
  if (typeof message?.messageId !== 'string' || typeof message.publishTime !== 'string') {
    throw new Error('not a Pub/Sub push envelope')
  }
  return {
    data: message.data ? JSON.parse(Buffer.from(message.data, 'base64').toString('utf8')) : null,
    attributes: message.attributes ?? {},
    messageId: message.messageId,
    publishTime: message.publishTime
  }
}

/**
 * Runs every handler at `now` side by side, so one failure stops none of the others, even a handler that throws
 * before returning its promise; resolves once every handler has settled, with the failed names.
 */
async function runAll(label: string, handlers: Record<string, TickHandler | BatchHandler>, now: Date) {
  const entries = Object.entries(handlers)
  const results = await Promise.allSettled(entries.map(async ([, handler]) => handler(now)))
  return entries.flatMap(([name], i) => {
    const result = results[i]
    if (result?.status !== 'rejected') return []
    log('ERROR', `${label} handler failed`, { [label]: name, error: String(result.reason) })
    return [name]
  })
}

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

export function createServer(options: ServerOptions) {
  const { registry } = options
  const app = new Hono()

  // Names the request span's route template, so it records http.server.request.duration (#114). A path no
  // route matched ends at a middleware wildcard and gets none.
  app.use(async (c, next) => {
    await next()
    const route = routePath(c, -1)
    if (!route.endsWith('*')) trace.getActiveSpan()?.setAttribute('http.route', route)
  })

  app.onError((error, c) => {
    log('ERROR', 'handler failed', { path: c.req.path, error: String(error) })
    return c.text('handler failed', 500)
  })

  app.get('/health', (c) => c.text('ok'))

  const googleOidc: MiddlewareHandler = async (c, next) => {
    const token = c.req.header('authorization')?.match(/^Bearer (.+)$/i)?.[1]
    if (!token) return c.text('missing bearer token', 401)
    let claims: JWTPayload
    try {
      ;({ payload: claims } = await jwtVerify(token, options.jwks, {
        issuer: GOOGLE_ISSUERS,
        audience: options.audience,
        algorithms: ['RS256']
      }))
    } catch {
      return c.text('invalid token', 401)
    }
    if (claims.email !== options.invoker || claims.email_verified !== true) return c.text('forbidden', 403)
    await next()
  }

  for (const path of ['/pubsub/*', '/tasks/*', '/ticks/*', '/internal/*']) app.use(path, googleOidc)

  app.post('/pubsub/:topic', async (c) => {
    const handler = registry.topics[c.req.param('topic')]
    if (!handler) return c.text('unknown topic', 404)
    let message: PushMessage
    try {
      message = decodePush(await c.req.text())
    } catch {
      return c.text('malformed push envelope', 400)
    }
    await handler(message)
    return c.body(null, 204)
  })

  app.post('/tasks/:queue', async (c) => {
    const handler = registry.queues[c.req.param('queue')]
    if (!handler) return c.text('unknown queue', 404)
    const text = await c.req.text()
    let body: unknown
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      return c.text('malformed task body', 400)
    }
    await handler({
      name: c.req.header('x-cloudtasks-taskname') ?? null,
      retryCount: Number(c.req.header('x-cloudtasks-taskretrycount') ?? 0),
      body
    })
    return c.body(null, 204)
  })

  app.post('/ticks/minute', async (c) => {
    ;(options.heartbeat ?? logHeartbeat)('minute_tick')
    const failed = await runAll('tick', registry.ticks, new Date())
    return failed.length ? c.json({ failed }, 500) : c.body(null, 204)
  })

  // D45: the route itself never reads or writes Postgres; its handlers do, sharing one connection per run, which goes
  // back to the pool once runAll has seen every handler settle. If it can't be opened, no handler can work, so the
  // batch names them all.
  app.post('/ticks/batch', async (c) => {
    const now = new Date()
    const failed = await shareSystemConnection(() => runAll('batch', registry.batch, now)).catch((error: unknown) => {
      const names = Object.keys(registry.batch)
      log('ERROR', 'batch connection failed', { handlers: names, error: String(error) })
      return names
    })
    return failed.length ? c.json({ failed }, 500) : c.body(null, 204)
  })

  for (const [prefix, routes] of [
    ['/internal', registry.internal],
    ['/ses', registry.ses]
  ] as const) {
    for (const [path, handler] of Object.entries(routes)) {
      app.post(prefix + path, (c) => handler(c.req.raw, c.req.param()))
    }
  }

  return app
}
