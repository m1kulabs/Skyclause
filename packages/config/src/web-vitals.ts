import { metrics, type Histogram } from '@opentelemetry/api'
import { METRICS } from '@skyclause/contracts'

// #111 records web vitals from `POST /e` here. One histogram for every metric (the infra dashboard reads
// `skyclause.web_vitals` with attributes `metric` and `route_group`): values arrive in milliseconds, CLS unitless.

const BOUNDARIES = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000
]

let webVitals: Histogram | undefined

export function startWebVitals() {
  webVitals = metrics.getMeter('skyclause').createHistogram(METRICS.webVitals, {
    unit: 'ms',
    description: 'Web vital measurement from POST /e: milliseconds, except CLS which is unitless.',
    advice: { explicitBucketBoundaries: BOUNDARIES }
  })
}

export function stopWebVitals() {
  webVitals = undefined
}

/** One point on `skyclause.web_vitals`; a no-op until `startTelemetry` runs. */
export function recordWebVital(o: { metric: string; value: number; route_group: string }) {
  webVitals?.record(o.value, { metric: o.metric, route_group: o.route_group })
}
