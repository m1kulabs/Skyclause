import { randomBytes } from 'node:crypto'
import {
  deleteMember as deleteMemberRow,
  insertInvitation,
  insertMember,
  lookupMemberToken,
  lockMemberWrites,
  memberSignInMethods,
  member,
  invitation,
  organization,
  ownershipTransfer,
  rotaShift,
  tokenHash,
  user,
  updateInvitationStatus,
  updateMember as updateMemberRow,
  type Tx
} from '@skyclause/db'
import type { Principal, RecordAudit, Role } from '@skyclause/contracts'
import { and, asc, eq, gt, sql } from 'drizzle-orm'
import { decodeCursor, page } from '../../pagination'
import { ApiError } from '../../problems'
import type { WithTenant } from '../../tenancy'

const INVITE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000
const INVITABLE_ROLES = new Set<Role>(['admin', 'approver', 'editor', 'viewer'])

const token = () => randomBytes(32).toString('base64url')
const normalEmail = (email: string) => email.trim().toLowerCase()
const iso = (date: Date) => date.toISOString()
const accountOf = (principal: Principal): string | null =>
  principal.kind === 'session' || principal.kind === 'api_key' || principal.kind === 'oauth'
    ? principal.accountId
    : null
const roleOf = (principal: Principal): Role | null =>
  principal.kind === 'session' || principal.kind === 'api_key' || principal.kind === 'oauth' ? principal.role : null

function requireManager(principal: Principal) {
  if (!accountOf(principal) || !['owner', 'admin'].includes(roleOf(principal) ?? '')) {
    throw new ApiError(403, 'insufficient-scope', 'Only Owners and Admins can manage members.')
  }
}

function requireOwner(principal: Principal) {
  if (!accountOf(principal) || roleOf(principal) !== 'owner') {
    throw new ApiError(403, 'insufficient-scope', 'Only the Owner can transfer ownership.')
  }
}

function tokenProblem(status: string, expiresAt: Date, now: Date): 'valid' | 'expired' | 'withdrawn' | 'used' {
  if (status === 'accepted') return 'used'
  if (status === 'revoked' || status === 'cancelled' || status !== 'pending') return 'withdrawn'
  return expiresAt.getTime() <= now.getTime() ? 'expired' : 'valid'
}

function throwTokenProblem(state: ReturnType<typeof tokenProblem>): never {
  if (state === 'withdrawn')
    throw new ApiError(410, 'invite-withdrawn', 'This invitation or ownership link was withdrawn.')
  if (state === 'expired') throw new ApiError(410, 'link-expired', 'This link has expired.')
  if (state === 'used') throw new ApiError(409, 'conflict', 'This link has already been used.')
  throw new Error('throwTokenProblem called for a valid token')
}

const inviteUrl = (value: string, origin?: string) =>
  new URL(`/invite/${value}`, origin || 'https://app.skyclause.m1ku.tech').toString()

export interface MemberEmail {
  to: string
  from: 'system'
  subject: string
  text: string
  html: string
  category: string
  idempotencyKey: string
}

function emailMessage(
  to: string,
  linkToken: string,
  origin: string | undefined,
  kind: 'invitation' | 'ownership transfer',
  id: string
): MemberEmail {
  const url = inviteUrl(linkToken, origin)
  return {
    to,
    from: 'system',
    subject: kind === 'invitation' ? 'You are invited to Skyclause' : 'Accept the Skyclause ownership transfer',
    text: `Open this one-time link within 7 days to ${kind === 'invitation' ? 'accept your invitation' : 'accept the ownership transfer'}:\n\n${url}\n`,
    html: `<p>Open this one-time link within 7 days to ${kind === 'invitation' ? 'accept your invitation' : 'accept the ownership transfer'}:</p><p><a href="${url}">${url}</a></p>`,
    category: kind === 'invitation' ? 'member-invitation' : 'ownership-transfer',
    idempotencyKey: `${kind.replaceAll(' ', '-')}-${id}`
  }
}

async function memberById(tx: Tx, id: string) {
  const [row] = await tx
    .select({ membership: member, user })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.id, id), eq(member.organizationId, tx.orgId!)))
    .limit(1)
  if (!row) throw new ApiError(404, 'not-found', 'The member was not found in this organisation.')
  return row
}

