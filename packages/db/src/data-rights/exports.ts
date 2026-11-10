import { AccountNotFoundError, ExportPendingError, ExportAlreadyRunningError } from './errors'
import { and, desc, eq, inArray, lte, sql } from 'drizzle-orm'
import { track } from '../analytics'
import { withRetention, withSystem, withTenant, systemPrincipal } from '../client'
import {
  account,
  aiKey,
  apikey,
  auditEvent,
  bundle,
  call,
  clause,
  clauseSheet,
  consentRecord,
  exportJob,
  grade,
  ledgerEntry,
  member,
  notice,
  notificationPreference,
  organization,
  passkey,
  project,
  projectChannel,
  projectPack,
  projectSource,
  reviewItem,
  session,
  sheetVersion,
  subscriber,
  suppression,
  user,
  window
} from '../schema'

export type ExportScope = 'account' | 'organisation'
export type ExportFormat = 'json' | 'csv'
export type ExportJobRow = typeof exportJob.$inferSelect

export interface CreateExportJobInput {
  scope: ExportScope
  orgId: string | null
  accountId: string
  formats: ExportFormat[]
  now: Date
}

const ACTIVE = ['queued', 'running'] as const
const DAY_MS = 24 * 60 * 60 * 1000

function causeCode(error: unknown) {
  if (!error || typeof error !== 'object') return undefined
  const cause = (error as { cause?: unknown }).cause
  return (
    (cause && typeof cause === 'object' ? (cause as { code?: string }).code : undefined) ??
    (error as { code?: string }).code
  )
}

