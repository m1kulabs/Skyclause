import { memo } from 'react'
import { Trace, TraceLine, TraceCollapsible, TraceCollapsibleTrigger, TraceCollapsibleContent } from '#ui/trace'
import { formatNumber } from '@skyclause/i18n/format'
import { InputFact } from './input-fact'
import { counted, t, type Locale } from './i18n'
import type { CallDetail, RunDetail } from './operations'

/**
 * The agent trace, collapsed: the run and its status stay in view, the steps open on request. For an all-Normal bundle
 * it leads with the fresh inputs, since that is the whole of the decision.
 */
export const ReviewTrace = memo(function ReviewTrace({
  calls,
  run,
  normal,
  locale = 'en'
}: {
  calls: CallDetail[]
  run?: RunDetail
  normal: boolean
  locale?: Locale
}) {
  const inputs = [...new Map(calls.flatMap((call) => call.inputs).map((input) => [input.name, input])).values()]
  const steps = calls.flatMap((call) => call.trace.map((step, index) => ({ key: `${call.id}-${index}`, step })))
  const fresh = inputs.filter((input) => input.state === 'fresh').length
  return (
    <section className="bundle-trace" aria-labelledby="bundle-trace-heading">
      <h2 id="bundle-trace-heading">{t('bundles.trace', {}, locale)}</h2>
      {normal && (
        <>
          <p className="bundle-trace-normal">
            {t(counted('bundles.normal', fresh), { count: formatNumber(fresh, locale) }, locale)}
          </p>
          {inputs.map((input) => (
            <InputFact key={input.name} input={input} locale={locale} />
          ))}
        </>
      )}
      {run && (
        <p>{t('bundles.run', { id: run.id, status: t(`bundles.run_states.${run.status}`, {}, locale) }, locale)}</p>
      )}
      {run?.reason && <p className="bundle-quiet">{run.reason}</p>}
      {!steps.length && <p className="bundle-quiet">{t('bundles.no_trace', {}, locale)}</p>}
      {steps.length > 0 && (
        <TraceCollapsible className="bundle-trace-steps">
          <TraceCollapsibleTrigger className="min-h-6">
            <TraceLine>{t('bundles.trace_steps', { count: formatNumber(steps.length, locale) }, locale)}</TraceLine>
          </TraceCollapsibleTrigger>
          <TraceCollapsibleContent>
            <Trace>
              {steps.map(({ key, step }) => (
                <TraceCollapsible key={key}>
                  <TraceCollapsibleTrigger className="min-h-6">
                    <TraceLine>
                      {t(
                        'bundles.trace_step',
                        { step: step.step, duration: formatNumber(step.duration_ms, locale) },
                        locale
                      )}
                    </TraceLine>
                  </TraceCollapsibleTrigger>
                  <TraceCollapsibleContent>
                    <p>{step.detail}</p>
                    {step.inputs.map((input) => (
                      <InputFact key={input.name} input={input} locale={locale} />
                    ))}
                  </TraceCollapsibleContent>
                </TraceCollapsible>
              ))}
            </Trace>
          </TraceCollapsibleContent>
        </TraceCollapsible>
      )}
    </section>
  )
})
