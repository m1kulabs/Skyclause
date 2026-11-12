'use client'

import { useEffect, useMemo, useState } from 'react'
import type { InputValue } from '@skyclause/contracts'
import { formatDateCompact, formatTime } from '@skyclause/i18n/format'
import type { StripInput, StripReading, StripSixty } from '@skyclause/elements'
import { Badge } from '#ui/badge'
import { Button } from '#ui/button'
import { Skeleton } from '#ui/skeleton'
import {
  Trace,
  TraceLine,
  TraceTitle,
  TraceDescription,
  TraceCollapsible,
  TraceCollapsibleTrigger,
  TraceCollapsibleContent
} from '#ui/trace'
import { SourceError } from '../data-components/states'
import { WindowStrip } from '../data-components/window-strip'
import { ModeBadge } from '../brand/mode-badge'
import { StatusMark } from '../brand/status-mark'
import { ApiProblem } from '../../lib/api-fetch'
import {
  apiFetch,
  resolveProject,
  type CallDetailView,
  type CallExplanationView,
  type GradeView,
  type RunDetailView,
  type StripView
} from './operations'
import { t } from './i18n'
import styles from './calls.module.css'

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; code: number | null; at: string }
  | {
      status: 'ready'
      call: CallDetailView
      explanation: CallExplanationView
      run: RunDetailView
      grades: GradeView[]
      strip: StripView
    }

function sameInput(a: InputValue, b: InputValue): boolean {
  return a.name === b.name && a.reading_ids.join(',') === b.reading_ids.join(',')
}

function snapshotInputs(run: RunDetailView, explanation: CallExplanationView): InputValue[] {
  const values = new Map<string, InputValue>()
  for (const input of [...(run.trace?.inputs ?? []), ...explanation.inputs]) {
    const existing = [...values.values()].find((candidate) => sameInput(candidate, input))
    if (!existing) values.set(`${input.name}:${input.reading_ids.join(',')}`, input)
  }
  return [...values.values()]
}

function stripInput(strip: StripView, call: CallDetailView, run: RunDetailView): StripInput {
  const series = Object.entries(strip.series)
  const rain5Series = series.find(([name]) => /rain[_-]?(?:5m|5min)|rain5/i.test(name))?.[1] ?? []
  const rain60Series = series.find(([name]) => /rain[_-]?(?:60m|60min)|rain60/i.test(name))?.[1] ?? []
  const rain5: StripReading[] = rain5Series.map(([at, value, state]) => ({
    at,
    value,
    state: state === 'error' ? 'error' : value === null ? 'missed' : 'received'
  }))
  const rain60: StripSixty[] = rain60Series.map(([at, value]) => ({ at, value }))
  const replaySource = run.trace?.text.startsWith('Replay · ') ? run.trace.text.slice('Replay · '.length) : undefined
  const lastReadingAt = [...rain5Series, ...rain60Series]
    .map(([at]) => at)
    .sort()
    .at(-1)
  return {
    from: strip.range.from,
    to: strip.range.to,
    now: strip.range.to,
    window: call.window ? { from: call.window.starts_at, to: call.window.ends_at } : null,
    // The call's own window as the capsule, filled by its mode; edged while it is still a draft.
    windows: call.window
      ? [
          {
            id: call.window.id,
            from: call.window.starts_at,
            to: call.window.ends_at,
            state: call.no_call?.length ? 'no_call' : (call.mode ?? (call.watch ? 'storm_watch' : 'no_call')),
            draft: ['drafted', 'edited'].includes(call.state),
            title: call.window.title
          }
        ]
      : undefined,
    rain5,
    rain60,
    ...(replaySource ? { replay: { source: replaySource, capturedAt: lastReadingAt ?? strip.range.to } } : {})
  }
}

