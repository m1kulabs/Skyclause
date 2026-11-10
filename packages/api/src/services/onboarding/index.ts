import { and, eq, sql } from 'drizzle-orm'
import {
  analyticsEvent,
  getOnboardingRows,
  setOnboardingSkipped,
  track,
  withSystem,
  type OnboardingStep
} from '@skyclause/db'
import type { AnalyticsOnboardingStep } from '@skyclause/contracts'
import { ApiError } from '../../problems'
import type { ServiceContext } from '../../tenancy'
import { formatTime } from '@skyclause/i18n/format'

const EVENT_STEP: Record<OnboardingStep, AnalyticsOnboardingStep> = {
  organisation: 'org_created',
  project: 'project_created',
  sources: 'source_bound',
  window: 'window_declared',
  rota: 'rota_set',
  channel: 'channel_connected'
}

const NOT_FOUND = () => new ApiError(404, 'not-found', 'No organisation with this ID.')

function ageText(ageSeconds: number): string {
  if (ageSeconds < 90 * 60) return `${Math.max(1, Math.round(ageSeconds / 60))} min`
  return `${Math.round(ageSeconds / 3600)} h`
}

function valueText(value: unknown): string | null {
  if (typeof value === 'number') return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(value)
  if (typeof value === 'string' && value) return value
  if (typeof value === 'object' && value !== null && 'API' in value) {
    const api = (value as { API?: unknown }).API
    if (typeof api === 'number' || typeof api === 'string') return String(api)
  }
  return null
}

function readingResult(
  row: NonNullable<Awaited<ReturnType<typeof getOnboardingRows>>>['sources'][number],
  now: Date
): string {
  const id = row.source.externalId
  if (row.state?.state === 'error') {
    const status = row.state.httpStatus === null ? '' : ` · HTTP ${row.state.httpStatus}`
    return `${id} bound · error${status}`
  }
  const value = row.reading
    ? (valueText(row.reading.value) ?? valueText(row.reading.valueText) ?? valueText(row.reading.valueJson))
    : null
  if (!row.reading || value === null) return `${id} bound · no reading`
  const age = Math.max(0, Math.floor((now.getTime() - row.reading.observedAt.getTime()) / 1000))
  const metric = row.source.kind === 'apims' ? 'API' : row.reading.metric
  return `${id} bound · ${metric} ${value}, ${ageText(age)} old`
}

function formatLocalTime(value: Date): string {
  return formatTime(value, 'en').replace(/\s*MYT$/, '')
}

function serialize(rows: NonNullable<Awaited<ReturnType<typeof getOnboardingRows>>>, now: Date) {
  const org = encodeURIComponent(rows.organization.slug)
  const projectSlug = rows.project ? encodeURIComponent(rows.project.slug) : null
  const hrefFor: Record<OnboardingStep, string> = {
    organisation: '/new',
    project: `/${org}/new`,
    sources: projectSlug ? `/${org}/${projectSlug}/settings/packs` : `/${org}/new`,
    window: projectSlug ? `/${org}/${projectSlug}/windows?declare=window` : `/${org}/new`,
    rota: `/${org}/settings/rota`,
    channel: projectSlug ? `/${org}/${projectSlug}/settings/channels` : `/${org}/new`
  }
  const completedAt: Record<OnboardingStep, Date | null> = {
    organisation: rows.membership?.createdAt ?? null,
    project: rows.project?.createdAt ?? null,
    sources: rows.sources[0]?.binding.createdAt ?? null,
    window: rows.window?.createdAt ?? null,
    rota: rows.rota?.shift.createdAt ?? null,
    channel: rows.channel?.updatedAt ?? null
  }
  const result: Record<OnboardingStep, string | null> = {
    organisation: rows.membership ? `${rows.organization.name} membership active` : null,
    project: rows.project ? `${rows.project.name} created` : null,
    sources: rows.sources[0] ? readingResult(rows.sources[0], now) : null,
    window: rows.window ? `${rows.window.title} declared · ${formatLocalTime(rows.window.startsAt)} MYT` : null,
    rota: rows.rota ? `Rota set · ${rows.rota.shift.localStart}–${rows.rota.shift.localEnd} MYT` : null,
    channel: rows.channel ? `${rows.channel.channel.replace('_', ' ')} connected` : null
  }

  return {
    steps: (['organisation', 'project', 'sources', 'window', 'rota', 'channel'] as const).map((step) => ({
      step,
      completed_at: completedAt[step]?.toISOString() ?? null,
      skipped: rows.skipped.includes(step),
      result: result[step],
      href: hrefFor[step]
    }))
  }
}

async function lockOnboarding(ctx: ServiceContext, orgId: string): Promise<void> {
  await ctx.tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${orgId}, 0))`)
}

async function trackObservedSteps(
  ctx: ServiceContext,
  orgId: string,
  rows: NonNullable<Awaited<ReturnType<typeof getOnboardingRows>>>
): Promise<void> {
  const previous = await withSystem('onboarding-step-dedupe', (tx) =>
    tx
      .select({ props: analyticsEvent.props })
      .from(analyticsEvent)
      .where(and(eq(analyticsEvent.orgId, orgId), eq(analyticsEvent.name, 'onboarding_step')))
  )
  const tracked = new Set(previous.map((event) => (event.props as { step?: string }).step))

  for (const step of ['organisation', 'project', 'sources', 'window', 'rota', 'channel'] as const) {
    const skipped = rows.skipped.includes(step)
    const done =
      step === 'sources'
        ? rows.sources.length > 0
        : step === 'rota'
          ? rows.rota !== null
          : step === 'channel'
            ? rows.channel !== null
            : step === 'organisation'
              ? rows.membership !== null
              : step === 'project'
                ? rows.project !== null
                : rows.window !== null
    const eventStep = EVENT_STEP[step]
    if ((!done && !skipped) || tracked.has(eventStep)) continue
    await track(
      ctx.tx,
      'onboarding_step',
      { step: eventStep, skipped },
      rows.project ? { projectId: rows.project.id } : undefined
    )
    tracked.add(eventStep)
  }
}

async function readAndTrack(ctx: ServiceContext, orgId: string, now: Date) {
  await lockOnboarding(ctx, orgId)
  const rows = await getOnboardingRows(ctx.tx, orgId)
  if (!rows) throw NOT_FOUND()
  await trackObservedSteps(ctx, orgId, rows)
  return serialize(rows, now)
}

export async function getOnboarding(ctx: ServiceContext, orgId: string, o: { now?: Date } = {}) {
  return readAndTrack(ctx, orgId, o.now ?? new Date())
}

export async function setOnboardingStepSkipped(
  ctx: ServiceContext,
  orgId: string,
  step: OnboardingStep,
  skipped: boolean,
  o: { now?: Date } = {}
) {
  await lockOnboarding(ctx, orgId)
  const current = await getOnboardingRows(ctx.tx, orgId)
  if (!current) throw NOT_FOUND()
  const completed =
    step === 'sources'
      ? current.sources.length > 0
      : step === 'rota'
        ? current.rota !== null
        : step === 'channel'
          ? current.channel !== null
          : step === 'organisation'
            ? current.membership !== null
            : step === 'project'
              ? current.project !== null
              : current.window !== null
  if (skipped && !completed) await setOnboardingSkipped(ctx.tx, orgId, step, true)
  if (!skipped) await setOnboardingSkipped(ctx.tx, orgId, step, false)
  const rows = await getOnboardingRows(ctx.tx, orgId)
  if (!rows) throw NOT_FOUND()
  await trackObservedSteps(ctx, orgId, rows)
  return serialize(rows, o.now ?? new Date())
}
