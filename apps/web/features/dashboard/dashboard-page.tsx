'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatDate, formatNumber, formatTime } from '@skyclause/i18n/format'
import type { Mode } from '@skyclause/contracts'
import { ApiProblem } from '../../lib/api-fetch'
import { Button } from '#ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '#ui/empty'
import { Skeleton } from '#ui/skeleton'
import { BundleCard, CallRow, GradeCard, SourceHealthRow, WindowStrip } from '../data-components'
import { ModeBadge } from '../brand/mode-badge'
import { readDashboard, type DashboardRead } from './operations'
import { stripInput } from './model'
import { t } from './catalogue'
import styles from './dashboard.module.css'

type DashboardBlockKey = 'needs_review' | 'windows_at_risk' | 'signal_health' | 'upcoming_risks' | 'yesterday_grades'

interface DashboardPageProps {
  org: string
  initialData: DashboardRead | null
  initialError: number | null
}

type ReadState =
  { status: 'loading' } | { status: 'ready'; value: DashboardRead } | { status: 'error'; httpStatus: number | null }

function blockTitle(key: DashboardBlockKey) {
  return t(`dashboard.${key}`)
}

function blockHref(key: DashboardBlockKey, org: string, data: DashboardRead) {
  const project = data.projects[0]
  const root = `/${encodeURIComponent(org)}`
  if (!project) return `${root}/new`
  const projectRoot = `${root}/${encodeURIComponent(project.slug)}`
  if (key === 'needs_review') return `${root}/approvals`
  if (key === 'windows_at_risk' || key === 'upcoming_risks') return `${projectRoot}/windows`
  if (key === 'signal_health') return `${root}/settings/integrations`
  return `${root}/analysis`
}

function nextAction(key: DashboardBlockKey, value: string | null) {
  if (value) return value
  const fallback: Record<DashboardBlockKey, string> = {
    needs_review: t('dashboard.review_next'),
    windows_at_risk: t('dashboard.declare_window'),
    signal_health: t('dashboard.bind_source'),
    upcoming_risks: t('dashboard.list_show'),
    yesterday_grades: t('dashboard.view_analysis')
  }
  return fallback[key]
}

function Count({ value }: { value: number }) {
  return (
    <span className="text-xs tabular-nums text-muted-foreground">
      {t('dashboard.count', { count: formatNumber(value, 'en') })}
    </span>
  )
}

function NextAction({ href, label }: { href: string; label: string }) {
  return (
    <p className="mt-2 flex flex-wrap items-baseline gap-x-1 text-sm text-muted-foreground">
      <span>{t('dashboard.next_action')}</span>
      <Link
        href={href}
        className="inline-flex min-h-6 items-center text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {label}
      </Link>
    </p>
  )
}

function EmptyBlock({
  title,
  description,
  href,
  action
}: {
  title: string
  description?: string
  href: string
  action: string
}) {
  return (
    <Empty className="items-start gap-3 rounded-none border-0 p-0 text-left">
      <EmptyHeader className="items-start gap-1">
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      <EmptyContent className="items-start">
        <Button
          variant="outline"
          render={<Link href={href} />}
          className="min-h-9 max-w-full whitespace-normal text-left"
        >
          {action}
        </Button>
      </EmptyContent>
    </Empty>
  )
}

function DashboardSkeleton() {
  const blocks: DashboardBlockKey[] = [
    'needs_review',
    'windows_at_risk',
    'signal_health',
    'upcoming_risks',
    'yesterday_grades'
  ]
  return (
    <section
      aria-label={t('dashboard.loading')}
      aria-busy="true"
      role="status"
      className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6"
    >
      <div className="mb-8 space-y-3">
        <h1 className="text-[26px] font-bold tracking-tight">{t('dashboard.title')}</h1>
        <Skeleton aria-hidden="true" className="h-7 w-[min(100%,34rem)]" />
        <Skeleton aria-hidden="true" className="h-9 w-44" />
      </div>
      <div className="space-y-8">
        {blocks.map((key, index) => (
          <section key={key} data-dashboard-block={key}>
            <h2 className="text-xl font-normal text-muted-foreground">{blockTitle(key)}</h2>
            <div className="mt-3 space-y-3" aria-hidden="true">
              <Skeleton className="h-5 w-14" />
              <Skeleton className={index === 0 ? 'h-32 w-full max-w-2xl' : 'h-12 w-full max-w-2xl'} />
              {index === 0 ? <Skeleton className="h-5 w-56" /> : null}
            </div>
          </section>
        ))}
      </div>
    </section>
  )
}

