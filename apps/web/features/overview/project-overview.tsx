'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { Bundle, PackState, Verdict } from '@skyclause/contracts'
import type { StripInput, StripPointState } from '@skyclause/elements'
import { formatDateLong, formatNumber, formatTime } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { ModeBadge } from '../brand/mode-badge'
import { BundleCard, InputAgeChip, PackStateNote, SourceHealthRow, WindowStrip } from '../data-components'
import { ApiProblem, browserPath } from '../../lib/api-fetch'
import { readSse } from '../../lib/read-sse'
import { useRead } from '../analysis/use-read'
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
import { t } from './catalogue'
import './overview.css'

type OverviewData = {
  listItem: ProjectListItem
  project: Project
  loadedAt: number
  role: string
  strip: ProjectStrip | null
  verdicts: ProjectVerdicts | null
  sources: ProjectSource[]
  windows: ProjectWindow[]
  days: ProjectDay[]
  nights: ProjectNight[]
  bundles: ProjectBundle[]
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

async function tryRead<Value>(read: () => Promise<Value>): Promise<Value | null> {
  try {
    return await read()
  } catch {
    return null
  }
}

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
    sources: sources ?? [],
    windows: windows ?? [],
    days: days ?? [],
    nights: nights ?? [],
    bundles: bundles ?? []
  }
}

