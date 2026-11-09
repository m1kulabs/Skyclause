import { IdParams, CommonProblems } from '../../common'
import { createRoute } from '../../create-route'
import { Page, PageQuery, ShareLink } from '../../shared'

export const listShareLinks = createRoute({
  method: 'get',
  path: '/api/projects/{id}/share-links',
  operationId: 'listShareLinks',
  tags: ['share-links'],
  request: { params: IdParams, query: PageQuery },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: Page(ShareLink) } } }
  },
  x: { owner: 'b-share-links', statement: 'share_link.create', idempotent: false }
})
