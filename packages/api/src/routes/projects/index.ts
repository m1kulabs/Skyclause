import type { Handlers } from '..'
import {
  archiveProject,
  createProject,
  getProject,
  listProjects,
  restoreProject,
  updateProject,
  type ProjectSettingsView,
  type ProjectWithSummaryView
} from '../../services/projects'
import { inTenant } from '../../tenancy'

const settingsBody = (view: ProjectSettingsView) => view as never
const listBody = (view: { data: ProjectWithSummaryView[]; next_cursor: string | null }) => view as never

export const projectHandlers: Handlers = {
  createProject: {
    handler: async (c) => {
      const body = c.req.valid('json')
      const { now } = c.get('deps')
      const created = await inTenant(c, (ctx) => createProject(ctx, body, { now: now() }))
      return c.json(created as never, 201)
    }
  },
  listProjects: {
    handler: async (c) => {
      const query = c.req.valid('query')
      const { now } = c.get('deps')
      const page = await inTenant(c, (ctx) => listProjects(ctx, query, { now: now() }))
      return c.json(listBody(page), 200)
    }
  },
  getProject: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const { can } = c.get('deps')
      const found = await inTenant(c, (ctx) => getProject(ctx, id, { can }))
      return c.json(found as never, 200)
    }
  },
  updateProject: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const body = c.req.valid('json')
      const { can, now } = c.get('deps')
      const updated = await inTenant(c, (ctx) => updateProject(ctx, id, body, { can, now: now() }))
      return c.json(settingsBody(updated), 200)
    }
  },
  archiveProject: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const { now } = c.get('deps')
      const archived = await inTenant(c, (ctx) => archiveProject(ctx, { projectId: id }, { now: now() }))
      return c.json(settingsBody(archived), 200)
    }
  },
  restoreProject: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const { now } = c.get('deps')
      const restored = await inTenant(c, (ctx) => restoreProject(ctx, id, { now: now() }))
      return c.json(settingsBody(restored), 200)
    }
  }
}
