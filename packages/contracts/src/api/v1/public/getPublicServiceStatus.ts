import { problemResponse } from '../../common'
import { createRoute } from '../../create-route'
import { publicServiceStatusSchema } from './_shared'

export const getPublicServiceStatus = createRoute({
  method: 'get',
  path: '/v1/public/status',
  operationId: 'getPublicServiceStatus',
  tags: ['Public status'],
  responses: {
    200: {
      description: 'Service components, source status and incident history.',
      content: { 'application/json': { schema: publicServiceStatusSchema } }
    },
    429: problemResponse('The public request rate limit was exceeded.')
  },
  x: { owner: 'd-public-api', statement: 'public', idempotent: false }
})
