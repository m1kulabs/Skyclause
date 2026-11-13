import {
  getProjectRecord,
  mutateNativeWindowSeries,
  readWindowSeriesDefinition,
  recordNativeSeriesFailure,
  windowLocalSpan
} from '@skyclause/db'
import type { ServiceContext } from '../../tenancy'
import { consumeWindowBudget } from './shared'
import { addDays, materializeNative, parseRule } from './series'

/** Extend one persisted ordinary native declaration under its own parent and child locks. */
export async function extendDueWindowSeries(
  ctx: ServiceContext,
  input: { projectId: string; seriesId: string; now: Date }
) {
  return mutateNativeWindowSeries(
    ctx.tx,
    input,
    async ({ series, members }, tx) => {
      const project = await getProjectRecord(tx, input.projectId)
      if (!project) throw new Error('Project unavailable')
      const definition = readWindowSeriesDefinition(series)
      if (
        definition.source !== 'native' ||
        members.some(
          (row) =>
            !row.seriesOccurrenceDate || row.guest || row.shareLinkId || row.via === 'guest' || row.via === 'share'
        )
      )
        throw new Error('Native series identity unavailable')
      const span = await windowLocalSpan(tx, {
        startsAt: input.now,
        endsAt: new Date(input.now.getTime() + 90 * 86400000),
        tz: project.project.timeZone
      })
      const materialisedUntil = addDays(span.date, span.endDayOffset)
      if (series.checkedOn !== null && series.checkedOn >= span.date)
        return { creates: [], checkedOn: span.date, materialisedUntil }
      const existing = new Set(members.map((row) => row.seriesOccurrenceDate))
      const candidates = await materializeNative(
        { ...ctx, tx },
        {
          projectId: input.projectId,
          definition,
          rule: parseRule(series.rule),
          localStart: series.localStart,
          localEnd: series.localEnd
        },
        input.now
      )
      return {
        creates: candidates
          .filter((row) => !existing.has(row.seriesOccurrenceDate ?? null))
          .map((row) => ({ ...row, seriesId: series.id })),
        checkedOn: span.date,
        materialisedUntil
      }
    },
    async (creates, tx) => {
      for (let i = 0; i < Math.max(1, creates.length); i++)
        await consumeWindowBudget({ ...ctx, tx }, { now: input.now })
    }
  )
}

export async function recordNativeWindowFailure(
  ctx: ServiceContext,
  input: { projectId: string; seriesId: string; now: Date }
) {
  return recordNativeSeriesFailure(ctx.tx, input)
}
