import { loadEnv, pubsubPublisher, startTelemetry } from '@skyclause/config'
import { DOMAIN_EVENTS_TOPIC, setEventPublisher } from '@skyclause/db'

/**
 * Starts telemetry (spec §1), whose `loadEnv` stops the server at start on a missing variable, or APP_ENV=test
 * on Cloud Run, rather than answering 500s; then has emitEvent publish to Pub/Sub `domain-events` (#79 §5) wherever
 * Terraform sets GCP_PROJECT.
 */
export function startServer() {
  try {
    startTelemetry('web')
    const project = loadEnv('web').GCP_PROJECT
    setEventPublisher(project ? pubsubPublisher(project, DOMAIN_EVENTS_TOPIC) : null)
  } catch (error) {
    console.error(JSON.stringify({ severity: 'ERROR', message: 'web failed', error: String(error) }))
    process.exit(1)
  }
}
