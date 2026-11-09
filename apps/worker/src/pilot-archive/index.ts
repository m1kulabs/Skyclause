import { log, type WorkerPart } from '../server'
import { cloudStorageBucket } from './gcs'
import { archivePilotRecords } from './run'

/** `node main.js job pilot-archive`: run once by hand after the pilot's exports are uploaded (#79 §9 item 11). */
export const pilotArchive: WorkerPart = {
  owner: 'c-ledger-chain',
  jobs: {
    'pilot-archive': async () => {
      const env = { ARCHIVE_BUCKET: process.env.ARCHIVE_BUCKET, PILOT_PROJECT: process.env.PILOT_PROJECT }
      const missing = Object.entries(env).flatMap(([name, value]) => (value ? [] : [name]))
      if (missing.length) throw new Error(`pilot-archive needs ${missing.join(', ')}`)
      const files = await archivePilotRecords(cloudStorageBucket(env.ARCHIVE_BUCKET!), env.PILOT_PROJECT!)
      log('INFO', 'pilot archive', { files })
    }
  }
}
