'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { Bundle, PackState, Verdict } from '@skyclause/contracts'
import type { StripInput, StripPointState, StripWindow } from '@skyclause/elements'
import { brandStates } from '@skyclause/elements'
import { formatDateCompact, formatDateLong, formatNumber, formatTime } from '@skyclause/i18n/format'
import { cn } from '#lib/utils'
import { Button } from '#ui/button'
import { buttonVariants } from '#ui/button-variants'
import { Skeleton } from '#ui/skeleton'
import { Table, TableBody } from '#ui/table'
import { ToggleGroup, ToggleGroupItem } from '#ui/toggle-group'
import { ModeBadge } from '../brand/mode-badge'
import { Glyph } from '../brand/glyph'
import {
  DayStrip,
  indicatorName,
  InputAgeChip,
  NoCallState,
  SignalHealthHead,
  SourceError,
  SourceHealthRow,
  WindowStrip
} from '../data-components'
import { ApiProblem, browserPath } from '../../lib/api-fetch'
import { readSse } from '../../lib/read-sse'
import { useRead } from '../analysis/use-read'
import { daySpan } from '../dashboard/model'
import {
  bundleStream,
  overviewApi,
  type Project,
  type ProjectBundle,
  type ProjectDay,
  type ProjectListItem,
  type ProjectNight,
  type ProjectSource,
  type ProjectStrip,
  type ProjectVerdicts,
  type ProjectWindow
} from './operations'
import { localDateAt, overviewFilterState, selectTodayAtRisk, type OverviewPackFilter } from './model'
import { t as bundleText } from '../bundles/i18n'
import { t } from './catalogue'
import './overview.css'

type Locale = 'en' | 'ms'

/** The sources table draws at most this many rows. */
const SOURCE_CAP = 50

/** One of the overview's reads: its value, or the status it failed with and when (shown as a named error). */
type Read<Value> = { ok: true; value: Value } | { ok: false; status: number | null; at: string }

type OverviewData = {
  listItem: ProjectListItem
  project: Project
  loadedAt: number
  role: string
  strip: Read<ProjectStrip>
  verdicts: Read<ProjectVerdicts>
  sources: Read<ProjectSource[]>
  windows: Read<ProjectWindow[]>
  days: Read<ProjectDay[]>
  nights: Read<ProjectNight[]>
  bundles: Read<ProjectBundle[]>
}

async function allPages<Item>(read: (cursor?: string) => Promise<{ data: Item[]; next_cursor: string | null }>) {
  const items: Item[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await read(cursor)
    items.push(...page.data)
    cursor = page.next_cursor ?? undefined
    if (cursor && seen.has(cursor)) throw new Error('Repeated project overview cursor')
    if (cursor) seen.add(cursor)
  } while (cursor)
  return items
}

async function tryRead<Value>(read: () => Promise<Value>): Promise<Read<Value>> {
  try {
    return { ok: true, value: await read() }
  } catch (error) {
    return { ok: false, status: error instanceof ApiProblem ? error.status : null, at: new Date().toISOString() }
  }
}

const valueOf = <Value,>(read: Read<Value>): Value | null => (read.ok ? read.value : null)

