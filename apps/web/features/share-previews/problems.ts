import { problemType } from '@skyclause/api'

/** An RFC 9457 problem (TRD "API conventions"), never cached. */
export function problem(status: number, type: string, title: string, detail: string): Response {
  return Response.json(
    { type, title, status, detail },
    { status, headers: { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store' } }
  )
}

/** One answer for every private, guest and missing target, so none can be told apart (D33, PUB-3). */
export const notFound = () => problem(404, problemType('not-found'), 'Not found', 'No public preview answers here.')
