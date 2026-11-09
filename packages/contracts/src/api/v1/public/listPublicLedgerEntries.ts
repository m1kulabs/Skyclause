import { problemResponse } from '../../common'
import { createRoute } from '../../create-route'
import { Page, PageQuery } from '../../shared'
import { orgProjectParams, publicLedgerEntrySchema } from './_shared'

export const listPublicLedgerEntries = createRoute({
  method: 'get',
  path: '/v1/public/{org}/{project}/ledger',
  operationId: 'listPublicLedgerEntries',
  tags: ['Public ledger'],
  request: { params: orgProjectParams, query: PageQuery },
  responses: {
    200: {
      description: 'Public ledger entries with derived values and no raw source readings.',
      content: { 'application/json': { schema: Page(publicLedgerEntrySchema) } }
    },
    404: problemResponse('The public project was not found.'),
    429: problemResponse('The public request rate limit was exceeded.')
  },
  x: { owner: 'd-public-api', statement: 'public', idempotent: false }
})
