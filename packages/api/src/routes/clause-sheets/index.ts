import { DraftSheetVersion, PublishedSheetVersion } from '@skyclause/contracts'
import type { Handlers } from '..'
import { requireHumanSession, requireRecentAuth } from '../../middleware/auth'
import {
  createClauseSheetDraft,
  deleteClauseSheetDraft,
  evaluateClauseSheet,
  getClauseSheetDiff,
  getClauseSheetDraft,
  getClauseSheetPublishPreview,
  getClauseSheetVersion,
  listClauseSheetDrafts,
  listClauseSheets,
  listClauseSheetVersions,
  publishClauseSheet
} from '../../services/clause-sheets'
import { inTenant } from '../../tenancy'

export const clauseSheetHandlers: Handlers = {
  listClauseSheets: {
    handler: async (c) => {
      const { id: projectId } = c.req.valid('param')
      const query = c.req.valid('query')
      const { can, now } = c.get('deps')
      const body = await inTenant(c, (ctx) => listClauseSheets(ctx, { projectId, query, can, now: now() }))
      return c.json(body, 200)
    }
  },
  listClauseSheetVersions: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const query = c.req.valid('query')
      const { can, now } = c.get('deps')
      const body = await inTenant(c, (ctx) => listClauseSheetVersions(ctx, { id, query, can, now: now() }))
      return c.json({ ...body, data: body.data.map((row) => PublishedSheetVersion.parse(row)) }, 200)
    }
  },
  getClauseSheetVersion: {
    handler: async (c) => {
      const params = c.req.valid('param')
      const { can, now } = c.get('deps')
      const body = await inTenant(c, (ctx) => getClauseSheetVersion(ctx, { ...params, can, now: now() }))
      return c.json(PublishedSheetVersion.parse(body), 200)
    }
  },
  getClauseSheetDiff: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const query = c.req.valid('query')
      const { can, now } = c.get('deps')
      const body = await inTenant(c, (ctx) => getClauseSheetDiff(ctx, { id, ...query, can, now: now() }))
      return c.json(body, 200)
    }
  },
  evaluateClauseSheet: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const input = c.req.valid('json')
      const { can, now } = c.get('deps')
      const body = await inTenant(c, (ctx) => evaluateClauseSheet(ctx, { id, ...input, can, now: now() }))
      return c.json(body, 200)
    }
  },
  listClauseSheetDrafts: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const query = c.req.valid('query')
      const { can, now } = c.get('deps')
      const body = await inTenant(c, (ctx) => listClauseSheetDrafts(ctx, { id, query, can, now: now() }))
      return c.json({ ...body, data: body.data.map((row) => DraftSheetVersion.parse(row)) }, 200)
    }
  },
  createClauseSheetDraft: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const input = c.req.valid('json')
      const { can, now } = c.get('deps')
      const body = await inTenant(c, (ctx) => createClauseSheetDraft(ctx, { id, ...input, can, now: now() }))
      return c.json(DraftSheetVersion.parse(body), 201)
    }
  },
  getClauseSheetDraft: {
    handler: async (c) => {
      const params = c.req.valid('param')
      const { can, now } = c.get('deps')
      const body = await inTenant(c, (ctx) => getClauseSheetDraft(ctx, { ...params, can, now: now() }))
      return c.json(DraftSheetVersion.parse(body), 200)
    }
  },
  deleteClauseSheetDraft: {
    handler: async (c) => {
      const params = c.req.valid('param')
      const { can, now } = c.get('deps')
      const body = await inTenant(c, (ctx) => deleteClauseSheetDraft(ctx, { ...params, can, now: now() }))
      return c.json(body, 200)
    }
  },
  getClauseSheetPublishPreview: {
    middleware: [requireHumanSession, requireRecentAuth(12)],
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const input = c.req.valid('query')
      const { can, now } = c.get('deps')
      const body = await inTenant(c, (ctx) => getClauseSheetPublishPreview(ctx, { id, ...input, can, now: now() }))
      return c.json(body, 200)
    }
  },
  publishClauseSheet: {
    middleware: [requireHumanSession, requireRecentAuth(12)],
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const input = c.req.valid('json')
      const { can, now } = c.get('deps')
      const body = await inTenant(c, (ctx) => publishClauseSheet(ctx, { id, ...input, can, now: now() }))
      return c.json(body, 201)
    }
  }
}
