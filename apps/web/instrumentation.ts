import { loadEnv } from '@skyclause/config'

// Next.js calls this once as the server starts. A missing variable, or APP_ENV=test on Cloud Run, stops the process
// rather than leaving a server that answers 500 to everything.
export function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  try {
    loadEnv('web')
  } catch (error) {
    console.error(JSON.stringify({ severity: 'ERROR', message: 'web failed', error: String(error) }))
    process.exit(1)
  }
}
