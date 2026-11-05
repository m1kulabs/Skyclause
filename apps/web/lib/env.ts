import { startTelemetry } from '@skyclause/config'

/**
 * Starts telemetry (spec §1), whose `loadEnv` stops the server at start on a missing variable, or APP_ENV=test
 * on Cloud Run, rather than answering 500s.
 */
export function startServer() {
  try {
    startTelemetry('web')
  } catch (error) {
    console.error(JSON.stringify({ severity: 'ERROR', message: 'web failed', error: String(error) }))
    process.exit(1)
  }
}
