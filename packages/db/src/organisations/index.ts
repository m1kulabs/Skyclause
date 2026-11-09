import {
  RESERVED_SLUGS,
  SLUG_REGEX,
  type CreateOrganisation,
  type Organisation,
  type Role,
  type TxHandle
} from '@skyclause/contracts'
import { asc, eq, sql } from 'drizzle-orm'
import { track } from '../analytics'
import { authDatabase } from '../auth'
import { type Tx } from '../client'
import { member, organization } from '../schema'

const toIso = (d: Date): string => d.toISOString().replace(/\.\d{3}Z$/, 'Z')

const RESERVED_SET = new Set<string>(RESERVED_SLUGS)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class OrgSlugError extends Error {
  readonly field = 'slug' as const
  constructor(
    readonly code: 'slug-reserved' | 'slug-taken' | 'validation-failed',
    readonly reason: 'reserved' | 'taken' | 'invalid',
    readonly slug: string,
    message: string
  ) {
    super(message)
    this.name = 'OrgSlugError'
  }
}

/** ORG-1 messages, shared by the service (API problems) and the `/new` form (inline errors). */
export const orgSlugMessage = {
  format: 'Use 2–39 lowercase letters, digits and single hyphens, starting and ending with a letter or digit.',
  reserved: (slug: string) => `${slug} is reserved. Choose another slug.`,
  taken: (slug: string) => `${slug} is taken. Choose another slug.`
}

/** Format, then reserved (only a `system` caller may take one, §1). Taken is checked against the table. */
export function validateOrgSlug(slug: string, o: { allowReserved: boolean }): void {
  if (!SLUG_REGEX.test(slug)) {
    throw new OrgSlugError('validation-failed', 'invalid', slug, orgSlugMessage.format)
  }
  if (!o.allowReserved && RESERVED_SET.has(slug)) {
    throw new OrgSlugError('slug-reserved', 'reserved', slug, orgSlugMessage.reserved(slug))
  }
}

const isRole = (role: string | null): role is Role =>
  (['owner', 'admin', 'approver', 'editor', 'viewer', 'guest'] as const).includes(role as Role)

/**
 * #102 `createOrganisation`: wraps Better Auth's organisation tables (its plugin's `organization` and `member`),
 * checks the slug, sets `plan` (P1 organisations get `community`; `commons` is #179's) and makes `ownerAccountId`
 * the Owner (null: no member row, for #179). Only a `system` caller may take a reserved slug (§1).
 *
 * Auth writes go through `authDatabase` (`auth_app`, the only login that writes the auth schema); the new
 * organisation's `org_created` analytic is tracked in the caller's transaction, which this scopes to the new org.
 */
export const createOrganisation: CreateOrganisation = async (
  handle,
  { name, slug, ownerAccountId, plan = 'community' }
) => {
  const tx = handle as Tx
  const system = tx.principal?.kind === 'system'
  validateOrgSlug(slug, { allowReserved: system })

  const created = await authDatabase()
    .transaction(async (adb) => {
      const [org] = await adb.insert(organization).values({ name, slug, plan, createdAt: new Date() }).returning()
      if (!org) throw new Error('organisation insert returned no row')
      try {
        if (ownerAccountId !== null) {
          await adb
            .insert(member)
            .values({ organizationId: org.id, userId: ownerAccountId, role: 'owner', createdAt: new Date() })
        }
      } catch (error) {
        if (isTaken(error)) {
          throw new OrgSlugError('slug-taken', 'taken', slug, orgSlugMessage.taken(slug))
        }
        throw error
      }
      return org
    })
    .catch((error: unknown) => {
      if (isTaken(error)) {
        throw new OrgSlugError('slug-taken', 'taken', slug, orgSlugMessage.taken(slug))
      }
      throw error
    })

  await tx.execute(
    sql`SELECT set_config('app.org_id', ${created.id}, true), set_config('app.account_id', ${ownerAccountId ?? ''}, true), set_config('app.role', 'owner', true)`
  )
  await track(tx, 'org_created', { plan })

  return { orgId: created.id }
}

function isTaken(error: unknown): boolean {
  const message = String((error as { cause?: unknown })?.cause ?? error)
  return message.includes('organization_slug_unique') || message.includes('duplicate key')
}

/** The account's memberships with organisation names, oldest first; roles outside §1's six grant nothing. */
export async function listMembershipRecords(
  handle: TxHandle,
  accountId: string
): Promise<
  Array<{
    id: string
    orgId: string
    accountId: string
    role: Role
    readsMalay: boolean
    createdAt: Date
    orgName: string
    orgSlug: string
  }>
> {
  const tx = handle as Tx
  const rows = await tx
    .select({
      id: member.id,
      orgId: member.organizationId,
      accountId: member.userId,
      role: member.role,
      readsMalay: member.readsMalay,
      createdAt: member.createdAt,
      orgName: organization.name,
      orgSlug: organization.slug
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, accountId))
    .orderBy(asc(member.createdAt))
  const seen = new Set<string>()
  return rows.flatMap((row) => {
    if (seen.has(row.orgId) || !isRole(row.role)) return []
    seen.add(row.orgId)
    return [{ ...row, role: row.role }]
  })
}

/** The organisation named by slug or ID; null when unknown. */
export async function getOrganisationRecord(handle: TxHandle, ref: string) {
  const tx = handle as Tx
  const [row] = await tx
    .select()
    .from(organization)
    .where(UUID.test(ref) ? eq(organization.id, ref) : eq(organization.slug, ref))
    .limit(1)
  return row ?? null
}

/** Renames the transaction's organisation (#102: the slug never changes). The write goes through `auth_app`. */
export async function renameOrganisationRecord(handle: TxHandle, name: string) {
  const tx = handle as Tx
  if (!tx.orgId) throw new Error('renameOrganisationRecord needs a withTenant transaction')
  const [row] = await authDatabase().update(organization).set({ name }).where(eq(organization.id, tx.orgId)).returning()
  return row ?? null
}

/** The wire `Organisation`, camelCase to snake_case. */
export function toOrganisation(row: typeof organization.$inferSelect): Organisation {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    deletion_requested_at: row.deletionRequestedAt ? toIso(row.deletionRequestedAt) : null,
    purge_after: row.purgeAfter ? toIso(row.purgeAfter) : null,
    onboarding_skipped: row.onboardingSkipped,
    ai_fallback_enabled: row.aiFallbackEnabled,
    allow_member_ai_keys: row.allowMemberAiKeys
  }
}
