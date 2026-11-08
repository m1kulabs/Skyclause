import type { Handlers } from '..'
import { inTenant, type ServiceContext } from '../../tenancy'
import {
  exportLedgerCsv,
  getPilotArchive,
  ledgerProjectFor,
  listLedgerEntries,
  verifyLedgerChain
} from '../../services/ledger'
import type { Context } from 'hono'
import type { ApiEnv } from '../../context'

// #146 c-ledger-chain: GET /v1/projects/{id}/{ledger,ledger/export,ledger/verify,pilot-archive}, all `ledger.view`.

/** The project behind `id`, checked against the principal's project scope (OAuth grants, share links). */
const projectIn = (c: Context<ApiEnv>, ctx: ServiceContext, projectId: string) =>
  ledgerProjectFor(ctx, projectId, (id) => c.get('deps').can(ctx.principal, 'ledger.view', { projectId: id }))

export const ledgerHandlers: Handlers = {
  listLedgerEntries: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const { limit, cursor, ...filters } = c.req.valid('query')
      const body = await inTenant(c, async (ctx) => {
        const { timeZone } = await projectIn(c, ctx, id)
        return listLedgerEntries(ctx, { projectId: id, timeZone, filters, limit, cursor })
      })
      return c.json(body, 200)
    }
  },
  exportLedger: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const filters = c.req.valid('query')
      const csv = await inTenant(c, async (ctx) => {
        const { timeZone } = await projectIn(c, ctx, id)
        return exportLedgerCsv(ctx, { projectId: id, timeZone, filters }, (fn) => inTenant(c, fn))
      })
      return c.body(csv, 200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="ledger-${id}.csv"`
      })
    }
  },
  verifyLedger: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const body = await inTenant(c, async (ctx) => {
        await projectIn(c, ctx, id)
        return verifyLedgerChain(ctx, id, c.get('deps').now())
      })
      return c.json(body, 200)
    }
  },
  getPilotArchive: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const body = await inTenant(c, async (ctx) => {
        await projectIn(c, ctx, id)
        return getPilotArchive(ctx, id, c.get('deps').now())
      })
      return c.json(body, 200)
    }
  }
}
