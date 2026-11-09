import { problemResponse } from '../../common'
import { createRoute } from '../../create-route'
import { Page, PageQuery } from '../../shared'
import { orgProjectParams, publicGradeMetricSchema } from './_shared'

export const listPublicGrades = createRoute({
  method: 'get',
  path: '/v1/public/{org}/{project}/grades',
  operationId: 'listPublicGrades',
  tags: ['Public grades'],
  request: { params: orgProjectParams, query: PageQuery },
  responses: {
    200: {
      description: 'Published grade metrics with sample counts and Wilson intervals.',
      content: { 'application/json': { schema: Page(publicGradeMetricSchema) } }
    },
    404: problemResponse('The public project was not found.'),
    429: problemResponse('The public request rate limit was exceeded.')
  },
  x: { owner: 'd-public-api', statement: 'public', idempotent: false }
})
