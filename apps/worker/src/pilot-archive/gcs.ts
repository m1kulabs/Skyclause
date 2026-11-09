import { createHash } from 'node:crypto'
import { Storage } from '@google-cloud/storage'
import type { ArchiveBucket } from './run'

/** ARCHIVE_BUCKET on Cloud Storage, as the job's service account (`jobs`, objectUser on it). */
export function cloudStorageBucket(name: string): ArchiveBucket {
  const bucket = new Storage().bucket(name)
  return {
    async list(prefix) {
      const [files] = await bucket.getFiles({ prefix })
      return files.map((file) => ({
        name: file.name,
        metadata: Object.fromEntries(
          Object.entries(file.metadata.metadata ?? {}).flatMap(([key, value]) =>
            value === null || value === undefined ? [] : [[key, String(value)]]
          )
        )
      }))
    },
    async sha256(objectName) {
      const hash = createHash('sha256')
      for await (const chunk of bucket.file(objectName).createReadStream()) hash.update(chunk as Buffer)
      return hash.digest('hex')
    },
    async copy(from, to) {
      try {
        // Generation 0 matches only a missing object, so an existing copy is never overwritten.
        await bucket.file(from).copy(bucket.file(to), { preconditionOpts: { ifGenerationMatch: 0 } })
        return 'copied'
      } catch (error) {
        if ((error as { code?: unknown }).code === 412) return 'exists'
        throw error
      }
    }
  }
}
