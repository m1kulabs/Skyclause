import { randomUUID } from 'node:crypto'
import {
  context,
  diag,
  DiagLogLevel,
  metrics,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
  TraceFlags,
  type Gauge
} from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  AggregationTemporality,
  InstrumentType,
  MeterProvider,
  PeriodicExportingMetricReader,
  type PushMetricExporter
} from '@opentelemetry/sdk-metrics'
import { AlwaysOnSampler, BatchSpanProcessor, TracerProvider, type SpanExporter } from '@opentelemetry/sdk-trace'
import { METRICS, type HeartbeatName } from '@skyclause/contracts'
import { GoogleAuth } from 'google-auth-library'
import { loadEnv, type Service } from './env'
import { HttpServerDurationProcessor, startHttpServerDuration, stopHttpServerDuration } from './http-metrics'
import { redact, redactText, RedactingSpanProcessor } from './redact'

/** Google's OTLP endpoint (the Telemetry API), which writes to Cloud Trace and Cloud Monitoring. */
const TELEMETRY_API = 'https://telemetry.googleapis.com'

type Level = 'debug' | 'info' | 'warn' | 'error'
const SEVERITY: Record<Level, string> = { debug: 'DEBUG', info: 'INFO', warn: 'WARNING', error: 'ERROR' }
const RANK: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }

export type LogWriter = (line: string, severity: string) => void

const stdio: LogWriter = (line, severity) => {
  if (severity === 'ERROR') console.error(line)
  else console.log(line)
}

let logging: { level: Level; project?: string; write: LogWriter } = { level: 'info', write: stdio }

function writeLog(level: Level, message: string, fields: Record<string, unknown> = {}) {
  if (RANK[level] < RANK[logging.level]) return
  const { severity: _severity, message: _message, ...rest } = redact(fields) as Record<string, unknown>
  const entry: Record<string, unknown> = { severity: SEVERITY[level], message: redactText(message), ...rest }
  const span = trace.getActiveSpan()?.spanContext()
  if (span && logging.project) {
    entry['logging.googleapis.com/trace'] = `projects/${logging.project}/traces/${span.traceId}`
    entry['logging.googleapis.com/spanId'] = span.spanId
    entry['logging.googleapis.com/trace_sampled'] = (span.traceFlags & TraceFlags.SAMPLED) === TraceFlags.SAMPLED
  }
  logging.write(JSON.stringify(entry), SEVERITY[level])
}

/** One redacted JSON line per call, in Cloud Logging's structured format, linked to the active trace. */
export const log = {
  debug: (message: string, fields?: Record<string, unknown>) => writeLog('debug', message, fields),
  info: (message: string, fields?: Record<string, unknown>) => writeLog('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => writeLog('warn', message, fields),
  error: (message: string, fields?: Record<string, unknown>) => writeLog('error', message, fields)
}

/** The active trace as `traceparent` (and `tracestate`): set it on Pub/Sub attributes and Cloud Tasks headers. */
export function traceContext(): Record<string, string> {
  const carrier: Record<string, string> = {}
  propagation.inject(context.active(), carrier)
  return carrier
}

/**
 * Runs `work` in a span continuing the trace in `carrier` (a message's attributes or a request's headers),
 * linked to the span it was called from, such as the push request's.
 */
export function withTrace<T>(
  carrier: Record<string, string | undefined>,
  name: string,
  work: () => Promise<T>,
  kind: SpanKind = SpanKind.CONSUMER
): Promise<T> {
  const parent = propagation.extract(ROOT_CONTEXT, carrier)
  const caller = trace.getActiveSpan()?.spanContext()
  const links = caller ? [{ context: caller }] : []
  return trace.getTracer('skyclause').startActiveSpan(name, { kind, links }, parent, async (span) => {
    try {
      return await work()
    } catch (error) {
      span.recordException(error as Error)
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) })
      throw error
    } finally {
      span.end()
    }
  })
}

export interface TelemetryOptions {
  env?: Record<string, string | undefined>
  /** Doubles for tests; by default both go to the Telemetry API when `GCP_PROJECT` is set. */
  traceExporter?: SpanExporter
  metricExporter?: PushMetricExporter
  write?: LogWriter
}

