'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { formatDate, formatNumber, formatTime } from '@skyclause/i18n/format'
import type { StripWindow } from '@skyclause/elements'
import type { Mode } from '@skyclause/contracts'
import { ApiProblem } from '../../lib/api-fetch'
import { cn } from '#lib/utils'
import { Button, buttonVariants } from '#ui/button'
import { Skeleton } from '#ui/skeleton'
import { DayStrip, GradeCard, SourceError, SourceHealthRow, WindowStrip } from '../data-components'
import { ModeBadge } from '../brand/mode-badge'
import { readDashboard, type DashboardRead } from './operations'
import { daySpan, slaLeft, stripInput, verdictState } from './model'
import { t } from './catalogue'
import styles from './dashboard.module.css'

type DashboardBlockKey = 'needs_review' | 'windows_at_risk' | 'signal_health' | 'upcoming_risks' | 'yesterday_grades'

type Locale = 'en' | 'ms'

interface DashboardPageProps {
  org: string
  locale?: Locale
  initialData: DashboardRead | null
  initialError: number | null
  /** When the server's read failed, so the error says when. */
  initialErrorAt?: string | null
}

type ReadState =
  | { status: 'loading' }
  | { status: 'ready'; value: DashboardRead }
  | { status: 'error'; httpStatus: number | null; at: string | null }

const BLOCK_IDS: Record<DashboardBlockKey, string> = {
  // The bar's Review control links here (`/{org}#dashboard-needs-review`): every state keeps this heading.
  needs_review: 'dashboard-needs-review',
  windows_at_risk: 'dashboard-windows-at-risk',
  signal_health: 'dashboard-signal-health',
  upcoming_risks: 'dashboard-upcoming-risks',
  yesterday_grades: 'dashboard-yesterday-grades'
}

const linkClass =
  'inline-flex min-h-6 items-center text-foreground underline underline-offset-4 decoration-ink-muted hover:decoration-current'

/** The minutes since the read, ticking once a minute after the page mounts (so the server and client agree). */
function useMinutesSinceRead(key: unknown) {
  const [minutes, setMinutes] = useState(0)
  useEffect(() => {
    setMinutes(0)
    const timer = setInterval(() => setMinutes((value) => value + 1), 60_000)
    return () => clearInterval(timer)
  }, [key])
  return minutes
}

function root(org: string) {
  return `/${encodeURIComponent(org)}`
}

function projectRoot(org: string, slug: string) {
  return `${root(org)}/${encodeURIComponent(slug)}`
}

/** Where each block's next action goes: the first project's page for it, or creating a project when there is none. */
function blockHref(key: DashboardBlockKey, org: string, data: DashboardRead) {
  const project = data.projects[0]
  if (!project) return `${root(org)}/new`
  const base = projectRoot(org, project.slug)
  if (key === 'needs_review') {
    const first = data.bundles[0]?.summary
    return first ? `${projectRoot(org, first.project.slug)}/bundles/${encodeURIComponent(first.id)}` : `${base}/calls`
  }
  if (key === 'windows_at_risk' || key === 'upcoming_risks') return `${base}/windows`
  if (key === 'signal_health') return data.dashboard.signal_health.n ? `${base}/signals` : `${base}/settings/packs`
  return `${root(org)}/analysis`
}

function nextAction(key: DashboardBlockKey, data: DashboardRead, locale: Locale) {
  const block = data.dashboard[key]
  if (key === 'needs_review' && block.n === 0) return t('dashboard.view_calls', {}, locale)
  if (block.next_action) return block.next_action
  const fallback: Record<DashboardBlockKey, string> = {
    needs_review: t('dashboard.view_calls', {}, locale),
    windows_at_risk: t('dashboard.declare_window', {}, locale),
    signal_health: t('dashboard.bind_source', {}, locale),
    upcoming_risks: t('dashboard.bind_source', {}, locale),
    yesterday_grades: t('dashboard.view_analysis', {}, locale)
  }
  return fallback[key]
}

function BlockHead({ id, title, action }: { id: string; title: string; action?: ReactNode }) {
  return (
    <header className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id={id} className="type-section">
        {title}
      </h2>
      {action}
    </header>
  )
}