async function memberViews(rows: Array<{ membership: typeof member.$inferSelect; user: typeof user.$inferSelect }>) {
  const userIds = [...new Set(rows.map((row) => row.user.id))]
  const methods = await memberSignInMethods(userIds)
  return rows.map((row) => ({
    id: row.membership.id,
    org_id: row.membership.organizationId,
    account_id: row.membership.userId,
    role: row.membership.role as Role,
    reads_malay: row.membership.readsMalay,
    name: row.user.name,
    email: row.user.email,
    last_active_at: row.user.lastActiveAt ? iso(row.user.lastActiveAt) : null,
    sign_in_methods: methods.get(row.user.id) ?? []
  }))
}

export async function listMembers(ctx: { tx: Tx; principal: Principal }, q: { limit: number; cursor?: string }) {
  requireManager(ctx.principal)
  const position = q.cursor ? decodeCursor(q.cursor) : null
  const cursorId = typeof position?.id === 'string' ? position.id : undefined
  const rows = await ctx.tx
    .select({ membership: member, user })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, ctx.tx.orgId!), ...(cursorId ? [gt(member.id, cursorId)] : [])))
    .orderBy(asc(member.id))
    .limit(q.limit + 1)
  const views = await memberViews(rows)
  return page(views, q.limit, (row) => ({ id: row.id }))
}

export async function updateMember(
  ctx: { tx: Tx; principal: Principal },
  input: { id: string; role?: Role; readsMalay?: boolean },
  recordAudit: RecordAudit
) {
  requireManager(ctx.principal)
  if (input.role === 'owner' || (input.role && !INVITABLE_ROLES.has(input.role))) {
    throw new ApiError(403, 'role-not-grantable', 'Owners can only be granted by accepting an ownership transfer.')
  }
  await lockMemberWrites(ctx.tx)
  const before = await memberById(ctx.tx, input.id)
  const roleBefore = before.membership.role as Role
  if (input.role && input.role !== roleBefore && roleBefore === 'owner') {
    const [ownerCountRow] = await ctx.tx
      .select({ count: sql<number>`count(*)::int` })
      .from(member)
      .where(and(eq(member.organizationId, ctx.tx.orgId!), eq(member.role, 'owner')))
    if ((ownerCountRow?.count ?? 0) <= 1) throw new ApiError(409, 'last-owner', 'An organisation must keep one Owner.')
  }
  const update: Partial<typeof member.$inferInsert> = {}
  if (input.role !== undefined) update.role = input.role
  if (input.readsMalay !== undefined) update.readsMalay = input.readsMalay
  if (Object.keys(update).length) {
    if (!(await updateMemberRow(ctx.tx, { id: input.id, ...update })))
      throw new ApiError(404, 'not-found', 'The member was not found in this organisation.')
    if (input.role !== undefined && input.role !== roleBefore) {
      await recordAudit(ctx.tx, {
        action: 'member.role_changed',
        target: { type: 'member', id: input.id },
        before: { role: roleBefore },
        after: { role: input.role }
      })
    }
    if (input.readsMalay !== undefined && input.readsMalay !== before.membership.readsMalay) {
      await recordAudit(ctx.tx, {
        action: 'member.reads_malay_changed',
        target: { type: 'member', id: input.id },
        before: { reads_malay: before.membership.readsMalay },
        after: { reads_malay: input.readsMalay }
      })
    }
  }
  return (await memberViews([await memberById(ctx.tx, input.id)]))[0]!
}

export async function removeMember(ctx: { tx: Tx; principal: Principal }, id: string, recordAudit: RecordAudit) {
  requireManager(ctx.principal)
  await lockMemberWrites(ctx.tx)
  const row = await memberById(ctx.tx, id)
  if (row.membership.role === 'owner') {
    const [ownerCountRow] = await ctx.tx
      .select({ count: sql<number>`count(*)::int` })
      .from(member)
      .where(and(eq(member.organizationId, ctx.tx.orgId!), eq(member.role, 'owner')))
    if ((ownerCountRow?.count ?? 0) <= 1) throw new ApiError(409, 'last-owner', 'An organisation must keep one Owner.')
  }
  await ctx.tx
    .delete(rotaShift)
    .where(and(eq(rotaShift.orgId, ctx.tx.orgId!), eq(rotaShift.accountId, row.membership.userId)))
  if (!(await deleteMemberRow(ctx.tx, id)))
    throw new ApiError(404, 'not-found', 'The member was not found in this organisation.')
  await recordAudit(ctx.tx, {
    action: 'member.removed',
    target: { type: 'member', id },
    before: { role: row.membership.role },
    after: null
  })
}

