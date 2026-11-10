import { and, count, eq, ne, or, sql } from 'drizzle-orm'
import type { Principal } from '@skyclause/contracts'
import { withRetention, type Tx } from '../client'
import {
  aiKey,
  auditEvent,
  bundleAlert,
  deviceCode,
  exportJob,
  guestToken,
  invitation,
  member,
  notification,
  notificationPreference,
  notice,
  oauthGrant,
  passkey,
  pushSubscription,
  rotaShift,
  session,
  shiftReminder,
  user,
  verification,
  apikey,
  account,
  organization
} from '../schema'
import {
  AccountConfirmationError,
  AccountNotFoundError,
  OrganisationConfirmationError,
  OrganisationDeletionExpiredError,
  OrganisationNotFoundError,
  SoleOwnerError
} from './errors'

const GRACE_MS = 30 * 24 * 60 * 60 * 1000

function actorFields(principal: Principal) {
  switch (principal.kind) {
    case 'session':
      return { actorType: 'account' as const, actorId: principal.accountId }
    case 'api_key':
      return { actorType: 'api_key' as const, actorId: principal.keyId }
    case 'oauth':
      return { actorType: 'oauth_client' as const, actorId: principal.clientId }
    case 'guest_token':
      return { actorType: 'guest_token' as const, actorId: principal.tokenId }
    case 'share_link':
      return { actorType: 'share_link' as const, actorId: principal.linkId }
    case 'device':
      return { actorType: 'device' as const, actorId: principal.keyId }
    case 'system':
      return { actorType: 'system' as const, actorId: principal.job }
  }
}

function auditRow(orgId: string, principal: Principal, action: string, targetId: string, now: Date, after?: unknown) {
  return {
    orgId,
    projectId: null,
    ...actorFields(principal),
    client: principal.client,
    clientName: principal.clientName,
    action,
    targetType: action.startsWith('organisation.') ? 'organisation' : 'account',
    targetId,
    before: null,
    after: after ?? null,
    at: now
  }
}

export interface OrganizationDeletion {
  deletionRequestedAt: Date | null
  purgeAfter: Date | null
}

export async function getOrganizationDeletion(orgId: string): Promise<OrganizationDeletion | null> {
  return withRetention('api:org-deletion-read', async (tx) => {
    const [row] = await tx
      .select({ deletionRequestedAt: organization.deletionRequestedAt, purgeAfter: organization.purgeAfter })
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1)
    return row ?? null
  })
}

export async function scheduleOrganizationDeletion(input: {
  orgId: string
  slug: string
  actor: Principal
  now: Date
}): Promise<OrganizationDeletion> {
  return withRetention('api:org-deletion-schedule', async (tx) => {
    const [org] = await tx.select().from(organization).where(eq(organization.id, input.orgId)).for('update').limit(1)
    if (!org) throw new OrganisationNotFoundError()
    if (org.slug !== input.slug) throw new OrganisationConfirmationError()
    if (org.deletionRequestedAt && org.purgeAfter && org.purgeAfter > input.now) {
      return { deletionRequestedAt: org.deletionRequestedAt, purgeAfter: org.purgeAfter }
    }
    const purgeAfter = new Date(input.now.getTime() + GRACE_MS)
    await tx
      .update(organization)
      .set({ deletionRequestedAt: input.now, purgeAfter })
      .where(eq(organization.id, input.orgId))
    await tx.insert(auditEvent).values(
      auditRow(input.orgId, input.actor, 'organisation.deletion_requested', input.orgId, input.now, {
        purgeAfter: purgeAfter.toISOString()
      })
    )
    return { deletionRequestedAt: input.now, purgeAfter }
  })
}

export async function cancelOrganizationDeletion(input: {
  orgId: string
  actor: Principal
  now: Date
}): Promise<OrganizationDeletion> {
  return withRetention('api:org-deletion-cancel', async (tx) => {
    const [org] = await tx.select().from(organization).where(eq(organization.id, input.orgId)).for('update').limit(1)
    if (!org) throw new OrganisationNotFoundError()
    if (!org.deletionRequestedAt || !org.purgeAfter || org.purgeAfter <= input.now)
      throw new OrganisationDeletionExpiredError()
    await tx
      .update(organization)
      .set({ deletionRequestedAt: null, purgeAfter: null })
      .where(eq(organization.id, input.orgId))
    await tx
      .insert(auditEvent)
      .values(auditRow(input.orgId, input.actor, 'organisation.deletion_cancelled', input.orgId, input.now))
    return { deletionRequestedAt: null, purgeAfter: null }
  })
}

