export interface ApiProblemBody {
  type?: string
  title?: string
  status?: number
  detail?: string
  instance?: string
  [extension: string]: unknown
}

export class ApiProblem extends Error {
  readonly status: number
  readonly body: ApiProblemBody

  constructor(status: number, body: ApiProblemBody) {
    super(body.title ?? `HTTP ${status}`)
    this.name = 'ApiProblem'
    this.status = status
    this.body = body
  }
}

export interface ApiOperation {
  method: string
  path: string
  request?: {
    params?: unknown
    query?: unknown
    body?: unknown
  }
  response: { parse(value: unknown): unknown }
  idempotent?: boolean
}

export type ApiRegistry = Record<string, ApiOperation>

type InputOf<Value> = Value extends { _input: infer Input } ? Input : Value
type OutputOf<Value> = Value extends { parse(value: unknown): infer Output } ? Output : unknown
type RequestOf<Operation> = Operation extends { request: infer Request } ? Request : Record<never, never>
type RequestInput<Operation, Key extends 'params' | 'query' | 'body'> = Key extends keyof RequestOf<Operation>
  ? InputOf<RequestOf<Operation>[Key]>
  : never

export interface ApiFetchOptions<Operation> {
  params?: RequestInput<Operation, 'params'>
  query?: RequestInput<Operation, 'query'>
  body?: RequestInput<Operation, 'body'>
  signal?: AbortSignal
  /** Forwarded to fetch so undoable actions can flush with keepalive on pagehide. */
  keepalive?: boolean
  /** Device operations supply their bearer and stable capture idempotency key. */
  headers?: HeadersInit
  credentials?: RequestCredentials
  /** Required when calling from a server context without an organisation in the URL. */
  org?: string
  /** Reuse across a recent-auth retry of the same logical write. */
  idempotencyKey?: string
}

export type ApiFetch<Registry extends ApiRegistry> = <OperationId extends keyof Registry & string>(
  operationId: OperationId,
  options: ApiFetchOptions<Registry[OperationId]>
) => Promise<OutputOf<Registry[OperationId]['response']>>

export interface ApiFetchConfig {
  baseUrl?: string
  organization?: false
}

function organizationFromBrowser(): string | undefined {
  if (typeof window === 'undefined') return undefined
  return window.location.pathname.split('/').filter(Boolean)[0]
}

function fillPath(path: string, params: unknown, organization?: string): string {
  const values = { ...(params as Record<string, unknown> | undefined) }
  if (organization && values.org === undefined) values.org = organization

  return path.replace(/\{([^}]+)\}/g, (placeholder, name: string) => {
    const value = values[name]
    if (value === undefined || value === null) throw new Error(`Missing path parameter: ${name}`)
    return encodeURIComponent(String(value))
  })
}

function addQuery(url: string | URL, query: unknown): string | URL {
  if (!query || typeof query !== 'object') return url
  const searchParams = url instanceof URL ? url.searchParams : new URLSearchParams()

  for (const [key, rawValue] of Object.entries(query)) {
    if (rawValue === undefined || rawValue === null) continue
    for (const value of Array.isArray(rawValue) ? rawValue : [rawValue]) {
      if (value !== undefined && value !== null) searchParams.append(key, String(value))
    }
  }

  if (url instanceof URL) return url
  const queryString = searchParams.toString()
  return queryString ? `${url}${url.includes('?') ? '&' : '?'}${queryString}` : url
}

function problemBody(value: unknown, status: number, statusText: string): ApiProblemBody {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as ApiProblemBody
  return { type: 'about:blank', title: statusText || `HTTP ${status}`, status }
}

function defaultBaseUrl(path: string): string | undefined {
  if (path.startsWith('/api/')) {
    if (typeof window !== 'undefined') return window.location.origin
    if (process.env.HOST_MODE === 'multi') return process.env.APP_ORIGIN
  }
  if (typeof window !== 'undefined') return process.env.NEXT_PUBLIC_API_ORIGIN
  return process.env.API_ORIGIN ?? 'https://api.skyclause.m1ku.tech'
}

/** Bind an operation registry once; the returned apiFetch is typed by its operation IDs. */
export function createApiFetch<const Registry extends ApiRegistry>(
  registry: Registry,
  config: ApiFetchConfig = {}
): ApiFetch<Registry> {
  return async function apiFetch<OperationId extends keyof Registry & string>(
    operationId: OperationId,
    options: ApiFetchOptions<Registry[OperationId]>
  ): Promise<OutputOf<Registry[OperationId]['response']>> {
    const operation = registry[operationId]!
    const organization =
      config.organization === false
        ? undefined
        : (options.org ?? (typeof window === 'undefined' ? undefined : organizationFromBrowser()))
    const requestOptions = options as ApiFetchOptions<Registry[OperationId]> & {
      params?: unknown
      query?: unknown
      body?: unknown
    }
    const path = fillPath(operation.path, requestOptions.params, organization)
    const baseUrl = config.baseUrl ?? defaultBaseUrl(path)
    const requestUrl = addQuery(baseUrl ? new URL(path, baseUrl) : path, requestOptions.query)
    const headers = new Headers(options.headers)
    headers.set('Accept', 'application/json')

    if (organization) headers.set('Skyclause-Organization', organization)
    if (operation.idempotent && !headers.has('Idempotency-Key'))
      headers.set('Idempotency-Key', options.idempotencyKey ?? globalThis.crypto.randomUUID())

    const init: RequestInit = {
      method: operation.method,
      headers,
      signal: options.signal,
      ...(options.credentials ? { credentials: options.credentials } : {}),
      ...(options.keepalive ? { keepalive: true } : {})
    }
    if (requestOptions.body !== undefined) {
      headers.set('Content-Type', 'application/json')
      init.body = JSON.stringify(requestOptions.body)
    }

    const response = await fetch(requestUrl, init)
    if (!response.ok) {
      const body = await response.json().catch(() => undefined)
      throw new ApiProblem(response.status, problemBody(body, response.status, response.statusText))
    }

    const body = response.status === 204 ? undefined : await response.json()
    return operation.response.parse(body) as OutputOf<Registry[OperationId]['response']>
  }
}
