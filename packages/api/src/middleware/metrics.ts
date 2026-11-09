import { recordHttpServerDuration } from '@skyclause/config'
import type { MiddlewareHandler } from 'hono'
import { routePath } from 'hono/route'

// #114's contract (PR #248): Next skips its catch-all routes, so the Hono app records `http.server.request.duration`
// itself, registered first, with the full route template such as `/v1/projects/:id` and never a raw path.
export const recordDuration: MiddlewareHandler = async (c, next) => {
  const start = performance.now()
  await next()
  const route = routePath(c, -1)
  if (!route.endsWith('*')) {
    recordHttpServerDuration({ method: c.req.method, route, status: c.res.status }, (performance.now() - start) / 1000)
  }
}
