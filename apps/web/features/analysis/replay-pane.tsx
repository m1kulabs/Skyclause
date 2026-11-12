'use client'

import type { SheetVersion } from '@skyclause/contracts'
import { useCallback, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip } from '#ui/chart'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '#ui/table'
import { formatDate, formatDateCompact, formatNumber } from '@skyclause/i18n/format'
import { ReplayMark } from '../brand/replay-mark'
import { NotBuilt } from '../data-components/states'
import { ApiProblem } from '../../lib/api-fetch'
import { t } from './catalogue'
import { apiFetch, allPages, type Replay } from './operations'
import { axisTicks, thinned, type AnalysisState, type Locale, type ReplayPoint, type ReplaySeries } from './model'
import { EmptyBlock, Failure, MetricRow, Time } from './presentation'
import { useRead } from './use-read'

const PAGE = 50

/** The replayed steps as the shared table, 50 to a page: a replay over 90 days can hold thousands. */
function StepsTable({ points, locale }: { points: ReplayPoint[]; locale: Locale }) {
  const [page, setPage] = useState(0)
  const pages = Math.ceil(points.length / PAGE)
  const current = Math.min(page, Math.max(0, pages - 1))
  const shown = points.slice(current * PAGE, current * PAGE + PAGE)
  return (
    <div className="analysis-table-frame">
      <Table compact>
        <TableCaption className="sr-only">{t('analysis.replayAxis', {}, locale)}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t('analysis.at', {}, locale)}</TableHead>
            <TableHead scope="col" numeric>
              {t('analysis.value', {}, locale)}
            </TableHead>
            <TableHead scope="col">{t('analysis.origin', {}, locale)}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((point, index) => (
            <TableRow key={`${point.at}-${index}`} data-origin="replay">
              <TableCell phone="primary">
                <Time at={point.at} locale={locale} />
              </TableCell>
              <TableCell numeric phone="end">
                {formatNumber(point.value ?? 0, locale)}
              </TableCell>
              <TableCell phone="hide">{t('analysis.replay', {}, locale)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {pages > 1 && (
        <div className="analysis-pager">
          <p role="status" className="analysis-muted" data-numeric>
            {t(
              'analysis.rowsShown',
              {
                from: formatNumber(current * PAGE + 1, locale),
                to: formatNumber(current * PAGE + shown.length, locale),
                n: formatNumber(points.length, locale)
              },
              locale
            )}
          </p>
          <Button variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>
            {t('analysis.previousRows', {}, locale)}
          </Button>
          <Button variant="outline" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            {t('analysis.nextRows', {}, locale)}
          </Button>
        </div>
      )}
    </div>
  )
}

function ReplayChart({ series, locale }: { series: ReplaySeries; locale: Locale }) {
  const [table, setTable] = useState(false)
  // A long replay is drawn thinned (each point the highest count of its run); the table keeps every step.
  const drawn = thinned(series.points)
  // Fired clauses are counts: whole-number steps, at least 0–3.
  const ticks = axisTicks(Math.max(2, ...series.points.map((point) => point.value ?? 0)))
  const steps = formatNumber(series.points.length, locale)
  return (
    <div data-replay-chart>
      <div className="analysis-chart-head">
        <h3>{t('analysis.replaySummary', { n: steps }, locale)}</h3>
        <Button variant="ghost" size="sm" aria-expanded={table} onClick={() => setTable(!table)}>
          {t(table ? 'analysis.view' : 'analysis.table', {}, locale)}
        </Button>
      </div>
      {drawn.size > 1 && !table && (
        <p className="analysis-sub">
          {t('analysis.replayThinned', { n: steps, size: formatNumber(drawn.size, locale) }, locale)}
        </p>
      )}
      {!series.points.length ? (
        <EmptyBlock message="replayEmpty" locale={locale} />
      ) : (
        <>
          {!table && (
            <ChartContainer
              config={{ value: { label: t('analysis.replayAxis', {}, locale), color: 'var(--chart-ink)' } }}
              className="analysis-chart"
            >
              <LineChart data={drawn.points} accessibilityLayer margin={{ left: 0, right: 16, top: 16, bottom: 8 }}>
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
                        <p>{t('analysis.fired', { n: formatNumber(Number(payload[0].value), locale) }, locale)}</p>
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
                  dot={drawn.points.length > 120 ? false : { r: 3, fill: 'var(--card)', stroke: 'var(--chart-ink)' }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ChartContainer>
          )}
          {table && <StepsTable points={series.points} locale={locale} />}
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
  change: (values: Record<string, string>, replace?: boolean) => void
  canDraft: boolean
  locale: Locale
}) {
  // A form field's edit replaces the URL's history entry instead of adding one per keystroke.
  const edit = (values: Record<string, string>) => change(values, true)
  const result = useRef<HTMLElement>(null)
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
  const [run, setRun] = useState<{
    key: string
    status: 'loading' | 'error' | 'ready'
    value?: Replay
    /** Why a run failed: the sheet or range was refused (422), or the run did not complete. */
    failure?: 'refused' | 'failed'
  }>()
  // A 501 means the replay engine is not available on this server yet: Run could only fail again, so the form gives way
  // to saying so. Only an answer decides it, so once the engine answers, Run works on the next visit.
  const [unavailable, setUnavailable] = useState(false)
  const notice = useRef<HTMLDivElement>(null)
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
      if (currentKey.current === key) {
        setRun({ key, status: 'ready', value })
        // The result takes focus, so the keyboard does not stay on a button that was disabled while running.
        requestAnimationFrame(() => result.current?.focus())
      }
    } catch (error) {
      if (error instanceof ApiProblem && error.status === 501) {
        setUnavailable(true)
        // The notice takes Run's place, so it takes Run's focus too and is read out; focus never falls to the body.
        requestAnimationFrame(() => notice.current?.focus())
      } else if (currentKey.current === key)
        setRun({
          key,
          status: 'error',
          failure: error instanceof ApiProblem && error.status === 422 ? 'refused' : 'failed'
        })
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
  const reversed = !!state.from && !!state.to && !validRange
  // Run waits for a sheet, a version and a valid range, and says which it is waiting for (once the lists have loaded).
  const waiting =
    sheets.status === 'ready' && !sheet
      ? 'analysis.chooseSheetFirst'
      : sheet && versions.status === 'ready' && !version
        ? 'analysis.chooseVersionFirst'
        : null
  const invalid = (key: 'sheet' | 'version' | 'range') =>
    (key === 'range' && reversed) ||
    (key === 'sheet' && waiting === 'analysis.chooseSheetFirst') ||
    (key === 'version' && waiting === 'analysis.chooseVersionFirst')
      ? { 'aria-describedby': 'analysis-replay-problem', ...(key === 'range' ? { 'aria-invalid': true } : {}) }
      : {}
  const sheetsOfPack = sheets.status === 'ready' ? sheets.value.filter((item) => item.pack === state.pack) : []
  const sheetName = (id: string) => {
    const index = sheetsOfPack.findIndex((item) => item.id === id)
    const pack = t(`analysis.tabs.${state.pack}`, {}, locale)
    return sheetsOfPack.length > 1
      ? t('analysis.sheetNameNumbered', { pack, n: formatNumber(index + 1, locale) }, locale)
      : t('analysis.sheetName', { pack }, locale)
  }
  const versionName = (item: SheetVersion) =>
    item.status === 'draft'
      ? item.base_n
        ? t('analysis.draftLabel', { n: formatNumber(item.base_n, locale) }, locale)
        : t('analysis.draftNew', {}, locale)
      : t(
          'analysis.versionLabel',
          { subject: t('analysis.version', {}, locale), n: formatNumber(item.n, locale) },
          locale
        )
  return (
    <section className="analysis-replay" data-replay-pane aria-labelledby="analysis-replay-title">
      <div className="analysis-section-head">
        <h2 id="analysis-replay-title">
          {t('analysis.whatIf', {}, locale)}
          <ReplayMark locale={locale} />
        </h2>
        <p className="analysis-muted">{t('analysis.replayHelp', {}, locale)}</p>
      </div>
      {/* In place of the form's card, not inside it: the notice is a card of its own. */}
      {unavailable ? (
        <NotBuilt ref={notice} title={t('analysis.replayUnavailable', {}, locale)}>
          <p className="analysis-muted">{t('analysis.replayUnavailableDetail', {}, locale)}</p>
        </NotBuilt>
      ) : (
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
            <form noValidate onSubmit={(event) => void submit(event)} className="analysis-replay-form">
              <div className="analysis-form-grid">
                {field(
                  'sheet',
                  t('analysis.sheet', {}, locale),
                  <select
                    name="sheet"
                    className="native-select"
                    autoComplete="off"
                    value={sheet?.id ?? ''}
                    {...invalid('sheet')}
                    onChange={(event) => edit({ sheet: event.target.value, version: '' })}
                  >
                    <option value="">{t('analysis.chooseSheet', {}, locale)}</option>
                    {sheetsOfPack.map((item) => (
                      <option key={item.id} value={item.id}>
                        {sheetName(item.id)}
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
                    onChange={(event) => edit({ subject: event.target.value, version: '' })}
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
                    {...invalid('version')}
                    onChange={(event) => edit({ version: event.target.value })}
                  >
                    <option value="">{t('analysis.chooseVersion', {}, locale)}</option>
                    {versions.status === 'ready' &&
                      versions.value
                        .filter((item) => item.status === (state.subject === 'draft' ? 'draft' : 'published'))
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {versionName(item)}
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
                        {...invalid('range')}
                        onChange={(event) => edit({ [key]: event.target.value })}
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
                    onChange={(event) => edit({ step: event.target.value })}
                  >
                    {[...new Set(['reading', 'PT5M', 'PT60M', state.step])].map((step) => (
                      <option key={step} value={step}>
                        {step === 'reading'
                          ? t('analysis.reading', {}, locale)
                          : t('analysis.stepMinutes', { n: formatNumber(Number(step.slice(2, -1)), locale) }, locale)}
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
                  aria-describedby={reversed || waiting ? 'analysis-replay-problem' : undefined}
                >
                  {t(visible?.status === 'loading' ? 'analysis.running' : 'analysis.run', {}, locale)}
                </Button>
                {reversed ? (
                  <p role="alert" id="analysis-replay-problem">
                    {t('analysis.invalidRange', {}, locale)}
                  </p>
                ) : waiting ? (
                  <p role="status" id="analysis-replay-problem" className="analysis-sub">
                    {t(waiting, {}, locale)}
                  </p>
                ) : null}
                {visible?.status === 'error' && (
                  <p role="alert">
                    {t(visible.failure === 'refused' ? 'analysis.replayFailed' : 'analysis.replayError', {}, locale)}
                  </p>
                )}
                {/* Always mounted: says when a replay starts and when it is done. */}
                <p role="status" className="sr-only">
                  {visible?.status === 'loading'
                    ? t('analysis.running', {}, locale)
                    : visible?.status === 'ready' && value
                      ? t('analysis.replayDone', { n: formatNumber(value.steps.length, locale) }, locale)
                      : null}
                </p>
              </div>
            </form>
          )}
          {value && version && (
            <section
              aria-label={t('analysis.replay', {}, locale)}
              className="analysis-replay-result"
              ref={result}
              tabIndex={-1}
            >
              <ReplayMark
                locale={locale}
                label={t(
                  'analysis.replayLabel',
                  {
                    sheet: sheetName(state.sheet),
                    subject: t(`analysis.${state.subject}`, {}, locale),
                    version: version.n ? formatNumber(version.n, locale) : versionName(version),
                    from: formatDate(state.from, locale),
                    to: formatDate(state.to, locale)
                  },
                  locale
                )}
              />
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
      )}
    </section>
  )
}
