import { ProblemResponse, GuestProblems as CommonProblems } from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { ProjectRef, ShareLink } from '../shared'

export const openShareLink = createRoute({
  method: 'post',
  path: '/api/share/{token}',
  operationId: 'openShareLink',
  tags: ['share'],
  request: {
    params: z.object({ token: z.string() }),
    body: {
      required: true,
      content: { 'application/json': { schema: z.object({ turnstile_token: z.string().min(1) }) } }
    }
  },
  responses: {
    ...CommonProblems,
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: z.object({
            project: ProjectRef,
            access: ShareLink.shape.access,
            expires_at: ShareLink.shape.expires_at,
            redirect_to: z.string()
          })
        }
      }
    },
    410: { ...ProblemResponse, description: 'link-expired: link is revoked or expired' }
  },
  x: { owner: 'b-share-links', statement: 'token', idempotent: false }
})

export const routes = [openShareLink] as const
