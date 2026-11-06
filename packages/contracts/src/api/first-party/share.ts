import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { ProjectRef, ShareLink, Problem } from '../shared'

const ProblemResponse = { description: 'Request failed', content: { 'application/problem+json': { schema: Problem } } }
const CommonProblems = {
  403: { ...ProblemResponse, description: 'Bot check failed' },
  404: { ...ProblemResponse, description: 'Resource not found or inaccessible' },
  422: { ...ProblemResponse, description: 'validation-failed or idempotency-mismatch' },
  429: {
    ...ProblemResponse,
    description: 'rate-limited',
    headers: z.object({ 'Retry-After': z.string().regex(/^\d+$/) })
  }
}

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
