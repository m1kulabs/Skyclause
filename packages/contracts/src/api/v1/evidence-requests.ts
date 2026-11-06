import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { CallView, EvidenceRequest, Grade, Instant, LedgerEntry, Problem, Reading, Source } from '../shared'

// D2: sessions select an organisation by slug or ID; scoped keys and grants already carry it.
const OrganizationHeaders = z.object({
  'Skyclause-Organization': z.string().min(1).optional().describe('Required for sessions; organisation slug or ID')
})
const IdParams = z.object({ id: z.string().min(1) })
const IdempotentHeaders = OrganizationHeaders.extend({ 'Idempotency-Key': z.string().min(1) })
const ProblemResponses = {
  400: {
    description: 'organization-required or validation-failed.',
    content: { 'application/problem+json': { schema: Problem } }
  },
  401: { description: 'Authentication required.', content: { 'application/problem+json': { schema: Problem } } },
  403: {
    description: 'insufficient-scope: permission denied.',
    content: { 'application/problem+json': { schema: Problem } }
  },
  404: {
    description: 'Resource not found, including a row in another organisation.',
    content: { 'application/problem+json': { schema: Problem } }
  },
  429: {
    description: 'rate-limited or budget-exhausted.',
    headers: z.object({ 'Retry-After': z.string().regex(/^\d+$/).describe('Retry delay in seconds') }),
    content: { 'application/problem+json': { schema: Problem } }
  }
}

// z.json() is recursive; explicit JSON Schema types prevent the OpenAPI converter from recursing forever.
// Keep the shared JSON validator, including nested objects and arrays, unchanged at runtime.
const JsonValue = LedgerEntry.shape.body.openapi({ type: ['string', 'number', 'boolean', 'object', 'array', 'null'] })

// LED-5: each quoted reading, warning and retained frame keeps its stored reading ID.
const EvidencePack = z.object({
  project_id: z.string(),
  window_id: z.string().nullable(),
  readings: z.array(
    Reading.extend({
      value_json: JsonValue.nullable(),
      station_id: Source.shape.external_id,
      source_url: Source.shape.url
    })
  ),
  warnings: z.array(
    z.object({
      reading_id: z.string(),
      text: z.string(),
      gloss: z.string().nullable(),
      valid_from: Instant,
      valid_to: Instant
    })
  ),
  calls: z.array(CallView),
  approvals: z.array(
    z.object({ id: z.string(), call_id: z.string().nullable(), approved_by: z.string(), approved_at: Instant })
  ),
  grades: z.array(Grade),
  ledger: z.array(LedgerEntry.extend({ body: JsonValue })),
  frames: z.array(z.object({ reading_id: z.string(), url: z.url(), captured_at: Instant }))
})
const EvidenceRequestView = EvidenceRequest.extend({ pack: EvidencePack.nullable() })
// Requester, via, organisation and leaves_org are resolved from the principal, never supplied by a body.
const EvidenceRequestInput = EvidenceRequest.pick({ span: true, call_id: true })
  .partial()
  .extend({ window_id: z.string().optional() })
  .refine((value) => value.span !== undefined || value.call_id != null || value.window_id !== undefined, {
    message: 'Provide a span, call_id or window_id'
  })

export const createEvidenceRequest = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/evidence-requests',
  operationId: 'createEvidenceRequest',
  tags: ['evidence-requests'],
  request: {
    headers: IdempotentHeaders,
    params: IdParams,
    body: { required: true, content: { 'application/json': { schema: EvidenceRequestInput } } }
  },
  responses: {
    ...ProblemResponses,
    202: {
      description: 'Evidence assembly accepted; external replies wait for human approval.',
      content: { 'application/json': { schema: EvidenceRequestView } }
    },
    422: {
      description: 'idempotency-mismatch or validation-failed.',
      content: { 'application/problem+json': { schema: Problem } }
    }
  },
  x: { owner: 'c-evidence', statement: 'evidence.request', idempotent: true }
})

export const getEvidenceRequest = createRoute({
  method: 'get',
  path: '/v1/evidence-requests/{id}',
  operationId: 'getEvidenceRequest',
  tags: ['evidence-requests'],
  request: { headers: OrganizationHeaders, params: IdParams },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: EvidenceRequestView } } }
  },
  x: { owner: 'c-evidence', statement: 'evidence.request', idempotent: false }
})

export const routes = [createEvidenceRequest, getEvidenceRequest] as const
