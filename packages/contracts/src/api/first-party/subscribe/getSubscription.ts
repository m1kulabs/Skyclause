import { SubscriberProblems as CommonProblems } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { LocalDate, ProjectRef, Subscriber, Window } from '../../shared'
import { TokenParams } from './_shared'

export const getSubscription = createRoute({
  method: 'get',
  path: '/api/subscribe/{token}',
  operationId: 'getSubscription',
  tags: ['subscribe'],
  request: { params: TokenParams },
  responses: {
    ...CommonProblems,
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: z.object({
            project: ProjectRef,
            project_name: z.string(),
            windows: z.array(Window),
            subscriber: Subscriber.nullable(),
            privacy_notice_version: LocalDate.nullable()
          })
        }
      }
    }
  },
  x: { owner: 'c-subscribers', statement: 'token', idempotent: false }
})