export interface Telemetry {
  /** Records `skyclause.heartbeat{name} = 1`; each beat is exported once, so an absent beat shows as no data. */
  heartbeat(name: HeartbeatName): void
  /** Exports everything recorded so far. Cloud Run throttles CPU between requests, so flush before answering. */
  flush(): Promise<void>
  /** Flushes, then unregisters the global providers. */
  shutdown(): Promise<void>
}

/** A gauge is exported only in the collection after it was recorded; sums and histograms stay cumulative. */
function gaugesAsDelta(exporter: PushMetricExporter): PushMetricExporter {
  return {
    export: (data, done) => exporter.export(data, done),
    forceFlush: () => exporter.forceFlush(),
    shutdown: () => exporter.shutdown(),
    selectAggregationTemporality: (type) =>
      type === InstrumentType.GAUGE ? AggregationTemporality.DELTA : AggregationTemporality.CUMULATIVE
  }
}

function googleExporters(project: string) {
  const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' })
  const headers = async () => ({
    ...Object.fromEntries((await (await auth.getClient()).getRequestHeaders()).entries()),
    'x-goog-user-project': project
  })
  return {
    traces: new OTLPTraceExporter({ url: `${TELEMETRY_API}/v1/traces`, headers }),
    metrics: new OTLPMetricExporter({ url: `${TELEMETRY_API}/v1/metrics`, headers })
  }
}

/** Spec §1: one call at the top of every service and job entry point. */
export function startTelemetry(service: Service, options: TelemetryOptions = {}): Telemetry {
  const env = loadEnv(service, options.env ?? process.env)
  const source = options.env ?? process.env
  const project = env.GCP_PROJECT
  logging = { level: env.LOG_LEVEL ?? 'info', project, write: options.write ?? stdio }
  diag.setLogger(
    {
      error: (message) => log.error(`telemetry: ${message}`),
      warn: () => {},
      info: () => {},
      debug: () => {},
      verbose: () => {}
    },
    DiagLogLevel.ERROR
  )

  const google = project && !(options.traceExporter && options.metricExporter) ? googleExporters(project) : null
  const traceExporter = options.traceExporter ?? google?.traces
  const metricExporter = options.metricExporter ?? google?.metrics

  const resource = resourceFromAttributes({
    'service.name': env.OTEL_SERVICE_NAME ?? service,
    'service.instance.id': randomUUID(),
    ...(env.GCP_REGION && { 'cloud.region': env.GCP_REGION }),
    ...(project && { 'gcp.project_id': project }),
    ...((source.K_SERVICE || source.CLOUD_RUN_JOB) && { 'cloud.platform': 'gcp_cloud_run' })
  })

  const tracerProvider = new TracerProvider({
    resource,
    sampler: new AlwaysOnSampler(),
    spanProcessors: [
      new HttpServerDurationProcessor(),
      ...(traceExporter ? [new RedactingSpanProcessor(new BatchSpanProcessor({ exporter: traceExporter }))] : [])
    ]
  })
  const meterProvider = new MeterProvider({
    resource,
    readers: metricExporter
      ? [new PeriodicExportingMetricReader({ exporter: gaugesAsDelta(metricExporter), exportIntervalMillis: 60_000 })]
      : []
  })

  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
  propagation.setGlobalPropagator(new W3CTraceContextPropagator())
  trace.setGlobalTracerProvider(tracerProvider)
  metrics.setGlobalMeterProvider(meterProvider)

  const heartbeats: Gauge = meterProvider.getMeter('skyclause').createGauge(METRICS.heartbeat)
  startHttpServerDuration(meterProvider.getMeter('skyclause'))

  const flush = async () => {
    try {
      await Promise.all([tracerProvider.forceFlush(), meterProvider.forceFlush()])
    } catch (error) {
      log.error('telemetry flush failed', { error })
    }
  }

  return {
    heartbeat: (name) => heartbeats.record(1, { name }),
    flush,
    shutdown: async () => {
      await flush()
      await Promise.all([tracerProvider.shutdown(), meterProvider.shutdown()])
      stopHttpServerDuration()
      trace.disable()
      metrics.disable()
      propagation.disable()
      context.disable()
      diag.disable()
      logging = { level: 'info', write: stdio }
    }
  }
}
