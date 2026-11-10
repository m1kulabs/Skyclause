import { principalOf, requireRecentAuth } from '../../middleware/auth'
import { createApiKey, canListAllApiKeys, listApiKeys, revokeApiKey } from '../../services/api-keys'
import { ApiError } from '../../problems'
import type { Handlers } from '../index'

function sessionPrincipal(principal: ReturnType<typeof principalOf>) {
  if (principal.kind !== 'session') {
    throw new ApiError(403, 'insufficient-scope', 'This operation needs a signed-in session.')
  }
  return principal
}

export const apiKeyHandlers: Handlers = {
  listMyApiKeys: {
    handler: async (c) => {
      const principal = sessionPrincipal(principalOf(c))
      const query = c.req.valid('query')
      const result = await listApiKeys(c.get('deps').apiKeys, {
        creatorId: principal.accountId,
        limit: query.limit,
        cursor: query.cursor
      })
      return c.json(result, 200)
    }
  },
  createMyApiKey: {
    middleware: [requireRecentAuth()],
    handler: async (c) => {
      const principal = principalOf(c)
      const input = c.req.valid('json')
      const result = await createApiKey(c.get('deps'), principal, c.get('orgId')!, {
        name: input.name,
        scopes: input.scopes,
        expiresInDays: input.expires_in_days
      })
      return c.json(result, 201)
    }
  },
  revokeMyApiKey: {
    handler: async (c) => {
      await revokeApiKey(c.get('deps'), principalOf(c), { id: c.req.valid('param').id })
      return c.body(null, 204)
    }
  },
  listOrganisationApiKeys: {
    handler: async (c) => {
      const principal = sessionPrincipal(principalOf(c))
      const query = c.req.valid('query')
      const all = canListAllApiKeys(c.get('deps').can, principal)
      const result = await listApiKeys(c.get('deps').apiKeys, {
        organizationId: c.get('orgId')!,
        ...(all ? {} : { creatorId: principal.accountId }),
        limit: query.limit,
        cursor: query.cursor
      })
      return c.json(result, 200)
    }
  },
  createOrganisationApiKey: {
    middleware: [requireRecentAuth()],
    handler: async (c) => {
      const principal = principalOf(c)
      const input = c.req.valid('json')
      const result = await createApiKey(c.get('deps'), principal, c.get('orgId')!, {
        name: input.name,
        scopes: input.scopes,
        expiresInDays: input.expires_in_days
      })
      return c.json(result, 201)
    }
  },
  revokeOrganisationApiKey: {
    handler: async (c) => {
      await revokeApiKey(c.get('deps'), principalOf(c), {
        id: c.req.valid('param').id,
        organizationId: c.get('orgId')!
      })
      return c.body(null, 204)
    }
  }
}
