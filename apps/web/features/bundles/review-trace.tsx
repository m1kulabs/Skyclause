import { memo } from 'react'
import { Trace, TraceLine, TraceCollapsible, TraceCollapsibleTrigger, TraceCollapsibleContent } from '#ui/trace'
import { formatTime } from '@skyclause/i18n/format'
import { InputFact } from './input-fact'
import { t } from './i18n'
import { callName } from './call-review'
import type { CallDetail, RunDetail } from './operations'

const minutes = (before: string, after: string) =>
  Math.max(0, Math.round((Date.parse(after) - Date.parse(before)) / 60000))

export const ReviewTrace = memo(function ReviewTrace({
  calls,
  run,
  normal
}: {
  calls: CallDetail[]
  run?: RunDetail
  normal: boolean
}) {
  const inputs = [...new Map(calls.flatMap((call) => call.inputs).map((input) => [input.name, input])).values()]
  return (
    <section className="bundle-trace">
      <h2>{t('bundles.trace')}</h2>
      {normal && (
        <>
          <p>{t('bundles.normal', { count: inputs.filter((input) => input.state === 'fresh').length })}</p>
          {inputs.map((input) => (
            <InputFact key={input.name} input={input} />
          ))}
        </>
      )}
      {run && <p>{t('bundles.run', { id: run.id, status: t(`bundles.run_states.${run.status}`) })}</p>}
      {run?.reason && <p>{run.reason}</p>}
      <Trace>
        {!calls.some((call) => call.trace.length) && <p>{t('bundles.no_trace')}</p>}
        {calls.flatMap((call) =>
          call.trace.map((step, index) => (
            <TraceCollapsible key={`${call.id}-${index}`}>
              <TraceCollapsibleTrigger>
                <TraceLine>{t('bundles.trace_step', { step: step.step, duration: step.duration_ms })}</TraceLine>
              </TraceCollapsibleTrigger>
              <TraceCollapsibleContent>
                <p>{step.detail}</p>
                {step.inputs.map((input) => (
                  <InputFact key={input.name} input={input} />
                ))}
              </TraceCollapsibleContent>
            </TraceCollapsible>
          ))
        )}
      </Trace>
      {!normal &&
        calls.map((call) => (
          <div key={call.id} className="bundle-delay">
            <h3>{t('bundles.delay')}</h3>
            <p>{callName(call)}</p>
            <p>{t('bundles.crossing', { time: formatTime(call.triggered_at, 'en') })}</p>
            <p>
              {t('bundles.drafted', {
                time: formatTime(call.drafted_at, 'en'),
                minutes: minutes(call.triggered_at, call.drafted_at)
              })}
            </p>
            <p>
              {call.approved_at
                ? t('bundles.approved_time', {
                    time: formatTime(call.approved_at, 'en'),
                    minutes: minutes(call.drafted_at, call.approved_at)
                  })
                : t('bundles.not_approved')}
            </p>
            <p>
              {call.sent_at && call.approved_at
                ? t('bundles.sent_time', {
                    time: formatTime(call.sent_at, 'en'),
                    minutes: minutes(call.approved_at, call.sent_at)
                  })
                : t('bundles.not_sent')}
            </p>
          </div>
        ))}
    </section>
  )
})
