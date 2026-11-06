'use client'

import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '#ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '#ui/toggle-group'
import { formatDate, formatDateTime, formatNumber } from '@skyclause/i18n/format'
import { ApiProblem } from '../../lib/api-fetch'
import { t } from './catalogue'
import { apiFetch, allPages, type Analysis, type Project } from './operations'
import {
  analysisQuery,
  analysisState,
  metricForTab,
  metricValue,
  periods,
  tabs,
  type AnalysisState,
  type LiveSeries,
  type Locale
} from './model'
import { EmptyBlock, Failure, MetricFigure, featureOff, rangeText } from './presentation'
import { useRead } from './use-read'
import { LiveChart } from './live-chart'
import { GradedTable } from './graded-table'
import { ReviewPanel } from './review-panel'
import { ReplayPane } from './replay-pane'
import { NightLanes } from './night-lanes'
import './analysis.css'

interface Scope {
  org: string
  project?: string
  locale: Locale
}

async function readAnalysis(
  org: string,
  projectId: string | undefined,
  state: Pick<AnalysisState, 'period' | 'pack'>,
  signal: AbortSignal
) {
  const read = (cursor?: string) =>
    projectId
      ? apiFetch('getProjectAnalysis', {
          org,
          params: { id: projectId },
          query: { ...analysisQuery(state), cursor },
          signal
        })
      : apiFetch('getOrganisationAnalysis', { org, query: { ...analysisQuery(state), cursor }, signal })
  const result = await read()
  const grades = await allPages(async (cursor) => (cursor ? (await read(cursor)).grades : result.grades))
  return { ...result, grades: { data: grades, next_cursor: null } }
}

