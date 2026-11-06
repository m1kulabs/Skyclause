import { OpenAPIHono, z } from '@hono/zod-openapi'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { createRoute, type SkyclauseRoute } from '../src/api/create-route'

// Test routes exercise metadata transport; their bodies are test doubles.
describe('createRoute', () => {
  it.each(['project.view', 'any', 'session', 'guest', 'public', 'token', 'staff', 'device', 'labeller'] as const)(
    'records owner, statement %s and idempotent in the OpenAPI 3.1 output',
    (statement) => {
      for (const idempotent of [true, false]) {
        const app = new OpenAPIHono()
        const x = { owner: 'f-contracts', statement, idempotent }
        const route = createRoute({
          method: 'get',
          path: '/contracts/{id}',
          operationId: 'getContract',
          request: { params: z.object({ id: z.string() }) },
          responses: {
            200: { description: 'Contract', content: { 'application/json': { schema: z.object({ id: z.string() }) } } }
          },
          x
        })
        expectTypeOf(route.path).toEqualTypeOf<'/contracts/{id}'>()
        expectTypeOf(route).toExtend<SkyclauseRoute>()
        expect(route.getRoutingPath()).toBe('/contracts/:id')
        app.openapi(route, (c) => c.json({ id: c.req.valid('param').id }, 200))
        const document = app.getOpenAPI31Document({ openapi: '3.1.0', info: { title: 'Contracts', version: '1' } })
        const operation = document.paths?.['/contracts/{id}']?.get
        expect(operation?.['x-skyclause']).toEqual(x)
        expect(operation).not.toHaveProperty('x')
        expect(operation?.operationId).toBe('getContract')
        expect(operation?.parameters).toMatchObject([{ name: 'id', in: 'path', required: true }])
      }
    }
  )
})