/**
 * A block with nothing in it: the one n=0 sentence and its one next action. With no project the block cannot act
 * (every action would open Create a project), so it keeps its sentence and the page offers that once, at the top.
 */
function EmptyBlock({ sentence, href, action }: { sentence: string; href?: string; action?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <p className="type-text">{sentence}</p>
      {href && action ? (
        <Link
          href={href}
          className={cn(buttonVariants({ variant: 'outline' }), 'h-auto min-h-9 max-w-full py-1.5 whitespace-normal')}
        >
          {action}
        </Link>
      ) : null}
    </div>
  )
}

/** No list on this page draws more than this many rows. */
const LIST_CAP = 50

/** Said once under a list that was cut at the cap: how many it shows of how many. */
function Capped({ shown, total, locale }: { shown: number; total: number; locale: Locale }) {
  if (total <= shown) return null
  return (
    <p className="type-small text-muted-foreground" data-numeric>
      {t('dashboard.capped', { shown: formatNumber(shown, locale), total: formatNumber(total, locale) }, locale)}
    </p>
  )
}

/** An organisation with no project: the one thing to do, once, under the title. */
function NoProjects({ org, locale }: { org: string; locale: Locale }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="type-text">{t('dashboard.no_projects', {}, locale)}</p>
      <Link href={`${root(org)}/new`} className={buttonVariants({ variant: 'default' })}>
        {t('dashboard.create_project', {}, locale)}
      </Link>
    </div>
  )
}

function Block({ block, className, children }: { block: DashboardBlockKey; className?: string; children: ReactNode }) {
  return (
    <section
      data-dashboard-block={block}
      aria-labelledby={BLOCK_IDS[block]}
      className={cn('flex min-w-0 flex-col gap-4', className)}
    >
      {children}
    </section>
  )
}

function DashboardSkeleton({ locale = 'en' }: { locale?: Locale }) {
  return (
    <section className={styles.page} aria-labelledby="dashboard-title" aria-busy="true">
      <header className={styles.head}>
        <h1 id="dashboard-title" className="type-title">
          {t('dashboard.title', {}, locale)}
        </h1>
        <p className="sr-only" role="status">
          {t('dashboard.loading', {}, locale)}
        </p>
        <Skeleton aria-hidden="true" className="h-7 w-[min(100%,34rem)] rounded-full" />
      </header>
      <Block block="needs_review">
        <BlockHead id={BLOCK_IDS.needs_review} title={t('dashboard.needs_review', {}, locale)} />
        <Skeleton aria-hidden="true" className="h-[104px] w-full rounded-xl" />
      </Block>
      <Block block="windows_at_risk">
        <BlockHead id={BLOCK_IDS.windows_at_risk} title={t('dashboard.windows_at_risk', {}, locale)} />
        <div className="flex flex-col gap-2" aria-hidden="true">
          <Skeleton className="h-[18px] w-64 rounded-full" />
          <Skeleton className="h-10 w-full rounded-full" />
          <Skeleton className="h-5 w-full rounded-full bg-transparent" />
        </div>
      </Block>
      <div className={styles.lower}>
        <Block block="signal_health" className={styles.signals}>
          <BlockHead id={BLOCK_IDS.signal_health} title={t('dashboard.signal_health', {}, locale)} />
          <div className="flex flex-col gap-2" aria-hidden="true">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        </Block>
        <div className={styles.side}>
          <Block block="upcoming_risks">
            <BlockHead id={BLOCK_IDS.upcoming_risks} title={t('dashboard.upcoming_risks', {}, locale)} />
            <Skeleton aria-hidden="true" className="h-11 w-full" />
          </Block>
          <Block block="yesterday_grades">
            <BlockHead id={BLOCK_IDS.yesterday_grades} title={t('dashboard.yesterday_grades', {}, locale)} />
            <Skeleton aria-hidden="true" className="h-32 w-full rounded-xl" />
          </Block>
        </div>
      </div>
    </section>
  )
}

