import { migrate } from '@skyclause/db'
import { fileURLToPath } from 'node:url'
import { log, type WorkerPart } from '../server'

/**
 * `node main.js job migrate`: deploy.yml runs it before web and worker move (#90). The image copies
 * packages/db/migrations to /app/packages/db/migrations, three levels above this bundle's /app/apps/worker/dist/main.js.
 */
export const migrations: WorkerPart = {
  owner: 'f-db',
  jobs: {
    migrate: async () => {
      const url = process.env.DATABASE_URL_MIGRATE
      if (!url) throw new Error('migrate needs DATABASE_URL_MIGRATE')
      const folder = fileURLToPath(new URL('../../../packages/db/migrations', import.meta.url))
      log('INFO', 'migrate', { applied: await migrate(url, folder) })
    }
  }
}
