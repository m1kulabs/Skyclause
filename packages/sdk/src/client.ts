import {
  OPERATION_IDS,
  OPERATIONS,
  type EventStreamOperationId,
  type OperationArguments,
  type OperationId,
  type OperationMetadata,
  type OperationRequests,
  type OperationResponses,
  type SdkMethods
} from './generated'
import { createProblemError, type Problem } from './problems'
import { webhooks } from './webhooks'

const DEFAULT_BASE_URL = 'https://api.skyclause.m1ku.tech/v1'
const RETRY_LIMIT = 3
const warnedDeprecations = new Set<string>()

export interface CreateSdkOptions {
  baseUrl?: string
  token?: string
  organization?: string
  fetch?: SdkFetch
  onDeprecation?: (event: DeprecationEvent) => void
}

export type SdkFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface DeprecationEvent {
  operationId: OperationId
  deprecation: string
  sunset: string | null
  link: string | null
}

export interface Page<T> {
  data: T[]
  next_cursor: string | null
}

export interface SseEvent {
  id: string
  event: string
  data: string
}

export type SdkStream = <Id extends EventStreamOperationId>(
  operationId: Id,
  ...args: OperationArguments[Id]
) => AsyncIterable<SseEvent>

export type SkyclauseSdk = SdkMethods & {
  paginate: typeof paginate
  stream: SdkStream
  webhooks: typeof webhooks
}

interface RuntimeRequest {
  params?: Record<string, unknown>
  query?: Record<string, unknown>
  body?: unknown
  idempotencyKey?: string
  signal?: AbortSignal
}

function normalizedApiBase(baseUrl: string): URL {
  const base = new URL(baseUrl)
  const basePath = base.pathname.replace(/\/+$/, '')
  base.pathname = basePath.endsWith('/v1') ? basePath : `${basePath}/v1`
  base.search = ''
  base.hash = ''
  return base
}

export function buildOperationUrl(
  baseUrl: string,
  path: string,
  request: Pick<RuntimeRequest, 'params' | 'query'> = {}
): URL {
  const base = normalizedApiBase(baseUrl)
  const apiPath = path.startsWith('/v1/') ? path.slice(3) : path
  const filledPath = apiPath.replace(/\{([^}]+)\}/g, (_placeholder, name: string) => {
    const value = request.params?.[name]
    if (value === undefined || value === null) throw new TypeError(`Missing path parameter: ${name}`)
    return encodeURIComponent(String(value))
  })
  const url = new URL(`${base.pathname.replace(/\/$/, '')}${filledPath}`, base.origin)
  for (const [key, rawValue] of Object.entries(request.query ?? {})) {
    if (rawValue === undefined || rawValue === null) continue
    for (const value of Array.isArray(rawValue) ? rawValue : [rawValue]) {
      if (value !== undefined && value !== null) url.searchParams.append(key, String(value))
    }
  }
  return url
}

function abortError(signal?: AbortSignal): unknown {
  if (!signal?.aborted) return undefined
  return signal.reason ?? new Error('The request was aborted.')
}

function retryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && /^\d+(?:\.\d+)?$/.test(value.trim())) return Math.max(0, seconds * 1000)
  const at = Date.parse(value)
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now())
}