/** Creates one S row and records the matching analytics event; the partial unique indexes settle concurrent requests. */
export async function createExportJob(input: CreateExportJobInput): Promise<ExportJobRow> {
  try {
    return await withSystem('api:export', async (tx) => {
      if (input.scope === 'account') {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${'a-data-rights:account:' + input.accountId}, 0))`
        )
        const [owner] = await tx
          .select({ id: user.id, deletedAt: user.deletedAt })
          .from(user)
          .where(eq(user.id, input.accountId))
          .limit(1)
        if (!owner || owner.deletedAt) throw new AccountNotFoundError()
      }
      await tx
        .update(exportJob)
        .set({ status: 'failed', error: 'Export did not finish within 24 hours.', updatedAt: input.now })
        .where(
          and(inArray(exportJob.status, [...ACTIVE]), lte(exportJob.createdAt, new Date(input.now.getTime() - DAY_MS)))
        )
      const scope =
        input.scope === 'account' ? eq(exportJob.accountId, input.accountId) : eq(exportJob.orgId, input.orgId!)
      const [active] = await tx
        .select({ id: exportJob.id })
        .from(exportJob)
        .where(and(eq(exportJob.scope, input.scope), scope, inArray(exportJob.status, [...ACTIVE])))
        .limit(1)
      if (active) throw new ExportPendingError()
      const [row] = await tx
        .insert(exportJob)
        .values({
          scope: input.scope,
          orgId: input.scope === 'organisation' ? input.orgId : null,
          accountId: input.accountId,
          formats: input.formats,
          status: 'queued',
          createdAt: input.now,
          updatedAt: input.now
        })
        .returning()
      await track(tx, 'export_requested', { scope: input.scope })
      return row!
    })
  } catch (error) {
    if (error instanceof ExportPendingError || causeCode(error) === '23505') throw new ExportPendingError()
    throw error
  }
}

export async function listExportJobs(input: { scope: ExportScope; id: string; limit: number; offset: number }) {
  return withSystem('api:export-list', (tx) =>
    tx
      .select()
      .from(exportJob)
      .where(
        and(
          eq(exportJob.scope, input.scope),
          input.scope === 'account' ? eq(exportJob.accountId, input.id) : eq(exportJob.orgId, input.id)
        )
      )
      .orderBy(desc(exportJob.createdAt))
      .limit(input.limit)
      .offset(input.offset)
  )
}

export async function getExportJob(id: string) {
  return withSystem('api:export-download', async (tx) => {
    const [row] = await tx.select().from(exportJob).where(eq(exportJob.id, id)).limit(1)
    return row ?? null
  })
}

/** Marks the initial Cloud Tasks enqueue failure as terminal, so the next request can retry the scope. */
export async function failExportEnqueue(id: string, error: string, now = new Date()) {
  return withSystem('api:export-enqueue', async (tx) => {
    const [row] = await tx
      .update(exportJob)
      .set({ status: 'failed', error, updatedAt: now })
      .where(and(eq(exportJob.id, id), inArray(exportJob.status, [...ACTIVE])))
      .returning()
    return row ?? null
  })
}

/** Claims a Cloud Task, reopening a stale running lease after a retry and enforcing the 24-hour deadline. */
export async function startExportJob(id: string, now: Date): Promise<ExportJobRow | null> {
  return withSystem('worker:export', async (tx) => {
    const [job] = await tx.select().from(exportJob).where(eq(exportJob.id, id)).for('update').limit(1)
    if (!job || job.status === 'failed') return null
    if (job.status === 'ready') return job
    if (job.createdAt.getTime() + DAY_MS <= now.getTime()) {
      const [failed] = await tx
        .update(exportJob)
        .set({ status: 'failed', error: job.error ?? 'Export did not finish within 24 hours.', updatedAt: now })
        .where(eq(exportJob.id, id))
        .returning()
      return failed ?? null
    }
    if (job.status === 'running' && job.updatedAt.getTime() > now.getTime() - 5 * 60 * 1000) {
      throw new ExportAlreadyRunningError()
    }
    const [running] = await tx
      .update(exportJob)
      .set({ status: 'running', updatedAt: now })
      .where(eq(exportJob.id, id))
      .returning()
    return running ?? null
  })
}

/** Stores the latest task error and marks the job failed only after its 24-hour deadline. */
export async function recordExportFailure(id: string, error: string, now: Date) {
  return withSystem('worker:export', async (tx) => {
    const [job] = await tx.select().from(exportJob).where(eq(exportJob.id, id)).limit(1)
    if (!job || job.status === 'ready' || job.status === 'failed') return job ?? null
    const expired = job.createdAt.getTime() + DAY_MS <= now.getTime()
    const [updated] = await tx
      .update(exportJob)
      .set({ status: expired ? 'failed' : job.status, error, updatedAt: now })
      .where(eq(exportJob.id, id))
      .returning()
    return updated ?? null
  })
}

/** A 15-minute worker sweep makes tasks that never complete terminal after 24 hours. */
export async function failStaleExports(now: Date) {
  return withSystem('worker:export-timeout', async (tx) => {
    const stale = await tx
      .select({ id: exportJob.id, error: exportJob.error })
      .from(exportJob)
      .where(and(inArray(exportJob.status, [...ACTIVE]), lte(exportJob.createdAt, new Date(now.getTime() - DAY_MS))))
    let failed = 0
    for (const job of stale) {
      const [updated] = await tx
        .update(exportJob)
        .set({ status: 'failed', error: job.error ?? 'Export did not finish within 24 hours.', updatedAt: now })
        .where(and(eq(exportJob.id, job.id), inArray(exportJob.status, [...ACTIVE])))
        .returning({ id: exportJob.id })
      failed += updated ? 1 : 0
    }
    return failed
  })
}

/** Commits the ZIP path, seven-day expiry and its single export_ready outbox row together. */
export async function completeExportJob(id: string, objectPath: string, generatedAt: Date) {
  return withSystem('worker:export', async (tx) => {
    const [current] = await tx
      .select({ scope: exportJob.scope, accountId: exportJob.accountId })
      .from(exportJob)
      .where(eq(exportJob.id, id))
      .limit(1)
    if (!current) return null
    if (current.scope === 'account' && current.accountId) {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${'a-data-rights:account:' + current.accountId}, 0))`
      )
    }
    const [job] = await tx
      .update(exportJob)
      .set({
        status: 'ready',
        objectPath,
        expiresAt: new Date(generatedAt.getTime() + 7 * DAY_MS),
        error: null,
        updatedAt: generatedAt
      })
      .where(and(eq(exportJob.id, id), inArray(exportJob.status, [...ACTIVE])))
      .returning()
    if (!job) return null
    await tx
      .insert(notice)
      .values({
        orgId: job.orgId,
        projectId: null,
        kind: 'export_ready',
        channel: 'email',
        idempotencyKey: `export-ready:${job.id}`,
        accountId: job.accountId,
        language: 'en',
        status: 'queued',
        createdAt: generatedAt,
        updatedAt: generatedAt
      })
      .onConflictDoNothing({ target: notice.idempotencyKey })
    return job
  })
}

export async function loadExportDelivery(id: string) {
  return withRetention('worker:export-mail', async (tx) => {
    const [job] = await tx.select().from(exportJob).where(eq(exportJob.id, id)).limit(1)
    if (!job || job.status !== 'ready') return null
    const [recipient] = await tx
      .select({ email: user.email, deletedAt: user.deletedAt })
      .from(user)
      .where(eq(user.id, job.accountId!))
      .limit(1)
    const [noticeRow] = await tx
      .select()
      .from(notice)
      .where(eq(notice.idempotencyKey, `export-ready:${job.id}`))
      .limit(1)
    if (
      !recipient ||
      recipient.deletedAt ||
      !noticeRow ||
      noticeRow.acceptedAt ||
      !['queued', 'failed'].includes(noticeRow.status)
    )
      return null
    return { job, notice: noticeRow, email: recipient.email }
  })
}

export async function recordExportNoticeSent(jobId: string, providerMessageId: string, now: Date) {
  return withSystem('worker:export-mail', async (tx) => {
    await tx
      .update(notice)
      .set({ status: 'sent', providerMessageId, acceptedAt: now, updatedAt: now })
      .where(eq(notice.idempotencyKey, `export-ready:${jobId}`))
  })
}