export async function listInvitations(ctx: { tx: Tx; principal: Principal }, q: { limit: number; cursor?: string }) {
  requireManager(ctx.principal)
  const position = q.cursor ? decodeCursor(q.cursor) : null
  const cursorId = typeof position?.id === 'string' ? position.id : undefined
  const rows = await ctx.tx
    .select()
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, ctx.tx.orgId!),
        eq(invitation.status, 'pending'),
        ...(cursorId ? [gt(invitation.id, cursorId)] : [])
      )
    )
    .orderBy(asc(invitation.id))
    .limit(q.limit + 1)
  return page(
    rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: (row.role ?? 'viewer') as Role,
      expires_at: iso(row.expiresAt)
    })),
    q.limit,
    (row) => ({ id: row.id })
  )
}

export async function createInvitation(
  ctx: { tx: Tx; principal: Principal },
  input: { email: string; role: Role },
  opts: { now: Date; origin?: string; recordAudit: RecordAudit }
) {
  requireManager(ctx.principal)
  if (!INVITABLE_ROLES.has(input.role))
    throw new ApiError(403, 'role-not-grantable', 'This role cannot be granted by invitation.')
  await lockMemberWrites(ctx.tx)
  const email = normalEmail(input.email)
  const [existingMember] = await ctx.tx
    .select({ id: member.id })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, ctx.tx.orgId!), sql`lower(${user.email}) = ${email}`))
    .limit(1)
  if (existingMember) throw new ApiError(409, 'conflict', 'This person is already a member.')
  const [existingInvitation] = await ctx.tx
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, ctx.tx.orgId!),
        eq(invitation.status, 'pending'),
        sql`lower(${invitation.email}) = ${email}`
      )
    )
    .limit(1)
  if (existingInvitation) throw new ApiError(409, 'conflict', 'A pending invitation already exists for this address.')
  const linkToken = token()
  const id = await insertInvitation(ctx.tx, {
    email,
    role: input.role,
    expiresAt: new Date(opts.now.getTime() + INVITE_DAYS * DAY_MS),
    inviterId: accountOf(ctx.principal)!,
    tokenHash: tokenHash(linkToken)
  })
  const [row] = await ctx.tx.select().from(invitation).where(eq(invitation.id, id)).limit(1)
  if (!row) throw new Error('The invitation insert did not return its row.')
  await opts.recordAudit(ctx.tx, {
    action: 'invite.created',
    target: { type: 'invitation', id: row.id },
    before: null,
    after: { role: input.role }
  })
  return {
    invitation: { id: row.id, email: row.email, role: input.role, expires_at: iso(row.expiresAt) },
    email: emailMessage(email, linkToken, opts.origin, 'invitation', row.id)
  }
}

export async function revokeInvitation(ctx: { tx: Tx; principal: Principal }, id: string, recordAudit: RecordAudit) {
  requireManager(ctx.principal)
  await lockMemberWrites(ctx.tx)
  const [row] = await ctx.tx
    .select()
    .from(invitation)
    .where(and(eq(invitation.id, id), eq(invitation.organizationId, ctx.tx.orgId!)))
    .limit(1)
  if (!row) throw new ApiError(404, 'not-found', 'The invitation was not found in this organisation.')
  if (row.status === 'pending') {
    await updateInvitationStatus(ctx.tx, id, 'revoked')
    await recordAudit(ctx.tx, {
      action: 'invite.revoked',
      target: { type: 'invitation', id },
      before: { status: 'pending' },
      after: { status: 'revoked' }
    })
  }
}

export async function resendInvitation(
  ctx: { tx: Tx; principal: Principal },
  id: string,
  opts: { now: Date; origin?: string; recordAudit: RecordAudit }
) {
  requireManager(ctx.principal)
  await lockMemberWrites(ctx.tx)
  const [previous] = await ctx.tx
    .select()
    .from(invitation)
    .where(and(eq(invitation.id, id), eq(invitation.organizationId, ctx.tx.orgId!)))
    .limit(1)
  if (!previous) throw new ApiError(404, 'not-found', 'The invitation was not found in this organisation.')
  if (previous.status !== 'pending')
    throw new ApiError(410, 'invite-withdrawn', 'This invitation is no longer pending.')
  const linkToken = token()
  await updateInvitationStatus(ctx.tx, previous.id, 'revoked')
  const nextId = await insertInvitation(ctx.tx, {
    email: previous.email,
    role: previous.role ?? 'viewer',
    expiresAt: new Date(opts.now.getTime() + INVITE_DAYS * DAY_MS),
    inviterId: accountOf(ctx.principal)!,
    tokenHash: tokenHash(linkToken)
  })
  const [next] = await ctx.tx.select().from(invitation).where(eq(invitation.id, nextId)).limit(1)
  if (!next) throw new Error('The resent invitation insert did not return its row.')
  await opts.recordAudit(ctx.tx, {
    action: 'invite.revoked',
    target: { type: 'invitation', id: previous.id },
    before: { status: 'pending' },
    after: { status: 'revoked' }
  })
  await opts.recordAudit(ctx.tx, {
    action: 'invite.created',
    target: { type: 'invitation', id: next.id },
    before: null,
    after: { role: next.role }
  })
  return {
    invitation: {
      id: next.id,
      email: next.email,
      role: (next.role ?? 'viewer') as Role,
      expires_at: iso(next.expiresAt)
    },
    email: emailMessage(next.email, linkToken, opts.origin, 'invitation', next.id)
  }
}

