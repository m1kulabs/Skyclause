import { eq, inArray, sql } from 'drizzle-orm'
import { authDatabase } from '../auth'
import { withSystem, type Tx } from '../client'
import { tokenHash } from '../tokens'
import { account, invitation, passkey } from '../schema/auth'
import { ownershipTransfer } from '../schema/members'

export type MemberTokenOwner =
  | { kind: 'invitation'; orgId: string; id: string; status: string; expiresAt: Date }
  | { kind: 'ownership_transfer'; orgId: string; id: string; status: string; expiresAt: Date }

/** Serialize member and Owner changes per organisation until the tenant transaction commits. */
export async function lockMemberWrites(tx: Tx): Promise<void> {
  if (!tx.orgId) throw new Error('lockMemberWrites needs a withTenant transaction')
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${tx.orgId}, 0))`)
}

/** Read authentication methods behind auth_app, keeping its wider auth-schema access inside the DB package. */
export async function memberSignInMethods(userIds: string[]): Promise<Map<string, string[]>> {
  if (!userIds.length) return new Map()
  const [accounts, passkeys] = await Promise.all([
    authDatabase()
      .select({ userId: account.userId, providerId: account.providerId })
      .from(account)
      .where(inArray(account.userId, userIds)),
    authDatabase().select({ userId: passkey.userId }).from(passkey).where(inArray(passkey.userId, userIds))
  ])
  const methods = new Map<string, Set<string>>()
  for (const row of accounts) {
    const found = methods.get(row.userId) ?? new Set<string>()
    found.add(row.providerId)
    methods.set(row.userId, found)
  }
  for (const row of passkeys) {
    const found = methods.get(row.userId) ?? new Set<string>()
    found.add('passkey')
    methods.set(row.userId, found)
  }
  return new Map([...methods].map(([userId, values]) => [userId, [...values]]))
}

/** Auth-schema writes use narrow SECURITY DEFINER functions so the app login keeps read-only auth grants. */
export async function insertMember(tx: Tx, q: { userId: string; role: string; createdAt: Date }) {
  const result = await tx.execute<{ id: string }>(
    sql`SELECT auth.member_insert(${q.userId}::uuid, ${q.role}, ${q.createdAt}::timestamptz) AS id`
  )
  const id = result.rows[0]?.id
  if (!id) throw new Error('auth.member_insert returned no member id.')
  return id
}

export async function updateMember(tx: Tx, q: { id: string; role?: string; readsMalay?: boolean }): Promise<boolean> {
  const result = await tx.execute<{ updated: boolean }>(
    sql`SELECT auth.member_update(
      ${q.id}::uuid,
      ${q.role ?? null}::text,
      ${q.readsMalay ?? null}::boolean
    ) AS updated`
  )
  return result.rows[0]?.updated ?? false
}

export async function deleteMember(tx: Tx, id: string): Promise<boolean> {
  const result = await tx.execute<{ deleted: boolean }>(sql`SELECT auth.member_delete(${id}::uuid) AS deleted`)
  return result.rows[0]?.deleted ?? false
}

export async function insertInvitation(
  tx: Tx,
  q: { email: string; role: string; expiresAt: Date; inviterId: string; tokenHash: string }
) {
  const result = await tx.execute<{ id: string }>(sql`
    SELECT auth.invitation_insert(
      ${q.email}, ${q.role}, ${q.expiresAt}::timestamptz, ${q.inviterId}::uuid, ${q.tokenHash}
    ) AS id
  `)
  const id = result.rows[0]?.id
  if (!id) throw new Error('auth.invitation_insert returned no invitation id.')
  return id
}

export async function updateInvitationStatus(tx: Tx, id: string, status: string): Promise<boolean> {
  const result = await tx.execute<{ updated: boolean }>(
    sql`SELECT auth.invitation_set_status(${id}::uuid, ${status}) AS updated`
  )
  return result.rows[0]?.updated ?? false
}

/** Resolve a token hash across tenants using the system read policy; callers then reopen it in its tenant. */
export async function lookupMemberToken(token: string): Promise<MemberTokenOwner | null> {
  const hash = tokenHash(token)
  return withSystem('member-token-lookup', async (tx) => {
    const [invite] = await tx
      .select({
        orgId: invitation.organizationId,
        id: invitation.id,
        status: invitation.status,
        expiresAt: invitation.expiresAt
      })
      .from(invitation)
      .where(eq(invitation.tokenHash, hash))
      .limit(1)
    if (invite) return { kind: 'invitation', ...invite }
    const [transfer] = await tx
      .select({
        orgId: ownershipTransfer.orgId,
        id: ownershipTransfer.id,
        status: ownershipTransfer.status,
        expiresAt: ownershipTransfer.expiresAt
      })
      .from(ownershipTransfer)
      .where(eq(ownershipTransfer.tokenHash, hash))
      .limit(1)
    return transfer ? { kind: 'ownership_transfer', ...transfer } : null
  })
}
