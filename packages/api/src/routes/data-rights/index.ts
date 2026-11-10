import type { Principal } from '@skyclause/contracts'
import { getExportJob } from '@skyclause/db'
import type { Context } from 'hono'
import type { ApiEnv } from '../../context'
import { encodeCursor, decodeCursor } from '../../pagination'
import { ApiError } from '../../problems'
import { toWire } from '../../serialize'
import {
  accountOf,
  cancelOrgDeletion,
  deleteMyAccount,
  getOrganizationDeletion,
  loadExportPage,
  problemFor,
  requestExport,
  requestOrgDeletion
} from '../../services/data-rights'
import type { Handlers } from '../index'

type AccountExportView = {
  id: string
  scope: 'account'
  status: string
  formats: Array<'json' | 'csv'>
  error: string | null
  expires_at: string | null
  format: 'json' | 'csv'
  created_at: string
}

type OrganisationExportView = {
  id: string
  scope: 'account' | 'organisation'
  status: string
  formats: Array<'json' | 'csv'>
  error: string | null
  expires_at: string | null
  created_at: string
  download_url: string | null
}

type DeletionView = { deletion_requested_at: string | null; purge_after: string | null }

function offsetFromCursor(cursor: string | undefined) {
  if (!cursor) return 0
  const { offset } = decodeCursor(cursor)
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
    throw new ApiError(422, 'validation-failed', 'The cursor is not one this API issued.', {
      errors: [{ in: 'query', pointer: '/cursor', detail: 'Invalid cursor' }]
    })
  }
  return offset
}

function accountExportSummary(job: Awaited<ReturnType<typeof getExportJob>>): AccountExportView {
  if (!job) throw new Error('account export job disappeared')
  return toWire({
    id: job.id,
    scope: job.scope,
    status: job.status,
    formats: job.formats as Array<'json' | 'csv'>,
    error: job.error,
    expiresAt: job.expiresAt,
    format: (job.formats[0] ?? 'json') as 'json' | 'csv',
    createdAt: job.createdAt
  }) as AccountExportView
}

function organisationExportSummary(
  c: Context<ApiEnv>,
  job: NonNullable<Awaited<ReturnType<typeof getExportJob>>>
): OrganisationExportView {
  const { appOrigin } = c.get('deps').config()
  const origin = appOrigin ?? new URL(c.req.url).origin
  const ready = job.status === 'ready' && job.expiresAt && job.expiresAt > c.get('deps').now()
  return toWire({
    id: job.id,
    scope: job.scope,
    status: job.status,
    formats: job.formats as Array<'json' | 'csv'>,
    error: job.error,
    expiresAt: job.expiresAt,
    createdAt: job.createdAt,
    downloadUrl: ready ? `${origin}/api/exports/${encodeURIComponent(job.id)}/download` : null
  }) as OrganisationExportView
}

async function pageJobs<T>(input: {
  scope: 'account' | 'organisation'
  id: string
  limit: number
  cursor: string | undefined
  map: (job: NonNullable<Awaited<ReturnType<typeof getExportJob>>>) => T
}) {
  const offset = offsetFromCursor(input.cursor)
  const rows = await loadExportPage({ scope: input.scope, id: input.id, limit: input.limit, offset })
  const data = rows.slice(0, input.limit)
  const last = data.at(-1)
  return {
    data: data.map((job) => input.map(job)),
    next_cursor: rows.length > input.limit && last ? encodeCursor({ offset: offset + input.limit }) : null
  }
}

function sessionAccount(principal: Principal) {
  return accountOf(principal)
}