function DashboardFailure({ httpStatus, retry }: { httpStatus: number | null; retry: () => void }) {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6" aria-labelledby="dashboard-title">
      <h1 id="dashboard-title" className="text-[26px] font-bold tracking-tight">
        {t('dashboard.title')}
      </h1>
      <div className="mt-5" role="alert">
        <p className="text-sm text-destructive tabular-nums">
          {t('dashboard.dashboard_error', { status: httpStatus ?? 'unknown' })}
        </p>
        <Button type="button" variant="outline" className="mt-3 min-h-9" onClick={retry}>
          {t('dashboard.retry')}
        </Button>
      </div>
    </section>
  )
}

function DashboardContent({ org, data }: { org: string; data: DashboardRead }) {
  const dashboard = data.dashboard
  const review = data.bundles
  const firstBundle = review[0]
  const firstCall = data.firstCall
  const firstWindow =
    firstCall?.window ??
    (firstBundle
      ? (
          dashboard.windows_at_risk.data.find((item) => item.window.id === firstCall?.window_id) ??
          dashboard.windows_at_risk.data.find((item) => item.project.id === firstBundle.summary.project.id)
        )?.window
      : undefined)
  const primaryMode: Mode | null = firstCall?.mode ?? null
  const minutes = firstBundle ? Math.max(0, Math.ceil(firstBundle.summary.seconds_remaining / 60)) : 0
  const reviewHref = firstBundle
    ? `/${encodeURIComponent(org)}/approvals?item=${encodeURIComponent(firstBundle.summary.id)}`
    : `/${encodeURIComponent(org)}/approvals`

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6" aria-labelledby="dashboard-title">
      <header className="mb-8 flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 id="dashboard-title" className="text-[26px] font-bold tracking-tight">
            {t('dashboard.title')}
          </h1>
          {dashboard.needs_review.n > 0 && firstBundle ? (
            <p className="mt-2 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-2 text-xl font-medium tabular-nums">
              <span>{t('dashboard.finding_prefix', { count: formatNumber(dashboard.needs_review.n, 'en') })}</span>
              {primaryMode ? <ModeBadge mode={primaryMode} /> : <span>{t('dashboard.unknown')}</span>}
              <span>
                {t('dashboard.finding_suffix', {
                  window: firstWindow?.title ?? t('dashboard.unknown'),
                  minutes: formatNumber(minutes, 'en')
                })}
              </span>
            </p>
          ) : (
            <p className="mt-2 text-xl font-medium tabular-nums">{t('dashboard.nothing_to_approve')}</p>
          )}
        </div>
        {dashboard.needs_review.n > 0 ? (
          <Button render={<Link href={reviewHref} />} className="min-h-9 max-w-full whitespace-normal">
            {t('dashboard.review_bundles', { count: formatNumber(dashboard.needs_review.n, 'en') })}
          </Button>
        ) : null}
      </header>

      <div className="space-y-8">
        <section data-dashboard-block="needs_review" aria-labelledby="dashboard-needs-review" className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="dashboard-needs-review" className="text-xl font-normal text-muted-foreground">
              {blockTitle('needs_review')}
            </h2>
            <Count value={dashboard.needs_review.n} />
          </div>
          {dashboard.needs_review.n === 0 ? (
            data.projects.length === 0 ? (
              <div className="mt-3">
                <EmptyBlock
                  title={t('dashboard.create_project')}
                  description={t('dashboard.no_projects')}
                  href={`/${encodeURIComponent(org)}/new`}
                  action={t('dashboard.create_project')}
                />
              </div>
            ) : (
              <div className="mt-3">
                <EmptyBlock
                  title={t('dashboard.no_review')}
                  href={blockHref('needs_review', org, data)}
                  action={nextAction('needs_review', dashboard.needs_review.next_action)}
                />
              </div>
            )
          ) : (
            <>
              <NextAction
                href={blockHref('needs_review', org, data)}
                label={nextAction('needs_review', dashboard.needs_review.next_action)}
              />
              <ol className="mt-4 space-y-4">
                {review.map(({ summary, detail }, index) => {
                  const project = data.projects.find((item) => item.id === summary.project.id)
                  return (
                    <li
                      key={summary.id}
                      className={index === 0 ? styles.bundleEnter : undefined}
                      data-dashboard-bundle-entry={index === 0 ? 'new' : undefined}
                    >
                      <BundleCard
                        bundle={detail}
                        trigger={detail.trigger}
                        triggeredAt={detail.triggered_at}
                        projectName={project?.name ?? summary.project.slug}
                        now={new Date(
                          new Date(summary.sla_due_at).getTime() - summary.seconds_remaining * 1000
                        ).toISOString()}
                      />
                      {index === 0 && data.strip ? (
                        <div data-window-strip className="mt-3 rounded-xl border border-border p-3 sm:p-4">
                          <WindowStrip
                            windows={data.strip.window ? [data.strip.window] : []}
                            strip={stripInput(data.strip)}
                          />
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ol>
            </>
          )}
        </section>

        <section data-dashboard-block="windows_at_risk" aria-labelledby="dashboard-windows-at-risk" className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="dashboard-windows-at-risk" className="text-xl font-normal text-muted-foreground">
              {blockTitle('windows_at_risk')}
            </h2>
            <Count value={dashboard.windows_at_risk.n} />
          </div>
          {dashboard.windows_at_risk.n === 0 ? (
            <div className="mt-3">
              <EmptyBlock
                title={t('dashboard.no_at_risk')}
                href={blockHref('windows_at_risk', org, data)}
                action={nextAction('windows_at_risk', dashboard.windows_at_risk.next_action)}
              />
            </div>
          ) : (
            <>
              <NextAction
                href={blockHref('windows_at_risk', org, data)}
                label={nextAction('windows_at_risk', dashboard.windows_at_risk.next_action)}
              />
              <div className="mt-3 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <caption className="sr-only">{blockTitle('windows_at_risk')}</caption>
                  <thead className="sr-only">
                    <tr>
                      <th scope="col">{t('dashboard.window')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.windows_at_risk.data.slice(0, 6).map((item) => (
                      <CallRow
                        key={item.window.id}
                        dashboard={{
                          projectName:
                            data.projects.find((project) => project.id === item.project.id)?.name ?? item.project.slug,
                          window: item.window,
                          verdict: item.verdict
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {dashboard.windows_at_risk.n > 6 ? (
                <p className="mt-2">
                  <Link
                    href={blockHref('windows_at_risk', org, data)}
                    className="inline-flex min-h-6 items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {t('dashboard.view_all')}
                  </Link>
                </p>
              ) : null}
            </>
          )}
        </section>

        <section data-dashboard-block="signal_health" aria-labelledby="dashboard-signal-health" className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="dashboard-signal-health" className="text-xl font-normal text-muted-foreground">
              {blockTitle('signal_health')}
            </h2>
            <Count value={dashboard.signal_health.n} />
          </div>
          {dashboard.signal_health.n === 0 ? (
            <div className="mt-3">
              <EmptyBlock
                title={t('dashboard.no_signals')}
                href={blockHref('signal_health', org, data)}
                action={nextAction('signal_health', dashboard.signal_health.next_action)}
              />
            </div>
          ) : (
            <>
              <NextAction
                href={blockHref('signal_health', org, data)}
                label={nextAction('signal_health', dashboard.signal_health.next_action)}
              />
              <div className="mt-3 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <caption className="sr-only">{blockTitle('signal_health')}</caption>
                  <thead className="sr-only">
                    <tr>
                      <th scope="col">{t('dashboard.source')}</th>
                      <th scope="col">{t('dashboard.cadence')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.signal_health.data.map((item) => (
                      <SourceHealthRow key={item.source.id} source={item.source} state={item.state} ageS={item.age_s} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section data-dashboard-block="upcoming_risks" aria-labelledby="dashboard-upcoming-risks" className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="dashboard-upcoming-risks" className="text-xl font-normal text-muted-foreground">
              {blockTitle('upcoming_risks')}
            </h2>
            <Count value={dashboard.upcoming_risks.n} />
          </div>
          {dashboard.upcoming_risks.n === 0 ? (
            <div className="mt-3">
              <EmptyBlock
                title={t('dashboard.no_upcoming')}
                href={blockHref('upcoming_risks', org, data)}
                action={nextAction('upcoming_risks', dashboard.upcoming_risks.next_action)}
              />
            </div>
          ) : (
            <>
              <NextAction
                href={blockHref('upcoming_risks', org, data)}
                label={nextAction('upcoming_risks', dashboard.upcoming_risks.next_action)}
              />
              <ul className="mt-3 divide-y divide-border">
                {dashboard.upcoming_risks.data.map((item, index) => (
                  <li key={`${item.project.id}:${item.date}:${item.pack}:${index}`} className="min-w-0 py-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium" translate={item.show_name ? 'no' : undefined}>
                        {item.show_name ??
                          data.projects.find((project) => project.id === item.project.id)?.name ??
                          item.project.slug}
                      </span>
                      {item.mode ? (
                        <ModeBadge mode={item.mode} pack={item.pack} />
                      ) : (
                        <span className="text-sm text-muted-foreground">{t('dashboard.unknown')}</span>
                      )}
                      <time dateTime={item.starts_at} className="text-sm tabular-nums text-muted-foreground">
                        {t('dashboard.show_date', {
                          date: formatDate(item.date, 'en'),
                          time: formatTime(item.starts_at, 'en')
                        })}
                      </time>
                    </div>
                    {item.warning ? (
                      <p className="mt-1 max-w-3xl text-sm leading-6">
                        <span lang="ms">{item.warning.text}</span>
                        {item.warning.gloss ? (
                          <span className="text-muted-foreground">
                            {t('dashboard.warning_separator')}
                            {t('dashboard.warning_gloss', { gloss: item.warning.gloss })}
                          </span>
                        ) : null}
                        <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                          <time dateTime={item.warning.valid_from}>{formatTime(item.warning.valid_from, 'en')}</time>
                          {t('dashboard.time_range_separator')}
                          <time dateTime={item.warning.valid_to}>{formatTime(item.warning.valid_to, 'en')}</time>
                        </span>
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section
          data-dashboard-block="yesterday_grades"
          aria-labelledby="dashboard-yesterday-grades"
          className="min-w-0"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="dashboard-yesterday-grades" className="text-xl font-normal text-muted-foreground">
              {blockTitle('yesterday_grades')}
            </h2>
            <Count value={dashboard.yesterday_grades.n} />
          </div>
          {dashboard.yesterday_grades.n === 0 ? (
            <div className="mt-3">
              <EmptyBlock
                title={t('dashboard.no_grades')}
                href={blockHref('yesterday_grades', org, data)}
                action={nextAction('yesterday_grades', dashboard.yesterday_grades.next_action)}
              />
            </div>
          ) : (
            <>
              <NextAction
                href={blockHref('yesterday_grades', org, data)}
                label={nextAction('yesterday_grades', dashboard.yesterday_grades.next_action)}
              />
              <div className="mt-3 grid min-w-0 gap-4 sm:grid-cols-2">
                {dashboard.yesterday_grades.data.map(({ project, grade, metric }) => (
                  <article key={grade.id} className="min-w-0">
                    <h3 className="mb-2 text-sm font-medium">
                      {data.projects.find((item) => item.id === project.id)?.name ?? project.slug}
                    </h3>
                    <GradeCard grade={grade} metric={metric} />
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  )
}

export function DashboardPage({ org, initialData, initialError }: DashboardPageProps) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<ReadState>(() =>
    initialData
      ? { status: 'ready', value: initialData }
      : initialError
        ? { status: 'error', httpStatus: initialError }
        : { status: 'loading' }
  )

  useEffect(() => {
    if (initialData) {
      setState({ status: 'ready', value: initialData })
      return
    }
    if (initialError !== null && attempt === 0) {
      setState({ status: 'error', httpStatus: initialError })
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
        setState({ status: 'error', httpStatus: error instanceof ApiProblem ? error.status : null })
      })
    return () => controller.abort()
  }, [attempt, initialData, initialError, org])

  if (initialData) return <DashboardContent org={org} data={initialData} />
  if (state.status === 'loading') return <DashboardSkeleton />
  if (state.status === 'error')
    return <DashboardFailure httpStatus={state.httpStatus} retry={() => setAttempt((value) => value + 1)} />
  return <DashboardContent org={org} data={state.value} />
}

export { DashboardSkeleton }
