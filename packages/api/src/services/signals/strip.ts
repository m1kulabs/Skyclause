import { RAIN_STEP_MS, rainPeriod, type Window as EngineWindow } from '@skyclause/clauses'
import {
  NotBuiltError,
  SCOPE_STATEMENTS,
  type InputValue,
  type PackState,
  type SnapshotSource
} from '@skyclause/contracts'
import type { getProjectStrip as route } from '@skyclause/contracts/api/v1/strip'
import {
  getProjectRecord,
  getProjectSummaryRecord,
  getStripWindow,
  listSourceUrls,
  listStripNights,
  listStripRainPollErrors,
  listStripRainSourceIds,
  listStripRainReadings,
  type StripReadingRecord
} from '@skyclause/db'
import { z } from 'zod'
import { ApiError } from '../../problems'
import { instant } from '../../serialize'
import type { ServiceContext } from '../../tenancy'
import type { SourcesAccess } from '../sources'

export type ProjectStripView = z.infer<(typeof route)['responses'][200]['content']['application/json']['schema']>
type Point = [string, number | null, string]
type StripWindow = NonNullable<ProjectStripView['window']>
type StripNight = ProjectStripView['nights'][number]
type StripWindowRow = NonNullable<Awaited<ReturnType<typeof getStripWindow>>>
type StripNightRow = Awaited<ReturnType<typeof listStripNights>>[number]

/** The strip shows the last six hours up to the request clock; the contract has no range parameters. */
export const STRIP_RANGE_MS = 6 * 3_600_000
const HOUR_MS = 3_600_000
const unavailable = () => new ApiError(404, 'not-found', 'The project is unavailable.')
const round6 = (value: number) => Math.round(value * 1_000_000) / 1_000_000

/** One 5-minute lane and one rolling 60-minute lane, a point for every 5-minute slot end in [from, to]. */
export function rainLanes(
  readings: readonly StripReadingRecord[],
  errorPolls: readonly Date[],
  range: { from: Date; to: Date }
): { rain5: Point[]; rain60: Point[] } {
  const samples = readings.map((row) => ({
    iso: instant(row.observedAt),
    ms: row.observedAt.getTime(),
    value: row.value,
    id: row.id
  }))
  const bySlot = new Map<number, typeof samples>()
  for (const sample of samples) bySlot.set(sample.ms, [...(bySlot.get(sample.ms) ?? []), sample])
  const errorSlots = new Set(errorPolls.map((at) => Math.floor(at.getTime() / RAIN_STEP_MS) * RAIN_STEP_MS))
  const rain5: Point[] = []
  const rain60: Point[] = []
  const last = Math.floor(range.to.getTime() / RAIN_STEP_MS) * RAIN_STEP_MS
  for (let slot = Math.ceil(range.from.getTime() / RAIN_STEP_MS) * RAIN_STEP_MS; slot <= last; slot += RAIN_STEP_MS) {
    const at = instant(new Date(slot))
    const here = bySlot.get(slot)
    // Several gauges at one slot add up, as the engine's own 60-minute total adds them.
    const value =
      here && here.every((sample) => typeof sample.value === 'number' && Number.isFinite(sample.value))
        ? round6(here.reduce((sum, sample) => sum + sample.value!, 0))
        : null
    rain5.push([at, value, value !== null ? 'received' : !here && errorSlots.has(slot) ? 'error' : 'missed'])
    // The engine's period total, with no live-edge carry: a slot without its own reading is a gap, not an older total.
    const total = rainPeriod(samples, slot, HOUR_MS, false)?.total ?? null
    rain60.push([at, total, total !== null ? 'received' : 'missed'])
  }
  return { rain5, rain60 }
}

function serializeWindow(row: StripWindowRow): StripWindow {
  return {
    id: row.id,
    project_id: row.projectId,
    starts_at: instant(row.startsAt),
    ends_at: instant(row.endsAt),
    title: row.title,
    kind: row.kind,
    tz: row.tz,
    declared_by: row.declaredBy,
    guest: row.guest,
    via: row.via,
    expires_at: row.expiresAt ? instant(row.expiresAt) : null,
    series_id: row.seriesId,
    ics_feed_id: row.icsFeedId,
    cancelled_at: row.cancelledAt ? instant(row.cancelledAt) : null,
    share_link_id: row.shareLinkId,
    moderation: row.moderation
  }
}

function serializeNight(row: StripNightRow): StripNight {
  return {
    id: row.id,
    project_id: row.projectId,
    date: row.date,
    state: row.state,
    doors: instant(row.doors!),
    show: instant(row.show!),
    arrival_start: instant(row.arrivalStart!),
    arrival_end: instant(row.arrivalEnd!),
    exit_start: row.exitStart ? instant(row.exitStart) : null,
    exit_end: row.exitEnd ? instant(row.exitEnd) : null
  }
}

