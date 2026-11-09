import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { createRoute } from '../../create-route'
import { LocalDate, Pack, Page, PageQuery } from '../../shared'
import { GradeView } from './_shared'

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
