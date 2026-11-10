import { withSystem } from '@skyclause/db'
import { requireHumanSession, principalOf } from '../../middleware/auth'
import { inTenant } from '../../tenancy'
import {
  createOrganisationTx,
  listMembershipsTx,
  principalAccountId,
  renameOrganisationTx
} from '../../services/organisations'
import type { Handlers } from '..'

// #102: `session` routes with no organisation in the request (`POST /api/orgs` creates it) and `PATCH
// /api/orgs/{org}` under requireOrg + org.manage. A guest gets 403 on POST; Editors get 403 on PATCH.

export const organisationHandlers: Handlers = {
  createOrganisation: {
    middleware: [requireHumanSession],
    handler: async (c) => {
      const body = c.req.valid('json')
      const ownerAccountId = principalAccountId(principalOf(c))
      const created = await withSystem('organisations', (tx) => createOrganisationTx(tx, { ...body, ownerAccountId }))
      return c.json(created as never, 201)
    }
  },
  listMyMemberships: {
    handler: async (c) => {
      const query = c.req.valid('query')
      const principal = principalOf(c)
      if (principal.kind !== 'session') throw new Error('listMyMemberships needs a signed-in session')
      const memberships = await withSystem('organisations', (tx) => listMembershipsTx(tx, principal.accountId, query))
      return c.json(memberships, 200)
    }
  },
  updateOrganisation: {
    handler: async (c) => {
      const body = c.req.valid('json')
      const updated = await inTenant(c, (ctx) => renameOrganisationTx(ctx.tx, body))
      return c.json(updated as never, 200)
    }
  }
}