function localDate(value: string): string {
  // MYT is UTC+08:00 year round; the grades API filters by the project's local date.
  return new Date(Date.parse(value) + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function delayLine(call: CallDetailView, locale: 'en' | 'ms'): string {
  const events = [
    { label: t('calls.crossing', {}, locale), at: call.triggered_at },
    { label: t('calls.drafted', {}, locale), at: call.drafted_at },
    { label: t('calls.approved', {}, locale), at: call.approved_at },
    { label: t('calls.sent', {}, locale), at: call.sent_at }
  ]
  return events
    .map(({ label, at }, index) => {
      let value = `${label} ${at ? formatTime(at, locale) : t('calls.dash', {}, locale)}`
      const previous = events[index - 1]?.at
      if (at && previous) {
        const minutes = Math.max(0, Math.round((Date.parse(at) - Date.parse(previous)) / 60_000))
        value += ` (${t('calls.minutes', { count: minutes }, locale)})`
      }
      return value
    })
    .join(' · ')
}

function CopyButton({ value, label, locale }: { value: string; label: string; locale: 'en' | 'ms' }) {
  const [status, setStatus] = useState<'copied' | 'copy_failed' | null>(null)
  return (
    <span className={styles.copyGroup}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            setStatus('copied')
          } catch {
            setStatus('copy_failed')
          }
        }}
      >
        {label}
      </Button>
      {status ? <span role="status">{t(`calls.${status}`, {}, locale)}</span> : null}
    </span>
  )
}

/** An input's age when the call was drafted, in words: seconds under a minute, else minutes, else hours. */
function ageText(seconds: number | null, locale: 'en' | 'ms'): string {
  if (seconds === null) return t('calls.dash', {}, locale)
  if (seconds < 60) return t('calls.seconds', { count: seconds }, locale)
  if (seconds < 90 * 60) return t('calls.minutes', { count: Math.round(seconds / 60) }, locale)
  return t('calls.hours', { count: Math.round(seconds / 3600) }, locale)
}

const valueText = (input: InputValue, locale: 'en' | 'ms') =>
  input.value === null
    ? t('calls.dash', {}, locale)
    : `${Array.isArray(input.value) ? input.value.join(', ') : input.value}${input.unit ? ` ${input.unit}` : ''}`

/** The delay as one bar: drafting, approval and sending as segments as long as their minutes, approval in ink. */
function DelayBar({ call }: { call: CallDetailView }) {
  const stamps = [call.triggered_at, call.drafted_at, call.approved_at, call.sent_at]
  const parts = (['drafting', 'approval', 'sending'] as const).flatMap((part, index) => {
    const from = stamps[index]
    const to = stamps[index + 1]
    if (!from || !to) return []
    return [{ part, minutes: Math.max(0, (Date.parse(to) - Date.parse(from)) / 60_000) }]
  })
  // One part alone would fill the bar and say nothing about where the time went.
  if (parts.length < 2) return null
  return (
    <div className={styles.delayBarTrack} aria-hidden="true">
      {parts.map(({ part, minutes }) => (
        <span
          key={part}
          className={styles.delaySegment}
          data-part={part}
          style={{ flexGrow: Math.max(minutes, 0.5) }}
        />
      ))}
    </div>
  )
}

function gradeDate(call: CallDetailView): string | undefined {
  if (call.night) return call.night.date
  if (call.window) return localDate(call.window.starts_at)
  return undefined
}

