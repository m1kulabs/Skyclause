import { HTTP_PROBLEM_STATUS } from '@skyclause/contracts'
import { createHash } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'
import { routePath } from 'hono/route'
import type { ApiEnv } from '../context'
import { ApiError } from '../problems'
import type { IdempotencyKey } from '../stores'
import { credentialOf, ipHash } from './rate-limit'

export const IDEMPOTENCY_TTL_MS = 24 * 3_600_000
/**
 * How long a reservation stays pending: the web service's Cloud Run request timeout (600 s), so a request that died
 * before storing its response frees its key instead of answering 409 for a day.
 */
export const IDEMPOTENCY_PENDING_MS = 600_000

const keyCreateOperations = new Set(['createMyApiKey', 'createOrganisationApiKey'])

/** A create replay may return metadata, but an idempotency row never holds the one-time plaintext key. */
async function storedBody(response: Response, operationId: string): Promise<string> {
  const body = await response.clone().text()
  if (!keyCreateOperations.has(operationId)) return body
  try {
    const parsed: unknown = JSON.parse(body)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'key' in parsed) {
      delete (parsed as { key?: unknown }).key
      return JSON.stringify(parsed)
    }
  } catch {
    // Only the declared API-key creation response is JSON; keep unexpected bodies unchanged for normal error handling.
  }
  return body
}

/**
 * TRD "API conventions": `Idempotency-Key` on creating POSTs, kept 24 hours with the organisation, route and request
 * hash. A repeat replays the stored response; the same key with another request is 422 `idempotency-mismatch`;
 * a repeat while the first still runs is 409. Only 2xx and 3xx responses are kept, so a refused or failed request
 * can be retried with the same key; a reservation whose request never finished frees after the pending lease.
 */
export const requireIdempotency: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const key = c.req.header('Idempotency-Key')
  if (!key) {
    throw new ApiError(422, 'validation-failed', 'This operation needs an Idempotency-Key header.', {
      errors: [{ in: 'header', pointer: '/Idempotency-Key', detail: 'Required' }]
    })
  }
  const { idempotency, now } = c.get('deps')
  const principal = c.get('principal')
  const id: IdempotencyKey = {
    scope: c.get('orgId') ?? (principal ? credentialOf(principal) : `ip:${ipHash(c)}`),
    route: `${c.req.method} ${routePath(c, -1)}`,
    key
  }
  const url = new URL(c.req.url)
  const requestHash = createHash('sha256')
    .update(`${c.req.method}\n${url.pathname}${url.search}\n${await c.req.text()}`)
    .digest('hex')

  const at = now()
  const held = await idempotency.reserve(
    { ...id, requestHash, expiresAt: new Date(at.getTime() + IDEMPOTENCY_PENDING_MS), response: null },
    at
  )
  if (held) {
    if (held.requestHash !== requestHash) {
      throw new ApiError(422, 'idempotency-mismatch', 'This Idempotency-Key was used with a different request.')
    }
    if (!held.response) {
      throw new ApiError(
        HTTP_PROBLEM_STATUS['idempotency-in-progress'],
        'idempotency-in-progress',
        'A request with this Idempotency-Key is still running.'
      )
    }
    const { status, contentType, location, body } = held.response
    return c.newResponse(body, status as 200, {
      ...(contentType && { 'Content-Type': contentType }),
      ...(location && { Location: location })
    })
  }

  // Hono turns an error thrown downstream into `c.res` before `next()` resolves.
  await next()
  const claim = { ...id, requestHash }
  if (c.res.status >= 200 && c.res.status < 400) {
    await idempotency.complete(
      claim,
      {
        status: c.res.status,
        contentType: c.res.headers.get('Content-Type'),
        location: c.res.headers.get('Location'),
        body: await storedBody(c.res, c.get('operation').operationId)
      },
      new Date(at.getTime() + IDEMPOTENCY_TTL_MS)
    )
  } else {
    await idempotency.release(claim)
  }
}
