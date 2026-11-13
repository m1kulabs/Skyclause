import { isDeepStrictEqual } from 'node:util'
import {
  mutateWindowSet,
  readWindowSeriesDefinition,
  windowLocalSpan,
  WindowStateConflict,
  type ImportedWindowDefinition,
  type NativeWindowDefinition,
  type WindowChange,
  type WindowRow,
  type WindowSet,
  type WindowSetPlan
} from '@skyclause/db'
import type { ServiceContext } from '../../tenancy'
import { ApiError } from '../../problems'
import { invalidField, validateFields } from './fields'
import { addDays, dayDifference, materializeNative, parseRule, resolveSpan, shiftRule } from './series'
import { expandWeeklyDates } from './recurrence'
import {
  consumeWindowBudget,
  currentWindowView,
  openWindow,
  parseInput,
  updateOperation,
  type UpdateWindowBody,
  type WindowsAccess,
  type WindowScope,
  type WindowView
} from './shared'

type Patch = Extract<WindowChange, { kind: 'update' }>['patch']
const conflict = (detail: string) => new ApiError(409, 'conflict', detail)
const invalidScope = () =>
  new ApiError(422, 'validation-failed', 'This window has no series.', {
    errors: [{ in: 'query', pointer: '/scope', detail: 'Use occurrence scope for a non-series window.' }]
  })
const changedPatch = (row: WindowRow, patch: Patch): Patch =>
  Object.fromEntries(
    Object.entries(patch).filter(
      ([key, value]) => value !== undefined && !isDeepStrictEqual(row[key as keyof WindowRow], value)
    )
  )
const fields = (row: WindowRow, patch: Patch) => ({
  starts_at: (patch.startsAt ?? row.startsAt).toISOString(),
  ends_at: (patch.endsAt ?? row.endsAt).toISOString(),
  kind: patch.kind ?? row.kind,
  tz: patch.tz ?? row.tz
})

async function occurrencePlan(
  ctx: ServiceContext,
  row: WindowRow,
  body: UpdateWindowBody,
  access: WindowsAccess
): Promise<WindowSetPlan> {
  if (body.recurrence !== undefined)
    throw invalidField('/recurrence', 'Recurrence can only be changed with series scope.')
  const patch = changedPatch(row, {
    title: body.title,
    kind: body.kind,
    tz: body.tz,
    startsAt: body.starts_at === undefined ? undefined : new Date(body.starts_at),
    endsAt: body.ends_at === undefined ? undefined : new Date(body.ends_at)
  })
  const timeChanged = patch.startsAt !== undefined || patch.endsAt !== undefined
  if (timeChanged && row.startsAt < access.now)
    throw invalidField('/starts_at', 'A started occurrence cannot be retimed.')
  await validateFields(
    ctx,
    {
      ...fields(row, patch),
      starts_at: body.starts_at ?? row.startsAt.toISOString(),
      ends_at: body.ends_at ?? row.endsAt.toISOString()
    },
    access.now,
    timeChanged
  )
  return {
    changes: Object.keys(patch).length
      ? [
          {
            kind: 'update',
            id: row.id,
            patch: { ...patch, ...(row.seriesId || row.icsFeedId ? { localOverride: true } : {}) },
            now: access.now
          }
        ]
      : []
  }
}

