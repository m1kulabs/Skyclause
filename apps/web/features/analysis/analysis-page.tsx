'use client'

import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '#ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '#ui/toggle-group'
import { formatDateTime, formatNumber } from '@skyclause/i18n/format'
import { ApiProblem } from '../../lib/api-fetch'
import { t } from './catalogue'
import { apiFetch, allPages, type Analysis, type Project } from './operations'
import {
  analysisQuery,
  analysisState,
  leadAndRows,
  metricForTab,
  metricValue,
  periods,
  tabs,
  type AnalysisState,
  type LiveSeries,
  type Locale
} from './model'
import { EmptyBlock, Failure, Loading, MetricFigure, MetricRow, featureOff, rangeText } from './presentation'
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

/** The answer to "were the calls right?": the lead figure, the rows that measure, its chart and the ranked clauses. */
function LiveFigures({ analysis, state, locale }: { analysis: Analysis; state: AnalysisState; locale: Locale }) {
  const main = analysis.metrics.filter(
    (metric) => metric.pack === state.pack && metric.clause_key === null && metricForTab(state.tab, metric.metric)
  )
  const ranked = analysis.metrics
    .filter((metric) => metric.pack === state.pack && metric.clause_key !== null && metric.metric === 'precision')
    .sort((a, b) => b.n - a.n)
  const { lead, rows } = leadAndRows(state.tab, main)
  // The review tab leads with its list when the period has no no-call count; it never claims there are no grades.
  const showLead = !!lead || state.tab !== 'review'
  const source = t('analysis.updated', { at: formatDateTime(analysis.updated_at, locale) }, locale)
  const max = Math.max(0, ...rows.map((metric) => metricValue(metric) ?? 0))
  const series: LiveSeries | null = lead
    ? {
        kind: 'live',
        points: analysis.series.map((point) => {
          const figure = point.metrics.find(
            (candidate) =>
              candidate.pack === state.pack && candidate.clause_key === null && candidate.metric === lead.metric
          )
          return {
            kind: 'live',
            at: point.at,
            value: figure ? metricValue(figure) : null,
            metric: figure ?? { metric: lead.metric, n: 0, x: null, low: null, high: null }
          }
        })
      }
    : null
  return (
    <>
      {state.tab === 'agreement' && analysis.kill_line_exceeded && (
        <p className="analysis-kill" role="alert">
          {t('analysis.killExceeded', {}, locale)}
        </p>
      )}
      {showLead && (
        <section className="analysis-lead" aria-labelledby="analysis-answer-title">
          <h2 id="analysis-answer-title" className="sr-only">
            {t('analysis.question', {}, locale)}
          </h2>
          {lead ? (
            <div className="analysis-lead-grid">
              <MetricFigure metric={lead} from={analysis.from} to={analysis.to} source={source} locale={locale} />
              {rows.length > 0 && (
                <ul className="analysis-rows" aria-label={t('analysis.metricsTitle', {}, locale)}>
                  {rows.map((metric) => (
                    <MetricRow key={metric.metric} metric={metric} max={max || undefined} locale={locale} />
                  ))}
                </ul>
              )}
              {series && lead.n > 0 && (
                <LiveChart
                  series={series}
                  metric={lead.metric}
                  from={analysis.from}
                  to={analysis.to}
                  locale={locale}
                  n={lead.n}
                  columns={state.tab === 'delays'}
                  agreement={state.tab === 'agreement'}
                />
              )}
            </div>
          ) : (
            <div className="analysis-answer" data-metric="none">
              <p className="analysis-answer-figure analysis-answer-empty">{t('analysis.emptyFinding', {}, locale)}</p>
              <p className="analysis-answer-words">{t('analysis.next', {}, locale)}</p>
            </div>
          )}
        </section>
      )}
      {state.tab !== 'delays' && state.tab !== 'review' && (
        <section className="analysis-ranked" aria-labelledby="analysis-ranked-title">
          <div className="analysis-section-head">
            <h2 id="analysis-ranked-title">{t('analysis.ranked', {}, locale)}</h2>
            <p className="analysis-muted">{t('analysis.rankSummary', {}, locale)}</p>
          </div>
          {!ranked.length ? (
            <EmptyBlock message="noClauses" locale={locale} />
          ) : (
            <ol className="analysis-rows">
              {ranked.map((metric) => (
                <MetricRow
                  key={`${metric.pack}-${metric.clause_key}`}
                  metric={metric}
                  name={metric.clause_key!}
                  extra={t('analysis.fired', { n: formatNumber(metric.n, locale) }, locale)}
                  locale={locale}
                />
              ))}
            </ol>
          )}
        </section>
      )}
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
  const liveRange = live.status === 'ready' ? { from: live.value.from, to: live.value.to } : null
  const rangeFrom = liveRange?.from
  const rangeTo = liveRange?.to
  const gradesRead = useCallback(
    async (signal: AbortSignal) => {
      if (!projectId || !rangeFrom || !rangeTo) return null
      return allPages((cursor) =>
        apiFetch('listGrades', {
          org,
          params: { id: projectId },
          query: { pack: state.pack, from: rangeFrom, to: rangeTo, cursor },
          signal
        })
      )
    },
    [org, projectId, state.pack, rangeFrom, rangeTo]
  )
  const grades = useRead(gradesRead)
  const canEdit = ['approver', 'admin', 'owner'].includes(role)
  const canDraft = canEdit || role === 'editor'
  const crowdEnabled = crowd.status === 'ready' && crowd.value
  const visibleTabs = tabs.filter((tab) => tab !== 'crowd' || crowdEnabled)
  if (slug && !project)
    return (
      <div className="analysis-page">
        <h1>{t('analysis.title', {}, locale)}</h1>
        <Failure source={t('analysis.sources.project', {}, locale)} error={new ApiProblem(404, {})} locale={locale} />
      </div>
    )
  return (
    <div className="analysis-page" data-analysis-page>
      <header className="analysis-title">
        <div className="analysis-title-text">
          <h1>{t('analysis.title', {}, locale)}</h1>
          {live.status === 'ready' && (
            <p className="analysis-muted">
              {t(
                'analysis.scope',
                {
                  scope: project && slug ? project.name : t('analysis.allProjects', {}, locale),
                  period: rangeText(live.value.from, live.value.to, locale)
                },
                locale
              )}
            </p>
          )}
        </div>
        <ToggleGroup
          className="analysis-period"
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
      </header>
      {crowd.status === 'error' && live.status === 'ready' && (
        <Failure
          source={t('analysis.sources.crowd', {}, locale)}
          error={crowd.error}
          at={crowd.at}
          retry={crowd.retry}
          locale={locale}
        />
      )}
      <Tabs
        value={visibleTabs.includes(state.tab) ? state.tab : null}
        onValueChange={(value) =>
          value &&
          change({ tab: String(value), pack: value === 'sky' || value === 'crowd' ? String(value) : state.pack })
        }
      >
        <div className="analysis-toolbar">
          <div className="analysis-tabs-scroll">
            <TabsList aria-label={t('analysis.title', {}, locale)}>
              {visibleTabs.map((tab) => (
                <TabsTrigger key={tab} value={tab}>
                  {t(`analysis.tabs.${tab}`, {}, locale)}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {!['sky', 'crowd'].includes(state.tab) && (
            <label className="analysis-inline-field">
              <span>{t('analysis.pack', {}, locale)}</span>
              <select
                name="pack"
                className="native-select"
                autoComplete="off"
                value={state.pack}
                onChange={(event) => change({ pack: event.target.value })}
              >
                <option value="sky">{t('analysis.tabs.sky', {}, locale)}</option>
                {crowdEnabled && <option value="crowd">{t('analysis.tabs.crowd', {}, locale)}</option>}
              </select>
            </label>
          )}
        </div>
        {live.status === 'loading' && <Loading locale={locale} />}
        {live.status === 'error' && (
          <Failure
            source={t('analysis.sources.live', {}, locale)}
            error={live.error}
            at={live.at}
            retry={live.retry}
            locale={locale}
          />
        )}
        {live.status === 'ready' && (
          <>
            {tabs.map((tab) => (
              <TabsContent key={tab} value={tab} className="analysis-panel">
                {tab === state.tab && <LiveFigures analysis={live.value} state={state} locale={locale} />}
              </TabsContent>
            ))}
            {!slug && (
              <label className="analysis-project-choice">
                <span>{t('analysis.project', {}, locale)}</span>
                <select
                  name="project"
                  className="native-select"
                  autoComplete="off"
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
              <Failure
                source={t('analysis.sources.grades', {}, locale)}
                error={grades.error}
                at={grades.at}
                retry={grades.retry}
                locale={locale}
              />
            )}
            {state.tab === 'review' &&
              (projectId ? (
                grades.status === 'ready' &&
                grades.value && (
                  <ReviewPanel
                    key={`review-${projectId}`}
                    projectId={projectId}
                    org={org}
                    grades={grades.value}
                    canEdit={canEdit}
                    locale={locale}
                  />
                )
              ) : (
                <EmptyBlock message="chooseProjectReview" locale={locale} />
              ))}
            {state.tab === 'crowd' && projectId && grades.status === 'ready' && grades.value && (
              <NightLanes
                key={`nights-${projectId}`}
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
                key={`replay-${projectId}`}
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
          <Loading locale={locale} />
        ) : (
          <Failure
            source={t('analysis.sources.projects', {}, locale)}
            error={data.error}
            at={data.at}
            retry={data.retry}
            locale={locale}
          />
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