async function loadOverview(org: string, slug: string, signal: AbortSignal): Promise<OverviewData> {
  const projects = await allPages((cursor) =>
    overviewApi('listProjects', { org, query: { slug, include: 'summary', limit: 200, cursor }, signal })
  )
  const listItem = projects.find((item) => item.slug === slug)
  if (!listItem) throw new ApiProblem(404, { title: t('overview.project_missing') })
  const [project, memberships] = await Promise.all([
    overviewApi('getProject', { org, params: { id: listItem.id }, signal }),
    allPages((cursor) => overviewApi('listMyMemberships', { query: { limit: 200, cursor }, signal }))
  ])
  const membership = memberships.find((item) => item.org_slug === org)
  const [strip, verdicts, sources, windows, days, nights, bundles] = await Promise.all([
    tryRead(() => overviewApi('getProjectStrip', { org, params: { id: project.id }, signal })),
    tryRead(() => overviewApi('getProjectVerdicts', { org, params: { id: project.id }, signal })),
    tryRead(() =>
      allPages((cursor) =>
        overviewApi('listProjectSources', { org, params: { id: project.id }, query: { limit: 200, cursor }, signal })
      )
    ),
    tryRead(() =>
      allPages((cursor) =>
        overviewApi('listWindows', {
          org,
          params: { id: project.id },
          query: {
            limit: 200,
            cursor,
            from: localDateAt(new Date(), project.time_zone),
            to: localDateAt(new Date(Date.now() + 86_400_000), project.time_zone),
            include: 'calls'
          },
          signal
        })
      )
    ),
    tryRead(() =>
      allPages((cursor) =>
        overviewApi('listProjectDays', { org, params: { id: project.id }, query: { limit: 200, cursor }, signal })
      )
    ),
    tryRead(() =>
      allPages((cursor) =>
        overviewApi('listNights', { org, params: { id: project.id }, query: { limit: 200, cursor }, signal })
      )
    ),
    tryRead(() =>
      allPages((cursor) =>
        overviewApi('listProjectBundles', {
          org,
          params: { id: project.id },
          query: { limit: 20, cursor },
          signal
        })
      )
    )
  ])
  return {
    listItem,
    project,
    loadedAt: Date.now(),
    role: membership?.role ?? 'viewer',
    strip,
    verdicts,
    sources,
    windows,
    days,
    nights,
    bundles
  }
}

function stripInput(strip: ProjectStrip, windows: readonly ProjectWindow[], now: Date): StripInput {
  const findSeries = (pattern: RegExp) => Object.entries(strip.series).find(([name]) => pattern.test(name))?.[1] ?? []
  const rain5 = findSeries(/rain.*(?:5m|5_min|5-minute|5min)|(?:5m|5_min|5min).*rain/i).map(([at, value, state]) => {
    const pointState: StripPointState = state === 'missed' || state === 'error' ? state : 'received'
    return { at, value, state: pointState }
  })
  const rain60 = findSeries(/rain.*(?:60m|60_min|hour)|(?:60m|60_min|hour).*rain/i).map(([at, value]) => ({
    at,
    value
  }))
  const nextHour = now.getTime() + 60 * 60_000
  const window = windows.find((item) => {
    const start = new Date(item.starts_at).getTime()
    const end = new Date(item.ends_at).getTime()
    return start <= nextHour && end >= now.getTime()
  })
  const stripWindow = window
    ? { from: window.starts_at, to: window.ends_at }
    : strip.window
      ? { from: strip.window.starts_at, to: strip.window.ends_at }
      : null
  return {
    from: strip.range.from,
    to: strip.range.to,
    now: now.toISOString(),
    window: stripWindow ? { from: stripWindow.from, to: stripWindow.to } : null,
    rain5,
    rain60,
    ages: strip.inputs.map((input) => ({ name: input.name, observedAt: input.observed_at })),
    ...(strip.replay ? { replay: { source: strip.replay.source, capturedAt: strip.replay.captured_at } } : {})
  }
}

function packVerdicts(verdicts: ProjectVerdicts | null, pack: PackState['pack']): Verdict[] {
  const data = verdicts?.packs.find((item) => item.pack === pack)
  return data ? [...data.site, ...data.windows, ...data.nights] : []
}

function canDeclare(role: string) {
  return ['owner', 'admin', 'approver', 'editor'].includes(role)
}

/** Binding a source lives in the project's pack settings, which only owners and admins open. */
function canBind(role: string) {
  return role === 'owner' || role === 'admin'
}

/** Today's windows on the strip, each with its latest call for the pack in view (Sky first when both are shown). */
function stripWindows(windows: readonly ProjectWindow[], filter: OverviewPackFilter): StripWindow[] {
  return windows.map((window) => {
    const call =
      filter === 'crowd'
        ? window.latest_calls.crowd
        : filter === 'sky'
          ? window.latest_calls.sky
          : (window.latest_calls.sky ?? window.latest_calls.crowd)
    return {
      id: window.id,
      from: window.starts_at,
      to: window.ends_at,
      state: call ? (call.mode ?? 'no_call') : null,
      draft: call?.state === 'drafted',
      title: window.title
    }
  })
}

function hasBundleDetails(bundle: Bundle): bundle is ProjectBundle {
  return 'trigger' in bundle && typeof bundle.trigger === 'string' && 'triggered_at' in bundle
}