function stripInput(strip: ProjectStrip | null, windows: readonly ProjectWindow[], now: Date): StripInput | undefined {
  if (!strip) return undefined
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

function ActionLink({
  org,
  project,
  locale,
  kind
}: {
  org: string
  project: string
  locale: 'en' | 'ms'
  kind: 'bind' | 'declare'
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const params = new URLSearchParams(searchParams.toString())
  params.set('declare', 'window')
  const key = kind === 'bind' ? 'overview.bind_source' : 'overview.declare_window'
  const href =
    kind === 'bind'
      ? `/${encodeURIComponent(org)}/${encodeURIComponent(project)}/settings/packs`
      : `${pathname}?${params.toString()}`
  return (
    <Link className="overview-action" href={href}>
      {t(key, {}, locale)}
    </Link>
  )
}

function hasBundleDetails(bundle: Bundle): bundle is ProjectBundle {
  return 'trigger' in bundle && typeof bundle.trigger === 'string' && 'triggered_at' in bundle
}

function EmptyBlock({ action, locale }: { action: ReactNode; locale: 'en' | 'ms' }) {
  return (
    <p className="overview-empty">
      <span>{t('overview.count', { count: 0 }, locale)}</span>
      {action}
    </p>
  )
}

function Finding({ data, locale, now }: { data: OverviewData; locale: 'en' | 'ms'; now: Date }) {
  const states = data.listItem.summary?.pack_states ?? data.strip?.packs ?? []
  const reporting = data.listItem.summary?.signal_health.inputs_reporting ?? data.strip?.inputs.length ?? 0
  const baseOldestS = data.listItem.summary?.signal_health.oldest_age_s
  const oldestS =
    baseOldestS === null || baseOldestS === undefined
      ? baseOldestS
      : baseOldestS + Math.max(0, Math.floor((now.getTime() - data.loadedAt) / 1000))
  const oldest =
    oldestS === null || oldestS === undefined
      ? '—'
      : t('overview.oldest_minutes', { count: Math.floor(oldestS / 60) }, locale)
  if (!states.length) return null
  return (
    <p className="overview-finding" data-finding-line>
      {states.map((state, index) => (
        <span className="overview-finding-pack" key={state.pack}>
          <ModeBadge pack={state.pack} mode={state.mode ?? 'no_call'} locale={locale} />
          {index === 0 && (
            <span className="overview-finding-detail">
              {t(
                'overview.finding_detail',
                {
                  reporting: t('overview.inputs_reporting', { count: formatNumber(reporting, locale) }, locale),
                  oldest
                },
                locale
              )}
            </span>
          )}
        </span>
      ))}
    </p>
  )
}

function Section({
  id,
  title,
  count,
  locale,
  children
}: {
  id: string
  title: string
  count?: number
  locale: 'en' | 'ms'
  children: React.ReactNode
}) {
  return (
    <section className="overview-section" aria-labelledby={id}>
      <header className="overview-section-header">
        <h2 id={id}>{title}</h2>
        {count !== undefined && <span className="overview-count">{t('overview.count', { count }, locale)}</span>}
      </header>
      {children}
    </section>
  )
}

export function ProjectOverview({
  org,
  project: slug,
  locale = 'en'
}: {
  org: string
  project: string
  locale?: 'en' | 'ms'
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

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (state.status !== 'ready') return
    setLatestBundle(state.value.bundles[0] ?? state.value.listItem.summary?.latest_bundle ?? null)
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

  const changeFilter = (next: OverviewPackFilter) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'all') params.delete('pack')
    else params.set('pack', next)
    router.push(`${pathname}${params.size ? `?${params.toString()}` : ''}`)
  }

  if (state.status === 'loading')
    return (
      <main className="overview-page" data-project-overview aria-busy="true">
        <h1>{t('overview.title', {}, locale)}</h1>
        <div className="overview-skeleton" />
      </main>
    )
  if (state.status === 'error') {
    return (
      <main className="overview-page" data-project-overview>
        <h1>{t('overview.title', {}, locale)}</h1>
        <p role="alert">{t('overview.load_failed', {}, locale)}</p>
        <Button type="button" variant="outline" onClick={() => setReadRevision((value) => value + 1)}>
          {t('overview.retry', {}, locale)}
        </Button>
      </main>
    )
  }

  const data = state.value
  const summary = data.listItem.summary
  const packStates = summary?.pack_states ?? data.strip?.packs ?? []
  const visiblePacks = packStates.filter((pack) => filter === 'all' || pack.pack === filter)
  const windows = data.windows
  const todayAtRisk = selectTodayAtRisk(windows, data.project.time_zone, now)
  const today = localDateAt(now, data.project.time_zone)
  const stripData = stripInput(data.strip, windows, now)
  const todayWindows = windows.filter((item) => localDateAt(new Date(item.starts_at), data.project.time_zone) === today)
  const nextNight = data.nights
    .filter((night) => night.date >= today && night.state !== 'unlisted')
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  const stormDay = data.days
    .filter((day) => day.date >= today && day.storm_afternoon)
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  const showName = nextNight && 'show_name' in nextNight ? nextNight.show_name : undefined
  const packLabels = new Map(packStates.map((item) => [item.pack, item]))

  return (
    <main className="overview-page" data-project-overview>
      <header className="overview-topline">
        <div>
          <p className="overview-eyebrow">{data.project.name}</p>
          <h1>{t('overview.title', {}, locale)}</h1>
          <Finding data={data} locale={locale} now={now} />
        </div>
        {canDeclare(data.role) ? (
          <Button
            type="button"
            className="overview-primary"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString())
              params.set('declare', 'window')
              router.push(`${pathname}?${params.toString()}`)
            }}
          >
            {t('overview.declare_window', {}, locale)}
          </Button>
        ) : null}
      </header>

      <div className="overview-filter" role="group" aria-label={t('overview.filter', {}, locale)}>
        {(['all', 'sky', 'crowd'] as const).map((value) => (
          <Button
            type="button"
            key={value}
            variant={filter === value ? 'secondary' : 'ghost'}
            aria-pressed={filter === value}
            onClick={() => changeFilter(value)}
          >
            {value === 'all'
              ? t('overview.all_packs', {}, locale)
              : t('overview.pack_filter', { pack: t(`brand.packs.${value}`, {}, locale) }, locale)}
          </Button>
        ))}
      </div>

      <div className="overview-grid">
        <Section
          id="overview-packs"
          title={t('overview.packs', {}, locale)}
          count={visiblePacks.length}
          locale={locale}
        >
          {visiblePacks.length ? (
            <div className="overview-pack-list">
              {visiblePacks.map((pack) => {
                const fired = packVerdicts(data.verdicts, pack.pack).flatMap((verdict) =>
                  verdict.clauses
                    .filter((clause) => clause.result === 'fired')
                    .map((clause) => ({ ...clause, scope: verdict.scope.kind }))
                )
                const inputs = data.strip?.inputs ?? []
                return (
                  <article className="overview-pack" key={pack.pack} data-pack={pack.pack}>
                    <h3>{t(`brand.packs.${pack.pack}`, {}, locale)}</h3>
                    <PackStateNote pack={pack} locale={locale} />
                    <div className="overview-pack-detail">
                      <div>
                        <h4>{t('overview.fired', {}, locale)}</h4>
                        {fired.length ? (
                          <ul>
                            {fired.map((clause, index) => (
                              <li key={`${clause.scope}-${clause.key}-${index}`}>{clause.key}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>{t('overview.no_fired', {}, locale)}</p>
                        )}
                      </div>
                      <div>
                        <h4>{t('overview.input_ages', {}, locale)}</h4>
                        {inputs.length ? (
                          <ul className="overview-age-list">
                            {inputs.map((input) => (
                              <li key={`${pack.pack}-${input.name}`}>
                                <InputAgeChip input={input} locale={locale} />
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>{t('overview.count', { count: 0 }, locale)}</p>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <EmptyBlock
              locale={locale}
              action={
                canDeclare(data.role) ? (
                  <ActionLink org={org} project={slug} locale={locale} kind="bind" />
                ) : (
                  t('overview.bind_source', {}, locale)
                )
              }
            />
          )}
        </Section>

        <Section id="overview-strip" title={t('overview.strip', {}, locale)} locale={locale}>
          {stripData && stripData.rain5.length + stripData.rain60.length > 0 ? (
            <WindowStrip
              windows={todayWindows.filter(
                (item) =>
                  new Date(item.starts_at).getTime() <= now.getTime() + 60 * 60_000 &&
                  new Date(item.ends_at).getTime() >= now.getTime()
              )}
              strip={stripData}
              locale={locale}
            />
          ) : (
            <>
              {stripData && <WindowStrip windows={[]} strip={stripData} locale={locale} />}
              <EmptyBlock
                locale={locale}
                action={
                  canDeclare(data.role) ? (
                    <ActionLink org={org} project={slug} locale={locale} kind="declare" />
                  ) : (
                    <Link
                      className="overview-action"
                      href={`/${encodeURIComponent(org)}/${encodeURIComponent(slug)}/windows`}
                    >
                      {t('overview.view_windows', {}, locale)}
                    </Link>
                  )
                }
              />
            </>
          )}
        </Section>

        <Section id="overview-risk" title={t('overview.at_risk', {}, locale)} count={todayAtRisk.total} locale={locale}>
          {todayAtRisk.windows.length ? (
            <>
              <ul className="overview-window-list">
                {todayAtRisk.windows.map((window) => (
                  <li key={window.id}>
                    <Link href={`/${encodeURIComponent(org)}/${encodeURIComponent(slug)}/windows`}>
                      <span>{window.title}</span>
                      <time dateTime={window.starts_at}>{formatTime(window.starts_at, locale)}</time>
                    </Link>
                  </li>
                ))}
              </ul>
              {todayAtRisk.total > 6 && (
                <Link
                  className="overview-action"
                  href={`/${encodeURIComponent(org)}/${encodeURIComponent(slug)}/windows`}
                >
                  {t('overview.view_all_windows', {}, locale)}
                </Link>
              )}
            </>
          ) : (
            <EmptyBlock
              locale={locale}
              action={
                canDeclare(data.role) ? (
                  <ActionLink org={org} project={slug} locale={locale} kind="declare" />
                ) : (
                  t('overview.view_windows', {}, locale)
                )
              }
            />
          )}
        </Section>

        <Section
          id="overview-sources"
          title={t('overview.sources', {}, locale)}
          count={data.sources.length}
          locale={locale}
        >
          {data.sources.length ? (
            <div className="overflow-x-auto">
              <table className="overview-source-table">
                <caption className="sr-only">{t('overview.sources', {}, locale)}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('overview.sources', {}, locale)}</th>
                    <th scope="col">{t('overview.updated', {}, locale)}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sources.map((item) => (
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
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyBlock
              locale={locale}
              action={
                canDeclare(data.role) ? (
                  <ActionLink org={org} project={slug} locale={locale} kind="bind" />
                ) : (
                  t('overview.bind_source', {}, locale)
                )
              }
            />
          )}
        </Section>

        <Section id="overview-bundle" title={t('overview.bundle', {}, locale)} locale={locale}>
          {latestBundle ? (
            <BundleCard
              bundle={latestBundle}
              trigger={hasBundleDetails(latestBundle) ? latestBundle.trigger : null}
              triggeredAt={hasBundleDetails(latestBundle) ? latestBundle.triggered_at : null}
              projectName={data.project.name}
              locale={locale}
            />
          ) : (
            <EmptyBlock
              locale={locale}
              action={
                canDeclare(data.role) ? (
                  <ActionLink org={org} project={slug} locale={locale} kind="declare" />
                ) : (
                  t('overview.view_windows', {}, locale)
                )
              }
            />
          )}
        </Section>

        <Section id="overview-next-event" title={t('overview.next_event', {}, locale)} locale={locale}>
          {nextNight ? (
            <div className="overview-next-event">
              <p>{showName ?? t('overview.show', { name: data.project.name }, locale)}</p>
              <p className="overview-date-line">
                <span>{formatDateLong(nextNight.date, locale)}</span>
                <time dateTime={nextNight.show}>{formatTime(nextNight.show, locale)}</time>
              </p>
              <ModeBadge
                pack={packLabels.get('sky')?.pack ?? 'sky'}
                mode={packLabels.get('sky')?.mode ?? 'no_call'}
                locale={locale}
              />
            </div>
          ) : stormDay?.storm_afternoon ? (
            <div className="overview-next-event">
              <p>{t('overview.storm', { wording: stormDay.storm_afternoon.wording }, locale)}</p>
              <p>{formatDateLong(stormDay.date, locale)}</p>
              <a
                href={stormDay.storm_afternoon.source_url}
                target="_blank"
                rel="noreferrer"
                className="overview-action"
              >
                {t('overview.source', {}, locale)}
              </a>
            </div>
          ) : (
            <EmptyBlock
              locale={locale}
              action={
                canDeclare(data.role) ? (
                  <ActionLink org={org} project={slug} locale={locale} kind="declare" />
                ) : (
                  t('overview.view_windows', {}, locale)
                )
              }
            />
          )}
        </Section>
      </div>
    </main>
  )
}
