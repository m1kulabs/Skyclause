import { CommonProblems } from '../../common'
import { createRoute } from '../../create-route'
import { Page, PageQuery } from '../../shared'
import { Incident } from './_shared'

export const listIncidents = createRoute({
  method: 'get',
  path: '/api/admin/incidents',
  operationId: 'listIncidents',
  tags: ['admin'],
  request: { query: PageQuery },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: Page(Incident) } } }
  },
  x: { owner: 'd-public-api', statement: 'staff', idempotent: false }
})
