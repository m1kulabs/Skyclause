import type { Operations } from '@skyclause/contracts'
import { requireHumanSession } from '../../middleware/auth'
import { ipHash } from '../../middleware/rate-limit'
import { ApiError } from '../../problems'
import {
  acceptMemberToken,
  cancelOwnershipTransfer,
  createInvitation,
  createOwnershipTransfer,
  inspectMemberToken,
  listInvitations,
  listMembers,
  removeMember,
  resendInvitation,
  revokeInvitation,
  updateMember
} from '../../services/members'
import { inTenant } from '../../tenancy'
import type { HandlerEntry } from '../index'
import type { ApiEnv } from '../../context'
import type { MiddlewareHandler } from 'hono'

const tokenRateLimit: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const deps = c.get('deps')
  const at = deps.now()
  const { count, resetAt } = await deps.rateLimits.hit({ bucket: `member-token:${ipHash(c)}`, windowS: 3600, now: at })
  if (count > 30) {
    throw new ApiError(
      429,
      'rate-limited',
      'Too many token lookups or accepts; retry after the hourly limit resets.',
      {},
      {
        'Retry-After': String(Math.max(1, Math.ceil((resetAt.getTime() - at.getTime()) / 1000)))
      }
    )
  }
  await next()
}

export const memberHandlers: {
  listMembers: HandlerEntry<Operations['listMembers']>
  updateMember: HandlerEntry<Operations['updateMember']>
  removeMember: HandlerEntry<Operations['removeMember']>
  listInvitations: HandlerEntry<Operations['listInvitations']>
  createInvitation: HandlerEntry<Operations['createInvitation']>
  revokeInvitation: HandlerEntry<Operations['revokeInvitation']>
  resendInvitation: HandlerEntry<Operations['resendInvitation']>
  createOwnershipTransfer: HandlerEntry<Operations['createOwnershipTransfer']>
  cancelOwnershipTransfer: HandlerEntry<Operations['cancelOwnershipTransfer']>
  inspectMemberToken: HandlerEntry<Operations['inspectMemberToken']>
  acceptInvitation: HandlerEntry<Operations['acceptInvitation']>
  acceptOwnershipTransfer: HandlerEntry<Operations['acceptOwnershipTransfer']>
} = {
  listMembers: {
    handler: async (c) => c.json(await inTenant(c, (ctx) => listMembers(ctx, c.req.valid('query'))), 200)
  },
  updateMember: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const body = c.req.valid('json')
      const row = await inTenant(c, (ctx) =>
        updateMember(
          ctx,
          {
            id,
            ...(body.role === undefined ? {} : { role: body.role }),
            ...(body.reads_malay === undefined ? {} : { readsMalay: body.reads_malay })
          },
          c.get('deps').recordAudit
        )
      )
      return c.json(row, 200)
    }
  },
  removeMember: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      await inTenant(c, (ctx) => removeMember(ctx, id, c.get('deps').recordAudit))
      return c.body(null, 204)
    }
  },
  listInvitations: {
    handler: async (c) => c.json(await inTenant(c, (ctx) => listInvitations(ctx, c.req.valid('query'))), 200)
  },
  createInvitation: {
    handler: async (c) => {
      const body = c.req.valid('json')
      const deps = c.get('deps')
      const result = await inTenant(c, (ctx) =>
        createInvitation(ctx, body, {
          now: deps.now(),
          origin: deps.config().appOrigin,
          recordAudit: deps.recordAudit
        })
      )
      await deps.email.send(result.email)
      return c.json(result.invitation, 201)
    }
  },
  revokeInvitation: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      await inTenant(c, (ctx) => revokeInvitation(ctx, id, c.get('deps').recordAudit))
      return c.body(null, 204)
    }
  },
  resendInvitation: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const deps = c.get('deps')
      const result = await inTenant(c, (ctx) =>
        resendInvitation(ctx, id, {
          now: deps.now(),
          origin: deps.config().appOrigin,
          recordAudit: deps.recordAudit
        })
      )
      await deps.email.send(result.email)
      return c.json(result.invitation, 200)
    }
  },
  createOwnershipTransfer: {
    handler: async (c) => {
      const { to_member_id: toMemberId } = c.req.valid('json')
      const deps = c.get('deps')
      const result = await inTenant(c, (ctx) =>
        createOwnershipTransfer(ctx, toMemberId, {
          now: deps.now(),
          origin: deps.config().appOrigin,
          recordAudit: deps.recordAudit
        })
      )
      await deps.email.send(result.email)
      return c.json(result.transfer, 201)
    }
  },
  cancelOwnershipTransfer: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      await inTenant(c, (ctx) => cancelOwnershipTransfer(ctx, id, c.get('deps').recordAudit))
      return c.body(null, 204)
    }
  },
  inspectMemberToken: {
    middleware: [tokenRateLimit],
    handler: async (c) => c.json(await inspectMemberToken(c.req.valid('param').token, c.get('deps').now()), 200)
  },
  acceptInvitation: {
    middleware: [tokenRateLimit, requireHumanSession],
    handler: async (c) => {
      const deps = c.get('deps')
      const result = await acceptMemberToken(c.req.valid('param').token, c.get('principal')!, {
        now: deps.now(),
        withTenant: deps.withTenant,
        recordAudit: deps.recordAudit,
        expectedKind: 'invitation',
        includeOrgSummary: true
      })
      return c.json(result as never, 201)
    }
  },
  acceptOwnershipTransfer: {
    middleware: [tokenRateLimit, requireHumanSession],
    handler: async (c) => {
      const deps = c.get('deps')
      const result = await acceptMemberToken(c.req.valid('param').token, c.get('principal')!, {
        now: deps.now(),
        withTenant: deps.withTenant,
        recordAudit: deps.recordAudit,
        expectedKind: 'ownership_transfer'
      })
      return c.json(result as never, 200)
    }
  }
}
