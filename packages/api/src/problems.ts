import { NotBuiltError, type ProblemSlug } from '@skyclause/contracts'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ZodError } from 'zod'

// TRD "API conventions": RFC 9457 problems. PROBLEM_SLUGS has no slug for a missing credential, an unknown route, a
// key still being processed or a server fault, so these four are API-local.
export type HttpSlug = 'unauthenticated' | 'not-found' | 'idempotency-in-progress' | 'internal-error'
export type Slug = ProblemSlug | HttpSlug

export const problemType = (slug: Slug) => `https://docs.skyclause.m1ku.tech/problems/${slug}`

/** Thrown anywhere in a request to answer with a problem; extension members and headers ride along. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly slug: Slug,
    detail: string,
    readonly extra: Record<string, unknown> = {},
    readonly headers: Record<string, string> = {}
  ) {
    super(detail)
    this.name = 'ApiError'
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof NotBuiltError) return new ApiError(501, 'not-built', error.message, { owner: error.owner })
  // zod-openapi's media-type gate throws 415 for a body it can't read.
  if (error instanceof HTTPException) return new ApiError(error.status, 'validation-failed', error.message)
  return new ApiError(500, 'internal-error', 'The server failed to answer this request.')
}

/** Built through the context, so headers set earlier in the request (CORS) stay on the problem. */
export function problemResponse(c: Context, error: ApiError): Response {
  const title = error.slug[0]!.toUpperCase() + error.slug.slice(1).replaceAll('-', ' ')
  const body = {
    ...error.extra,
    type: problemType(error.slug),
    title,
    status: error.status,
    detail: error.message,
    instance: c.req.path
  }
  return c.newResponse(JSON.stringify(body), error.status as 400, {
    ...error.headers,
    'Content-Type': 'application/problem+json'
  })
}

const LOCATIONS = { json: 'body', form: 'body', query: 'query', param: 'path', header: 'header', cookie: 'cookie' }
const pointerOf = (path: PropertyKey[]) =>
  path.map((part) => `/${String(part).replaceAll('~', '~0').replaceAll('/', '~1')}`).join('')

/** 422 `validation-failed` with an RFC 6901 pointer per zod issue, in the request part it came from. */
export function validationFailed(target: string, error: ZodError): ApiError {
  const where = LOCATIONS[target as keyof typeof LOCATIONS] ?? target
  return new ApiError(422, 'validation-failed', 'The request is invalid.', {
    errors: error.issues.map((issue) => ({ in: where, pointer: pointerOf(issue.path), detail: issue.message }))
  })
}
