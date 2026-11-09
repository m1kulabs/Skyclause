import type { Handlers } from '..'
import { principalOf, requireRecentAuth } from '../../middleware/auth'
import { ApiError } from '../../problems'

export const oauthHandlers: Handlers = {
  listOauthClients: {
    handler: async (c) => {
      const query = c.req.valid('query')
      const result = await c.get('deps').oauth.listClients(c.get('orgId')!, query)
      return c.json(result as never, 200)
    }
  },
  createOauthClient: {
    middleware: [requireRecentAuth()],
    handler: async (c) => {
      const body = c.req.valid('json')
      const principal = principalOf(c)
      const created = await c.get('deps').oauth.createClient({
        orgId: c.get('orgId')!,
        principal,
        headers: c.req.raw.headers,
        clientName: body.client_name,
        redirectUris: body.redirect_uris,
        scopes: body.scopes
      })
      return c.json(created as never, 201, { 'X-Skyclause-One-Time': 'true' })
    }
  },
  deleteOauthClient: {
    middleware: [requireRecentAuth()],
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const removed = await c.get('deps').oauth.deleteClient({
        orgId: c.get('orgId')!,
        id,
        now: c.get('deps').now(),
        principal: principalOf(c)
      })
      if (!removed) throw new ApiError(404, 'not-found', 'No OAuth client exists in this organisation.')
      return c.body(null, 204)
    }
  },
  listOauthGrants: {
    handler: async (c) => {
      const query = c.req.valid('query')
      const result = await c.get('deps').oauth.listGrants(c.get('orgId')!, query)
      return c.json(result as never, 200)
    }
  },
  revokeOauthGrant: {
    middleware: [requireRecentAuth()],
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const revoked = await c.get('deps').oauth.revokeGrant({
        orgId: c.get('orgId')!,
        id,
        now: c.get('deps').now(),
        principal: principalOf(c)
      })
      if (!revoked) throw new ApiError(404, 'not-found', 'No active OAuth grant exists in this organisation.')
      return c.body(null, 204)
    }
  }
}