/** Only explicit series fields replace occurrence overrides. An unprovided endpoint retains its effective value. */
async function memberPatch(
  ctx: ServiceContext,
  row: WindowRow,
  body: UpdateWindowBody,
  clocks: {
    localStart: string
    localEnd: string
    dateOffsetDays: number
    endDayOffset: number
    sourceDateShift: number
  },
  access: WindowsAccess
): Promise<Patch> {
  let startsAt = row.startsAt
  let endsAt = row.endsAt
  const zone = body.tz ?? row.tz
  const previous = await windowLocalSpan(ctx.tx, row)
  if (body.tz !== undefined && body.tz !== row.tz) {
    const resolved = await resolveSpan(ctx, { ...previous, tz: zone })
    startsAt = resolved.startsAt
    endsAt = resolved.endsAt
  }
  const originalDate = row.seriesOccurrenceDate ?? previous.date
  if (body.starts_at !== undefined || body.ends_at !== undefined) {
    const date = addDays(originalDate, row.icsFeedId ? clocks.sourceDateShift : clocks.dateOffsetDays)
    const resolved = await resolveSpan(ctx, {
      date,
      start: clocks.localStart,
      end: clocks.localEnd,
      endDayOffset: clocks.endDayOffset,
      tz: zone
    })
    if (body.starts_at !== undefined) startsAt = resolved.startsAt
    if (body.ends_at !== undefined) endsAt = resolved.endsAt
  }
  const patch = changedPatch(row, { title: body.title, kind: body.kind, tz: body.tz, startsAt, endsAt })
  await validateFields(ctx, fields(row, patch), access.now, patch.startsAt !== undefined || patch.endsAt !== undefined)
  return patch
}

