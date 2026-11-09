import { IdParams, CommonProblems } from '../../common'
import { createRoute } from '../../create-route'
import { ShareLink } from '../../shared'

export const revokeShareLink = createRoute({
  method: 'post',
  path: '/api/share-links/{id}/revoke',
  operationId: 'revokeShareLink',
  tags: ['share-links'],
  request: { params: IdParams },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: ShareLink } } }
  },
  x: { owner: 'b-share-links', statement: 'share_link.create', idempotent: false }
})
