import { problemResponse } from '../../common'
import { createRoute } from '../../create-route'
import { orgProjectParams, publicProjectStatusSchema } from './_shared'

export const getPublicProjectStatus = createRoute({
  method: 'get',
  path: '/v1/public/{org}/{project}/status',
  operationId: 'getPublicProjectStatus',
  tags: ['Public project'],
  request: { params: orgProjectParams },
  responses: {
    200: {
      description: 'Published project state, verdicts and derived inputs.',
      content: { 'application/json': { schema: publicProjectStatusSchema } }
    },
    404: problemResponse('The public project was not found.'),
    429: problemResponse('The public request rate limit was exceeded.')
  },
  x: { owner: 'd-public-api', statement: 'public', idempotent: false }
})