export async function createOwnershipTransfer(
  ctx: { tx: Tx; principal: Principal },
  toMemberId: string,
  opts: { now: Date; origin?: string; recordAudit: RecordAudit }
) {
  requireOwner(ctx.principal)
  await lockMemberWrites(ctx.tx)
  const actorId = accountOf(ctx.principal)!
  const [from] = await ctx.tx
    .select({ id: member.id, role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, ctx.tx.orgId!), eq(member.userId, actorId)))
    .limit(1)
  if (!from || from.role !== 'owner')
    throw new ApiError(403, 'insufficient-scope', 'Only the current Owner can transfer ownership.')
  const target = await memberById(ctx.tx, toMemberId)
  if (target.membership.id === from.id || target.membership.role === 'owner')
    throw new ApiError(400, 'validation-failed', 'Ownership can only move to another current member.')
  const [pending] = await ctx.tx
    .select({ id: ownershipTransfer.id })
    .from(ownershipTransfer)
    .where(and(eq(ownershipTransfer.orgId, ctx.tx.orgId!), eq(ownershipTransfer.status, 'pending')))
    .limit(1)
  if (pending) throw new ApiError(409, 'conflict', 'An ownership transfer is already pending.')
  const linkToken = token()
  const [row] = await ctx.tx
    .insert(ownershipTransfer)
    .values({
      orgId: ctx.tx.orgId!,
      fromMemberId: from.id,
      toMemberId: target.membership.id,
      tokenHash: tokenHash(linkToken),
      status: 'pending',
      expiresAt: new Date(opts.now.getTime() + INVITE_DAYS * DAY_MS)
    })
    .returning()
  await opts.recordAudit(ctx.tx, {
    action: 'ownership_transfer.created',
    target: { type: 'ownership_transfer', id: row!.id },
    before: null,
    after: { to_member_id: target.membership.id }
  })
  return {
    transfer: { id: row!.id, to_member_id: target.membership.id, status: row!.status },
    email: emailMessage(target.user.email, linkToken, opts.origin, 'ownership transfer', row!.id)
  }
}

export async function cancelOwnershipTransfer(
  ctx: { tx: Tx; principal: Principal },
  id: string,
  recordAudit: RecordAudit
) {
  requireOwner(ctx.principal)
  await lockMemberWrites(ctx.tx)
  const [row] = await ctx.tx
    .select()
    .from(ownershipTransfer)
    .where(and(eq(ownershipTransfer.id, id), eq(ownershipTransfer.orgId, ctx.tx.orgId!)))
    .limit(1)
  if (!row) throw new ApiError(404, 'not-found', 'The transfer was not found in this organisation.')
  if (row.status !== 'pending') throw new ApiError(409, 'conflict', 'The transfer is no longer pending.')
  await ctx.tx.update(ownershipTransfer).set({ status: 'cancelled' }).where(eq(ownershipTransfer.id, id))
  await recordAudit(ctx.tx, {
    action: 'ownership_transfer.cancelled',
    target: { type: 'ownership_transfer', id },
    before: { status: 'pending' },
    after: { status: 'cancelled' }
  })
}

export async function inspectMemberToken(linkToken: string, now: Date) {
  const owner = await lookupMemberToken(linkToken)
  if (!owner) throw new ApiError(404, 'not-found', 'The link was not found.')
  return { kind: owner.kind, state: tokenProblem(owner.status, owner.expiresAt, now) }
}

