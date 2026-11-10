import type { Membership, Organisation, Principal, TxHandle } from '@skyclause/contracts'
import { RESERVED_SLUGS } from '@skyclause/contracts'
import {
  createOrganisation as createOrganisationRecord,
  getOrganisationRecord,
  listMembershipRecords,
  OrgSlugError,
  orgSlugMessage,
  renameOrganisationRecord,
  toOrganisation
} from '@skyclause/db'
import { z } from 'zod'
import { decodeCursor, page } from '../../pagination'
import { ApiError } from '../../problems'
import { instant } from '../../serialize'

// The wire shapes, kept as the shared types (the registry schemas type the responses).
export type OrganisationView = Organisation
export type MembershipSummaryView = Membership & { org_name: string; org_slug: string }

export interface CreateOrganisationInput {
  name: string
  slug: string
}

function toOrgApiError(error: unknown): never {
  if (error instanceof OrgSlugError) {
    const status = error.code === 'validation-failed' ? 422 : 409
    throw new ApiError(status, error.code, error.message, {
      errors: [{ in: 'body', pointer: '/slug', detail: error.message }]
    })
  }
  throw error
}

const toMembership = (
  row: Awaited<ReturnType<typeof listMembershipRecords>>[number]
): Membership & { org_name: string; org_slug: string } => ({
  id: row.id,
  org_id: row.orgId,
  account_id: row.accountId,
  role: row.role,
  reads_malay: row.readsMalay,
  org_name: row.orgName,
  org_slug: row.orgSlug
})

const CursorPosition = z.object({ at: z.iso.datetime(), id: z.string() })
function parseCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null
  const parsed = CursorPosition.safeParse(decodeCursor(cursor))
  if (!parsed.success) {
    throw new ApiError(422, 'validation-failed', 'The cursor is not one this API issued.', {
      errors: [{ in: 'query', pointer: '/cursor', detail: 'Invalid cursor' }]
    })
  }
  return { createdAt: new Date(parsed.data.at), id: parsed.data.id }
}

/**
 * #102 `POST /api/orgs` on the caller's transaction (the API route scopes it to the new org with `withSystem`):
 * D36 lets any signed-in account create an organisation; P1 plans are `community`. `POST /orgs` never takes a
 * reserved slug, even though it runs on a system transaction (§1's system allowance is for #179's caller).
 */
export async function createOrganisationTx(
  tx: TxHandle,
  input: CreateOrganisationInput & { ownerAccountId: string | null }
): Promise<Organisation> {
  if ((RESERVED_SLUGS as readonly string[]).includes(input.slug)) {
    throw new ApiError(409, 'slug-reserved', orgSlugMessage.reserved(input.slug), {
      errors: [{ in: 'body', pointer: '/slug', detail: orgSlugMessage.reserved(input.slug) }]
    })
  }
  try {
    const { orgId } = await createOrganisationRecord(tx, {
      name: input.name,
      slug: input.slug,
      ownerAccountId: input.ownerAccountId
    })
    const row = await getOrganisationRecord(tx, orgId)
    if (!row) throw new Error('organisation missing after creation')
    return toOrganisation(row) as OrganisationView
  } catch (error) {
    toOrgApiError(error)
  }
}

/**
 * #102 `GET /api/me/memberships`: the session's memberships with organisation names, oldest first, paged.
 */
export async function listMembershipsTx(
  tx: TxHandle,
  accountId: string,
  query: { limit: number; cursor?: string }
): Promise<{ data: MembershipSummaryView[]; next_cursor: string | null }> {
  const cursor = parseCursor(query.cursor)
  const rows = (await listMembershipRecords(tx, accountId)).filter(
    (row) =>
      !cursor ||
      row.createdAt > cursor.createdAt ||
      (row.createdAt.getTime() === cursor.createdAt.getTime() && row.id > cursor.id)
  )
  const paged = page(rows, query.limit, (row) => ({ at: instant(row.createdAt), id: row.id }))
  return { data: paged.data.map(toMembership) as MembershipSummaryView[], next_cursor: paged.next_cursor }
}

/**
 * #102 `PATCH /api/orgs/{org}` in the caller's tenant transaction: renames only; the slug never changes.
 */
export async function renameOrganisationTx(tx: TxHandle, input: { name: string }): Promise<Organisation> {
  const row = await renameOrganisationRecord(tx, input.name)
  if (!row) {
    throw new ApiError(404, 'not-found', 'No such organisation, or you are not a member of it.')
  }
  return toOrganisation(row) as OrganisationView
}

export function principalAccountId(principal: Principal): string | null {
  return principal.kind === 'session' ? principal.accountId : null
}