function LiveFigures({ analysis, state, locale }: { analysis: Analysis; state: AnalysisState; locale: Locale }) {
  const metrics = analysis.metrics.filter(
    (metric) => metric.pack === state.pack && metricForTab(state.tab, metric.metric)
  )
  const ranked = analysis.metrics
    .filter((metric) => metric.pack === state.pack && metric.clause_key !== null && metric.metric === 'precision')
    .sort((a, b) => b.n - a.n)
  const main = metrics.filter((metric) => metric.clause_key === null)
  const charts = [...new Set(main.map((metric) => metric.metric))]
  const source = t('analysis.updated', { at: formatDateTime(analysis.updated_at, locale) }, locale)
  return (
    <>
      <div className="analysis-research-row">
        <section className="analysis-ranked" aria-labelledby="analysis-ranked-title">
          <h2 id="analysis-ranked-title">{t('analysis.ranked', {}, locale)}</h2>
          <p className="analysis-muted">{t('analysis.rankSummary', {}, locale)}</p>
          {!ranked.length ? (
            <EmptyBlock message="noClauses" locale={locale} />
          ) : (
            <ol>
              {ranked.map((metric) => (
                <li key={`${metric.pack}-${metric.clause_key}`}>
                  <h3>{metric.clause_key}</h3>
                  <p>{t('analysis.fired', { n: formatNumber(metric.n, locale) }, locale)}</p>
                  <MetricFigure metric={metric} from={analysis.from} to={analysis.to} source={source} locale={locale} />
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="analysis-charts" aria-label={t('analysis.chart', {}, locale)}>
          {!charts.length ? (
            <EmptyBlock message="emptyFinding" locale={locale} />
          ) : (
            charts.map((metric) => {
              const series: LiveSeries = {
                kind: 'live',
                points: analysis.series.map((point) => {
                  const figure = point.metrics.find(
                    (candidate) =>
                      candidate.pack === state.pack && candidate.clause_key === null && candidate.metric === metric
                  )
                  return {
                    kind: 'live',
                    at: point.at,
                    value: figure ? metricValue(figure) : null,
                    metric: figure ?? { metric, n: 0, x: null, low: null, high: null }
                  }
                })
              }
              return (
                <LiveChart
                  key={metric}
                  series={series}
                  metric={metric}
                  from={analysis.from}
                  to={analysis.to}
                  locale={locale}
                  n={main.find((item) => item.metric === metric)!.n}
                  columns={state.tab === 'delays'}
                  agreement={state.tab === 'agreement'}
                />
              )
            })
          )}
        </section>
      </div>
      <section aria-labelledby="analysis-metrics-title">
        <h2 id="analysis-metrics-title">{t('analysis.metricsTitle', {}, locale)}</h2>
        <div className="analysis-figures">
          {main.map((metric) => (
            <MetricFigure
              key={`${metric.pack}-${metric.metric}`}
              metric={metric}
              from={analysis.from}
              to={analysis.to}
              source={source}
              locale={locale}
            />
          ))}
        </div>
        {!main.length && <EmptyBlock locale={locale} />}
      </section>
    </>
  )
}

function Workspace({
  org,
  project: slug,
  locale,
  projects,
  role,
  state,
  change
}: Scope & {
  projects: Project[]
  role: string
  state: AnalysisState
  change: (values: Record<string, string>) => void
}) {
  const project = slug
    ? projects.find((item) => item.slug === slug)
    : projects.find((item) => item.id === state.project)
  const projectId = project?.id
  const { period, pack } = state
  const liveRead = useCallback(
    (signal: AbortSignal) => readAnalysis(org, slug ? projectId : undefined, { period, pack }, signal),
    [org, slug, projectId, period, pack]
  )
  const live = useRead(liveRead)
  const crowdRead = useCallback(
    async (signal: AbortSignal) => {
      try {
        if (slug && !projectId) return false
        if (slug)
          await apiFetch('getProjectAnalysis', {
            org,
            params: { id: projectId! },
            query: { period: state.period, pack: 'crowd' },
            signal
          })
        else await apiFetch('getOrganisationAnalysis', { org, query: { period: state.period, pack: 'crowd' }, signal })
        return true
      } catch (error) {
        if (featureOff(error)) return false
        throw error
      }
    },
    [org, slug, projectId, state.period]
  )
  const crowd = useRead(crowdRead)
  const gradesRead = useCallback(
    async (signal: AbortSignal) => {
      if (!projectId || live.status !== 'ready') return null
      return allPages((cursor) =>
        apiFetch('listGrades', {
          org,
          params: { id: projectId },
          query: { pack: state.pack, from: live.value.from, to: live.value.to, cursor },
          signal
        })
      )
    },
    [org, projectId, state.pack, live]
  )
  const grades = useRead(gradesRead)
  const canEdit = ['approver', 'admin', 'owner'].includes(role)
  const canDraft = canEdit || role === 'editor'
  const crowdEnabled = crowd.status === 'ready' && crowd.value
  const visibleTabs = tabs.filter((tab) => tab !== 'crowd' || crowdEnabled)
  const finding =
    live.status === 'ready' && live.value.metrics.some((metric) => metric.n > 0)
      ? t(
          'analysis.finding',
          { from: formatDate(live.value.from, locale), to: formatDate(live.value.to, locale) },
          locale
        )
      : live.status === 'ready'
        ? t('analysis.emptyFinding', {}, locale)
        : undefined
  if (slug && !project)
    return <Failure operation={t('analysis.title', {}, locale)} error={new ApiProblem(404, {})} locale={locale} />
  return (
    <div className="analysis-page" data-analysis-page>
      <h1>{t('analysis.title', {}, locale)}</h1>
      {finding && <p className="analysis-finding">{finding}</p>}
      {live.status === 'ready' && <p className="analysis-muted">{rangeText(live.value.from, live.value.to, locale)}</p>}
      {crowd.status === 'error' && live.status === 'ready' && (
        <Failure operation={t('analysis.tabs.crowd', {}, locale)} error={crowd.error} locale={locale} />
      )}
      <Tabs
        value={visibleTabs.includes(state.tab) ? state.tab : null}
        onValueChange={(value) =>
          value &&
          change({ tab: String(value), pack: value === 'sky' || value === 'crowd' ? String(value) : state.pack })
        }
      >
        <div className="analysis-tabs-scroll">
          <TabsList variant="line" aria-label={t('analysis.title', {}, locale)}>
            {visibleTabs.map((tab) => (
              <TabsTrigger key={tab} value={tab}>
                {t(`analysis.tabs.${tab}`, {}, locale)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <div className="analysis-toolbar analysis-controls">
          <ToggleGroup
            value={[state.period]}
            onValueChange={(values) => values[0] && change({ period: String(values[0]) })}
            aria-label={t('analysis.rangeLabel', {}, locale)}
          >
            {periods.map((period) => (
              <ToggleGroupItem key={period} value={period}>
                {t(`analysis.ranges.${period}`, {}, locale)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {!['sky', 'crowd'].includes(state.tab) && (
            <label>
              {t('analysis.pack', {}, locale)}
              <select value={state.pack} onChange={(event) => change({ pack: event.target.value })}>
                <option value="sky">{t('analysis.tabs.sky', {}, locale)}</option>
                {crowdEnabled && <option value="crowd">{t('analysis.tabs.crowd', {}, locale)}</option>}
              </select>
            </label>
          )}
        </div>
        {live.status === 'loading' && <p role="status">{t('analysis.loading', {}, locale)}</p>}
        {live.status === 'error' && (
          <Failure operation={t('analysis.title', {}, locale)} error={live.error} locale={locale} />
        )}
        {live.status === 'ready' && (
          <>
            <p className="analysis-muted">
              {t('analysis.updated', { at: formatDateTime(live.value.updated_at, locale) }, locale)}
            </p>
            {state.tab === 'agreement' && live.value.kill_line_exceeded && (
              <p role="status">{t('analysis.killExceeded', {}, locale)}</p>
            )}
            {tabs.map((tab) => (
              <TabsContent key={tab} value={tab}>
                {tab === state.tab && <LiveFigures analysis={live.value} state={state} locale={locale} />}
              </TabsContent>
            ))}
            {!slug && (
              <label className="analysis-project-choice">
                {t('analysis.project', {}, locale)}
                <select
                  value={projectId ?? ''}
                  onChange={(event) => change({ project: event.target.value, sheet: '', version: '' })}
                >
                  <option value="">{t('analysis.chooseProject', {}, locale)}</option>
                  {projects.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {grades.status === 'error' && (
              <Failure operation={t('analysis.fullTable', {}, locale)} error={grades.error} locale={locale} />
            )}
            {state.tab === 'review' &&
              (projectId ? (
                grades.status === 'ready' &&
                grades.value && (
                  <ReviewPanel
                    key={projectId}
                    projectId={projectId}
                    org={org}
                    grades={grades.value}
                    canEdit={canEdit}
                    locale={locale}
                  />
                )
              ) : (
                <p>{t('analysis.chooseProject', {}, locale)}</p>
              ))}
            {state.tab === 'crowd' && projectId && grades.status === 'ready' && grades.value && (
              <NightLanes
                key={projectId}
                projectId={projectId}
                org={org}
                from={live.value.from}
                to={live.value.to}
                grades={grades.value}
                locale={locale}
              />
            )}
            {slug ? (
              grades.status === 'ready' && grades.value && <GradedTable grades={grades.value} locale={locale} />
            ) : (
              <GradedTable grades={live.value.grades.data} locale={locale} />
            )}
            {projectId ? (
              <ReplayPane
                key={projectId}
                projectId={projectId}
                org={org}
                state={state}
                change={change}
                canDraft={canDraft}
                locale={locale}
              />
            ) : (
              <EmptyBlock message={projects.length ? 'chooseProject' : 'noProjects'} locale={locale} />
            )}
          </>
        )}
      </Tabs>
    </div>
  )
}

export function AnalysisPage({ org, project, locale }: Scope) {
  const search = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const state = analysisState(search)
  const read = useCallback(
    async (signal: AbortSignal) => {
      const [projects, memberships] = await Promise.all([
        allPages((cursor) => apiFetch('listProjects', { org, query: { cursor }, signal })),
        allPages((cursor) => apiFetch('listMyMemberships', { org, query: { cursor }, signal }))
      ])
      const membership = memberships.find((item) => item.org_slug === org)
      if (!membership) throw new ApiProblem(403, {})
      return { projects: projects.filter((item) => item.org_id === membership.org_id), role: membership.role }
    },
    [org]
  )
  const data = useRead(read)
  const change = useCallback(
    (values: Record<string, string>) => {
      const next = new URLSearchParams(search.toString())
      for (const [key, value] of Object.entries(values)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      router.push(`${pathname}?${next}`, { scroll: false })
    },
    [search, router, pathname]
  )
  if (data.status !== 'ready')
    return (
      <div className="analysis-page">
        <h1>{t('analysis.title', {}, locale)}</h1>
        {data.status === 'loading' ? (
          <p role="status">{t('analysis.loading', {}, locale)}</p>
        ) : (
          <Failure operation={t('analysis.title', {}, locale)} error={data.error} locale={locale} />
        )}
      </div>
    )
  return (
    <Workspace
      org={org}
      project={project}
      locale={locale}
      projects={data.value.projects}
      role={data.value.role}
      state={state}
      change={change}
    />
  )
}