/** The read failed or is not built (501 in production today): a named error in the first block, never an empty day. */
function DashboardFailure({
  httpStatus,
  at,
  retry,
  locale
}: {
  httpStatus: number | null
  at: string | null
  retry: () => void
  locale: Locale
}) {
  return (
    <section className={styles.page} aria-labelledby="dashboard-title">
      <header className={styles.head}>
        <h1 id="dashboard-title" className="type-title">
          {t('dashboard.title', {}, locale)}
        </h1>
      </header>
      <Block block="needs_review">
        <BlockHead id={BLOCK_IDS.needs_review} title={t('dashboard.needs_review', {}, locale)} />
        <SourceError
          source={t('dashboard.read_source', {}, locale)}
          status={httpStatus}
          at={at}
          locale={locale}
          // A 501 is "not built": reading again cannot change the answer.
          retry={
            httpStatus === 501 ? undefined : (
              <Button type="button" variant="outline" onClick={retry}>
                {t('dashboard.retry', {}, locale)}
              </Button>
            )
          }
        />
      </Block>
    </section>
  )
}

function ReviewRow({
  org,
  item,
  index,
  data,
  minutesSinceRead,
  locale
}: {
  org: string
  item: DashboardRead['bundles'][number]
  index: number
  data: DashboardRead
  minutesSinceRead: number
  locale: Locale
}) {
  const { summary, detail } = item
  const sla = slaLeft(detail, summary.seconds_remaining, minutesSinceRead)
  const project = data.projects.find((entry) => entry.id === summary.project.id)
  const modes = [...new Set(detail.calls.map((call) => call.mode ?? 'no_call'))] as Array<Mode | 'no_call'>
  const disagreements = detail.calls.filter((call) => !call.agrees).length
  const href = `${projectRoot(org, summary.project.slug)}/bundles/${encodeURIComponent(summary.id)}`
  const titleId = `dashboard-bundle-${summary.id}`
  const triggered = detail.triggered_at ?? summary.sla_due_at
  return (
    <li
      data-bundle={summary.id}
      data-dashboard-bundle-entry={index === 0 ? 'new' : undefined}
      className={cn(styles.review, index === 0 && styles.bundleEnter)}
    >
      <div className={styles.sla}>
        <p className="flex items-baseline gap-2">
          {sla.passed ? (
            <span className="type-card-title">{t('dashboard.sla_passed', {}, locale)}</span>
          ) : (
            <>
              <span className="type-title figures" data-numeric>
                {formatNumber(sla.minutes, locale)}
              </span>
              <span className="type-small text-muted-foreground">{t('dashboard.sla_unit', {}, locale)}</span>
            </>
          )}
        </p>
        {/* The SLA countdown at text size: the capsule's fill is the share of the bundle's SLA still left. */}
        <span className={styles.slaTrack} aria-hidden="true">
          <span className={styles.slaFill} style={{ width: `${(sla.share * 100).toFixed(1)}%` }} />
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <p id={titleId} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="type-card-title" translate="no">
            {project?.name ?? summary.project.slug}
          </span>
          <span className="type-body text-muted-foreground">
            {detail.trigger
              ? t('dashboard.bundle_trigger', { trigger: detail.trigger, time: formatTime(triggered, locale) }, locale)
              : formatTime(triggered, locale)}
          </span>
        </p>
        <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 type-body">
          {modes.map((mode) => (
            <ModeBadge key={mode} mode={mode} pack={detail.pack} locale={locale} />
          ))}
          <span>
            {disagreements === 0
              ? t('dashboard.shadow_agrees', {}, locale)
              : t('dashboard.shadow_disagrees', { count: formatNumber(disagreements, locale) }, locale)}
          </span>
          {detail.escalation_level > 0 ? (
            <span className="text-muted-foreground" data-numeric>
              {t('dashboard.escalation', { level: detail.escalation_level }, locale)}
            </span>
          ) : null}
        </p>
        {index === 0 && data.strip ? (
          <details className={styles.readings}>
            <summary>
              <ChevronRight aria-hidden="true" className="size-4" />
              {t('dashboard.readings', {}, locale)}
            </summary>
            <div data-window-strip className="pt-3">
              <WindowStrip
                windows={data.strip.window ? [data.strip.window] : []}
                strip={stripInput(data.strip)}
                locale={locale}
              />
            </div>
          </details>
        ) : null}
      </div>
      <Link
        href={href}
        aria-describedby={titleId}
        className={cn(buttonVariants({ variant: index === 0 ? 'default' : 'outline' }), styles.reviewAction)}
      >
        {t('dashboard.review_bundle', {}, locale)}
      </Link>
    </li>
  )
}

