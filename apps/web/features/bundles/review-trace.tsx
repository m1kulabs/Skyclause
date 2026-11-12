import { memo } from 'react'
import { Trace, TraceLine, TraceCollapsible, TraceCollapsibleTrigger, TraceCollapsibleContent } from '#ui/trace'
import { InputFact } from './input-fact'
import { t } from './i18n'
import type { CallDetail, RunDetail } from './operations'

/**
 * The agent trace, collapsed: the run and its status stay in view, the steps open on request. For an all-Normal bundle
 * it leads with the fresh inputs, since that is the whole of the decision.
 */
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
  const steps = calls.flatMap((call) => call.trace.map((step, index) => ({ key: `${call.id}-${index}`, step })))
  return (
    <section className="bundle-trace" aria-labelledby="bundle-trace-heading">
      <h2 id="bundle-trace-heading">{t('bundles.trace')}</h2>
      {normal && (
        <>
          <p className="bundle-trace-normal">
            {t('bundles.normal', { count: inputs.filter((input) => input.state === 'fresh').length })}
          </p>
          {inputs.map((input) => (
            <InputFact key={input.name} input={input} />
          ))}
        </>
      )}
      {run && <p>{t('bundles.run', { id: run.id, status: t(`bundles.run_states.${run.status}`) })}</p>}
      {run?.reason && <p className="bundle-quiet">{run.reason}</p>}
      {!steps.length && <p className="bundle-quiet">{t('bundles.no_trace')}</p>}
      {steps.length > 0 && (
        <TraceCollapsible className="bundle-trace-steps">
          <TraceCollapsibleTrigger className="min-h-6">
            <TraceLine>{t('bundles.trace_steps', { count: steps.length })}</TraceLine>
          </TraceCollapsibleTrigger>
          <TraceCollapsibleContent>
            <Trace>
              {steps.map(({ key, step }) => (
                <TraceCollapsible key={key}>
                  <TraceCollapsibleTrigger className="min-h-6">
                    <TraceLine>{t('bundles.trace_step', { step: step.step, duration: step.duration_ms })}</TraceLine>
                  </TraceCollapsibleTrigger>
                  <TraceCollapsibleContent>
                    <p>{step.detail}</p>
                    {step.inputs.map((input) => (
                      <InputFact key={input.name} input={input} />
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
