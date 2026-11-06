import { OpenAPIHono } from '@hono/zod-openapi'
import type { SkyclauseRoute } from './create-route'
import { API_ROUTES } from './first-party'
import { V1_ROUTES } from './v1'

export { API_ROUTES, V1_ROUTES }
export const REGISTRY = [...V1_ROUTES, ...API_ROUTES] as const
export type OperationId = (typeof REGISTRY)[number]['operationId']
export type Operations = {
  [Route in (typeof REGISTRY)[number] as Route['operationId']]: Route
}

// These three global reads have no project or organisation boundary. All other
// v1 operations include scoped resources, including public and device lookups.
export const CROSS_ORG_OPERATIONS = V1_ROUTES.filter(
  (route) => !['/v1/me', '/v1/catalogue/sources', '/v1/public/status'].includes(route.path)
).map((route) => route.operationId)

export function v1OpenApiDocument(): ReturnType<OpenAPIHono['getOpenAPI31Document']> {
  const app = new OpenAPIHono()
  for (const route of V1_ROUTES) {
    // Widen only at mounting: the placeholder's 501 is not an operation's success response.
    app.openapi(route as SkyclauseRoute, (c) => c.newResponse(null, 501))
  }
  return app.getOpenAPI31Document({
    openapi: '3.1.0',
    info: { title: 'Skyclause API', version: '1' }
  })
}
