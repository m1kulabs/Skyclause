import { randomBytes } from 'node:crypto'
import { z } from '@hono/zod-openapi'
import { createRoute, type SkyclauseRoute } from '@skyclause/contracts'
import { afterEach, expect, test, vi } from 'vitest'
import { ApiError } from '../src/problems'
import { apiRequest, createTestApi } from './harness'

// A failed request is logged by its route template, so a token in the path (subscribe and share links) never reaches
// a log line.

const getTestLink = createRoute({
  method: 'get',
  path: '/api/test-links/{token}',
  operationId: 'getTestLink',
  request: { params: z.object({ token: z.string() }) },
  responses: { 200: { description: 'A link', content: { 'application/json': { schema: z.object({}) } } } },
  x: { owner: 'test', statement: 'token', idempotent: false }
})

afterEach(() => vi.restoreAllMocks())

test('a 5xx on a token route logs the route template, not the token', async () => {
  const lines: string[] = []
  vi.spyOn(console, 'error').mockImplementation((line: unknown) => void lines.push(String(line)))
  const { api } = createTestApi({
    v1: [],
    api: [getTestLink] as SkyclauseRoute[],
    handlers: {
      getTestLink: {
        handler: () => {
          throw new ApiError(503, 'privacy-notice-unpublished', 'Not yet.')
        }
      }
    }
  })
  const token = randomBytes(32).toString('base64url')
  const response = await apiRequest(api, { method: 'GET', path: `/api/test-links/${token}` })
  expect(response.status).toBe(503)
  expect(lines).toHaveLength(1)
  expect(lines[0]).toContain('/api/test-links/:token')
  expect(lines[0]).not.toContain(token)
})
