import { Storage } from '@google-cloud/storage'
import { loadEnv } from '@skyclause/config'
import type { ApiDeps } from '../../context'

const TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token'

function metadataToken(send: typeof fetch) {
  let cached: { value: string; until: number } | undefined
  return async () => {
    if (cached && cached.until > Date.now()) return cached.value
    const response = await send(TOKEN_URL, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(5_000)
    })
    if (!response.ok) throw new Error(`metadata token failed: ${response.status}`)
    const result = (await response.json()) as { access_token: string; expires_in: number }
    cached = { value: result.access_token, until: Date.now() + Math.max(30, result.expires_in - 60) * 1000 }
    return cached.value
  }
}

/** Production API access to the `exports` queue and account export prefix. All methods are lazy. */
export function createDataRightsTransports(
  load = () => loadEnv('web'),
  send: typeof fetch = fetch,
  storage = new Storage()
): NonNullable<ApiDeps['dataRights']> {
  const token = metadataToken(send)
  return {
    async enqueueExport(exportId) {
      const env = load()
      if (!env.GCP_PROJECT || !env.GCP_REGION || !env.WORKER_URL || !env.WORKER_INVOKER_SA) {
        throw new Error('export queue needs GCP_PROJECT, GCP_REGION, WORKER_URL and WORKER_INVOKER_SA')
      }
      const parent = `projects/${env.GCP_PROJECT}/locations/${env.GCP_REGION}/queues/exports`
      const response = await send(`https://cloudtasks.googleapis.com/v2/${parent}/tasks`, {
        method: 'POST',
        headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          task: {
            name: `${parent}/tasks/export-${exportId}`,
            httpRequest: {
              httpMethod: 'POST',
              url: `${env.WORKER_URL}/tasks/exports`,
              headers: { 'Content-Type': 'application/json' },
              body: Buffer.from(JSON.stringify({ export_id: exportId })).toString('base64'),
              oidcToken: { serviceAccountEmail: env.WORKER_INVOKER_SA, audience: env.WORKER_URL }
            }
          }
        }),
        signal: AbortSignal.timeout(10_000)
      })
      const body = await response.text()
      if (response.ok || response.status === 409) return
      throw new Error(`Cloud Tasks exports/${exportId} failed: ${response.status} ${body.slice(0, 200)}`)
    },
    async signDownload(objectPath, expiresAt) {
      const env = load()
      if (!env.EXPORTS_BUCKET) throw new Error('EXPORTS_BUCKET is not set')
      const [url] = await storage.bucket(env.EXPORTS_BUCKET).file(objectPath).getSignedUrl({
        action: 'read',
        expires: expiresAt,
        version: 'v4'
      })
      return url
    },
    async deleteAccountExports(accountId) {
      const env = load()
      if (!env.EXPORTS_BUCKET) throw new Error('EXPORTS_BUCKET is not set')
      const bucket = storage.bucket(env.EXPORTS_BUCKET)
      const [files] = await bucket.getFiles({ prefix: `accounts/${accountId}/exports/`, versions: true })
      await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })))
      return files.length
    }
  }
}
