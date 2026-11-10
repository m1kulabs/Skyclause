import { Storage } from '@google-cloud/storage'
import type { DataRightsBucket } from './index'

export function cloudBucket(name: string, storage = new Storage()): DataRightsBucket {
  const bucket = storage.bucket(name)
  return {
    name,
    async write(path, contents) {
      await bucket.file(path).save(contents, { resumable: false, metadata: { contentType: 'application/zip' } })
    },
    async deleteObject(path) {
      const [files] = await bucket.getFiles({ prefix: path, versions: true })
      await Promise.all(files.filter((file) => file.name === path).map((file) => file.delete({ ignoreNotFound: true })))
    },
    async deletePrefix(prefix) {
      const [files] = await bucket.getFiles({ prefix, versions: true })
      await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })))
      return files.length
    }
  }
}