export async function recordExportNoticeFailure(jobId: string, now: Date) {
  return withSystem('worker:export-mail', async (tx) => {
    await tx
      .update(notice)
      .set({ status: 'failed', updatedAt: now })
      .where(eq(notice.idempotencyKey, `export-ready:${jobId}`))
  })
}

export async function readOrganisationExport(orgId: string) {
  return withTenant({ orgId, principal: systemPrincipal('a-data-rights:export') }, async (tx) => {
    const projects = await tx.select().from(project)
    const projectPacks = await tx.select().from(projectPack)
    const projectChannels = await tx.select().from(projectChannel)
    const projectSources = await tx.select().from(projectSource)
    const windows = await tx.select().from(window)
    const clauseSheets = await tx.select().from(clauseSheet)
    const clauseVersions = await tx.select().from(sheetVersion)
    const clauses = await tx.select().from(clause)
    const calls = await tx.select().from(call)
    const bundles = await tx.select().from(bundle)
    const ledger = await tx.select().from(ledgerEntry)
    const grades = await tx.select().from(grade)
    const reviewItems = await tx.select().from(reviewItem)
    const subscribers = await tx.select().from(subscriber)
    const consents = await tx.select().from(consentRecord)
    const suppressions = await tx.select().from(suppression)
    const audit = await tx.select().from(auditEvent)
    return {
      projects,
      projectPacks,
      projectChannels,
      projectSources,
      windows,
      clauseSheets,
      clauseVersions,
      clauses,
      calls,
      bundles,
      ledger,
      grades,
      reviewItems,
      subscribers,
      consents,
      suppressions,
      audit
    }
  })
}

/** Explicit projections keep authentication secrets and encrypted AI keys out of account archives. */
export async function readAccountExport(accountId: string) {
  return withRetention('worker:account-export', async (tx) => {
    const [profile] = await tx
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        preferences: user.preferences,
        magicLinkEnabled: user.magicLinkEnabled,
        createdAt: user.createdAt,
        deletedAt: user.deletedAt,
        lastActiveAt: user.lastActiveAt
      })
      .from(user)
      .where(eq(user.id, accountId))
      .limit(1)
    if (!profile || profile.deletedAt) throw new AccountNotFoundError()
    const memberships = await tx
      .select({
        orgId: member.organizationId,
        orgName: organization.name,
        orgSlug: organization.slug,
        role: member.role,
        readsMalay: member.readsMalay,
        createdAt: member.createdAt
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(eq(member.userId, accountId))
    const signInMethods = await tx
      .select({ providerId: account.providerId, createdAt: account.createdAt })
      .from(account)
      .where(eq(account.userId, accountId))
    const passkeys = await tx
      .select({ name: passkey.name, createdAt: passkey.createdAt })
      .from(passkey)
      .where(eq(passkey.userId, accountId))
    const sessionDevices = await tx
      .select({
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        activeOrganizationId: session.activeOrganizationId
      })
      .from(session)
      .where(eq(session.userId, accountId))
    const apiKeys = await tx
      .select({
        id: apikey.id,
        name: apikey.name,
        start: apikey.start,
        prefix: apikey.prefix,
        enabled: apikey.enabled,
        permissions: apikey.permissions,
        createdAt: apikey.createdAt,
        expiresAt: apikey.expiresAt,
        lastRequest: apikey.lastRequest,
        rateLimitEnabled: apikey.rateLimitEnabled,
        rateLimitTimeWindow: apikey.rateLimitTimeWindow,
        rateLimitMax: apikey.rateLimitMax
      })
      .from(apikey)
      .where(eq(apikey.referenceId, accountId))
    const aiKeys = await tx
      .select({
        orgId: aiKey.orgId,
        id: aiKey.id,
        provider: aiKey.provider,
        model: aiKey.model,
        last4: aiKey.last4,
        fingerprint: aiKey.fingerprint,
        declaredTier: aiKey.declaredTier,
        enabled: aiKey.enabled,
        createdAt: aiKey.createdAt,
        updatedAt: aiKey.updatedAt
      })
      .from(aiKey)
      .where(and(eq(aiKey.ownerType, 'account'), eq(aiKey.accountId, accountId)))
    const notificationPreferences = await tx
      .select({
        orgId: notificationPreference.orgId,
        kind: notificationPreference.kind,
        enabled: notificationPreference.enabled
      })
      .from(notificationPreference)
      .where(eq(notificationPreference.accountId, accountId))
    const audit = await tx.select().from(auditEvent).where(eq(auditEvent.actorId, accountId))
    return {
      profile,
      memberships,
      signInMethods,
      passkeys,
      sessionDevices,
      apiKeys,
      aiKeys,
      notificationPreferences,
      audit
    }
  })
}

/** Used by purge after an object prefix has been cleared; callers log the returned rows by table. */
export async function removeExportJobsForOrganisation(orgId: string) {
  return withSystem('retention:org-purge', async (tx) => {
    const rows = await tx.delete(exportJob).where(eq(exportJob.orgId, orgId)).returning({ id: exportJob.id })
    return rows.length
  })
}
