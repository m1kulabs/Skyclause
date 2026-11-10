import type { TxHandle } from '@skyclause/contracts'
import { and, countDistinct, desc, eq, inArray, isNotNull } from 'drizzle-orm'
import type { Tx } from '../client'
import { bundle, call, member, night, notice, project, projectChannel, source, subscriber, window } from '../schema'

// #152 c-notice-templates: `project_channel` (#79 §3), the notice counts behind LOC-4, and what a preview of the
// latest sent call needs beyond the call row.

export type RecipientsByLanguage = (tx: TxHandle, callId: string) => Promise<Record<'en' | 'ms', number>>
export type ProjectChannelKind = (typeof projectChannel.$inferSelect)['channel']

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * LOC-4: a call's recipients by language. Once approved, each subscriber of its `call` notices counts once across
 * channels, in the language its notice was queued in, which is after any LOC-5 fallback to English. Before that
 * (no notice rows yet), its candidates count by the language each subscriber picked, or all as English when the call
 * has no Malay notice, since it then goes in English (TRD, LOC-5).
 */
export const recipientsByLanguage: RecipientsByLanguage = async (handle, callId) => {
  const tx = handle as Tx
  const tally = (rows: Array<{ language: string; n: number }>) => {
    const n = (language: string) => rows.find((row) => row.language === language)?.n ?? 0
    return { en: n('en'), ms: n('ms') }
  }
  const queued = await tx
    .select({ language: notice.language, n: countDistinct(notice.subscriberId) })
    .from(notice)
    .where(and(eq(notice.callId, callId), eq(notice.kind, 'call'), isNotNull(notice.subscriberId)))
    .groupBy(notice.language)
  if (queued.length) return tally(queued)

  const [drafted] = await tx
    .select({ notices: call.notices, recipients: call.recipients })
    .from(call)
    .where(eq(call.id, callId))
  // `recipients` is the model's text list of subscriber IDs: one that isn't a UUID names no subscriber.
  const ids = (drafted?.recipients ?? []).filter((id) => UUID.test(id))
  if (!ids.length) return { en: 0, ms: 0 }
  const candidates = await tx
    .select({ language: subscriber.language, n: countDistinct(subscriber.id) })
    .from(subscriber)
    .where(inArray(subscriber.id, ids))
    .groupBy(subscriber.language)
  const malay = (drafted!.notices as Array<{ language: string }>).some((n) => n.language === 'ms')
  if (malay) return tally(candidates)
  return { en: candidates.reduce((sum, row) => sum + row.n, 0), ms: 0 }
}

/** The project's ID and name, or null when the transaction can't see it (another organisation's, or none). */
export async function channelProject(handle: TxHandle, projectId: string) {
  if (!UUID.test(projectId)) return null
  const [row] = await (handle as Tx)
    .select({ id: project.id, name: project.name })
    .from(project)
    .where(eq(project.id, projectId))
  return row ?? null
}

export function listProjectChannels(handle: TxHandle, projectId: string) {
  return (handle as Tx)
    .select({ channel: projectChannel.channel, enabled: projectChannel.enabled })
    .from(projectChannel)
    .where(eq(projectChannel.projectId, projectId))
}

/** Switches a channel on or off; `before` is null when the project had no row for it. */
export async function setProjectChannel(
  handle: TxHandle,
  c: { projectId: string; channel: ProjectChannelKind; enabled: boolean }
): Promise<{ before: boolean | null; after: boolean }> {
  const tx = handle as Tx
  const [existing] = await tx
    .select({ enabled: projectChannel.enabled })
    .from(projectChannel)
    .where(and(eq(projectChannel.projectId, c.projectId), eq(projectChannel.channel, c.channel)))
    .for('update')
  await tx
    .insert(projectChannel)
    .values({ orgId: tx.orgId!, projectId: c.projectId, channel: c.channel, enabled: c.enabled })
    .onConflictDoUpdate({
      target: [projectChannel.projectId, projectChannel.channel],
      set: { enabled: c.enabled, updatedAt: new Date() }
    })
  return { before: existing?.enabled ?? null, after: c.enabled }
}

type CallRow = typeof call.$inferSelect

/** The source IDs a call's shadow verdict cites, from its clauses' inputs. */
export function citedSourceIds(shadow: unknown): string[] {
  const clauses = (shadow as { clauses?: Array<{ inputs?: Array<{ source_ids?: string[] }> }> } | null)?.clauses ?? []
  return [...new Set(clauses.flatMap((c) => c.inputs ?? []).flatMap((i) => i.source_ids ?? []))].filter((id) =>
    UUID.test(id)
  )
}

/**
 * NTC-7: the project's newest sent call (by `sent_at`) of the pack and mode, with its bundle's pack, its window's
 * or night's span, its approver's current role in the organisation (null if no longer a member) and the sources it
 * cites; null when none was sent.
 */
export async function latestSentCall(
  handle: TxHandle,
  q: { projectId: string; pack?: 'sky' | 'crowd'; mode?: CallRow['mode'] }
): Promise<{
  call: CallRow
  pack: 'sky' | 'crowd'
  window: { startsAt: Date; endsAt: Date } | null
  approverRole: string | null
  sources: Array<{ name: string; licence: string }>
} | null> {
  const tx = handle as Tx
  const [row] = await tx
    .select({
      call,
      pack: bundle.pack,
      approvedBy: bundle.approvedBy,
      window: { startsAt: window.startsAt, endsAt: window.endsAt },
      night: { startsAt: night.arrivalStart, endsAt: night.exitEnd }
    })
    .from(call)
    .innerJoin(bundle, eq(bundle.id, call.bundleId))
    .leftJoin(window, eq(window.id, call.windowId))
    .leftJoin(night, eq(night.id, call.nightId))
    .where(
      and(
        eq(call.projectId, q.projectId),
        eq(call.state, 'sent'),
        q.pack ? eq(bundle.pack, q.pack) : undefined,
        q.mode ? eq(call.mode, q.mode) : undefined
      )
    )
    .orderBy(desc(call.sentAt))
    .limit(1)
  if (!row) return null
  const [approver] = row.approvedBy
    ? await tx
        .select({ role: member.role })
        .from(member)
        .where(and(eq(member.organizationId, tx.orgId!), eq(member.userId, row.approvedBy)))
    : []
  const ids = citedSourceIds(row.call.shadow)
  const sources = ids.length
    ? await tx
        .select({ name: source.name, licence: source.licenceLabel })
        .from(source)
        .where(inArray(source.id, ids))
        .orderBy(source.name)
    : []
  const span = row.window?.startsAt ? row.window : row.night?.startsAt && row.night.endsAt ? row.night : null
  return {
    call: row.call,
    pack: row.pack,
    window: span ? { startsAt: span.startsAt!, endsAt: span.endsAt! } : null,
    approverRole: approver?.role ?? null,
    sources
  }
}

/** The member's `reads_malay` flag in the transaction's organisation (LOC-5); false for a non-member. */
export async function memberReadsMalay(handle: TxHandle, accountId: string) {
  const tx = handle as Tx
  const [row] = await tx
    .select({ readsMalay: member.readsMalay })
    .from(member)
    .where(and(eq(member.organizationId, tx.orgId!), eq(member.userId, accountId)))
  return row?.readsMalay ?? false
}
