import { HTTP_PROBLEM_STATUS, NotBuiltError, type ProblemSlug } from '@skyclause/contracts'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ZodError } from 'zod'

// TRD "API conventions": RFC 9457 problems; the slugs live in @skyclause/contracts.

export const problemType = (slug: ProblemSlug) => `https://docs.skyclause.m1ku.tech/problems/${slug}`

/** Thrown anywhere in a request to answer with a problem; extension members and headers ride along. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly slug: ProblemSlug,
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
  // The validators throw for a body they can't read (malformed JSON, an undeclared media type).
  if (error instanceof HTTPException) {
    return new ApiError(422, 'validation-failed', error.message, {
      errors: [{ in: 'body', pointer: '', detail: error.message }]
    })
  }
  return new ApiError(
    HTTP_PROBLEM_STATUS['internal-error'],
    'internal-error',
    'The server failed to answer this request.'
  )
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
