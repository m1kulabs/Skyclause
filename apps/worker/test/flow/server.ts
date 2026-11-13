// #194's ephemeral worker for the approval-flow suite (apps/web/e2e/flow): the registered handlers, which the suite
// runs at the times it names (its fake clock) instead of Cloud Scheduler. Test only: it refuses to start unless
// APP_ENV=test, listens on loopback and asks for no OIDC token, so it is never the deployed server (src/main.ts).
import { serve } from '@hono/node-server'
import { shareSystemConnection } from '@skyclause/db'
import { Hono } from 'hono'
import { registry } from '../../src/registry'

if (process.env.APP_ENV !== 'test') throw new Error('the flow worker runs only with APP_ENV=test')

const app = new Hono()
// The handler's own error, so a failing step names its cause in the spec's output.
app.onError((error, c) => c.text(String(error), 500))
app.get('/health', (c) => c.text('ok'))

// One 15-minute batch handler at `now`, on one shared system connection as `/ticks/batch` runs them.
app.post('/batch/:name', async (c) => {
  const handler = registry.batch[c.req.param('name')]
  if (!handler) return c.text('unknown batch handler', 404)
  const now = new Date((await c.req.json<{ now?: string }>()).now ?? NaN)
  if (Number.isNaN(now.getTime())) return c.text('now must be an instant', 400)
  await shareSystemConnection(() => handler(now))
  return c.body(null, 204)
})

serve({ fetch: app.fetch, hostname: '127.0.0.1', port: Number(process.env.E2E_WORKER_PORT) })
