import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Forecast, Grade, Instant, LocalDate, Pack, Page, PageQuery } from '../shared'
import { CallGradedEventSchema } from '../../events'

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
