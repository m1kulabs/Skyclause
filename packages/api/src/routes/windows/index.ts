import type { Handlers } from '..'
import { createWindow, listWindows } from '../../services/windows'
import { inTenant } from '../../tenancy'

// #139, #79 §4 b-windows-api: list and declare a single window. Mount-all has checked the statement (`project.view`;
// `window.declare` and the Idempotency-Key for the POST).
export const windowHandlers: Handlers = {
  listWindows: {
    handler: async (c) => {
      const { id: projectId } = c.req.valid('param')
      const query = c.req.valid('query')
      const { can, now } = c.get('deps')
      const access = { can, now: now() }
      return c.json(await inTenant(c, (ctx) => listWindows(ctx, { projectId, query }, access)), 200)
    }
  },
  createWindow: {
    handler: async (c) => {
      const { id: projectId } = c.req.valid('param')
      const body = c.req.valid('json')
      const { can, now } = c.get('deps')
      const access = { can, now: now() }
      return c.json(await inTenant(c, (ctx) => createWindow(ctx, { projectId, body }, access)), 201)
    }
  }
}