export const dataRightsHandlers: Handlers = {
  listMyExports: {
    handler: async (c) => {
      const accountId = sessionAccount(c.get('principal')!)
      const { limit, cursor } = c.req.valid('query')
      return c.json(await pageJobs({ scope: 'account', id: accountId, limit, cursor, map: accountExportSummary }), 200)
    }
  },
  createMyExport: {
    handler: async (c) => {
      const principal = c.get('principal')!
      const { format } = c.req.valid('json')
      try {
        const job = await requestExport({
          deps: c.get('deps'),
          principal,
          scope: 'account',
          orgId: null,
          formats: [format],
          now: c.get('deps').now()
        })
        return c.json(accountExportSummary(job), 202)
      } catch (error) {
        throw problemFor(error)
      }
    }
  },
  deleteMyAccount: {
    handler: async (c) => {
      const principal = c.get('principal')!
      const accountId = sessionAccount(principal)
      const { email } = c.req.valid('json')
      const result = await deleteMyAccount({
        deps: c.get('deps'),
        accountId,
        email,
        principal,
        now: c.get('deps').now()
      })
      return c.json(toWire({ deletedAt: result.deletedAt }) as { deleted_at: string }, 202)
    }
  },
  listOrganisationExports: {
    handler: async (c) => {
      const orgId = c.get('orgId')!
      const { limit, cursor } = c.req.valid('query')
      return c.json(
        await pageJobs({
          scope: 'organisation',
          id: orgId,
          limit,
          cursor,
          map: (job) => organisationExportSummary(c, job)
        }),
        200
      )
    }
  },
  createOrganisationExport: {
    handler: async (c) => {
      const principal = c.get('principal')!
      const orgId = c.get('orgId')!
      const { formats } = c.req.valid('json')
      try {
        const job = await requestExport({
          deps: c.get('deps'),
          principal,
          scope: 'organisation',
          orgId,
          formats,
          now: c.get('deps').now()
        })
        return c.json(organisationExportSummary(c, job), 202)
      } catch (error) {
        throw problemFor(error)
      }
    }
  },
  getOrganisationDeletion: {
    handler: async (c) => {
      const state = await getOrganizationDeletion(c.get('orgId')!)
      if (!state) throw new ApiError(404, 'not-found', 'The organisation was not found.')
      return c.json(toWire(state) as DeletionView, 200)
    }
  },
  requestOrganisationDeletion: {
    handler: async (c) => {
      const principal = c.get('principal')!
      const slug = c.req.valid('json').slug
      const state = await requestOrgDeletion({ orgId: c.get('orgId')!, slug, principal, now: c.get('deps').now() })
      return c.json(toWire(state) as DeletionView, 202)
    }
  },
  cancelOrganisationDeletion: {
    handler: async (c) => {
      const principal = c.get('principal')!
      const state = await cancelOrgDeletion({ orgId: c.get('orgId')!, principal, now: c.get('deps').now() })
      return c.json(toWire(state) as DeletionView, 200)
    }
  },
  downloadExport: {
    handler: async (c) => {
      const accountId = sessionAccount(c.get('principal')!)
      const { id } = c.req.valid('param')
      const job = await getExportJob(id)
      if (!job) throw new ApiError(404, 'not-found', 'The export does not exist for this account or organisation.')
      if (job.scope === 'account') {
        if (job.accountId !== accountId)
          throw new ApiError(404, 'not-found', 'The export does not exist for this account or organisation.')
      } else {
        const isRequester = job.accountId === accountId
        if (!isRequester) {
          const membership = job.orgId ? await c.get('deps').membership.lookup(job.orgId, accountId) : null
          if (!membership || !['owner', 'admin'].includes(membership.role ?? '')) {
            throw new ApiError(404, 'not-found', 'The export does not exist for this account or organisation.')
          }
        }
      }
      if (job.status !== 'ready' || !job.objectPath || !job.expiresAt) {
        throw new ApiError(409, 'export-pending', 'The export is still being prepared.')
      }
      if (job.expiresAt <= c.get('deps').now())
        throw new ApiError(410, 'link-expired', 'The export download link has expired.')
      const transport = c.get('deps').dataRights
      if (!transport) throw new ApiError(503, 'internal-error', 'Export downloads are not configured.')
      const signed = await transport.signDownload(job.objectPath, job.expiresAt)
      return c.redirect(signed, 302)
    }
  }
}
