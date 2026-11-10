import { Storage } from '@google-cloud/storage'
import type { RetentionBucket } from '@skyclause/db'

/** FRAMES_BUCKET or EXPORTS_BUCKET on Cloud Storage, as the job's service account (`jobs`, objectUser on both). */
export function cloudStorageBucket(name: string): RetentionBucket {
  const bucket = new Storage().bucket(name)
  return {
    async list(prefix) {
      const [files] = await bucket.getFiles({ prefix })
      return files
        .filter((file) => typeof file.name === 'string')
        .map((file) => ({
          name: file.name,
          metadata: Object.fromEntries(
            Object.entries(file.metadata.metadata ?? {}).flatMap(([key, value]) =>
              value === null || value === undefined ? [] : [[key, String(value)]]
            )
          ),
          timeCreated: new Date(file.metadata.timeCreated ?? Date.now()),
          // The uploader stamps the frame's project `semester_ends_on` as the object's custom time (#128 writes it).
          customTime: file.metadata.customTime ? new Date(file.metadata.customTime) : null
        }))
    },
    async delete(name) {
      try {
        await bucket.file(name).delete({ ignoreNotFound: true })
      } catch (error) {
        // A missing object is already gone, so it is not an error.
        if ((error as { code?: unknown }).code !== 404) throw error
      }
    }
  }
}
