import {
  NonEmptyIdParams as IdParams,
  ScopedIdempotentOrganizationHeaders as IdempotentHeaders,
  ProblemResponses,
  ProblemContent
} from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'

const SubscribeLink = z.object({ id: z.string(), project_id: z.string(), url: z.url() })

export const createSubscribeLink = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/subscribe-link',
  operationId: 'createSubscribeLink',
  tags: ['subscribe-link'],
  request: { headers: IdempotentHeaders, params: IdParams },
  responses: {
    ...ProblemResponses,
    201: { description: 'Success', content: { 'application/json': { schema: SubscribeLink } } },
    422: {
      description: 'idempotency-mismatch or validation-failed.',
      content: ProblemContent
    }
  },
  x: { owner: 'c-subscribers', statement: 'channels.manage', idempotent: true }
})

export const routes = [createSubscribeLink] as const