export function CallDetailPage({
  org,
  projectSlug,
  callId,
  locale = 'en'
}: {
  org: string
  projectSlug: string
  callId: string
  locale?: 'en' | 'ms'
}) {
  const [state, setState] = useState<DetailState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    void resolveProject(org, projectSlug, controller.signal)
      .then(async (project) => {
        const [call, explanation] = await Promise.all([
          apiFetch('getCall', { org, params: { id: callId }, signal: controller.signal }),
          apiFetch('getCallExplanation', { org, params: { id: callId }, signal: controller.signal })
        ])
        if (call.project_id !== project.id) throw new Error('Call unavailable')
        const [run, strip, gradePage] = await Promise.all([
          apiFetch('getRun', { org, params: { id: call.trace_id }, signal: controller.signal }),
          apiFetch('getProjectStrip', { org, params: { id: project.id }, signal: controller.signal }),
          apiFetch('listGrades', {
            org,
            params: { id: project.id },
            query: {
              limit: 200,
              pack: call.night_id ? 'crowd' : undefined,
              from: gradeDate(call),
              to: gradeDate(call)
            },
            signal: controller.signal
          })
        ])
        return { call, explanation, run, strip, grades: gradePage.data }
      })
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: 'ready', ...data })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            status: 'error',
            code: error instanceof ApiProblem ? error.status : null,
            at: new Date().toISOString()
          })
      })
    return () => controller.abort()
  }, [org, projectSlug, callId, attempt])

  const inputs = useMemo(() => (state.status === 'ready' ? snapshotInputs(state.run, state.explanation) : []), [state])
  const strip = useMemo(
    () => (state.status === 'ready' ? stripInput(state.strip, state.call, state.run) : undefined),
    [state]
  )

  return (
    <section
      className={styles.detailPage}
      aria-label={t('calls.region_detail', {}, locale)}
      aria-busy={state.status === 'loading'}
      data-calls-ready={state.status === 'loading' ? undefined : 'true'}
    >
      {state.status === 'loading' && (
        <div className={styles.detailLoading} role="status">
          <span className="sr-only">{t('calls.loading_detail', {}, locale)}</span>
          <Skeleton className="h-8 w-80 max-w-full rounded-full" />
          <Skeleton className="h-6 w-56 rounded-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      )}
      {state.status === 'error' && (
        <>
          <h1>{t('calls.detail', {}, locale)}</h1>
          <SourceError
            source={t('calls.call_source', {}, locale)}
            status={state.code}
            at={state.at}
            locale={locale}
            retry={
              <Button type="button" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
                {t('calls.retry', {}, locale)}
              </Button>
            }
          />
        </>
      )}
      {state.status === 'ready' &&
        (() => {
          const { call, explanation, run, grades } = state
          const mark = call.no_call?.length ? 'no_call' : (call.mode ?? 'no_call')
          const replay = run.trace?.text.startsWith('Replay · ') || call.reason.startsWith('Replay · ')
          const grade = grades.find((item) => item.call_id === call.id) ?? call.grade
          const pending = grades.find((item) => item.night_id === call.night_id && item.outcome === 'pending')
          return (
            <>
              <header className={styles.detailHeader}>
                <h1>{call.window?.title ?? call.night?.date ?? t('calls.detail', {}, locale)}</h1>
                <div className={styles.detailIdentity}>
                  <ModeBadge mode={mark} locale={locale} />
                  <span className={styles.callState}>{t(`calls.states.${call.state}`, {}, locale)}</span>
                  {call.window ? (
                    <time dateTime={call.window.starts_at} className={styles.detailWhen}>
                      {t(
                        'calls.window_range',
                        {
                          date: formatDateCompact(call.window.starts_at, locale),
                          from: formatTime(call.window.starts_at, locale),
                          to: formatTime(call.window.ends_at, locale)
                        },
                        locale
                      )}
                    </time>
                  ) : null}
                  {replay ? (
                    <Badge variant="outline">
                      {t(
                        'calls.replay',
                        {
                          label:
                            (run.trace?.text.startsWith('Replay · ') ? run.trace.text : undefined) ??
                            call.reason.split(':')[0] ??
                            call.reason
                        },
                        locale
                      )}
                    </Badge>
                  ) : null}
                </div>
                {call.reason ? <p className={styles.reason}>{call.reason}</p> : null}
              </header>

              <div className={styles.recordGrid}>
                <div className={styles.recordMain}>
                  <section className={styles.stripLead} aria-label={t('calls.window', {}, locale)}>
                    <WindowStrip
                      windows={call.window ? [call.window] : []}
                      strip={strip}
                      list={false}
                      locale={locale}
                    />
                  </section>

                  {call.no_call?.length ? (
                    <section className={styles.panel}>
                      <h2>{t('calls.no_call', {}, locale)}</h2>
                      <ul className={styles.plainList}>
                        {call.no_call.map((name) => {
                          const input = inputs.find((value) => value.name === name)
                          return (
                            <li key={name}>
                              {input?.since ? (
                                <time dateTime={input.since}>
                                  {t('calls.no_call_input', { name, time: formatTime(input.since, locale) }, locale)}
                                </time>
                              ) : (
                                t('calls.no_call_since_unknown', { name }, locale)
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  ) : null}

                  {call.state === 'expired' && !call.sent_at ? (
                    <p className={styles.expired}>{t('calls.expired_not_sent', {}, locale)}</p>
                  ) : null}

                  <section className={styles.panel}>
                    <h2 id="call-inputs-heading">{t('calls.inputs', {}, locale)}</h2>
                    {inputs.length ? (
                      <div className={styles.tableWrap}>
                        <table className={styles.inputsTable} aria-labelledby="call-inputs-heading">
                          <thead>
                            <tr>
                              <th scope="col">{t('calls.col_input', {}, locale)}</th>
                              <th scope="col" className={styles.numeric}>
                                {t('calls.col_value', {}, locale)}
                              </th>
                              <th scope="col">{t('calls.state', {}, locale)}</th>
                              <th scope="col" className={styles.numeric}>
                                {t('calls.col_age', {}, locale)}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {inputs.map((input) => (
                              <tr key={`${input.name}:${input.reading_ids.join(',')}`} data-input={input.name}>
                                <th scope="row">{input.name}</th>
                                <td className={styles.numeric} data-numeric>
                                  {valueText(input, locale)}
                                </td>
                                <td>
                                  <StatusMark state={input.state} variant="plain" locale={locale} />
                                </td>
                                <td className={styles.numeric} data-numeric>
                                  <span className={styles.phoneLabel}>{t('calls.col_age', {}, locale)} </span>
                                  {ageText(input.age_s, locale)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className={styles.quiet}>{t('calls.no_inputs', {}, locale)}</p>
                    )}
                  </section>

                  <section className={styles.panel}>
                    <h2>{t('calls.clauses', {}, locale)}</h2>
                    {explanation.clauses.length ? (
                      <ul className={styles.clauseList}>
                        {explanation.clauses.map((clause) => (
                          <li key={clause.key}>
                            <h3>{clause.wording[locale] ?? clause.key}</h3>
                            <code>{clause.cel}</code>
                            {clause.inputs.length ? (
                              <ul className={styles.clauseInputs}>
                                {clause.inputs.map((input) => (
                                  <li key={`${clause.key}:${input.name}:${input.reading_ids.join(',')}`}>
                                    {t(
                                      'calls.clause_input',
                                      { name: input.name, value: valueText(input, locale) },
                                      locale
                                    )}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.quiet}>{t('calls.no_clauses', {}, locale)}</p>
                    )}
                  </section>

                  {explanation.warnings.length ? (
                    <section className={styles.panel}>
                      <h2>{t('calls.reason', {}, locale)}</h2>
                      <ul className={styles.plainList}>
                        {explanation.warnings.map((warning) => (
                          <li key={warning.reading_id}>
                            {warning.gloss
                              ? t('calls.warning_gloss', { text: warning.text, gloss: warning.gloss }, locale)
                              : warning.text}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  <section className={`${styles.panel} ${styles.traceSection}`}>
                    <h2>{t('calls.agent_trace', {}, locale)}</h2>
                    <Trace aria-label={t('calls.agent_trace', {}, locale)}>
                      {call.trace.map((step, index) => (
                        <TraceLine key={`${step.step}:${index}`}>
                          <TraceTitle>{step.step}</TraceTitle>
                          <TraceDescription className="text-foreground">
                            {t('calls.trace_detail', { duration: step.duration_ms, detail: step.detail }, locale)}
                          </TraceDescription>
                        </TraceLine>
                      ))}
                      <TraceCollapsible>
                        <TraceCollapsibleTrigger className="min-h-6">
                          <TraceLine>
                            {t('calls.trace_steps', { count: run.trace?.steps.length ?? 0 }, locale)}
                          </TraceLine>
                        </TraceCollapsibleTrigger>
                        <TraceCollapsibleContent>
                          <ol className={styles.stepList}>
                            {(run.trace?.steps ?? []).map((step, index) => {
                              const detail = explanation.trace.find((entry) => entry.step === step.step)
                              const duration =
                                detail?.duration_ms ??
                                (step.finished_at
                                  ? Math.max(0, Date.parse(step.finished_at) - Date.parse(step.started_at))
                                  : 0)
                              const status =
                                step.status === 'completed' ? t('calls.trace_completed', {}, locale) : step.status
                              return (
                                <li key={`${step.step}:${index}`}>
                                  {t('calls.trace_step_status', { step: step.step, status, duration }, locale)}
                                  {detail?.detail ? <p>{detail.detail}</p> : null}
                                </li>
                              )
                            })}
                          </ol>
                        </TraceCollapsibleContent>
                      </TraceCollapsible>
                    </Trace>
                  </section>
                </div>

                <aside className={styles.recordSide} aria-labelledby="call-record-heading">
                  <h2 id="call-record-heading">{t('calls.record', {}, locale)}</h2>
                  <section className={styles.recordItem}>
                    <h3>{t('calls.delay', {}, locale)}</h3>
                    <DelayBar call={call} />
                    <p className={styles.delayLine} data-delay-line>
                      {delayLine(call, locale)}
                    </p>
                    <p className={styles.quiet}>
                      {call.approved_at ? t('calls.approver', {}, locale) : t('calls.approver_pending', {}, locale)}
                    </p>
                  </section>
                  <section className={styles.recordItem}>
                    <h3>{t('calls.grade', {}, locale)}</h3>
                    {grade && grade.outcome !== 'pending' ? (
                      <div className={styles.gradeResult}>
                        <span className={styles.gradeOutcome}>{t(`calls.grades.${grade.outcome}`, {}, locale)}</span>
                        {grade.observed_mode ? (
                          <>
                            <span className={styles.quiet}>{t('calls.graded_mode', {}, locale)}</span>
                            <ModeBadge mode={grade.observed_mode} locale={locale} />
                          </>
                        ) : null}
                      </div>
                    ) : run.pack === 'sky' ? (
                      <p className={styles.quiet}>{t('calls.sky_grading_deadline', {}, locale)}</p>
                    ) : (
                      <p className={styles.quiet}>
                        {t(
                          'calls.crowd_pending',
                          {
                            time: pending?.pending_until
                              ? formatTime(pending.pending_until, locale)
                              : t('calls.dash', {}, locale)
                          },
                          locale
                        )}
                      </p>
                    )}
                  </section>
                  <section className={styles.recordItem}>
                    <h3>{t('calls.sheet', {}, locale)}</h3>
                    <p>{t('calls.clause_version', { version: call.sheet_version_id }, locale)}</p>
                  </section>
                  <section className={styles.recordItem}>
                    <h3>{t('calls.permalink', {}, locale)}</h3>
                    <div className={styles.linkValue}>
                      <a href={call.permalink} aria-label={`${t('calls.permalink', {}, locale)}: ${call.permalink}`}>
                        {call.permalink}
                      </a>
                      <CopyButton
                        value={call.permalink}
                        label={t('calls.copy_permalink', {}, locale)}
                        locale={locale}
                      />
                    </div>
                  </section>
                  <section className={styles.recordItem}>
                    <h3>{t('calls.trace_id', {}, locale)}</h3>
                    <div className={styles.linkValue}>
                      <code>{call.trace_id}</code>
                      <CopyButton value={call.trace_id} label={t('calls.copy_trace', {}, locale)} locale={locale} />
                    </div>
                  </section>
                </aside>
              </div>
            </>
          )
        })()}
    </section>
  )
}
