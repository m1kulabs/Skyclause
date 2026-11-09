import { SessionErrors as sessionErrors } from '../../common'
import { createRoute } from '../../create-route'
import { Page, PageQuery } from '../../shared'
import { exportSummary } from './_shared'

export const listMyExports = createRoute({
  method: 'get',
  path: '/api/me/exports',
  operationId: 'listMyExports',
  tags: ['Data Rights'],
  request: { query: PageQuery },
  responses: {
    200: {
      description: 'The signed-in account’s export jobs.',
      content: { 'application/json': { schema: Page(exportSummary) } }
    },
    ...sessionErrors
  },
  x: { owner: 'a-data-rights', statement: 'session', idempotent: false }
})
