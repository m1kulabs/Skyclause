import { serve } from '@hono/node-server'
import { loadEnv, pubsubPublisher, startTelemetry, withTrace } from '@skyclause/config'
import { DOMAIN_EVENTS_TOPIC, RUNS_REQUESTED, setEventPublisher, setRunPublisher } from '@skyclause/db'
import { createRemoteJWKSet } from 'jose'
import { registry } from './registry'
import { createServer, log, runJob } from './server'
import { tracePushes, traceRequests } from './telemetry'

const GOOGLE_JWKS = new URL('https://www.googleapis.com/oauth2/v3/certs')

/**
 * #79 §5: emitEvent publishes to Pub/Sub `domain-events`, and requestRun and the `runs-republish` batch to
 * `runs-requested`, wherever Terraform sets GCP_PROJECT (f-infra).
 */
function registerPublishers(project: string | undefined) {
  setEventPublisher(project ? pubsubPublisher(project, DOMAIN_EVENTS_TOPIC) : null)
  setRunPublisher(project ? pubsubPublisher(project, RUNS_REQUESTED) : null)
}

// One Node 22 entry: no arguments serves the worker; `job <name> [args]` runs a Cloud Run job.
async function main([mode, name, ...args]: string[]) {
  if (mode === 'job') {
    if (!name) throw new Error('usage: main.js job <name> [args]')
    const telemetry = startTelemetry('job')
    registerPublishers(loadEnv('job').GCP_PROJECT)
    try {
      await withTrace({}, `job ${name}`, () => runJob(registry, name, args))
    } finally {
      await telemetry.shutdown()
    }
    return
  }
  if (mode) throw new Error(`unknown mode ${mode}; usage: main.js [job <name> [args]]`)
  const telemetry = startTelemetry('worker')
  const env = loadEnv('worker')
  registerPublishers(env.GCP_PROJECT)
  const app = createServer({
    registry: tracePushes(registry),
    audience: env.WORKER_URL,
    invoker: env.WORKER_INVOKER_SA,
    jwks: createRemoteJWKSet(GOOGLE_JWKS),
    resendWebhookSecret: env.RESEND_WEBHOOK_SECRET,
    heartbeat: telemetry.heartbeat
  })
  // Cloud Run sends SIGTERM 10 s before it stops the instance: export what's left, then exit.
  process.once('SIGTERM', () => void telemetry.shutdown().finally(() => process.exit()))
  serve({ fetch: traceRequests(app.fetch, telemetry), port: env.PORT }, ({ port }) =>
    log('INFO', 'worker listening', { port })
  )
}

main(process.argv.slice(2)).catch((error: unknown) => {
  log('ERROR', 'worker failed', { error: String(error) })
  process.exitCode = 1
})