/** Every site input of a non-persisted Sky snapshot at `now`; an evaluator that is not built yet yields none. */
async function currentInputs(
  ctx: ServiceContext,
  snapshots: SnapshotSource,
  q: { projectId: string; now: Date; windows: EngineWindow[] }
): Promise<InputValue[]> {
  let site
  try {
    const taken = await snapshots.take(ctx.tx, {
      projectId: q.projectId,
      pack: 'sky',
      tEval: instant(q.now),
      windows: q.windows,
      persist: false
    })
    site = Object.values(taken.snapshot.site)
  } catch (error) {
    if (error instanceof NotBuiltError) return []
    throw error
  }
  const urls = await listSourceUrls(
    ctx.tx,
    site.flatMap((value) => value.sourceIds)
  )
  return site.map((value) => ({
    name: value.name,
    value: value.value,
    unit: value.unit,
    state: value.state,
    since: value.since,
    age_s: value.ageS === null ? null : Math.round(value.ageS),
    source_ids: value.sourceIds,
    source_url: value.sourceIds.map((id) => urls.get(id)).find(Boolean) ?? null,
    reading_ids: value.readingIds,
    observed_at: value.observedAt
  }))
}

/**
 * `GET /v1/projects/{id}/strip`: the last six hours of rain in 5-minute slots, the Sky inputs now, the soonest window
 * and the Sky pack's state, all read in the caller's tenant transaction. Verdict history is not stored in the
 * `Verdicts` shape, so `verdicts` stays empty; nothing is invented.
 */
export async function getProjectStrip(
  ctx: ServiceContext,
  input: { projectId: string },
  access: SourcesAccess & { snapshots: SnapshotSource }
): Promise<ProjectStripView> {
  const { principal, tx } = ctx
  const { projectId } = input
  const scopes =
    principal.kind === 'api_key' || principal.kind === 'oauth' || principal.kind === 'guest_token'
      ? principal.scopes
      : null
  if (
    principal.kind === 'device' ||
    principal.kind === 'system' ||
    (scopes && !scopes.some((scope) => SCOPE_STATEMENTS[scope].includes('project.view'))) ||
    !access.can(principal, 'project.view')
  )
    throw new ApiError(403, 'insufficient-scope', 'This operation requires project.view.')
  if (
    !tx.orgId ||
    principal.orgId !== tx.orgId ||
    !z.uuid().safeParse(projectId).success ||
    (principal.kind === 'share_link' && principal.projectId !== projectId) ||
    (principal.kind === 'oauth' && principal.projectIds !== 'all' && !principal.projectIds.includes(projectId))
  )
    throw unavailable()
  if (!access.can(principal, 'project.view', { projectId }))
    throw new ApiError(403, 'insufficient-scope', 'This operation requires project.view.')
  if (!(await getProjectRecord(tx, projectId))) throw unavailable()

  const to = access.now
  const from = new Date(to.getTime() - STRIP_RANGE_MS)
  // No bound gauge, no rain lanes: an empty lane reads as "nothing to show", a lane of gaps as "gauge silent".
  const sourceIds = await listStripRainSourceIds(tx, projectId)
  let lanes: { rain5: Point[]; rain60: Point[] } = { rain5: [], rain60: [] }
  if (sourceIds.length) {
    // The first 60-minute total needs the hour before the first slot.
    const readings = await listStripRainReadings(tx, { sourceIds, from: new Date(from.getTime() - HOUR_MS), to })
    const errorPolls = await listStripRainPollErrors(tx, { sourceIds, from, to })
    lanes = rainLanes(readings, errorPolls, { from, to })
  }
  const windowRow = await getStripWindow(tx, { projectId, from })
  const window = windowRow ? serializeWindow(windowRow) : null
  const inputs = await currentInputs(ctx, access.snapshots, {
    projectId,
    now: to,
    windows: window
      ? [{ id: window.id, startsAt: window.starts_at, endsAt: window.ends_at, kind: window.kind, tz: window.tz }]
      : []
  })
  const nights = (await listStripNights(tx, { projectId, from, to })).map(serializeNight)
  // The project summary's own derivation, so the strip and the overview cannot disagree about the pack.
  const { pack_states } = await getProjectSummaryRecord(tx, projectId, to)
  const packs: PackState[] = pack_states.filter((state) => state.pack === 'sky')

  return {
    project_id: projectId,
    range: { from: instant(from), to: instant(to) },
    window,
    series: { 'site.rain_5m_mm': lanes.rain5, 'site.rain_60m_mm': lanes.rain60 },
    inputs,
    packs,
    verdicts: [],
    nights
  }
}
