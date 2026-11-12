'use client'

import type { SheetVersion } from '@skyclause/contracts'
import { useCallback, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip } from '#ui/chart'
import { Badge } from '#ui/badge'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { formatDate, formatDateCompact, formatNumber } from '@skyclause/i18n/format'
import { RotateCcwIcon } from 'lucide-react'
import { t } from './catalogue'
import { apiFetch, allPages, type Replay } from './operations'
import { axisTicks, type AnalysisState, type Locale, type ReplaySeries } from './model'
import { EmptyBlock, Failure, MetricRow, Time } from './presentation'
import { useRead } from './use-read'

function ReplayChart({ series, locale }: { series: ReplaySeries; locale: Locale }) {
  const [table, setTable] = useState(false)
  // Fired clauses are counts: whole-number steps, at least 0–3.
  const ticks = axisTicks(Math.max(2, ...series.points.map((point) => point.value ?? 0)))
  return (
    <div data-replay-chart>
      <div className="analysis-chart-head">
        <h3>{t('analysis.replaySummary', { n: series.points.length }, locale)}</h3>
        <Button variant="ghost" size="sm" aria-expanded={table} onClick={() => setTable(!table)}>
          {t(table ? 'analysis.view' : 'analysis.table', {}, locale)}
        </Button>
      </div>
      <p className="analysis-sub">{t('analysis.n', { n: series.points.length }, locale)}</p>
      {!series.points.length ? (
        <EmptyBlock message="replayEmpty" locale={locale} />
      ) : (
        <>
          {!table && (
            <ChartContainer
              config={{ value: { label: t('analysis.replayAxis', {}, locale), color: 'var(--chart-ink)' } }}
              className="analysis-chart"
            >
              <LineChart data={series.points} accessibilityLayer margin={{ left: 0, right: 16, top: 16, bottom: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="at"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={40}
                  tickMargin={8}
                  tickFormatter={(value: string) => formatDateCompact(value, locale)}
                />
                <YAxis
                  ticks={ticks}
                  domain={[0, ticks.at(-1)!]}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  tickFormatter={(value: number) => formatNumber(value, locale)}
                />
                <ChartTooltip
                  content={({ active, payload }) =>
                    active && payload?.[0] ? (
                      <div className="analysis-tooltip">
                        <Time at={String(payload[0].payload.at)} locale={locale} />
                        <p>{t('analysis.fired', { n: Number(payload[0].value) }, locale)}</p>
                      </div>
                    ) : null
                  }
                />
                <Line
                  dataKey="value"
                  name={t('analysis.replayAxis', {}, locale)}
                  type="linear"
                  stroke="var(--chart-ink)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={{ r: 3, fill: 'var(--card)', stroke: 'var(--chart-ink)' }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ChartContainer>
          )}
          {table && (
            <div className="analysis-table-frame">
              <table>
                <caption className="sr-only">{t('analysis.replayAxis', {}, locale)}</caption>
                <thead>
                  <tr>
                    {['at', 'value', 'origin'].map((key) => (
                      <th key={key} scope="col">
                        {t(`analysis.${key}`, {}, locale)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {series.points.map((point, index) => (
                    <tr key={`${point.at}-${index}`} data-origin="replay">
                      <td>
                        <Time at={point.at} locale={locale} />
                      </td>
                      <td data-figure="" data-numeric>
                        {formatNumber(point.value ?? 0, locale)}
                      </td>
                      <td>{t('analysis.replay', {}, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function ReplayPane({
  projectId,
  org,
  state,
  change,
  canDraft,
  locale
}: {
  projectId: string
  org: string
  state: AnalysisState
  change: (values: Record<string, string>) => void
  canDraft: boolean
  locale: Locale
}) {
  const sheetsRead = useCallback(
    (signal: AbortSignal) =>
      allPages((cursor) => apiFetch('listClauseSheets', { org, params: { id: projectId }, query: { cursor }, signal })),
    [org, projectId]
  )
  const sheets = useRead(sheetsRead)
  const sheet =
    sheets.status === 'ready'
      ? sheets.value.find((item) => item.id === state.sheet && item.pack === state.pack)
      : undefined
  const versionsRead = useCallback(
    async (signal: AbortSignal) => {
      if (!sheet || (state.subject === 'draft' && !canDraft)) return []
      return allPages<SheetVersion>((cursor) =>
        apiFetch(state.subject === 'draft' ? 'listClauseSheetDrafts' : 'listClauseSheetVersions', {
          org,
          params: { id: sheet.id },
          query: { cursor },
          signal
        })
      )
    },
    [org, sheet, state.subject, canDraft]
  )
  const versions = useRead(versionsRead)
  const version =
    versions.status === 'ready'
      ? versions.value.find(
          (item) => item.id === state.version && item.status === (state.subject === 'draft' ? 'draft' : 'published')
        )
      : undefined
  const inputKey = JSON.stringify([
    projectId,
    state.pack,
    state.sheet,
    state.subject,
    state.version,
    state.from,
    state.to,
    state.step
  ])
  const currentKey = useRef(inputKey)
  currentKey.current = inputKey
  const [run, setRun] = useState<{ key: string; status: 'loading' | 'error' | 'ready'; value?: Replay }>()
  const visible = run?.key === inputKey ? run : undefined
  const validRange =
    !!state.from &&
    !!state.to &&
    Date.parse(state.to) >= Date.parse(state.from) &&
    Date.parse(state.to) - Date.parse(state.from) < 90 * 86_400_000
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!version || !validRange || visible?.status === 'loading') return
    const key = inputKey
    setRun({ key, status: 'loading' })
    try {
      const value = await apiFetch('evaluateWhatIf', {
        org,
        params: { id: projectId },
        body: {
          sheet: version.content,
          range: {
            from: new Date(`${state.from}T00:00:00+08:00`).toISOString(),
            to: new Date(`${state.to}T23:59:59+08:00`).toISOString(),
            step: state.step
          }
        }
      })
      if (currentKey.current === key) setRun({ key, status: 'ready', value })
    } catch {
      if (currentKey.current === key) setRun({ key, status: 'error' })
    }
  }
  const value = visible?.value
  const series: ReplaySeries = {
    kind: 'replay',
    points:
      value?.steps.map((step) => ({
        kind: 'replay',
        at: step.t_eval,
        value: [...step.verdicts.site, ...step.verdicts.windows, ...step.verdicts.nights].reduce(
          (sum, verdict) => sum + verdict.clauses.filter((clause) => clause.result === 'fired').length,
          0
        ),
        verdict: step.verdicts.hash
      })) ?? []
  }
  const field = (key: string, label: string, control: ReactNode) => (
    <label className="analysis-field" key={key}>
      <span>{label}</span>
      {control}
    </label>
  )
  return (
    <section className="analysis-replay" data-replay-pane aria-labelledby="analysis-replay-title">
      <div className="analysis-section-head">
        <h2 id="analysis-replay-title">
          {t('analysis.whatIf', {}, locale)}
          <span className="analysis-replay-mark">
            <RotateCcwIcon aria-hidden="true" focusable="false" />
            {t('analysis.replay', {}, locale)}
          </span>
        </h2>
        <p className="analysis-muted">{t('analysis.replayHelp', {}, locale)}</p>
      </div>
      <div className="analysis-replay-body">
        {sheets.status === 'error' ? (
          <Failure
            source={t('analysis.sources.sheets', {}, locale)}
            error={sheets.error}
            at={sheets.at}
            retry={sheets.retry}
            locale={locale}
          />
        ) : (
          <form onSubmit={(event) => void submit(event)} className="analysis-replay-form">
            <div className="analysis-form-grid">
              {field(
                'sheet',
                t('analysis.sheet', {}, locale),
                <select
                  name="sheet"
                  className="native-select"
                  autoComplete="off"
                  value={sheet?.id ?? ''}
                  onChange={(event) => change({ sheet: event.target.value, version: '' })}
                >
                  <option value="">{t('analysis.chooseSheet', {}, locale)}</option>
                  {sheets.status === 'ready' &&
                    sheets.value
                      .filter((item) => item.pack === state.pack)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.id}
                        </option>
                      ))}
                </select>
              )}
              {field(
                'subject',
                t('analysis.subject', {}, locale),
                <select
                  name="subject"
                  className="native-select"
                  autoComplete="off"
                  value={state.subject}
                  onChange={(event) => change({ subject: event.target.value, version: '' })}
                >
                  <option value="version">{t('analysis.version', {}, locale)}</option>
                  {canDraft && <option value="draft">{t('analysis.draft', {}, locale)}</option>}
                </select>
              )}
              {field(
                'version',
                t(state.subject === 'draft' ? 'analysis.draft' : 'analysis.version', {}, locale),
                <select
                  name="version"
                  className="native-select"
                  autoComplete="off"
                  value={version?.id ?? ''}
                  disabled={!sheet || versions.status !== 'ready'}
                  onChange={(event) => change({ version: event.target.value })}
                >
                  <option value="">{t('analysis.chooseVersion', {}, locale)}</option>
                  {versions.status === 'ready' &&
                    versions.value
                      .filter((item) => item.status === (state.subject === 'draft' ? 'draft' : 'published'))
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.status === 'draft'
                            ? t('analysis.draftLabel', { id: item.id }, locale)
                            : t(
                                'analysis.versionLabel',
                                { subject: t(`analysis.${state.subject}`, {}, locale), n: item.n, id: item.id },
                                locale
                              )}
                        </option>
                      ))}
                </select>
              )}
              {(['from', 'to'] as const).map((key) =>
                field(
                  key,
                  t(`analysis.${key}`, {}, locale),
                  <span className="analysis-field-ring" data-focus-ring>
                    <Input
                      type="date"
                      name={key}
                      autoComplete="off"
                      value={state[key]}
                      onChange={(event) => change({ [key]: event.target.value })}
                      required
                    />
                  </span>
                )
              )}
              {field(
                'step',
                t('analysis.step', {}, locale),
                <select
                  name="step"
                  className="native-select"
                  autoComplete="off"
                  value={state.step}
                  onChange={(event) => change({ step: event.target.value })}
                >
                  {[...new Set(['reading', 'PT5M', 'PT60M', state.step])].map((step) => (
                    <option key={step} value={step}>
                      {step === 'reading'
                        ? t('analysis.reading', {}, locale)
                        : t('analysis.stepMinutes', { n: Number(step.slice(2, -1)) }, locale)}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {versions.status === 'error' && (
              <Failure
                source={t('analysis.sources.versions', {}, locale)}
                error={versions.error}
                at={versions.at}
                retry={versions.retry}
                locale={locale}
              />
            )}
            {((sheets.status === 'ready' && sheets.value.length === 0) ||
              (sheet && versions.status === 'ready' && versions.value.length === 0)) && (
              <EmptyBlock message="subjectsEmpty" locale={locale} />
            )}
            <div className="analysis-replay-run">
              <Button
                type="submit"
                variant="outline"
                disabled={!version || !validRange || visible?.status === 'loading'}
              >
                {t(visible?.status === 'loading' ? 'analysis.running' : 'analysis.run', {}, locale)}
              </Button>
              {state.from && state.to && !validRange && <p role="alert">{t('analysis.invalidRange', {}, locale)}</p>}
              {visible?.status === 'error' && <p role="alert">{t('analysis.replayFailed', {}, locale)}</p>}
            </div>
          </form>
        )}
        {value && version && (
          <section aria-label={t('analysis.replay', {}, locale)} className="analysis-replay-result">
            <Badge variant="outline">
              {t(
                'analysis.replayLabel',
                {
                  sheet: state.sheet,
                  subject: t(`analysis.${state.subject}`, {}, locale),
                  version: version.n ?? version.id,
                  from: formatDate(state.from, locale),
                  to: formatDate(state.to, locale)
                },
                locale
              )}
            </Badge>
            <ReplayChart series={series} locale={locale} />
            {!!value.metrics?.length && (
              <ul className="analysis-rows" aria-label={t('analysis.replayFigures', {}, locale)}>
                {value.metrics.map((metric, index) => (
                  <MetricRow key={index} metric={metric} locale={locale} />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </section>
  )
}