function waitFor(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false)
  return new Promise((resolve) => {
    const finish = (result: boolean) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      resolve(result)
    }
    const timer = setTimeout(() => finish(true), ms)
    const onAbort = () => finish(false)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function makeHeaders(
  operation: OperationMetadata,
  request: RuntimeRequest,
  options: CreateSdkOptions,
  accept: string,
  lastEventId?: string
): Headers {
  const headers = new Headers()
  headers.set('Accept', accept)
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`)
  if (options.organization) headers.set('Skyclause-Organization', options.organization)
  if (operation.method === 'POST' && operation.idempotent) {
    headers.set('Idempotency-Key', request.idempotencyKey ?? crypto.randomUUID())
  }
  if (request.body !== undefined) headers.set('Content-Type', 'application/json')
  if (lastEventId !== undefined) headers.set('Last-Event-ID', lastEventId)
  return headers
}

function notifyDeprecation(
  response: Response,
  operationId: OperationId,
  callback?: CreateSdkOptions['onDeprecation']
): void {
  const deprecation = response.headers.get('Deprecation')
  if (!deprecation) return
  const event = {
    operationId,
    deprecation,
    sunset: response.headers.get('Sunset'),
    link: response.headers.get('Link')
  }
  if (callback) {
    callback(event)
    return
  }
  if (warnedDeprecations.has(operationId)) return
  warnedDeprecations.add(operationId)
  console.warn(
    `Skyclause API operation ${operationId} is deprecated (${deprecation}); sunset ${event.sunset ?? 'unknown'}.`
  )
}

async function problemFrom(response: Response): Promise<Problem> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  const raw = typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
  return {
    ...raw,
    type: typeof raw.type === 'string' ? raw.type : 'about:blank',
    title: typeof raw.title === 'string' ? raw.title : response.statusText || `HTTP ${response.status}`,
    status: typeof raw.status === 'number' ? raw.status : response.status,
    detail: typeof raw.detail === 'string' ? raw.detail : response.statusText || `HTTP ${response.status}`,
    instance: typeof raw.instance === 'string' ? raw.instance : ''
  }
}

async function throwProblem(response: Response): Promise<never> {
  throw createProblemError(await problemFrom(response))
}

async function readResponse(response: Response, eventStream: boolean): Promise<unknown> {
  if (eventStream) return response
  if (response.status === 204 || response.status === 205) return undefined
  const contentType = response.headers.get('Content-Type')?.toLowerCase() ?? ''
  if (contentType.includes('json')) return response.json()
  if (contentType.startsWith('text/')) return response.text()
  if (!contentType) return response.json()
  return response.arrayBuffer()
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

async function executeOperation(
  operationId: OperationId,
  request: RuntimeRequest,
  options: CreateSdkOptions,
  baseUrl: string,
  fetcher: SdkFetch
): Promise<unknown> {
  const operation = OPERATIONS[operationId]
  const url = buildOperationUrl(baseUrl, operation.path, request)
  const headers = makeHeaders(operation, request, options, 'application/json')
  const init: RequestInit = {
    method: operation.method,
    headers,
    signal: request.signal,
    ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {})
  }
  const canRetry =
    operation.method === 'GET' || operation.method === 'DELETE' || (operation.method === 'POST' && operation.idempotent)

  for (let retry = 0; ; retry += 1) {
    const response = await fetcher(url, init)
    notifyDeprecation(response, operationId, options.onDeprecation)
    if (canRetry && isRetryableStatus(response.status) && retry < RETRY_LIMIT) {
      const delay = retryAfterMs(response.headers.get('Retry-After')) ?? 250 * 2 ** retry
      await response.body?.cancel()
      const waited = await waitFor(delay, request.signal)
      if (!waited) throw abortError(request.signal)
      continue
    }
    if (!response.ok) return throwProblem(response)
    return readResponse(response, operation.eventStream)
  }
}

function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<boolean> {
  const jittered = Math.floor(ms * (0.8 + Math.random() * 0.4))
  return waitFor(jittered, signal)
}

async function* readEvents(body: ReadableStream<Uint8Array>, initialId: string): AsyncIterable<SseEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let lastEventId = initialId
  let eventName = ''
  let dataLines: string[] = []
  let complete = false

  const consumeLine = (line: string): SseEvent | undefined => {
    if (line === '') {
      const event = dataLines.length
        ? { id: lastEventId, event: eventName || 'message', data: dataLines.join('\n') }
        : undefined
      eventName = ''
      dataLines = []
      return event
    }
    if (line.startsWith(':')) return undefined
    const separator = line.indexOf(':')
    const field = separator < 0 ? line : line.slice(0, separator)
    const value = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /, '')
    if (field === 'data') dataLines.push(value)
    if (field === 'event') eventName = value
    if (field === 'id' && !value.includes('\0')) lastEventId = value
    return undefined
  }

  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) {
        complete = true
        buffer += decoder.decode()
        break
      }
      buffer += decoder.decode(chunk.value, { stream: true })
      while (true) {
        const lineEnd = /\r\n|\n|\r/.exec(buffer)
        if (!lineEnd || (lineEnd[0] === '\r' && lineEnd.index === buffer.length - 1)) break
        const line = buffer.slice(0, lineEnd.index)
        buffer = buffer.slice(lineEnd.index + lineEnd[0].length)
        const event = consumeLine(line)
        if (event) yield event
      }
    }

    if (buffer) {
      const event = consumeLine(buffer)
      if (event) yield event
    }
    const finalEvent = consumeLine('')
    if (finalEvent) yield finalEvent
  } finally {
    if (!complete) await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

async function* streamEvents(
  operationId: EventStreamOperationId,
  request: RuntimeRequest,
  options: CreateSdkOptions,
  baseUrl: string,
  fetcher: SdkFetch
): AsyncIterable<SseEvent> {
  const operation = OPERATIONS[operationId]
  if (!operation.eventStream) throw new TypeError(`${operationId} is not an event-stream operation.`)
  const url = buildOperationUrl(baseUrl, operation.path, request)
  let lastEventId = ''
  let backoffMs = 1000
  let reconnect = false

  while (!request.signal?.aborted) {
    if (reconnect) {
      const waited = await sleepWithSignal(backoffMs, request.signal)
      if (!waited) return
      backoffMs = Math.min(backoffMs * 2, 30_000)
    }
    try {
      const response = await fetcher(url, {
        method: operation.method,
        headers: makeHeaders(operation, request, options, 'text/event-stream', lastEventId || undefined),
        signal: request.signal
      })
      notifyDeprecation(response, operationId, options.onDeprecation)
      if (!response.ok) return throwProblem(response)
      if (response.body) {
        for await (const event of readEvents(response.body, lastEventId)) {
          if (event.id) lastEventId = event.id
          yield event
        }
      }
      reconnect = true
    } catch (error) {
      if (request.signal?.aborted) return
      if (error instanceof Error && error.name !== 'TypeError' && error.name !== 'NetworkError') throw error
      reconnect = true
    }
  }
}

export function paginate<T>(fetchPage: (cursor?: string) => Promise<Page<T>>): AsyncIterable<T> {
  return (async function* () {
    let cursor: string | undefined
    while (true) {
      const page = await fetchPage(cursor)
      for (const item of page.data) yield item
      if (page.next_cursor === null) return
      cursor = page.next_cursor
    }
  })()
}

export function createSdk(options: CreateSdkOptions = {}): SkyclauseSdk {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const fetcher: SdkFetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init))
  const client: Record<string, (...args: unknown[]) => Promise<unknown>> = {}

  for (const operationId of OPERATION_IDS) {
    client[operationId] = (input: unknown = {}) =>
      executeOperation(operationId, input as RuntimeRequest, options, baseUrl, fetcher)
  }

  const stream: SdkStream = ((operationId: EventStreamOperationId, ...args: unknown[]) => {
    return streamEvents(operationId, (args[0] ?? {}) as RuntimeRequest, options, baseUrl, fetcher)
  }) as SdkStream

  return Object.assign(client, {
    paginate,
    stream,
    webhooks
  }) as unknown as SkyclauseSdk
}

export type { EventStreamOperationId, OperationId, OperationRequests, OperationResponses, SdkMethods }
