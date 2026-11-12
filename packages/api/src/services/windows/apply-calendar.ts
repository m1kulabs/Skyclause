import { z } from 'zod'
import { UnsafeUrlError } from '@skyclause/config/net'
import {
  allocateCalendarIds,
  getProjectRecord,
  mutateIcsFeed,
  nextWindowLocalDate,
  readWindowSeriesDefinition,
  resolveWindowLocalSpan,
  windowLocalSpan,
  recordIcsFeedError,
  WindowStateConflict,
  type IcsFeedPlan,
  type WindowMutationInsert,
  type WindowSeriesRow
} from '@skyclause/db'
import type { ServiceContext } from '../../tenancy'
import { ApiError } from '../../problems'
import { applyCalendarDefaults, planCalendarDiff } from './calendar-diff'
import { expandCalendar, parseCalendar, CalendarParseError } from './parse-ics'
import { validateFields } from './fields'
import { consumeWindowBudget, type WindowsAccess } from './shared'
import { addDays } from './series'
import type { CalendarDocument, CalendarOptions } from './calendar-types'
import { CalendarDecodeError, CalendarHttpError, type FetchResult } from './fetch-ics'

const provenance = z
  .object({ version: z.literal(1), declaredBy: z.string().min(1), via: z.enum(['app', 'api', 'cli', 'mcp']) })
  .strict()
const importedRule = z.object({ version: z.literal(1), source: z.literal('ics'), uid: z.string().min(1) }).strict()
const unavailable = () => new ApiError(409, 'conflict', 'The calendar source cannot be reconciled.')
export class MissingCalendarDocumentError extends Error {}

