import { firstMcpToolCall, latestVerifications, oauthOrgClientId, VERIFICATION_TARGETS } from '@skyclause/db'
import { principalOf, requireHumanSession } from '../../middleware/auth'
import { requireOrg } from '../../middleware/org'
import { ApiError } from '../../problems'
import { connectConfigVariants, fetchOAuthAuthorizationMetadata, verificationStatus } from '../../services/connect'
import { inTenant } from '../../tenancy'
import type { Handlers } from '../index'

const memberAndOrg = [requireHumanSession, requireOrg]

export const connectHandlers: Handlers = {
  getConnectConfig: {
    middleware: memberAndOrg,
    handler: async (c) => {
      const { target, transport } = c.req.valid('query')
      const { appOrigin, mcpOrigin } = c.get('deps').config()
      if (!mcpOrigin) throw new Error('MCP_ORIGIN is not configured')

      const principal = principalOf(c)
      if (principal.kind !== 'session') throw new Error('Connect routes need a human session')
      const orgId = c.get('orgId')
      if (!orgId) throw new Error('Connect routes need an organisation')
      const orgRef = c.req.header('Skyclause-Organization') ?? principal.orgId ?? orgId

      const isEnterprise = target === 'gemini_enterprise'
      const selectedOrg = isEnterprise ? await c.get('deps').membership.lookup(orgRef, principal.accountId) : null
      if (isEnterprise && !selectedOrg) {
        throw new ApiError(404, 'not-found', 'No such organisation, or you are not a member of it.')
      }
      const metadata = isEnterprise ? await fetchOAuthAuthorizationMetadata(appOrigin) : null
      const clientId = isEnterprise ? await inTenant(c, ({ tx }) => oauthOrgClientId(tx)) : null
      const variants = connectConfigVariants({
        target,
        mcpOrigin,
        appOrigin,
        organizationRef: selectedOrg?.slug ?? orgRef,
        clientId,
        metadata
      })
      const selectedTransport = transport === 'stdio' ? 'stdio' : 'http'
      const selected = variants.find((variant) => variant.transport === selectedTransport)
      if (!selected) throw new ApiError(404, 'not-found', `The ${target} client has no ${selectedTransport} config.`)
      return c.json(
        {
          target,
          transport: selected.transport === 'http' ? 'remote' : 'stdio',
          config: selected.config,
          variants,
          // The public tool list is a separate #209 surface at /mcp/tools.json.
          tools: []
        },
        200
      )
    }
  },
  listConnectVerifications: {
    middleware: memberAndOrg,
    handler: async (c) => {
      const { target } = c.req.valid('query')
      const now = c.get('deps').now()
      const records = await inTenant(c, ({ tx }) => latestVerifications(tx))
      const latest = new Map(records.map((record) => [record.target, record]))
      const targets = VERIFICATION_TARGETS.map((id) => {
        const record = latest.get(id)
        const status = verificationStatus(record, now)
        return {
          target: id,
          status,
          tested_at: record?.testedAt.toISOString() ?? null,
          client_version: record?.clientVersion ?? null
        }
      })
      const data = records
        .filter((record) => !target || record.target === target)
        .map((record) => ({
          id: record.id,
          target: record.target,
          client_version: record.clientVersion,
          tested_at: record.testedAt.toISOString(),
          result: verificationStatus(record, now),
          tested_by: record.testedBy,
          notes: record.notes
        }))
      return c.json(
        {
          data,
          next_cursor: null,
          targets,
          verified_count: targets.filter((row) => row.status === 'verified').length
        },
        200
      )
    }
  },
  listConnectActivity: {
    middleware: memberAndOrg,
    handler: async (c) => {
      const { since } = c.req.valid('query')
      const principal = principalOf(c)
      if (principal.kind !== 'session') throw new Error('Connect routes need a human session')
      const event = await inTenant(c, ({ tx }) =>
        firstMcpToolCall(tx, { accountId: principal.accountId, since: new Date(since) })
      )
      const first = event ? { at: event.at.toISOString(), tool: event.tool, client_name: event.clientName } : null
      return c.json({ data: first ? [first] : [], next_cursor: null, first }, 200)
    }
  }
}
