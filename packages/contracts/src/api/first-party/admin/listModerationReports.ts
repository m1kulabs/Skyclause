import { CommonProblems } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { Instant, Page, PageQuery, Window } from '../../shared'

export const listModerationReports = createRoute({
  method: 'get',
  path: '/api/admin/moderation/reports',
  operationId: 'listModerationReports',
  tags: ['admin'],
  request: { query: PageQuery },
  responses: {
    ...CommonProblems,
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: Page(
            z.object({
              window: Window,
              report_count: z.number().int().nonnegative(),
              first_reported_at: Instant,
              last_reported_at: Instant
            })
          )
        }
      }
    }
  },
  x: { owner: 'd-guest-lifecycle', statement: 'staff', idempotent: false }
})