async function soleOwnerOrganisations(tx: Tx, accountId: string) {
  const own = await tx
    .select({ id: organization.id, slug: organization.slug, name: organization.name })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(and(eq(member.userId, accountId), eq(member.role, 'owner')))
  const sole: typeof own = []
  for (const org of own) {
    const [others] = await tx
      .select({ n: count() })
      .from(member)
      .where(and(eq(member.organizationId, org.id), eq(member.role, 'owner'), ne(member.userId, accountId)))
    if (!others || others.n === 0) sole.push(org)
  }
  return sole
}

export async function assertAccountCanBeDeleted(accountId: string, typedEmail: string) {
  return withRetention('api:account-deletion-preflight', async (tx) => {
    const [profile] = await tx
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.id, accountId))
      .limit(1)
    if (!profile) throw new AccountNotFoundError()
    if (profile.email.toLowerCase() !== typedEmail.trim().toLowerCase()) throw new AccountConfirmationError()
    const organisations = await soleOwnerOrganisations(tx, accountId)
    if (organisations.length) throw new SoleOwnerError(organisations)
    return true
  })
}

export async function deleteAccount(input: { accountId: string; email: string; actor: Principal; now: Date }) {
  return withRetention('api:account-delete', async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${'a-data-rights:account:' + input.accountId}, 0))`
    )
    const [profile] = await tx.select().from(user).where(eq(user.id, input.accountId)).for('update').limit(1)
    if (!profile) throw new AccountNotFoundError()
    if (profile.email.toLowerCase() !== input.email.trim().toLowerCase()) throw new AccountConfirmationError()
    const organisations = await tx
      .select({ id: organization.id, slug: organization.slug, name: organization.name, role: member.role })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(eq(member.userId, input.accountId))
      .orderBy(organization.id)
      .for('update')
    const soleOwners = await soleOwnerOrganisations(tx, input.accountId)
    if (soleOwners.length) throw new SoleOwnerError(soleOwners)

    for (const org of organisations) {
      await tx
        .insert(auditEvent)
        .values(auditRow(org.id, input.actor, 'account.deleted', input.accountId, input.now, { deleted: true }))
    }

    await tx.delete(notice).where(eq(notice.accountId, input.accountId))
    const accountExportJobs = await tx
      .delete(exportJob)
      .where(and(eq(exportJob.scope, 'account'), eq(exportJob.accountId, input.accountId)))
      .returning({ id: exportJob.id })
    await tx
      .update(exportJob)
      .set({ accountId: null })
      .where(and(eq(exportJob.scope, 'organisation'), eq(exportJob.accountId, input.accountId)))

    await tx.delete(notification).where(eq(notification.accountId, input.accountId))
    await tx.delete(notificationPreference).where(eq(notificationPreference.accountId, input.accountId))
    await tx.delete(pushSubscription).where(eq(pushSubscription.accountId, input.accountId))
    await tx.delete(shiftReminder).where(eq(shiftReminder.accountId, input.accountId))
    await tx.delete(rotaShift).where(eq(rotaShift.accountId, input.accountId))
    await tx.delete(bundleAlert).where(eq(bundleAlert.accountId, input.accountId))
    await tx.delete(guestToken).where(eq(guestToken.accountId, input.accountId))
    await tx.delete(oauthGrant).where(eq(oauthGrant.accountId, input.accountId))
    await tx.delete(aiKey).where(and(eq(aiKey.ownerType, 'account'), eq(aiKey.accountId, input.accountId)))

    await tx
      .delete(invitation)
      .where(or(eq(invitation.inviterId, input.accountId), sql`lower(${invitation.email}) = lower(${profile.email})`))
    await tx.delete(session).where(eq(session.userId, input.accountId))
    await tx.delete(account).where(eq(account.userId, input.accountId))
    await tx.delete(passkey).where(eq(passkey.userId, input.accountId))
    await tx.delete(apikey).where(eq(apikey.referenceId, input.accountId))
    await tx.delete(deviceCode).where(eq(deviceCode.userId, input.accountId))
    await tx.delete(verification).where(sql`lower(${verification.identifier}) = lower(${profile.email})`)
    await tx.delete(member).where(eq(member.userId, input.accountId))
    const [deleted] = await tx
      .update(user)
      .set({
        email: `${input.accountId}@deleted.invalid`,
        name: '',
        image: null,
        deletedAt: input.now,
        preferences: null,
        updatedAt: input.now
      })
      .where(eq(user.id, input.accountId))
      .returning({ deletedAt: user.deletedAt })
    return {
      deletedAt: deleted?.deletedAt ?? input.now,
      accountExportsRemoved: accountExportJobs.length,
      organisations
    }
  })
}
