import { createRoute as honoCreateRoute, type RouteConfig } from '@hono/zod-openapi'
import type { Statement } from '../auth'

// Spec §2: operation ownership and permission travel with the OpenAPI route.
export interface RouteMetadata {
  owner: string
  statement: Statement | 'any' | 'session' | 'guest' | 'public' | 'token' | 'staff' | 'device' | 'labeller'
  idempotent: boolean
}

export function createRoute<P extends string, R extends Omit<RouteConfig, 'path'> & { path: P; x: RouteMetadata }>(
  route: R
) {
  const { x, ...config } = route
  return honoCreateRoute({ ...config, 'x-skyclause': x })
}

export type SkyclauseRoute = ReturnType<typeof createRoute>
