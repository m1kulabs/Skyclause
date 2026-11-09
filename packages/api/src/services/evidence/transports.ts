// #159's frame links, signed on first use so a build or test loads without the bucket.

/** Signs a read URL for an object in `FRAMES_BUCKET` that stops working at `expiresAt`. */
export type FrameUrlSigner = (objectPath: string, expiresAt: Date) => Promise<string>

let storage: import('@google-cloud/storage').Storage | undefined

/** Keyless V4 signing as the running service account, as the ledger's archive links do. */
export const signFrameUrl: FrameUrlSigner = async (objectPath, expiresAt) => {
  const bucket = process.env.FRAMES_BUCKET
  if (!bucket) throw new Error('FRAMES_BUCKET is not set')
  if (!storage) storage = new (await import('@google-cloud/storage')).Storage()
  const [url] = await storage.bucket(bucket).file(objectPath).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: expiresAt
  })
  return url
}