function Section({
  id,
  title,
  action,
  className,
  children
}: {
  id: string
  title: string
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={cn('overview-section', className)} aria-labelledby={id}>
      <header className="overview-section-header">
        <h2 id={id} className="type-section">
          {title}
        </h2>
        {action ? <span className="overview-section-action">{action}</span> : null}
      </header>
      {children}
    </section>
  )
}

/** An empty block: its sentence, with n=0 once, and the one next action that exists for this person (or none). */
function EmptyBlock({ sentence, action }: { sentence: string; action?: ReactNode }) {
  return (
    <p className="overview-empty">
      <span>{sentence}</span>
      {action}
    </p>
  )
}

function ReadError({
  read,
  source,
  onRetry,
  locale
}: {
  read: Read<unknown>
  source: string
  onRetry: () => void
  locale: Locale
}) {
  if (read.ok) return null
  return (
    <SourceError
      source={source}
      status={read.status}
      at={read.at}
      locale={locale}
      // A 501 is "not built": reading again cannot change the answer.
      retry={
        read.status === 501 ? undefined : (
          <Button type="button" variant="outline" onClick={onRetry}>
            {t('overview.retry', {}, locale)}
          </Button>
        )
      }
    />
  )
}

/** The screen's answer: each pack's mode, large, with its glyph and word, its basis, fired clauses and input ages. */
function PackAnswer({ pack, data, locale }: { pack: PackState; data: OverviewData; locale: Locale }) {
  const state = pack.no_call
    ? 'no_call'
    : pack.mode === 'normal' && pack.watch
      ? 'storm_watch'
      : (pack.mode ?? 'no_call')
  const { tone, word } = brandStates[state]
  const basis =
    pack.basis === 'engine_verdict'
      ? t('data.pack.clause_engine', {}, locale)
      : pack.basis === 'approved_call'
        ? t('data.pack.approved_call', {}, locale)
        : t('data.pack.no_basis', {}, locale)
  const fired = packVerdicts(valueOf(data.verdicts), pack.pack).flatMap((verdict) =>
    verdict.clauses
      .filter((clause) => clause.result === 'fired')
      .map((clause) => ({ ...clause, scope: verdict.scope.kind }))
  )
  const inputs = valueOf(data.strip)?.inputs ?? []
  const blocked = pack.no_call?.inputs ?? []
  const since = blocked.map((input) => input.since).sort()[0] ?? null
  return (
    <article className="overview-answer" data-pack={pack.pack}>
      <div className="overview-answer-body">
        <div className="overview-answer-mode">
          <h3 className="type-card-title">{t(`brand.packs.${pack.pack}`, {}, locale)}</h3>
          <p className="overview-mode tone-fill" data-tone={tone} data-state={state}>
            <Glyph state={state} width={20} height={20} />
            <span className="type-title">{t(word, {}, locale)}</span>
          </p>
          <p className="type-small text-muted-foreground">{basis}</p>
          {pack.no_call ? (
            <NoCallState
              inputs={blocked.map((input) => indicatorName(input.name, locale))}
              since={since}
              locale={locale}
            />
          ) : null}
        </div>
        <div className="overview-answer-detail">
          <div>
            <h4 className="type-small text-muted-foreground">{t('overview.fired', {}, locale)}</h4>
            {fired.length ? (
              <ul className="overview-fired">
                {fired.map((clause, index) => (
                  <li key={`${clause.scope}-${clause.key}-${index}`} translate="no">
                    {clause.key}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="type-body">{t('overview.no_fired', {}, locale)}</p>
            )}
          </div>
          <div>
            <h4 className="type-small text-muted-foreground">{t('overview.input_ages', {}, locale)}</h4>
            {inputs.length ? (
              <ul className="overview-age-list">
                {inputs.map((input) => (
                  <li key={`${pack.pack}-${input.name}`}>
                    <InputAgeChip input={input} locale={locale} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="type-body">{t('overview.no_inputs', {}, locale)}</p>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

function Finding({ data, locale, now }: { data: OverviewData; locale: Locale; now: Date }) {
  const strip = valueOf(data.strip)
  const reporting = data.listItem.summary?.signal_health.inputs_reporting ?? strip?.inputs.length ?? 0
  const baseOldestS = data.listItem.summary?.signal_health.oldest_age_s
  const oldestS =
    baseOldestS === null || baseOldestS === undefined
      ? baseOldestS
      : baseOldestS + Math.max(0, Math.floor((now.getTime() - data.loadedAt) / 1000))
  const oldest =
    oldestS === null || oldestS === undefined
      ? '—'
      : t('overview.oldest_minutes', { count: formatNumber(Math.floor(oldestS / 60), locale) }, locale)
  return (
    <p className="type-body text-muted-foreground" data-finding-line>
      {t(
        'overview.signal_line',
        {
          reporting: t(
            reporting === 1 ? 'overview.inputs_reporting_one' : 'overview.inputs_reporting',
            { count: formatNumber(reporting, locale) },
            locale
          ),
          oldest
        },
        locale
      )}
    </p>
  )
}

function OverviewSkeleton({ locale }: { locale: Locale }) {
  return (
    <div className="overview-page" data-project-overview aria-busy="true">
      <header className="overview-topline">
        <h1 className="type-title">{t('overview.title', {}, locale)}</h1>
      </header>
      <p className="sr-only" role="status">
        {t('overview.loading', {}, locale)}
      </p>
      <div className="overview-answers" aria-hidden="true">
        <Skeleton className="h-[180px] w-full rounded-xl" />
      </div>
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-7 w-32 rounded-full" />
        <Skeleton className="h-10 w-full rounded-full" />
        <Skeleton className="h-5 w-full rounded-full bg-transparent" />
        <Skeleton className="h-11 w-full" />
      </div>
    </div>
  )
}

export function ProjectOverview({
  org,
  project: slug,
  locale = 'en'
}: {
  org: string
  project: string
  locale?: Locale
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const filter = overviewFilterState(searchParams).pack
  const [readRevision, setReadRevision] = useState(0)
  const read = useCallback((signal: AbortSignal) => loadOverview(org, slug, signal), [org, slug, readRevision])
  const state = useRead(read)
  const [now, setNow] = useState(() => new Date())
  const [latestBundle, setLatestBundle] = useState<Bundle | null>(null)
  const [refresh, setRefresh] = useState(0)
  const retry = () => setReadRevision((value) => value + 1)

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (state.status !== 'ready') return
    setLatestBundle(valueOf(state.value.bundles)?.[0] ?? state.value.listItem.summary?.latest_bundle ?? null)
  }, [state])

  useEffect(() => {
    if (state.status !== 'ready') return
    const projectId = state.value.project.id
    const controller = new AbortController()
    const path = bundleStream.path.replace('{id}', encodeURIComponent(projectId))
    void readSse(browserPath(path), {
      signal: controller.signal,
      headers: { 'Skyclause-Organization': org },
      onEvent(event) {
        let raw: unknown
        try {
          raw = JSON.parse(event.data)
        } catch {
          return
        }
        const parsed = bundleStream.responses[200].content['text/event-stream'].schema.safeParse(raw)
        if (parsed.success && parsed.data.type === 'bundle.drafted') setRefresh((current) => current + 1)
      }
    })
    return () => controller.abort()
  }, [state, org])

  useEffect(() => {
    if (state.status !== 'ready' || refresh === 0) return
    let active = true
    allPages((cursor) =>
      overviewApi('listProjectBundles', {
        org,
        params: { id: state.value.project.id },
        query: { limit: 20, cursor }
      })
    )
      .then((bundles) => {
        if (active) setLatestBundle(bundles[0] ?? null)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [refresh, state, org])

  const today = useMemo(() => {
    if (state.status !== 'ready' || !state.value.windows.ok) return null
    const { time_zone: timeZone } = state.value.project
    const day = localDateAt(now, timeZone)
    const todays = state.value.windows.value.filter((item) => localDateAt(new Date(item.starts_at), timeZone) === day)
    const windows = stripWindows(todays, filter)
    return { windows, span: daySpan(windows, now.toISOString()) }
  }, [state, filter, now])

  const changeFilter = (next: OverviewPackFilter) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'all') params.delete('pack')
    else params.set('pack', next)
    router.push(`${pathname}${params.size ? `?${params.toString()}` : ''}`)
  }

  if (state.status === 'loading') return <OverviewSkeleton locale={locale} />
  if (state.status === 'error') {
    return (
      <div className="overview-page" data-project-overview>
        <header className="overview-topline">
          <h1 className="type-title">{t('overview.title', {}, locale)}</h1>
        </header>
        <SourceError
          source={t('overview.read_source', {}, locale)}
          status={state.error instanceof ApiProblem ? state.error.status : null}
          locale={locale}
          retry={
            state.error instanceof ApiProblem && state.error.status === 501 ? undefined : (
              <Button type="button" variant="outline" onClick={retry}>
                {t('overview.retry', {}, locale)}
              </Button>
            )
          }
        />
      </div>
    )
  }

  const data = state.value
  const root = `/${encodeURIComponent(org)}/${encodeURIComponent(slug)}`
  const declare = canDeclare(data.role)
  const bind = canBind(data.role)
  const declareHref = (() => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('declare', 'window')
    return `${pathname}?${params.toString()}`
  })()
  const declareLink = (
    <Link className="overview-action" href={declareHref}>
      {t('overview.declare_window', {}, locale)}
    </Link>
  )
  const bindLink = (
    <Link className="overview-action" href={`${root}/settings/packs`}>
      {t('overview.bind_source', {}, locale)}
    </Link>
  )
  const windowsLink = (
    <Link className="overview-action" href={`${root}/windows`}>
      {t('overview.view_windows', {}, locale)}
    </Link>
  )
  /** What an empty block about windows offers: declaring one, or for a viewer looking at the windows page. */
  const windowsAction = declare ? declareLink : windowsLink
  /** What an empty block about sources offers: binding one, which only owners and admins can do. */
  const sourcesAction = bind ? bindLink : undefined
  const summary = data.listItem.summary
  const strip = valueOf(data.strip)
  const packStates = summary?.pack_states ?? strip?.packs ?? []
  const visiblePacks = packStates.filter((pack) => filter === 'all' || pack.pack === filter)
  const windows = valueOf(data.windows) ?? []
  const todayAtRisk = selectTodayAtRisk(windows, data.project.time_zone, now)
  const todayKey = localDateAt(now, data.project.time_zone)
  const stripData = strip ? stripInput(strip, windows, now) : null
  const hasReadings = !!stripData && stripData.rain5.length + stripData.rain60.length > 0
  const nights = valueOf(data.nights) ?? []
  const days = valueOf(data.days) ?? []
  const nextNight = nights
    .filter((night) => night.date >= todayKey && night.state !== 'unlisted')
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  const stormDay = days
    .filter((day) => day.date >= todayKey && day.storm_afternoon)
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  const showName = nextNight && 'show_name' in nextNight ? nextNight.show_name : undefined
  const skyState = packStates.find((item) => item.pack === 'sky')
  const sources = valueOf(data.sources) ?? []
  const listed = valueOf(data.bundles) ?? []
  const recent = latestBundle ? [latestBundle, ...listed.filter((item) => item.id !== latestBundle.id)] : listed
  const hrefs = Object.fromEntries(
    windows.map((window) => [window.id, `${root}/windows?window=${encodeURIComponent(window.id)}`])
  )

  return (
    <div className="overview-page" data-project-overview>
      <header className="overview-topline">
        <h1 className="type-title">{t('overview.title', {}, locale)}</h1>
        <div className="overview-controls">
          <ToggleGroup
            value={[filter]}
            onValueChange={(values) => values[0] && changeFilter(values[0] as OverviewPackFilter)}
            aria-label={t('overview.filter', {}, locale)}
          >
            {(['all', 'sky', 'crowd'] as const).map((value) => (
              <ToggleGroupItem key={value} value={value}>
                {value === 'all'
                  ? t('overview.all_packs', {}, locale)
                  : t('overview.pack_filter', { pack: t(`brand.packs.${value}`, {}, locale) }, locale)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {declare ? (
            <Link href={declareHref} className={buttonVariants()}>
              {t('overview.declare_window', {}, locale)}
            </Link>
          ) : null}
        </div>
      </header>

      <Section id="overview-packs" title={t('overview.packs', {}, locale)}>
        {visiblePacks.length ? (
          <>
            <div className="overview-answers">
              {visiblePacks.map((pack) => (
                <PackAnswer key={pack.pack} pack={pack} data={data} locale={locale} />
              ))}
            </div>
            <Finding data={data} locale={locale} now={now} />
          </>
        ) : (
          <EmptyBlock sentence={t('overview.no_packs', {}, locale)} action={sourcesAction} />
        )}
      </Section>

      <div className="overview-row">
        <Section id="overview-strip" title={t('overview.strip', {}, locale)} className="overview-today">
          {!data.windows.ok ? (
            <ReadError
              read={data.windows}
              source={t('overview.windows_source', {}, locale)}
              onRetry={retry}
              locale={locale}
            />
          ) : today ? (
            <DayStrip
              from={today.span.from}
              to={today.span.to}
              now={now.toISOString()}
              windows={today.windows}
              hrefs={hrefs}
              emptyAction={windowsAction}
              locale={locale}
            />
          ) : null}
          {strip?.replay ? (
            <p className="type-small text-muted-foreground" data-replay>
              {t(
                'overview.replay',
                { source: strip.replay.source, captured: formatDateLong(strip.replay.captured_at, locale) },
                locale
              )}
            </p>
          ) : null}
          {hasReadings && stripData ? (
            <details className="overview-readings">
              <summary>
                <ChevronRight aria-hidden="true" className="size-4" />
                {t('overview.readings', {}, locale)}
              </summary>
              <div className="pt-3">
                <WindowStrip
                  windows={windows.filter(
                    (item) =>
                      new Date(item.starts_at).getTime() <= now.getTime() + 60 * 60_000 &&
                      new Date(item.ends_at).getTime() >= now.getTime()
                  )}
                  strip={stripData}
                  locale={locale}
                />
              </div>
            </details>
          ) : null}
          {!data.strip.ok ? (
            <ReadError
              read={data.strip}
              source={t('overview.strip_source', {}, locale)}
              onRetry={retry}
              locale={locale}
            />
          ) : null}
        </Section>

        <Section id="overview-risk" title={t('overview.at_risk', {}, locale)} className="overview-risk">
          {!data.windows.ok ? (
            <ReadError
              read={data.windows}
              source={t('overview.windows_source', {}, locale)}
              onRetry={retry}
              locale={locale}
            />
          ) : todayAtRisk.windows.length ? (
            <>
              <ul className="overview-window-list">
                {todayAtRisk.windows.map((window) => (
                  <li key={window.id}>
                    <Link href={`${root}/windows?window=${encodeURIComponent(window.id)}`}>
                      <span>{window.title}</span>
                      <time dateTime={window.starts_at} data-numeric>
                        {formatTime(window.starts_at, locale)}
                      </time>
                    </Link>
                  </li>
                ))}
              </ul>
              {todayAtRisk.total > 6 && (
                <Link className="overview-action" href={`${root}/windows`}>
                  {t('overview.view_all_windows', {}, locale)}
                </Link>
              )}
            </>
          ) : (
            <EmptyBlock sentence={t('overview.no_at_risk', {}, locale)} action={windowsAction} />
          )}
        </Section>
      </div>

      <div className="overview-row">
        <Section id="overview-sources" title={t('overview.sources', {}, locale)} className="overview-sources">
          {!data.sources.ok ? (
            <ReadError
              read={data.sources}
              source={t('overview.sources_source', {}, locale)}
              onRetry={retry}
              locale={locale}
            />
          ) : sources.length ? (
            <>
              <Table aria-label={t('overview.sources', {}, locale)}>
                <SignalHealthHead locale={locale} />
                <TableBody>
                  {sources.slice(0, SOURCE_CAP).map((item) => (
                    <SourceHealthRow
                      key={item.id}
                      source={item}
                      latest={
                        item.latest_reading
                          ? {
                              value: item.latest_reading.value,
                              observed_at: item.latest_reading.observed_at,
                              unit: item.latest_reading.unit ?? undefined
                            }
                          : null
                      }
                      state={item.state}
                      locale={locale}
                    />
                  ))}
                </TableBody>
              </Table>
              {sources.length > SOURCE_CAP ? (
                <p className="type-small text-muted-foreground" data-numeric>
                  {t(
                    'overview.capped',
                    { shown: formatNumber(SOURCE_CAP, locale), total: formatNumber(sources.length, locale) },
                    locale
                  )}
                </p>
              ) : null}
            </>
          ) : (
            <EmptyBlock sentence={t('overview.no_sources', {}, locale)} action={sourcesAction} />
          )}
        </Section>

        <Section id="overview-next-event" title={t('overview.next_event', {}, locale)} className="overview-next">
          {!data.nights.ok ? (
            <ReadError
              read={data.nights}
              source={t('overview.nights_source', {}, locale)}
              onRetry={retry}
              locale={locale}
            />
          ) : !data.days.ok ? (
            <ReadError
              read={data.days}
              source={t('overview.days_source', {}, locale)}
              onRetry={retry}
              locale={locale}
            />
          ) : nextNight ? (
            <div className="overview-next-event">
              <p className="type-card-title" translate={showName ? 'no' : undefined}>
                {showName ?? t('overview.show', { name: data.project.name }, locale)}
              </p>
              <p className="flex flex-wrap gap-x-2 type-body text-muted-foreground">
                <span>{formatDateLong(nextNight.date, locale)}</span>
                <time dateTime={nextNight.show}>{formatTime(nextNight.show, locale)}</time>
              </p>
              <ModeBadge pack={skyState?.pack ?? 'sky'} mode={skyState?.mode ?? 'no_call'} locale={locale} />
            </div>
          ) : stormDay?.storm_afternoon ? (
            <div className="overview-next-event">
              <p className="type-card-title">
                {t('overview.storm', { wording: stormDay.storm_afternoon.wording }, locale)}
              </p>
              <p className="type-body text-muted-foreground">{formatDateLong(stormDay.date, locale)}</p>
              <a
                href={stormDay.storm_afternoon.source_url}
                target="_blank"
                rel="noreferrer"
                className="overview-action"
              >
                {t('overview.storm_source', {}, locale)}
              </a>
            </div>
          ) : (
            <EmptyBlock sentence={t('overview.no_next_event', {}, locale)} action={sourcesAction} />
          )}
        </Section>
      </div>

      <Section id="overview-bundle" title={t('overview.bundle', {}, locale)}>
        {!data.bundles.ok && !latestBundle ? (
          <ReadError
            read={data.bundles}
            source={t('overview.bundles_source', {}, locale)}
            onRetry={retry}
            locale={locale}
          />
        ) : recent.length ? (
          <ol className="overview-bundles">
            {recent.slice(0, 5).map((bundle) => {
              const modes = [...new Set(bundle.calls.map((call) => call.mode ?? 'no_call'))]
              const at = hasBundleDetails(bundle) ? bundle.triggered_at : (bundle.needs_review_at ?? bundle.sla_due_at)
              return (
                <li key={bundle.id} data-bundle={bundle.id}>
                  <Link href={`${root}/bundles/${encodeURIComponent(bundle.id)}`} className="overview-bundle-row">
                    <span className="overview-bundle-when" data-numeric>
                      {at ? (
                        <time dateTime={at}>
                          {localDateAt(new Date(at), data.project.time_zone) === todayKey
                            ? formatTime(at, locale)
                            : `${formatDateCompact(at, locale)} ${formatTime(at, locale)}`}
                        </time>
                      ) : null}
                    </span>
                    <span className="overview-bundle-what">
                      <span className="type-card-title">
                        {hasBundleDetails(bundle) && bundle.trigger
                          ? bundleText(`bundles.triggers.${bundle.trigger}`, {}, locale)
                          : t(`brand.packs.${bundle.pack}`, {}, locale)}
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        {modes.map((mode) => (
                          <ModeBadge key={mode} mode={mode} pack={bundle.pack} locale={locale} />
                        ))}
                      </span>
                    </span>
                    <span className="overview-bundle-state type-body">
                      {t(`overview.bundle_state.${bundle.state}`, {}, locale)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ol>
        ) : (
          <EmptyBlock sentence={t('overview.no_bundles', {}, locale)} action={windowsAction} />
        )}
      </Section>
    </div>
  )
}
