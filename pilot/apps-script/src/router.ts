import type { DevicePost, PostBody, PostResult } from '../../shared/device-post.ts'
import type { GetProperty, ScriptProperty } from './properties.ts'

// A doPost handler: its body `kind` and the Script Property holding its token.
export interface PostRoute {
  kind: string
  tokenProperty: ScriptProperty
  handle: (body: PostBody) => PostResult
}

export type WebResponse = { json: unknown } | { html: string }

// A doGet handler for `?page=` or `?kind=`, with an optional token checked against `?token=`.
export interface GetRoute {
  param: 'page' | 'kind'
  value: string
  tokenProperty?: ScriptProperty
  handle: (params: Record<string, string>) => WebResponse
}

export interface PostDeps {
  getProperty: GetProperty
  withLock: <T>(fn: () => T) => T
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function tokenMatches(tokenProperty: ScriptProperty, token: string | undefined, getProperty: GetProperty): boolean {
  const expected = getProperty(tokenProperty)
  return Boolean(expected) && token === expected
}

function parse(contents: string | undefined): DevicePost | null {
  let body: unknown
  try {
    body = JSON.parse(contents ?? '')
  } catch {
    return null
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const { kind, token, device_id } = body as Record<string, unknown>
  if (typeof kind !== 'string' || typeof token !== 'string' || typeof device_id !== 'string' || !device_id) return null
  return body as DevicePost
}

// One router for every device post: a bad token, an unknown kind or a malformed body writes nothing.
export function handlePost(contents: string | undefined, routes: PostRoute[], deps: PostDeps): PostResult {
  const post = parse(contents)
  if (!post) return { ok: false, error: 'malformed body' }
  const route = routes.find((candidate) => candidate.kind === post.kind)
  if (!route) return { ok: false, error: 'unknown kind' }
  if (!tokenMatches(route.tokenProperty, post.token, deps.getProperty)) return { ok: false, error: 'bad token' }
  const { token: _token, ...body } = post
  try {
    return deps.withLock(() => route.handle(body))
  } catch (error) {
    return { ok: false, error: message(error) }
  }
}

// `health=1` first, then `page`, then `kind`.
export function handleGet(
  params: Record<string, string>,
  routes: GetRoute[],
  health: () => unknown,
  deps: { getProperty: GetProperty }
): WebResponse {
  try {
    if (params.health === '1') return { json: health() }
    const param = params.page !== undefined ? 'page' : 'kind'
    const route = routes.find((candidate) => candidate.param === param && candidate.value === params[param])
    if (!route) return { json: { ok: false, error: 'unknown route' } }
    if (route.tokenProperty && !tokenMatches(route.tokenProperty, params.token, deps.getProperty)) {
      return { json: { ok: false, error: 'bad token' } }
    }
    return route.handle(params)
  } catch (error) {
    return { json: { ok: false, error: message(error) } }
  }
}
