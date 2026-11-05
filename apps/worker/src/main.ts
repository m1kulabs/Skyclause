import { serve } from '@hono/node-server'
import { loadEnv } from '@skyclause/config'
import { createRemoteJWKSet } from 'jose'
import { registry } from './registry'
import { createServer, log, runJob } from './server'

const GOOGLE_JWKS = new URL('https://www.googleapis.com/oauth2/v3/certs')

// One Node 22 entry: no arguments serves the worker; `job <name> [args]` runs a Cloud Run job.
async function main([mode, name, ...args]: string[]) {
  if (mode === 'job') {
    loadEnv('job')
    if (!name) throw new Error('usage: main.js job <name> [args]')
    await runJob(registry, name, args)
    return
  }
  if (mode) throw new Error(`unknown mode ${mode}; usage: main.js [job <name> [args]]`)
  const env = loadEnv('worker')
  const app = createServer({
    registry,
    audience: env.WORKER_URL,
    invoker: env.WORKER_INVOKER_SA,
    jwks: createRemoteJWKSet(GOOGLE_JWKS)
  })
  serve({ fetch: app.fetch, port: env.PORT }, ({ port }) => log('INFO', 'worker listening', { port }))
}

main(process.argv.slice(2)).catch((error: unknown) => {
  log('ERROR', 'worker failed', { error: String(error) })
  process.exitCode = 1
})
