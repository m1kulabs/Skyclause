import { drillDatabase } from '@skyclause/db'
import { log, type WorkerPart } from '../server'
import { runDrill } from './drill'
import { createNeonClient } from './neon'

/** `node main.js job restore-drill`: quarterly from Cloud Scheduler, or by hand (docs/runbooks/restore.md). */
export const restoreDrill: WorkerPart = {
  owner: 'a-ops-runbooks',
  jobs: {
    'restore-drill': async () => {
      const env = {
        NEON_PROJECT_ID: process.env.NEON_PROJECT_ID,
        NEON_DRILL_API_KEY: process.env.NEON_DRILL_API_KEY,
        // packages/db reads it; checked here so a missing secret fails before a branch is made.
        DATABASE_URL_SYSTEM: process.env.DATABASE_URL_SYSTEM
      }
      const missing = Object.entries(env).flatMap(([name, value]) => (value ? [] : [name]))
      if (missing.length) throw new Error(`restore-drill needs ${missing.join(', ')}`)

      const controller = new AbortController()
      process.once('SIGTERM', () => controller.abort())
      const { record, misses } = await runDrill({
        neon: createNeonClient({ apiKey: env.NEON_DRILL_API_KEY!, projectId: env.NEON_PROJECT_ID! }),
        database: drillDatabase,
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
