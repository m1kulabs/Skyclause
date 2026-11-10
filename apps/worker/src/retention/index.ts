import { runRetentionSweep } from '@skyclause/db'
import { log, type WorkerPart } from '../server'
import { cloudStorageBucket } from './gcs'

/** `node main.js job retention` at 03:30 MYT: the NFR-14 nightly sweeps (#112), on DATABASE_URL_RETENTION. */
export const retention: WorkerPart = {
  owner: 'a-retention',
  jobs: {
    retention: async () => {
      const env = { FRAMES_BUCKET: process.env.FRAMES_BUCKET, EXPORTS_BUCKET: process.env.EXPORTS_BUCKET }
      const missing = Object.entries(env).flatMap(([name, value]) => (value ? [] : [name]))
      if (missing.length) throw new Error(`retention needs ${missing.join(', ')}`)
      await runRetentionSweep(new Date(), {
        buckets: {
          frames: cloudStorageBucket(env.FRAMES_BUCKET!),
          exports: cloudStorageBucket(env.EXPORTS_BUCKET!)
        }
      })
      log('INFO', 'retention done', {})
    }
  }
}