async function seriesPlan(
  ctx: ServiceContext,
  state: WindowSet,
  body: UpdateWindowBody,
  access: WindowsAccess
): Promise<WindowSetPlan> {
  const { series, selected, members } = state
  if (!series) throw invalidScope()
  const definition = readWindowSeriesDefinition(series)
  if (series.cancelledAt) throw conflict('The series is cancelled.')
  const timeChanged =
    (body.starts_at !== undefined && Date.parse(body.starts_at) !== selected.startsAt.getTime()) ||
    (body.ends_at !== undefined && Date.parse(body.ends_at) !== selected.endsAt.getTime())
  const preservesSelectedHistory = selected.startsAt < access.now && !timeChanged
  // Validate the combined supplied/effective fields before conversion, preserving independent issue codes.
  // A future-only kind patch does not change an untouched historical selection; planned future rows validate it.
  await validateFields(
    ctx,
    {
      starts_at: body.starts_at ?? selected.startsAt.toISOString(),
      ends_at: body.ends_at ?? selected.endsAt.toISOString(),
      kind: preservesSelectedHistory ? selected.kind : (body.kind ?? selected.kind),
      tz: body.tz ?? selected.tz
    },
    access.now,
    timeChanged
  )
  const selectedSpan = await windowLocalSpan(ctx.tx, {
    startsAt: new Date(body.starts_at ?? selected.startsAt),
    endsAt: new Date(body.ends_at ?? selected.endsAt),
    tz: body.tz ?? selected.tz
  })
  const oldSpan = await windowLocalSpan(ctx.tx, selected)
  const native = definition.source === 'native'
  const defaults = native ? undefined : definition.manualDefaults
  const clocks = {
    localStart:
      body.starts_at === undefined
        ? native
          ? series.localStart
          : (defaults?.localStart ?? oldSpan.start)
        : selectedSpan.start,
    localEnd:
      body.ends_at === undefined ? (native ? series.localEnd : (defaults?.localEnd ?? oldSpan.end)) : selectedSpan.end,
    dateOffsetDays:
      body.starts_at === undefined
        ? native
          ? definition.dateOffsetDays
          : (defaults?.dateOffsetDays ?? 0)
        : native
          ? dayDifference(selectedSpan.date, selected.seriesOccurrenceDate ?? definition.anchor)
          : dayDifference(selectedSpan.date, oldSpan.date) + (defaults?.dateOffsetDays ?? 0),
    endDayOffset: native ? definition.endDayOffset : (defaults?.endDayOffset ?? oldSpan.endDayOffset),
    sourceDateShift: body.starts_at === undefined ? 0 : dayDifference(selectedSpan.date, oldSpan.date)
  }
  if (body.ends_at !== undefined) {
    const startDate = native
      ? addDays(selected.seriesOccurrenceDate ?? definition.anchor, clocks.dateOffsetDays)
      : body.starts_at !== undefined
        ? selectedSpan.date
        : oldSpan.date
    clocks.endDayOffset = dayDifference(addDays(selectedSpan.date, selectedSpan.endDayOffset), startDate)
  }
  const changes: WindowChange[] = []
  let nextDefinition: NativeWindowDefinition | ImportedWindowDefinition
  let rule = series.rule
  if (native) {
    nextDefinition = {
      ...definition,
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.kind !== undefined ? { kind: body.kind } : {}),
      ...(body.tz !== undefined ? { tz: body.tz } : {}),
      dateOffsetDays: clocks.dateOffsetDays,
      endDayOffset: clocks.endDayOffset
    }
    if (members.some((row) => !row.seriesOccurrenceDate))
      throw conflict('A native member has no original occurrence identity.')
    rule = body.recurrence ?? shiftRule(parseRule(series.rule), clocks.dateOffsetDays - definition.dateOffsetDays)
    const desired = await materializeNative(
      ctx,
      {
        definition: nextDefinition,
        rule: parseRule(rule),
        localStart: clocks.localStart,
        localEnd: clocks.localEnd,
        projectId: selected.projectId
      },
      access.now
    )
    // Existing identities can still belong to the rule when their template time is past or beyond this horizon.
    // Only new materialization is bounded by now/+90 days; absence there is not evidence of recurrence removal.
    const dateOffsetDays = nextDefinition.dateOffsetDays
    const effectiveAnchor = addDays(nextDefinition.anchor, dateOffsetDays)
    const membershipThrough = members
      .map((row) => addDays(row.seriesOccurrenceDate!, dateOffsetDays))
      .sort()
      .at(-1)!
    const membershipDates = new Set(expandWeeklyDates(parseRule(rule), effectiveAnchor, membershipThrough))
    const known = new Set<string | null | undefined>(members.map((row) => row.seriesOccurrenceDate))
    for (const row of members)
      if (
        !row.cancelledAt &&
        row.startsAt >= access.now &&
        body.recurrence !== undefined &&
        !membershipDates.has(addDays(row.seriesOccurrenceDate!, dateOffsetDays))
      )
        changes.push({ kind: 'cancel', id: row.id, origin: 'series', now: access.now })
    for (const row of desired)
      if (!known.has(row.seriesOccurrenceDate))
        changes.push({ kind: 'create', values: { ...row, seriesId: series.id }, now: access.now })
  } else {
    if (body.recurrence !== undefined)
      throw invalidField('/recurrence', 'Imported recurrence is owned by its source calendar.')
    const manualDefaults = {
      ...definition.manualDefaults,
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.kind !== undefined ? { kind: body.kind } : {}),
      ...(body.tz !== undefined ? { tz: body.tz } : {}),
      ...(body.starts_at !== undefined ? { localStart: clocks.localStart, dateOffsetDays: clocks.dateOffsetDays } : {}),
      ...(body.ends_at !== undefined ? { localEnd: clocks.localEnd, endDayOffset: clocks.endDayOffset } : {})
    }
    nextDefinition = { ...definition, manualDefaults }
  }
  for (const row of members) {
    if (
      row.cancelledAt ||
      row.startsAt < access.now ||
      changes.some((change) => change.kind === 'cancel' && change.id === row.id)
    )
      continue
    const patch = await memberPatch(ctx, row, body, clocks, access)
    if (Object.keys(patch).length)
      changes.push({
        kind: 'update',
        id: row.id,
        patch: { ...patch, ...(!native ? { localOverride: true } : {}) },
        now: access.now
      })
  }
  if (definition.source === 'ics' && nextDefinition.source === 'ics') {
    // Matching effective values express no new override intent, including defaults for future source occurrences.
    const defaults = nextDefinition.manualDefaults
    const old = definition.manualDefaults
    const future = members.filter((row) => !row.cancelledAt && row.startsAt >= access.now)
    for (const key of ['title', 'kind', 'tz'] as const)
      if (old[key] === undefined && (future.length ? future : [selected]).every((row) => row[key] === body[key]))
        delete defaults[key]
    if (
      body.starts_at !== undefined &&
      old.localStart === undefined &&
      !changes.some((change) => change.kind === 'update' && change.patch.startsAt !== undefined)
    ) {
      delete defaults.localStart
      delete defaults.dateOffsetDays
    }
    if (
      body.ends_at !== undefined &&
      old.localEnd === undefined &&
      !changes.some((change) => change.kind === 'update' && change.patch.endsAt !== undefined)
    ) {
      delete defaults.localEnd
      delete defaults.endDayOffset
    }
  }
  const sameClock = (a: string, b: string) =>
    Date.parse(`2000-01-01T${a.length === 5 ? `${a}:00` : a}Z`) ===
    Date.parse(`2000-01-01T${b.length === 5 ? `${b}:00` : b}Z`)
  const localStart = !native || sameClock(series.localStart, clocks.localStart) ? series.localStart : clocks.localStart
  const localEnd = !native || sameClock(series.localEnd, clocks.localEnd) ? series.localEnd : clocks.localEnd
  const metadataChanged =
    !isDeepStrictEqual(definition, nextDefinition) ||
    !isDeepStrictEqual(series.rule, rule) ||
    series.localStart !== localStart ||
    series.localEnd !== localEnd
  return {
    changes,
    ...(metadataChanged ? { seriesPatch: { definition: nextDefinition, rule, localStart, localEnd } } : {})
  }
}