function Finding({
  data,
  minutesSinceRead,
  locale
}: {
  data: DashboardRead
  minutesSinceRead: number
  locale: Locale
}) {
  const { dashboard, bundles, firstCall } = data
  const first = bundles[0]
  if (dashboard.needs_review.n === 0 || !first)
    return <p className="type-text">{t('dashboard.nothing_to_approve', {}, locale)}</p>
  const window =
    firstCall?.window ??
    // The call's window, else today's at-risk row for it or for the bundle's project.
    (
      dashboard.windows_at_risk.data.find((item) => item.window.id === firstCall?.window_id) ??
      dashboard.windows_at_risk.data.find((item) => item.project.id === first.summary.project.id)
    )?.window
  const sla = slaLeft(first.detail, first.summary.seconds_remaining, minutesSinceRead)
  const count = dashboard.needs_review.n
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 type-text">
      <span>
        {count === 1
          ? t('dashboard.finding_prefix_one', {}, locale)
          : t('dashboard.finding_prefix', { count: formatNumber(count, locale) }, locale)}
      </span>
      {firstCall?.mode ? (
        <ModeBadge mode={firstCall.mode} locale={locale} />
      ) : (
        <span>{t('dashboard.unknown', {}, locale)}</span>
      )}
      <span>
        {t(
          'dashboard.finding_suffix',
          {
            window: window?.title ?? t('dashboard.unknown', {}, locale),
            minutes: formatNumber(sla.minutes, locale)
          },
          locale
        )}
      </span>
    </p>
  )
}

/** Today's windows at risk across projects on the day strip; each verdict is the engine's, not an approved call. */
function todayStrip(org: string, data: DashboardRead, now: string, locale: Locale) {
  const items = data.dashboard.windows_at_risk.data
  const several = data.projects.length > 1
  const windows: StripWindow[] = items.map(({ project, window, verdict }) => {
    const name = data.projects.find((entry) => entry.id === project.id)?.name ?? project.slug
    return {
      id: window.id,
      from: window.starts_at,
      to: window.ends_at,
      state: verdictState(verdict),
      draft: true,
      title: several ? t('dashboard.window_in_project', { project: name, window: window.title }, locale) : window.title
    }
  })
  const hrefs = Object.fromEntries(
    items.map(({ project, window }) => [
      window.id,
      `${projectRoot(org, project.slug)}/windows?window=${encodeURIComponent(window.id)}`
    ])
  )
  return { windows, hrefs, span: daySpan(windows, now) }
}

