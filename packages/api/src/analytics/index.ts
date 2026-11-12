import { ApiError, problemType } from '../problems'
import { z } from 'zod'
import { hashIp, IP_LIMIT, RATE_LIMIT_WINDOW_S } from '../middleware/rate-limit'
import type { ApiDeps } from '../context'
import { MAX_BODY_BYTES, parseIngestBody } from './body'
import { ingestBrowserEvent, ingestVital } from './service'

// #111's `POST /e` (spec §4 Other): public, CORS `*` without credentials. It sets and reads no cookie, stores no IP,
// user agent, referrer or account ID — even when a session cookie is sent, which is ignored — and answers 204 with
// no body. Runs outside the registry (like `/oembed`'s owner), so `apps/web`'s `app/e/route.ts` calls it directly.

const ALLOW_ORIGIN = '*'

const cors = (response: Response): Response => {
  response.headers.set('Access-Control-Allow-Origin', ALLOW_ORIGIN)
  return response
}

/** The RFC 9457 body `problems.ts` serves, with `instance` `/e` and the CORS origin. */
function problem(request: Request, error: ApiError): Response {
  const title = error.slug[0]!.toUpperCase() + error.slug.slice(1).replaceAll('-', ' ')
  const body = {
    ...error.extra,
    type: problemType(error.slug),
    title,
    status: error.status,
    detail: error.message,
    instance: new URL(request.url).pathname
  }
  return cors(
    new Response(JSON.stringify(body), {
      status: error.status,
      headers: { 'Content-Type': 'application/problem+json', ...error.headers }
    })
  )
}

/** A preflight from any origin gets `*` and no `Access-Control-Allow-Credentials`. */
function preflight(): Response {
  return cors(
    new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Expose-Headers': 'Retry-After'
      }
    })
  )
}

/** 429 with `Retry-After` once this IP hash passes its fixed one-minute window. */
async function checkRateLimit(request: Request, deps: ApiDeps): Promise<void> {
  const key = deps.config().ipHashKey
  if (!key) throw new Error('IP_HASH_KEY is not set')
  const bucket = `e:${hashIp(request.headers.get('X-Forwarded-For'), key)}`
  const at = deps.now()
  const { count, resetAt } = await deps.rateLimits.hit({ bucket, windowS: RATE_LIMIT_WINDOW_S, now: at })
  if (count > IP_LIMIT) {
    const retryAfter = Math.max(1, Math.ceil((resetAt.getTime() - at.getTime()) / 1000))
    throw new ApiError(
      429,
      'rate-limited',
      `Too many requests; retry in ${retryAfter} seconds.`,
      {},
      { 'Retry-After': String(retryAfter) }
    )
  }
}

function validationFailed(detail: string, errors: unknown[] = []): ApiError {
  return new ApiError(422, 'validation-failed', detail, { errors })
}

/** The matching variant's failure, with an RFC 6901 pointer per zod issue. */
function parseIngestBodyOrThrow(value: unknown) {
  try {
    return parseIngestBody(value)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ApiError(422, 'validation-failed', 'The request is invalid.', {
        errors: error.issues.map((issue) => ({
          in: 'body',
          pointer: issue.path.map((part) => `/${String(part).replaceAll('~', '~0').replaceAll('/', '~1')}`).join(''),
          detail: issue.message
        }))
      })
    }
    throw error
  }
}

function tooLarge(): ApiError {
  return validationFailed(`The body must be at most ${MAX_BODY_BYTES} bytes.`, [
    { in: 'body', pointer: '', detail: `body is larger than ${MAX_BODY_BYTES} bytes` }
  ])
}

/**
 * The body as text, never holding more than `limit` bytes of it: a declared Content-Length over the limit is refused
 * before reading, and a body that runs past it is refused as soon as it does, its stream cancelled.
 */
async function readBodyWithin(request: Request, limit: number): Promise<string> {
  const declared = Number(request.headers.get('Content-Length'))
  if (Number.isFinite(declared) && declared > limit) throw tooLarge()
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel().catch(() => undefined)
      throw tooLarge()
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

/** Serves `POST /e` and its preflight; `apps/web/app/e/route.ts` is the only caller in production. */
export async function handleAnalyticsIngest(request: Request, deps: ApiDeps): Promise<Response> {
  if (request.method === 'OPTIONS') return preflight()
  if (request.method !== 'POST') {
    return problem(request, new ApiError(404, 'not-found', 'No operation answers this method and path.'))
  }
  try {
    await checkRateLimit(request, deps)
    const type = request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase()
    if (type && type !== 'application/json' && type !== 'text/plain') {
      throw validationFailed('The body must be application/json or text/plain (what navigator.sendBeacon sends).', [
        { in: 'body', pointer: '', detail: `content type ${type} is not application/json or text/plain` }
      ])
    }
    const raw = await readBodyWithin(request, MAX_BODY_BYTES)
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw validationFailed('The body must be JSON.', [{ in: 'body', pointer: '', detail: 'body is not JSON' }])
    }
    const body = parseIngestBodyOrThrow(parsed)
    if ('type' in body) ingestVital(body)
    else await ingestBrowserEvent(deps, body)
    return cors(new Response(null, { status: 204 }))
  } catch (error) {
    if (error instanceof ApiError) return problem(request, error)
    throw error
  }
}
