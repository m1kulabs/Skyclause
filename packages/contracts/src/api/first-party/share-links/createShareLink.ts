import { IdParams, CommonProblems, IdempotencyHeaders } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { Instant, ShareLink } from '../../shared'

export const createShareLink = createRoute({
  method: 'post',
  path: '/api/projects/{id}/share-links',
  operationId: 'createShareLink',
  tags: ['share-links'],
  request: {
    params: IdParams,
    headers: IdempotencyHeaders,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({
            access: ShareLink.shape.access,
            expires_in_days: z.number().int().min(1).max(30).default(7)
          })
        }
      }
    }
  },
  responses: {
    ...CommonProblems,
    201: {
      description: 'Share link created; token returned once',
      content: {
        'application/json': { schema: ShareLink.extend({ token: z.string(), url: z.url(), created_at: Instant }) }
      }
    }
  },
  x: { owner: 'b-share-links', statement: 'share_link.create', idempotent: true }
})
