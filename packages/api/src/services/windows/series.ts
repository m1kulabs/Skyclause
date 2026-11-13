import {
  createNativeWindowSeries,
  getProjectRecord,
  resolveWindowLocalSpan,
  windowLocalSpan,
  WindowLocalTimeError,
  track,
  type NativeWindowDefinition,
  type WindowMutationInsert
} from '@skyclause/db'
import type { ServiceContext } from '../../tenancy'
import { ApiError } from '../../problems'
import type { LocalSpan, NativeRule } from './calendar-types'
import { expandWeeklyDates, validateRecurrence } from './recurrence'
import { invalidField, invalidWindow, validateFields } from './fields'
import {
  createOperation,
  consumeWindowBudget,
  currentWindowView,
  declarer,
  openProject,
  parseInput,
  type WindowBody,
  type WindowView,
  type WindowsAccess
} from './shared'

export const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
export const dayDifference = (to: string, from: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000
const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
/** The stored rule is caller-visible local recurrence; translate it only when an implicit date shift moves it. */
export function shiftRule(rule: NativeRule, days: number): NativeRule {
  return {
    ...rule,
    days_of_week: rule.days_of_week.map((day) => weekdays[(((weekdays.indexOf(day) + days) % 7) + 7) % 7]!),
    ...(rule.until === undefined ? {} : { until: addDays(rule.until, days) }),
    skip_dates: rule.skip_dates.map((date) => addDays(date, days))
  }
}
export async function resolveSpan(ctx: ServiceContext, span: LocalSpan) {
  try {
    return await resolveWindowLocalSpan(ctx.tx, span)
  } catch (error) {
    if (error instanceof WindowLocalTimeError)
      throw invalidField('/starts_at', 'The local time does not exist in this time zone.')
    throw error
  }
}
export function parseRule(value: unknown): NativeRule {
  return parseInput(createOperation.request.body.content['application/json'].schema.shape.recurrence.unwrap(), value)
}

/** Original anchor/count are retained across every expansion; skips and tombstones never get replacements. */
export async function materializeNative(
  ctx: ServiceContext,
  input: {
    definition: NativeWindowDefinition
    rule: NativeRule
    localStart: string
    localEnd: string
    projectId: string
  },
  now: Date
): Promise<WindowMutationInsert[]> {
  const { definition: template, rule, localStart, localEnd, projectId } = input
  const effectiveAnchor = addDays(template.anchor, template.dateOffsetDays)
  const issues = validateRecurrence(rule, effectiveAnchor)
  if (issues.length) throw invalidWindow(issues)
  const horizon = new Date(now.getTime() + 90 * 86400000)
  const localNow = await windowLocalSpan(ctx.tx, { startsAt: now, endsAt: horizon, tz: template.tz })
  const through = addDays(localNow.date, localNow.endDayOffset)
  const dates = expandWeeklyDates(rule, effectiveAnchor, through)
  const rows: WindowMutationInsert[] = []
  for (const effective of dates) {
    const date = addDays(effective, -template.dateOffsetDays)
    if (effective < localNow.date) continue
    const span = await resolveSpan(ctx, {
      date: effective,
      start: localStart,
      end: localEnd,
      endDayOffset: template.endDayOffset,
      tz: template.tz
    })
    if (span.startsAt < now || span.startsAt > horizon) continue
    await validateFields(
      ctx,
      {
        starts_at: span.startsAt.toISOString(),
        ends_at: span.endsAt.toISOString(),
        kind: template.kind,
        tz: template.tz
      },
      now
    )
    rows.push({
      projectId,
      title: template.title,
      kind: template.kind,
      tz: template.tz,
      ...template.provenance,
      ...span,
      seriesOccurrenceDate: date
    })
  }
  return rows
}

export async function createWindowSeries(
  ctx: ServiceContext,
  input: { projectId: string; body: WindowBody },
  access: WindowsAccess
): Promise<WindowView> {
  await openProject(ctx, input.projectId, 'window.declare', access)
  const provenance = declarer(ctx.principal)
  const body = parseInput(createOperation.request.body.content['application/json'].schema, input.body)
  if (!body.recurrence) throw invalidField('/recurrence', 'Provide a recurrence for this series.')
  await validateFields(ctx, body, access.now)
  const span = await windowLocalSpan(ctx.tx, {
    startsAt: new Date(body.starts_at),
    endsAt: new Date(body.ends_at),
    tz: body.tz
  })
  const definition: NativeWindowDefinition = {
    version: 1,
    source: 'native',
    anchor: span.date,
    dateOffsetDays: 0,
    endDayOffset: span.endDayOffset,
    title: body.title,
    kind: body.kind,
    tz: body.tz,
    provenance: { ...provenance, shareLinkId: null, guest: false }
  }
  const occurrences = await materializeNative(
    ctx,
    { projectId: input.projectId, definition, rule: body.recurrence, localStart: span.start, localEnd: span.end },
    access.now
  )
  if (!occurrences.length)
    throw invalidField('/recurrence', 'The recurrence has no occurrences in the allowed horizon.')
  const project = await getProjectRecord(ctx.tx, input.projectId)
  if (!project) throw new ApiError(404, 'not-found', 'The project is unavailable.')
  const horizon = await windowLocalSpan(ctx.tx, {
    startsAt: access.now,
    endsAt: new Date(access.now.getTime() + 90 * 86400000),
    tz: project.project.timeZone
  })
  const rows = await createNativeWindowSeries(
    ctx.tx,
    {
      projectId: input.projectId,
      rule: body.recurrence,
      definition,
      localStart: span.start,
      localEnd: span.end,
      occurrences,
      checkedOn: horizon.date,
      materialisedUntil: addDays(horizon.date, horizon.endDayOffset),
      now: access.now
    },
    async () => {
      for (let i = 0; i < occurrences.length; i++) await consumeWindowBudget(ctx, access)
    }
  )
  const first = rows.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id))[0]!
  await track(
    ctx.tx,
    'window_declared',
    { via: provenance.via === 'app' ? 'form' : provenance.via, recurring: true },
    { projectId: input.projectId }
  )
  return { ...(await currentWindowView(ctx, first)), recurrence: body.recurrence }
}