function DashboardContent({ org, data, locale }: { org: string; data: DashboardRead; locale: Locale }) {
  const { dashboard } = data
  const minutesSinceRead = useMinutesSinceRead(data)
  const now = new Date(Date.parse(data.readAt) + minutesSinceRead * 60_000).toISOString()
  const today = useMemo(() => todayStrip(org, data, now, locale), [org, data, now, locale])
  const noProjects = data.projects.length === 0
  const headAction = (key: DashboardBlockKey) =>
    dashboard[key].n > 0 ? (
      <Link href={blockHref(key, org, data)} className={linkClass}>
        {nextAction(key, data, locale)}
      </Link>
    ) : undefined
  /** An empty block's action: none before the first project (every one would open Create a project). */
  const emptyAction = (key: DashboardBlockKey, href = blockHref(key, org, data), action?: string) =>
    noProjects ? {} : { href, action: action ?? nextAction(key, data, locale) }

  return (
    <section className={styles.page} aria-labelledby="dashboard-title">
      <header className={styles.head}>
        <h1 id="dashboard-title" className="type-title">
          {t('dashboard.title', {}, locale)}
        </h1>
        {noProjects ? (
          <NoProjects org={org} locale={locale} />
        ) : (
          <Finding data={data} minutesSinceRead={minutesSinceRead} locale={locale} />
        )}
      </header>

      <Block block="needs_review">
        <BlockHead id={BLOCK_IDS.needs_review} title={t('dashboard.needs_review', {}, locale)} />
        {dashboard.needs_review.n === 0 ? (
          <EmptyBlock sentence={t('dashboard.no_review', {}, locale)} {...emptyAction('needs_review')} />
        ) : (
          <>
            <ol className="flex flex-col gap-2">
              {data.bundles.slice(0, LIST_CAP).map((item, index) => (
                <ReviewRow
                  key={item.summary.id}
                  org={org}
                  item={item}
                  index={index}
                  data={data}
                  minutesSinceRead={minutesSinceRead}
                  locale={locale}
                />
              ))}
            </ol>
            <Capped shown={LIST_CAP} total={data.bundles.length} locale={locale} />
          </>
        )}
      </Block>

      <Block block="windows_at_risk">
        <BlockHead
          id={BLOCK_IDS.windows_at_risk}
          title={t('dashboard.windows_at_risk', {}, locale)}
          action={headAction('windows_at_risk')}
        />
        {dashboard.windows_at_risk.n === 0 ? (
          <EmptyBlock
            sentence={t('dashboard.no_at_risk', {}, locale)}
            {...emptyAction(
              'windows_at_risk',
              data.projects[0] ? `${projectRoot(org, data.projects[0].slug)}/windows?declare=window` : undefined
            )}
          />
        ) : (
          <>
            <DayStrip
              from={today.span.from}
              to={today.span.to}
              now={now}
              windows={today.windows}
              hrefs={today.hrefs}
              locale={locale}
            />
            <p className="type-small text-muted-foreground">{t('dashboard.today_at_risk_note', {}, locale)}</p>
          </>
        )}
      </Block>

      <div className={styles.lower}>
        <Block block="signal_health" className={styles.signals}>
          <BlockHead
            id={BLOCK_IDS.signal_health}
            title={t('dashboard.signal_health', {}, locale)}
            action={headAction('signal_health')}
          />
          {dashboard.signal_health.n === 0 ? (
            <EmptyBlock sentence={t('dashboard.no_signals', {}, locale)} {...emptyAction('signal_health')} />
          ) : (
            <table className="w-full border-collapse type-body">
              <caption className="sr-only">{t('dashboard.signal_health', {}, locale)}</caption>
              <thead className="sr-only">
                <tr>
                  <th scope="col">{t('dashboard.source', {}, locale)}</th>
                  <th scope="col">{t('dashboard.cadence', {}, locale)}</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.signal_health.data.slice(0, LIST_CAP).map((item) => (
                  <SourceHealthRow
                    key={item.source.id}
                    source={item.source}
                    state={item.state}
                    ageS={item.age_s}
                    locale={locale}
                  />
                ))}
              </tbody>
            </table>
          )}
          <Capped shown={LIST_CAP} total={dashboard.signal_health.data.length} locale={locale} />
        </Block>

        <div className={styles.side}>
          <Block block="upcoming_risks">
            <BlockHead
              id={BLOCK_IDS.upcoming_risks}
              title={t('dashboard.upcoming_risks', {}, locale)}
              action={headAction('upcoming_risks')}
            />
            {dashboard.upcoming_risks.n === 0 ? (
              <EmptyBlock
                sentence={t('dashboard.no_upcoming', {}, locale)}
                // Shows come from a bound venue listing and storm afternoons from a bound forecast: nothing lists a
                // show by hand, so the action that exists is binding a source.
                {...emptyAction(
                  'upcoming_risks',
                  data.projects[0] ? `${projectRoot(org, data.projects[0].slug)}/settings/packs` : undefined,
                  t('dashboard.bind_source', {}, locale)
                )}
              />
            ) : (
              <ul className="flex flex-col">
                {dashboard.upcoming_risks.data.slice(0, LIST_CAP).map((item, index) => (
                  <li key={`${item.project.id}:${item.date}:${item.pack}:${index}`} className={styles.upcoming}>
                    <time dateTime={item.starts_at} className="type-body text-muted-foreground" data-numeric>
                      {t(
                        'dashboard.show_date',
                        {
                          date: formatDate(item.date, locale),
                          time: formatTime(item.starts_at, locale)
                        },
                        locale
                      )}
                    </time>
                    <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="type-card-title" translate={item.show_name ? 'no' : undefined}>
                        {item.show_name ??
                          data.projects.find((project) => project.id === item.project.id)?.name ??
                          item.project.slug}
                      </span>
                      {item.mode ? (
                        <ModeBadge mode={item.mode} pack={item.pack} locale={locale} />
                      ) : (
                        <span className="type-body text-muted-foreground">{t('dashboard.unknown', {}, locale)}</span>
                      )}
                    </p>
                    {item.warning ? (
                      <p className="type-body">
                        <span lang="ms">{item.warning.text}</span>
                        {item.warning.gloss ? (
                          <span className="text-muted-foreground">
                            {t('dashboard.warning_separator', {}, locale)}
                            {t('dashboard.warning_gloss', { gloss: item.warning.gloss }, locale)}
                          </span>
                        ) : null}
                        <span className="ml-1 type-small text-muted-foreground" data-numeric>
                          <time dateTime={item.warning.valid_from}>{formatTime(item.warning.valid_from, locale)}</time>
                          {t('dashboard.time_range_separator', {}, locale)}
                          <time dateTime={item.warning.valid_to}>{formatTime(item.warning.valid_to, locale)}</time>
                        </span>
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <Capped shown={LIST_CAP} total={dashboard.upcoming_risks.data.length} locale={locale} />
          </Block>

          <Block block="yesterday_grades">
            <BlockHead
              id={BLOCK_IDS.yesterday_grades}
              title={t('dashboard.yesterday_grades', {}, locale)}
              action={headAction('yesterday_grades')}
            />
            {dashboard.yesterday_grades.n === 0 ? (
              <EmptyBlock sentence={t('dashboard.no_grades', {}, locale)} {...emptyAction('yesterday_grades')} />
            ) : (
              <div className={styles.grades}>
                {dashboard.yesterday_grades.data.slice(0, LIST_CAP).map(({ project, grade, metric }) => (
                  <article key={grade.id} className="flex min-w-0 flex-col gap-2">
                    <h3 className="type-card-title" translate="no">
                      {data.projects.find((item) => item.id === project.id)?.name ?? project.slug}
                    </h3>
                    <GradeCard grade={grade} metric={metric} locale={locale} />
                  </article>
                ))}
              </div>
            )}
          </Block>
        </div>
      </div>
    </section>
  )
}

export function DashboardPage({
  org,
  locale = 'en',
  initialData,
  initialError,
  initialErrorAt = null
}: DashboardPageProps) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<ReadState>(() =>
    initialData
      ? { status: 'ready', value: initialData }
      : initialError
        ? { status: 'error', httpStatus: initialError, at: initialErrorAt }
        : { status: 'loading' }
  )

  useEffect(() => {
    if (initialData) {
      setState({ status: 'ready', value: initialData })
      return
    }
    if (initialError !== null && attempt === 0) {
      setState({ status: 'error', httpStatus: initialError, at: initialErrorAt })
      return
    }
    const controller = new AbortController()
    setState({ status: 'loading' })
    void readDashboard(org, new Headers(), controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setState({ status: 'ready', value })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          status: 'error',
          httpStatus: error instanceof ApiProblem ? error.status : null,
          at: new Date().toISOString()
        })
      })
    return () => controller.abort()
  }, [attempt, initialData, initialError, initialErrorAt, org])

  if (initialData) return <DashboardContent org={org} data={initialData} locale={locale} />
  if (state.status === 'loading') return <DashboardSkeleton locale={locale} />
  if (state.status === 'error')
    return (
      <DashboardFailure
        httpStatus={state.httpStatus}
        at={state.at}
        retry={() => setAttempt((value) => value + 1)}
        locale={locale}
      />
    )
  return <DashboardContent org={org} data={state.value} locale={locale} />
}

export { DashboardSkeleton }
