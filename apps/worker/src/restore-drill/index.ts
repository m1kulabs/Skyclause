import { log, type WorkerPart } from '../server'
import { runDrill } from './drill'
import { createNeonClient } from './neon'

/** `node main.js job restore-drill`: quarterly from Cloud Scheduler, or by hand (docs/runbooks/restore.md). */
export const restoreDrill: WorkerPart = {
  owner: 'a-ops-runbooks',
  jobs: {
    'restore-drill': async () => {
      const env = { NEON_PROJECT_ID: process.env.NEON_PROJECT_ID, NEON_DRILL_API_KEY: process.env.NEON_DRILL_API_KEY }
      const missing = Object.entries(env).flatMap(([name, value]) => (value ? [] : [name]))
      if (missing.length) throw new Error(`restore-drill needs ${missing.join(', ')}`)

      const controller = new AbortController()
      process.once('SIGTERM', () => controller.abort())
      const { record, misses } = await runDrill({
        neon: createNeonClient({ apiKey: env.NEON_DRILL_API_KEY!, projectId: env.NEON_PROJECT_ID! }),
        // packages/db's reads replace null once #91's `system` login and #146's verifyLedger land.
        database: null,
        signal: controller.signal
      })
      if (misses.length) {
        log('ERROR', 'restore drill missed', { ...record, misses })
        throw new Error(`restore drill missed: ${misses.join('; ')}`)
      }
      log('INFO', 'restore drill', { ...record })
    }
  }
}
