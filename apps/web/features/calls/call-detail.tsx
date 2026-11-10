'use client'

import { useEffect, useMemo, useState } from 'react'
import type { InputValue } from '@skyclause/contracts'
import { formatTime } from '@skyclause/i18n/format'
import type { StripInput, StripReading, StripSixty } from '@skyclause/elements'
import { Alert, AlertDescription } from '#ui/alert'
import { Badge } from '#ui/badge'
import { Button } from '#ui/button'
import {
  Trace,
  TraceLine,
  TraceTitle,
  TraceDescription,
  TraceCollapsible,
  TraceCollapsibleTrigger,
  TraceCollapsibleContent
} from '#ui/trace'
import { InputAgeChip } from '../data-components/input-age-chip'
import { WindowStrip } from '../data-components/window-strip'
import { ModeBadge } from '../brand/mode-badge'
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
  | { status: 'error' }
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
  const base = `/${encodeURIComponent(org)}/${encodeURIComponent(projectSlug)}`

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
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' })
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
      {state.status === 'loading' && <p role="status">{t('calls.loading_detail', {}, locale)}</p>}
      {state.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>
            <span>{t('calls.not_found', {}, locale)}</span>
            <Button type="button" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
              {t('calls.retry', {}, locale)}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {state.status === 'ready' && (
        <>
          <header className={styles.detailHeader}>
            <div className={styles.detailIdentity}>
              <ModeBadge mode={state.call.mode ?? 'no_call'} locale={locale} />
              <span className={styles.callState}>{t(`calls.states.${state.call.state}`, {}, locale)}</span>
            </div>
            <h1>{state.call.window?.title ?? state.call.night?.date ?? t('calls.detail', {}, locale)}</h1>
            {state.call.reason ? <p>{state.call.reason}</p> : null}
            {state.run.trace?.text.startsWith('Replay · ') || state.call.reason.startsWith('Replay · ') ? (
              <Badge variant="outline">
                {t(
                  'calls.replay',
                  {
                    label:
                      (state.run.trace?.text.startsWith('Replay · ') ? state.run.trace.text : undefined) ??
                      state.call.reason.split(':')[0] ??
                      state.call.reason
                  },
                  locale
                )}
              </Badge>
            ) : null}
          </header>

          <section className={styles.stripSection} aria-label={t('calls.window', {}, locale)}>
            <WindowStrip windows={state.call.window ? [state.call.window] : []} strip={strip} locale={locale} />
          </section>

          {state.call.no_call?.length ? (
            <section className={styles.section}>
              <h2>{t('calls.no_call', {}, locale)}</h2>
              <ul>
                {state.call.no_call.map((name) => {
                  const input = inputs.find((value) => value.name === name)
                  return (
                    <li key={name}>
                      {input?.since
                        ? t('calls.no_call_input', { name, time: formatTime(input.since, locale) }, locale)
                        : t('calls.no_call_since_unknown', { name }, locale)}
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}

          {state.call.state === 'expired' && !state.call.sent_at ? (
            <p className={styles.expired}>{t('calls.expired_not_sent', {}, locale)}</p>
          ) : null}

          <section className={styles.section}>
            <h2>{t('calls.inputs', {}, locale)}</h2>
            {inputs.length ? (
              <Trace aria-label={t('calls.inputs', {}, locale)}>
                {inputs.map((input) => (
                  <TraceLine key={`${input.name}:${input.reading_ids.join(',')}`}>
                    <TraceTitle>{input.name}</TraceTitle>
                    <TraceDescription className="text-foreground">
                      {input.value === null
                        ? t('calls.dash', {}, locale)
                        : `${Array.isArray(input.value) ? input.value.join(', ') : input.value}${input.unit ? ` ${input.unit}` : ''}`}
                    </TraceDescription>
                    <InputAgeChip input={input} ageSeconds={input.age_s} locale={locale} />
                  </TraceLine>
                ))}
              </Trace>
            ) : (
              <p>{t('calls.no_inputs', {}, locale)}</p>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionTitle}>
              <h2>{t('calls.clauses', {}, locale)}</h2>
              <a
                className={styles.actionLink}
                href={`${base}/clauses?version=${encodeURIComponent(state.call.sheet_version_id)}`}
              >
                {t('calls.clause_version', { version: state.call.sheet_version_id }, locale)}
              </a>
            </div>
            {state.explanation.clauses.length ? (
              <ul className={styles.clauseList}>
                {state.explanation.clauses.map((clause) => (
                  <li key={clause.key}>
                    <h3>{clause.wording[locale] ?? clause.key}</h3>
                    <code>{clause.cel}</code>
                    {clause.inputs.length ? (
                      <ul className={styles.clauseInputs}>
                        {clause.inputs.map((input) => (
                          <li key={`${clause.key}:${input.name}:${input.reading_ids.join(',')}`}>
                            {t(
                              'calls.clause_input',
                              {
                                name: input.name,
                                value:
                                  input.value === null
                                    ? t('calls.dash', {}, locale)
                                    : `${Array.isArray(input.value) ? input.value.join(', ') : input.value} ${input.unit}`
                              },
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
              <p>{t('calls.no_clauses', {}, locale)}</p>
            )}
          </section>

          {state.explanation.warnings.length ? (
            <section className={styles.section}>
              <h2>{t('calls.reason', {}, locale)}</h2>
              <ul>
                {state.explanation.warnings.map((warning) => (
                  <li key={warning.reading_id}>
                    {warning.gloss
                      ? t('calls.warning_gloss', { text: warning.text, gloss: warning.gloss }, locale)
                      : warning.text}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className={`${styles.section} ${styles.traceSection}`}>
            <h2>{t('calls.agent_trace', {}, locale)}</h2>
            <Trace aria-label={t('calls.agent_trace', {}, locale)}>
              {state.call.trace.map((step, index) => (
                <TraceLine key={`${step.step}:${index}`}>
                  <TraceTitle>{step.step}</TraceTitle>
                  <TraceDescription className="text-foreground">
                    {t('calls.trace_detail', { duration: step.duration_ms, detail: step.detail }, locale)}
                  </TraceDescription>
                </TraceLine>
              ))}
              <TraceCollapsible>
                <TraceCollapsibleTrigger>
                  <TraceLine>{t('calls.trace_steps', { count: state.run.trace?.steps.length ?? 0 }, locale)}</TraceLine>
                </TraceCollapsibleTrigger>
                <TraceCollapsibleContent>
                  <ol className={styles.stepList}>
                    {(state.run.trace?.steps ?? []).map((step, index) => {
                      const detail = state.explanation.trace.find((entry) => entry.step === step.step)
                      const duration =
                        detail?.duration_ms ??
                        (step.finished_at ? Math.max(0, Date.parse(step.finished_at) - Date.parse(step.started_at)) : 0)
                      const status = step.status === 'completed' ? t('calls.trace_completed', {}, locale) : step.status
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

          <section className={styles.section}>
            <h2>{t('calls.delay', {}, locale)}</h2>
            <p className={styles.delayLine} data-delay-line>
              {delayLine(state.call, locale)}
            </p>
            <p>{state.call.approved_at ? t('calls.approver', {}, locale) : t('calls.approver_pending', {}, locale)}</p>
          </section>

          <section className={styles.section}>
            <h2>{t('calls.grade', {}, locale)}</h2>
            {(() => {
              const grade = state.grades.find((item) => item.call_id === state.call.id) ?? state.call.grade
              const pending = state.grades.find(
                (item) => item.night_id === state.call.night_id && item.outcome === 'pending'
              )
              if (grade && grade.outcome !== 'pending') {
                return (
                  <div className={styles.gradeResult}>
                    <Badge variant="outline">{t(`calls.grades.${grade.outcome}`, {}, locale)}</Badge>
                    {grade.observed_mode ? (
                      <>
                        <span>{t('calls.graded_mode', {}, locale)}</span>
                        <ModeBadge mode={grade.observed_mode} locale={locale} />
                      </>
                    ) : null}
                  </div>
                )
              }
              if (state.run.pack === 'sky') return <p>{t('calls.sky_grading_deadline', {}, locale)}</p>
              const time = pending?.pending_until
              return (
                <p>
                  {t(
                    'calls.crowd_pending',
                    { time: time ? formatTime(time, locale) : t('calls.dash', {}, locale) },
                    locale
                  )}
                </p>
              )
            })()}
          </section>

          <section className={styles.section}>
            <h2>{t('calls.permalink', {}, locale)}</h2>
            <div className={styles.linkValue}>
              <a
                href={state.call.permalink}
                aria-label={`${t('calls.permalink', {}, locale)}: ${state.call.permalink}`}
              >
                {state.call.permalink}
              </a>
              <CopyButton value={state.call.permalink} label={t('calls.copy_permalink', {}, locale)} locale={locale} />
            </div>
          </section>

          <section className={styles.section}>
            <h2>{t('calls.trace_id', {}, locale)}</h2>
            <div className={styles.linkValue}>
              <code>{state.call.trace_id}</code>
              <CopyButton value={state.call.trace_id} label={t('calls.copy_trace', {}, locale)} locale={locale} />
            </div>
          </section>
        </>
      )}
    </section>
  )
}