async function mutate(
  ctx: ServiceContext,
  input: { id: string; scope: WindowScope },
  access: WindowsAccess,
  planner: (state: WindowSet) => Promise<WindowSetPlan>
): Promise<WindowView> {
  await openWindow(ctx, input.id, access)
  await consumeWindowBudget(ctx, access)
  try {
    const row = await mutateWindowSet(
      ctx.tx,
      { ...input, now: access.now },
      async (state) => {
        if (
          state.selected.guest ||
          state.selected.shareLinkId ||
          state.members.some((row) => row.guest || row.shareLinkId)
        )
          throw new ApiError(403, 'insufficient-scope', 'Guest window lifecycle is unavailable.')
        return planner(state)
      },
      async (creates) => {
        for (let i = 0; i < creates.length; i++) await consumeWindowBudget(ctx, access)
      }
    )
    if (!row) throw new ApiError(404, 'not-found', 'The window is unavailable.')
    return await currentWindowView(ctx, row)
  } catch (error) {
    if (error instanceof WindowStateConflict) throw conflict(error.message)
    throw error
  }
}

export async function updateWindow(
  ctx: ServiceContext,
  input: { id: string; scope: WindowScope; patch: UpdateWindowBody },
  access: WindowsAccess
): Promise<WindowView> {
  // Denial before parsing or target discovery also protects direct callers.
  await openWindow(ctx, input.id, access)
  const { scope } = parseInput(updateOperation.request.query, { scope: input.scope }, 'query')
  const body = parseInput(updateOperation.request.body.content['application/json'].schema, input.patch)
  return mutate(ctx, { id: input.id, scope }, access, async (state) => {
    if (state.selected.cancelledAt) throw conflict('A cancelled window cannot be edited.')
    if (state.series?.cancelledAt) throw conflict('The series is cancelled.')
    return scope === 'series' ? seriesPlan(ctx, state, body, access) : occurrencePlan(ctx, state.selected, body, access)
  })
}

export async function cancelWindow(
  ctx: ServiceContext,
  input: { id: string; scope: WindowScope },
  access: WindowsAccess
): Promise<WindowView> {
  await openWindow(ctx, input.id, access)
  const { scope } = parseInput(updateOperation.request.query, { scope: input.scope }, 'query')
  return mutate(ctx, { id: input.id, scope }, access, async (state) => {
    if (scope === 'series') {
      if (!state.series) throw invalidScope()
      readWindowSeriesDefinition(state.series)
      if (state.series.cancelledAt) return { changes: [] }
      return {
        seriesPatch: { cancelledAt: access.now },
        changes: state.members
          .filter((row) => !row.cancelledAt && row.startsAt >= access.now)
          .map((row) => ({ kind: 'cancel', id: row.id, origin: 'series', now: access.now }))
      }
    }
    if (state.selected.cancelledAt) return { changes: [] }
    if (state.series?.cancelledAt) throw conflict('The series is cancelled.')
    return { changes: [{ kind: 'cancel', id: state.selected.id, origin: 'manual', now: access.now }] }
  })
}
