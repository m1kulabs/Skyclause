import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Forecast, Grade, Instant, LocalDate, Pack, Page, PageQuery, Problem } from '../shared'
import { CallGradedEventSchema } from '../../events'

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

const GradeView = Grade.extend({
  outcome: CallGradedEventSchema.shape.data.shape.outcome,
  forecast: Forecast.nullable(),
  actual: z.number().nullable(),
  reading_ids: z.array(z.string()),
  graded_at: Instant
})

export const listGrades = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/grades',
  operationId: 'listGrades',
  tags: ['grades'],
  request: {
    headers: OrganizationHeaders,
    params: IdParams,
    query: PageQuery.extend({
      pack: Pack.optional(),
      from: LocalDate.optional(),
      to: LocalDate.optional(),
      outcome: GradeView.shape.outcome.optional()
    })
  },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: Page(GradeView) } } }
  },
  x: { owner: 'c-grades', statement: 'ledger.view', idempotent: false }
})

export const routes = [listGrades] as const
