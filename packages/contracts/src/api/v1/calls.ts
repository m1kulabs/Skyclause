import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import {
  CallView,
  CallState,
  ClauseExplanation,
  Grade,
  InputValue,
  Instant,
  LocalDate,
  Mode,
  Night,
  Pack,
  Page,
  PageQuery,
  Problem,
  Window
} from '../shared'

// D2: sessions select an organisation by slug or ID; scoped keys and grants already carry it.
const OrganizationHeaders = z.object({
  'Skyclause-Organization': z.string().min(1).optional().describe('Required for sessions; organisation slug or ID')
})
const IdParams = z.object({ id: z.string().min(1) })
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

// CAL-13 and CAL-16: retain the inputs as read, the published clause version, and the agent trace.
const Warning = z.object({
  reading_id: z.string(),
  text: z.string(),
  gloss: z.string().nullable(),
  valid_from: Instant,
  valid_to: Instant
})
const CallExplanation = z.object({
  call_id: z.string(),
  sheet_version_id: z.string(),
  clauses: z.array(ClauseExplanation),
  inputs: z.array(InputValue),
  warnings: z.array(Warning),
  trace: z.array(
    z.object({
      step: z.string(),
      duration_ms: z.number().nonnegative(),
      inputs: z.array(InputValue),
      detail: z.string()
    })
  )
})
const CallDetail = CallView.extend(CallExplanation.shape).extend({
  project_id: z.string(),
  window: Window.nullable(),
  night: Night.nullable(),
  approved_by: z.string().nullable(),
  grade: Grade.nullable(),
  permalink: z.url(),
  deliveries: z.array(
    z.object({
      recipient_id: z.string(),
      language: CallView.shape.notices.element.shape.language,
      status: z.enum(['queued', 'sent', 'delivered', 'bounced', 'complained', 'suppressed', 'failed', 'expired']),
      accepted_at: Instant.nullable()
    })
  )
})
const CallQuery = PageQuery.extend({
  pack: Pack.optional(),
  state: CallState.optional(),
  mode: Mode.optional(),
  from: LocalDate.optional(),
  to: LocalDate.optional()
})

export const listProjectCalls = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/calls',
  operationId: 'listProjectCalls',
  tags: ['calls'],
  request: { headers: OrganizationHeaders, params: IdParams, query: CallQuery },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: Page(CallView) } } }
  },
  x: { owner: 'c-bundle-lifecycle', statement: 'project.view', idempotent: false }
})

export const getCall = createRoute({
  method: 'get',
  path: '/v1/calls/{id}',
  operationId: 'getCall',
  tags: ['calls'],
  request: { headers: OrganizationHeaders, params: IdParams },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: CallDetail } } }
  },
  x: { owner: 'c-bundle-lifecycle', statement: 'project.view', idempotent: false }
})

export const getCallExplanation = createRoute({
  method: 'get',
  path: '/v1/calls/{id}/explanation',
  operationId: 'getCallExplanation',
  tags: ['calls'],
  request: { headers: OrganizationHeaders, params: IdParams },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: CallExplanation } } }
  },
  x: { owner: 'c-bundle-lifecycle', statement: 'project.view', idempotent: false }
})

export const routes = [listProjectCalls, getCall, getCallExplanation] as const
