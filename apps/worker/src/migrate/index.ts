import { closeConnections, migrate } from '@skyclause/db'
import { fileURLToPath } from 'node:url'
import { log, type WorkerPart } from '../server'

/**
 * `node main.js job migrate`: deploy.yml runs it before web and worker move (#90). The image copies
 * packages/db/migrations to /app/packages/db/migrations, three levels above this bundle's /app/apps/worker/dist/main.js.
 */
export const migrator: WorkerPart = {
  owner: 'f-db',
  jobs: {
    migrate: async () => {
      const url = process.env.DATABASE_URL_MIGRATE
      if (!url) throw new Error('migrate needs DATABASE_URL_MIGRATE')
      const folder = fileURLToPath(new URL('../../../packages/db/migrations', import.meta.url))
      try {
        const applied = await migrate(url, folder)
        log('INFO', 'migrate', { applied })
      } finally {
        await closeConnections()
      }
    }
  }
}
