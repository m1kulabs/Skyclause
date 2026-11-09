import { problemResponse } from '../../common'
import { createRoute } from '../../create-route'
import { Page, PageQuery } from '../../shared'
import { orgProjectParams, publicCallSchema } from './_shared'

export const listPublicProjectCalls = createRoute({
  method: 'get',
  path: '/v1/public/{org}/{project}/calls',
  operationId: 'listPublicProjectCalls',
  tags: ['Public calls'],
  request: { params: orgProjectParams, query: PageQuery },
  responses: {
    200: {
      description: 'Approved and sent calls published by the project.',
      content: { 'application/json': { schema: Page(publicCallSchema) } }
    },
    404: problemResponse('The public project was not found.'),
    429: problemResponse('The public request rate limit was exceeded.')
  },
  x: { owner: 'd-public-api', statement: 'public', idempotent: false }
})
