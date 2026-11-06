import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Instant, Page, PageQuery, ShareLink, Problem } from '../shared'

const IdParams = z.object({ id: z.string() })

const ProblemResponse = { description: 'Request failed', content: { 'application/problem+json': { schema: Problem } } }
const CommonProblems = {
  401: { ...ProblemResponse, description: 'Authentication required' },
  403: { ...ProblemResponse, description: 'insufficient-scope' },
  404: { ...ProblemResponse, description: 'Resource not found or inaccessible' },
  422: { ...ProblemResponse, description: 'validation-failed or idempotency-mismatch' },
  429: {
    ...ProblemResponse,
    description: 'rate-limited',
    headers: z.object({ 'Retry-After': z.string().regex(/^\d+$/) })
  }
}

export const listShareLinks = createRoute({
  method: 'get',
  path: '/api/projects/{id}/share-links',
  operationId: 'listShareLinks',
  tags: ['share-links'],
  request: { params: IdParams, query: PageQuery },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: Page(ShareLink) } } }
  },
  x: { owner: 'b-share-links', statement: 'share_link.create', idempotent: false }
})

export const createShareLink = createRoute({
  method: 'post',
  path: '/api/projects/{id}/share-links',
  operationId: 'createShareLink',
  tags: ['share-links'],
  request: {
    params: IdParams,
    headers: z.object({ 'Idempotency-Key': z.string().min(1) }),
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

export const revokeShareLink = createRoute({
  method: 'post',
  path: '/api/share-links/{id}/revoke',
  operationId: 'revokeShareLink',
  tags: ['share-links'],
  request: { params: IdParams },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: ShareLink } } }
  },
  x: { owner: 'b-share-links', statement: 'share_link.create', idempotent: false }
})

export const routes = [listShareLinks, createShareLink, revokeShareLink] as const
