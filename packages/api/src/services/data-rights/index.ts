import type { Principal } from '@skyclause/contracts'
import {
  AccountConfirmationError,
  AccountNotFoundError,
  ExportPendingError,
  OrganisationConfirmationError,
  OrganisationDeletionExpiredError,
  OrganisationNotFoundError,
  SoleOwnerError,
  assertAccountCanBeDeleted,
  cancelOrganizationDeletion,
  createExportJob,
  deleteAccount,
  failExportEnqueue,
  getExportJob,
  getOrganizationDeletion,
  listExportJobs,
  scheduleOrganizationDeletion,
  type ExportFormat,
  type ExportScope
} from '@skyclause/db'
import type { ApiDeps } from '../../context'
import { ApiError } from '../../problems'

export { ExportPendingError }

export function accountOf(principal: Principal) {
  if (principal.kind !== 'session')
    throw new ApiError(401, 'unauthenticated', 'A signed-in account session is required.')
  return principal.accountId
}

export function problemFor(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof ExportPendingError) return new ApiError(409, 'export-pending', error.message)
  if (error instanceof SoleOwnerError) {
    return new ApiError(409, 'sole-owner', error.message, {
      organisations: error.organisations.map(({ id, slug, name }) => ({ id, slug, name }))
    })
  }
  if (error instanceof AccountConfirmationError) return new ApiError(400, 'validation-failed', error.message)
  if (error instanceof OrganisationConfirmationError) return new ApiError(400, 'validation-failed', error.message)
  if (error instanceof AccountNotFoundError || error instanceof OrganisationNotFoundError) {
    return new ApiError(404, 'not-found', error.message)
  }
  if (error instanceof OrganisationDeletionExpiredError) return new ApiError(404, 'not-found', error.message)
  return new ApiError(
    503,
    'internal-error',
    error instanceof Error ? error.message : 'The data-rights operation failed.'
  )
}

export async function requestExport(input: {
  deps: ApiDeps
  principal: Principal
  scope: ExportScope
  orgId: string | null
  formats: ExportFormat[]
  now: Date
}) {
  const accountId = accountOf(input.principal)
  const job = await createExportJob({
    scope: input.scope,
    orgId: input.orgId,
    accountId,
    formats: input.formats,
    now: input.now
  })
  try {
    if (input.scope === 'organisation' && input.orgId) {
      await input.deps.withTenant({ orgId: input.orgId, principal: input.principal }, (tx) =>
        input.deps.recordAudit(tx, { action: 'export.requested', target: { type: 'export', id: job.id } })
      )
    }
    if (!input.deps.dataRights) throw new Error('export task transport is not configured')
    await input.deps.dataRights.enqueueExport(job.id)
  } catch (error) {
    await failExportEnqueue(job.id, error instanceof Error ? error.message : String(error), input.now)
    throw new ApiError(503, 'internal-error', 'The export could not be queued. Retry the request.')
  }
  return job
}

export async function deleteMyAccount(input: {
  deps: ApiDeps
  accountId: string
  email: string
  principal: Principal
  now: Date
}) {
  try {
    await assertAccountCanBeDeleted(input.accountId, input.email)
    if (!input.deps.dataRights) throw new Error('account export storage is not configured')
    await input.deps.dataRights.deleteAccountExports(input.accountId)
    const result = await deleteAccount({
      accountId: input.accountId,
      email: input.email,
      actor: input.principal,
      now: input.now
    })
    if (result.accountExportsRemoved > 0) await input.deps.dataRights.deleteAccountExports(input.accountId)
    return result
  } catch (error) {
    throw problemFor(error)
  }
}

export async function loadExportPage(input: { scope: ExportScope; id: string; limit: number; offset: number }) {
  return listExportJobs({ ...input, limit: input.limit + 1 })
}

export async function requestOrgDeletion(input: { orgId: string; slug: string; principal: Principal; now: Date }) {
  try {
    return await scheduleOrganizationDeletion({
      orgId: input.orgId,
      slug: input.slug,
      actor: input.principal,
      now: input.now
    })
  } catch (error) {
    throw problemFor(error)
  }
}

export async function cancelOrgDeletion(input: { orgId: string; principal: Principal; now: Date }) {
  try {
    return await cancelOrganizationDeletion({ orgId: input.orgId, actor: input.principal, now: input.now })
  } catch (error) {
    throw problemFor(error)
  }
}

export { getExportJob, getOrganizationDeletion }
