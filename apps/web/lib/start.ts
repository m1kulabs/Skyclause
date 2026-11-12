import { loadEnv, pubsubPublisher, startTelemetry } from '@skyclause/config'
import { DOMAIN_EVENTS_TOPIC, RUNS_REQUESTED, setEventPublisher, setRunPublisher } from '@skyclause/db'

/**
 * Starts telemetry (spec §1), whose `loadEnv` stops the server at start on a missing variable, or APP_ENV=test
 * on Cloud Run, rather than answering 500s; then has emitEvent publish to Pub/Sub `domain-events` (#79 §5), and a run
 * the API requests (createRun, "Ask for a call") publish to `runs-requested` at commit, wherever Terraform sets
 * GCP_PROJECT. Without the run publisher a requested run waited for the 15-minute batch's republish.
 */
export function startServer() {
  try {
    startTelemetry('web')
    const project = loadEnv('web').GCP_PROJECT
    setEventPublisher(project ? pubsubPublisher(project, DOMAIN_EVENTS_TOPIC) : null)
    setRunPublisher(project ? pubsubPublisher(project, RUNS_REQUESTED) : null)
  } catch (error) {
    console.error(JSON.stringify({ severity: 'ERROR', message: 'web failed', error: String(error) }))
    process.exit(1)
  }
}