export async function acceptMemberToken(
  linkToken: string,
  principal: Principal,
  opts: {
    now: Date
    withTenant: WithTenant
    recordAudit: RecordAudit
    expectedKind?: 'invitation' | 'ownership_transfer'
    includeOrgSummary?: boolean
  }
) {
  if (principal.kind !== 'session' || principal.isGuest)
    throw new ApiError(401, 'unauthenticated', 'A signed-in human session is required.')
  const owner = await lookupMemberToken(linkToken)
  if (!owner) throw new ApiError(404, 'not-found', 'The link was not found.')
  if (opts.expectedKind && owner.kind !== opts.expectedKind)
    throw new ApiError(404, 'not-found', 'The link was not found.')
  return opts.withTenant({ orgId: owner.orgId, principal }, async (tx) => {
    await lockMemberWrites(tx)
    if (owner.kind === 'invitation') {
      const [row] = await tx
        .select()
        .from(invitation)
        .where(and(eq(invitation.id, owner.id), eq(invitation.organizationId, owner.orgId)))
        .limit(1)
      if (!row) throw new ApiError(404, 'not-found', 'The invitation was not found.')
      const state = tokenProblem(row.status, row.expiresAt, opts.now)
      if (state !== 'valid') throwTokenProblem(state)
      const [person] = await tx
        .select({ email: user.email, verified: user.emailVerified })
        .from(user)
        .where(eq(user.id, principal.accountId))
        .limit(1)
      if (!person || !person.verified || normalEmail(person.email) !== normalEmail(row.email)) {
        throw new ApiError(
          403,
          'insufficient-scope',
          'Sign in with the verified email address this invitation was sent to.'
        )
      }
      const [existing] = await tx
        .select({ id: member.id })
        .from(member)
        .where(and(eq(member.organizationId, owner.orgId), eq(member.userId, principal.accountId)))
        .limit(1)
      if (existing) throw new ApiError(409, 'conflict', 'This account is already a member.')
      const createdId = await insertMember(tx, {
        userId: principal.accountId,
        role: row.role ?? 'viewer',
        createdAt: opts.now
      })
      const [created] = await tx.select().from(member).where(eq(member.id, createdId)).limit(1)
      if (!created) throw new Error('The member insert did not return its row.')
      await updateInvitationStatus(tx, row.id, 'accepted')
      await opts.recordAudit(tx, {
        action: 'invite.accepted',
        target: { type: 'invitation', id: row.id },
        before: { status: 'pending' },
        after: { status: 'accepted', role: row.role ?? 'viewer' }
      })
      const summary = {
        id: created.id,
        org_id: created.organizationId,
        account_id: created.userId,
        role: created.role as Role,
        reads_malay: created.readsMalay
      }
      if (opts.includeOrgSummary) {
        const [org] = await tx
          .select({ name: organization.name, slug: organization.slug })
          .from(organization)
          .where(eq(organization.id, owner.orgId))
          .limit(1)
        if (!org) throw new ApiError(404, 'not-found', 'The organisation was not found.')
        return { ...summary, org_name: org.name, org_slug: org.slug }
      }
      return summary
    }

    const [row] = await tx
      .select()
      .from(ownershipTransfer)
      .where(and(eq(ownershipTransfer.id, owner.id), eq(ownershipTransfer.orgId, owner.orgId)))
      .limit(1)
    if (!row) throw new ApiError(404, 'not-found', 'The transfer was not found.')
    const state = tokenProblem(row.status, row.expiresAt, opts.now)
    if (state !== 'valid') throwTokenProblem(state)
    const [target] = await tx
      .select()
      .from(member)
      .where(and(eq(member.id, row.toMemberId), eq(member.organizationId, owner.orgId)))
      .limit(1)
    if (!target || target.userId !== principal.accountId)
      throw new ApiError(403, 'insufficient-scope', 'Only the member named by this transfer can accept it.')
    const [from] = await tx
      .select()
      .from(member)
      .where(and(eq(member.id, row.fromMemberId), eq(member.organizationId, owner.orgId)))
      .limit(1)
    if (!from || from.role !== 'owner')
      throw new ApiError(409, 'conflict', 'The requesting Owner is no longer an Owner.')
    await updateMemberRow(tx, { id: from.id, role: 'admin' })
    await updateMemberRow(tx, { id: target.id, role: 'owner' })
    await tx.update(ownershipTransfer).set({ status: 'accepted' }).where(eq(ownershipTransfer.id, row.id))
    await opts.recordAudit(tx, {
      action: 'ownership_transfer.accepted',
      target: { type: 'ownership_transfer', id: row.id },
      before: { status: 'pending' },
      after: { status: 'accepted', to_member_id: target.id }
    })
    return { id: row.id, to_member_id: row.toMemberId, status: 'accepted' }
  })
}