/** HTTP has already completed; parsing, local resolution and atomic apply use this tenant transaction. */
export async function applyCalendar(
  ctx: ServiceContext,
  input: { feedId: string; claimId?: string; result: FetchResult; now: Date; memberAccess?: WindowsAccess }
) {
  return mutateIcsFeed(
    ctx.tx,
    {
      feedId: input.feedId,
      claimId: input.claimId,
      now: input.now,
      ...(input.memberAccess
        ? {
            beforeApply: async (creates: readonly WindowMutationInsert[], tx: ServiceContext['tx']) => {
              for (const _ of creates) await consumeWindowBudget({ ...ctx, tx }, input.memberAccess!)
            }
          }
        : {})
    },
    async ({ feed, series, members }, tx) => {
      const planContext = { ...ctx, tx }
      const source = provenance.safeParse(feed.provenance)
      if (!source.success) throw unavailable()
      const project = await getProjectRecord(tx, feed.projectId)
      if (!project) throw unavailable()
      const through = new Date(input.now.getTime() + 90 * 86_400_000)
      const byUid = new Map<string, WindowSeriesRow>()
      let extraSourceDays = 0
      for (const row of series) {
        if (!row.icsUid || byUid.has(row.icsUid)) throw unavailable()
        const definition = readWindowSeriesDefinition(row)
        if (definition.source !== 'ics') throw unavailable()
        const rule = importedRule.safeParse(row.rule)
        if (!rule.success || rule.data.uid !== row.icsUid) throw unavailable()
        byUid.set(row.icsUid, row)
        const defaults = definition.manualDefaults
        if (
          !row.cancelledAt &&
          (defaults.dateOffsetDays !== undefined ||
            defaults.tz !== undefined ||
            defaults.localStart !== undefined ||
            defaults.localEnd !== undefined ||
            defaults.endDayOffset !== undefined)
        )
          extraSourceDays = Math.max(extraSourceDays, Math.max(0, -(defaults.dateOffsetDays ?? 0)) + 2)
      }
      const sourceThrough = new Date(through.getTime() + extraSourceDays * 86_400_000)
      if (!Number.isFinite(sourceThrough.getTime()) || sourceThrough.getUTCFullYear() > 9999) throw unavailable()
      const options: CalendarOptions = {
        projectTz: project.project.timeZone,
        kind: feed.kind,
        now: input.now,
        through,
        sourceThrough,
        resolveLocalSpan: (span) => resolveWindowLocalSpan(tx, span),
        transformOccurrence: (occurrence) => {
          const row = byUid.get(occurrence.uid)
          const definition = row ? readWindowSeriesDefinition(row) : null
          if (definition && definition.source !== 'ics') throw unavailable()
          const days = Math.max(0, definition?.manualDefaults.dateOffsetDays ?? 0) + 2
          if (occurrence.startsAt.getTime() < input.now.getTime() - days * 86_400_000)
            return Promise.resolve({ ...occurrence, kind: definition?.manualDefaults.kind ?? feed.kind })
          return applyCalendarDefaults(tx, occurrence, feed.kind, definition?.manualDefaults ?? {})
        }
      }
      let parsed
      try {
        parsed =
          input.result.status === 'changed'
            ? await parseCalendar(input.result.text, options)
            : feed.document
              ? await expandCalendar(feed.document as CalendarDocument, options)
              : null
      } catch (error) {
        if (error instanceof CalendarParseError)
          throw new ApiError(422, 'validation-failed', 'The calendar could not be imported.')
        throw error
      }
      if (!parsed) throw new MissingCalendarDocumentError('Calendar document unavailable.')
      const desired = []
      for (const occurrence of parsed.occurrences) {
        const row = byUid.get(occurrence.uid)
        const definition = row ? readWindowSeriesDefinition(row) : null
        if (definition && definition.source !== 'ics') throw unavailable()
        const effective = { ...occurrence, kind: definition?.manualDefaults.kind ?? feed.kind }
        await validateFields(
          planContext,
          {
            starts_at: effective.startsAt.toISOString(),
            ends_at: effective.endsAt.toISOString(),
            kind: effective.kind,
            tz: effective.tz
          },
          input.now
        )
        desired.push(effective)
      }
      const stopped = series.filter((row) => row.cancelledAt)
      const diff = planCalendarDiff({
        now: input.now,
        through,
        members: [...members],
        occurrences: desired,
        protectedIdentities: parsed.protectedIdentities,
        stoppedSeriesIds: stopped.map((row) => row.id),
        stoppedUids: stopped.flatMap((row) => (row.icsUid ? [row.icsUid] : []))
      })
      const firstByUid = new Map<string, (typeof diff.missing)[number]>()
      for (const occurrence of diff.missing)
        if (occurrence.recurring && !byUid.has(occurrence.uid) && !firstByUid.has(occurrence.uid))
          firstByUid.set(occurrence.uid, occurrence)
      const newSeriesUids = [...firstByUid.keys()].sort()
      const count = newSeriesUids.length + diff.missing.length
      const ids = count ? (await allocateCalendarIds(tx, count)).ids : []
      const seriesIds = new Map(newSeriesUids.map((uid, index) => [uid, ids[index]!]))
      const seriesCreates = []
      const horizonSpan = await windowLocalSpan(tx, {
        startsAt: input.now,
        endsAt: through,
        tz: project.project.timeZone
      })
      const materialisedUntil = addDays(horizonSpan.date, horizonSpan.endDayOffset)
      for (const uid of newSeriesUids) {
        const first = firstByUid.get(uid)!
        const local = await windowLocalSpan(tx, first)
        seriesCreates.push({
          id: seriesIds.get(uid)!,
          projectId: feed.projectId,
          icsFeedId: feed.id,
          icsUid: uid,
          rule: { version: 1, source: 'ics', uid },
          definition: { version: 1, source: 'ics', manualDefaults: {} },
          localStart: local.start,
          localEnd: local.end,
          checkedOn: horizonSpan.date,
          materialisedUntil,
          createdAt: input.now,
          updatedAt: input.now
        })
      }
      const changes: IcsFeedPlan['changes'] = diff.changes.map((change) => ({ ...change, now: input.now }))
      for (const [index, occurrence] of diff.missing.entries()) {
        const values: WindowMutationInsert = {
          id: ids[newSeriesUids.length + index]!,
          projectId: feed.projectId,
          icsFeedId: feed.id,
          icsUid: occurrence.uid,
          icsRecurrenceId: occurrence.recurrenceId,
          seriesId: occurrence.recurring
            ? (byUid.get(occurrence.uid)?.id ?? seriesIds.get(occurrence.uid) ?? null)
            : null,
          startsAt: occurrence.startsAt,
          endsAt: occurrence.endsAt,
          title: occurrence.title,
          tz: occurrence.tz,
          kind: occurrence.kind,
          declaredBy: source.data.declaredBy,
          via: source.data.via,
          guest: false,
          shareLinkId: null
        }
        changes.push({ kind: 'create', values, now: input.now })
      }
      const feedPatch: NonNullable<IcsFeedPlan['feedPatch']> = {
        document: parsed.document,
        skipped: parsed.skipped.map((issue) => ({ ...issue, detail: 'A calendar entry could not be imported.' })),
        refreshedAt: input.now,
        lastError: null,
        materialisedUntil,
        refreshClaim: null,
        ...(feed.url === null
          ? { nextRefreshAt: await nextWindowLocalDate(tx, { now: input.now, tz: project.project.timeZone }) }
          : {}),
        ...(input.result.status === 'changed'
          ? { etag: input.result.etag, lastModified: input.result.lastModified }
          : {})
      }
      const seriesUpdates = series
        .filter(
          (row) =>
            !row.cancelledAt && (row.checkedOn !== horizonSpan.date || row.materialisedUntil !== materialisedUntil)
        )
        .map((row) => ({ id: row.id, patch: { checkedOn: horizonSpan.date, materialisedUntil } }))
      return { seriesCreates, seriesUpdates, changes, feedPatch }
    }
  )
}

/** Persist a fixed code only; never persist or log an exception that may contain a capability URL. */
export async function recordCalendarFailure(
  ctx: ServiceContext,
  input: { feedId: string; claimId: string; now: Date; error: unknown }
) {
  const code =
    input.error instanceof UnsafeUrlError
      ? 'unsafe-url'
      : input.error instanceof MissingCalendarDocumentError
        ? 'missing-document'
        : input.error instanceof CalendarHttpError
          ? 'fetch-failed'
          : input.error instanceof WindowStateConflict ||
              (input.error instanceof ApiError && input.error.status === 409)
            ? 'unavailable'
            : input.error instanceof CalendarDecodeError ||
                input.error instanceof CalendarParseError ||
                input.error instanceof ApiError
              ? 'parse-failed'
              : 'fetch-failed'
  return recordIcsFeedError(ctx.tx, { feedId: input.feedId, claimId: input.claimId, now: input.now, code })
}
