import type { Handlers } from '..'
import { cancelWindow, createWindow, listWindows, updateWindow } from '../../services/windows'
import { inTenant } from '../../tenancy'
import { authorizeWindowProject } from '../../middleware/window-project'

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
    middleware: [authorizeWindowProject],
    handler: async (c) => {
      const { id: projectId } = c.req.valid('param')
      const body = c.req.valid('json')
      const { can, now } = c.get('deps')
      const access = { can, now: now() }
      return c.json(await inTenant(c, (ctx) => createWindow(ctx, { projectId, body }, access)), 201)
    }
  },
  updateWindow: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const { scope } = c.req.valid('query')
      const patch = c.req.valid('json')
      const { can, now } = c.get('deps')
      return c.json(await inTenant(c, (ctx) => updateWindow(ctx, { id, scope, patch }, { can, now: now() })), 200)
    }
  },
  cancelWindow: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const { scope } = c.req.valid('query')
      const { can, now } = c.get('deps')
      return c.json(await inTenant(c, (ctx) => cancelWindow(ctx, { id, scope }, { can, now: now() })), 200)
    }
  }
}
