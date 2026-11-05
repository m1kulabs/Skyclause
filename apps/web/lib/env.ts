import { loadEnv } from '@skyclause/config'

/** Stops the server at start on a missing variable, or APP_ENV=test on Cloud Run, rather than answering 500s. */
export function checkEnv() {
  try {
    loadEnv('web')
  } catch (error) {
    console.error(JSON.stringify({ severity: 'ERROR', message: 'web failed', error: String(error) }))
    process.exit(1)
  }
}
