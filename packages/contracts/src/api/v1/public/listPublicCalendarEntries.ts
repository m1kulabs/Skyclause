import { problemResponse } from '../../common'
import { createRoute } from '../../create-route'
import { Page, PageQuery } from '../../shared'
import { orgProjectParams, publicCalendarEntrySchema } from './_shared'

export const listPublicCalendarEntries = createRoute({
  method: 'get',
  path: '/v1/public/{org}/{project}/calendar-entries',
  operationId: 'listPublicCalendarEntries',
  tags: ['Public calendar'],
  request: { params: orgProjectParams, query: PageQuery },
  responses: {
    200: {
      description: 'Upcoming published conditions calendar entries.',
      content: { 'application/json': { schema: Page(publicCalendarEntrySchema) } }
    },
    404: problemResponse('The public project was not found.'),
    429: problemResponse('The public request rate limit was exceeded.')
  },
  x: { owner: 'd-public-api', statement: 'public', idempotent: false }
})
