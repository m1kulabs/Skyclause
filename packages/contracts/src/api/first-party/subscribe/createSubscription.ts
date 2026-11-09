import { IdempotencyHeaders, ProblemResponse, SubscriberProblems as CommonProblems } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { LocalDate, Subscriber } from '../../shared'
import { SubscriberFields, TokenParams } from './_shared'

export const createSubscription = createRoute({
  method: 'post',
  path: '/api/subscribe/{token}',
  operationId: 'createSubscription',
  tags: ['subscribe'],
  request: {
    params: TokenParams,
    headers: IdempotencyHeaders,
    body: {
      required: true,
      content: {
        'application/json': { schema: SubscriberFields.extend({ consent: z.literal(true), notice_version: LocalDate }) }
      }
    }
  },
  responses: {
    ...CommonProblems,
    202: { description: 'Awaiting email confirmation', content: { 'application/json': { schema: Subscriber } } },
    503: { ...ProblemResponse, description: 'privacy-notice-unpublished' }
  },
  x: { owner: 'c-subscribers', statement: 'token', idempotent: true }
})
