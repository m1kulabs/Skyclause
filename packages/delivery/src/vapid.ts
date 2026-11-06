// The `vapid-keys` job (#113): creates the approver web-push VAPID pair once per environment.
// The private key goes only to Secret Manager `VAPID_PRIVATE_KEY`, whose container Terraform makes
// without a version, so no key material reaches git, CI or Terraform state. The public key is
// printed for TF `VAPID_PUBLIC_KEY`. Keys never rotate by themselves: rotation drops every push
// subscription, so any existing version, even a disabled one, stops the job.
import { createECDH } from 'node:crypto'
import { log as sharedLog } from '@skyclause/config'

export interface VapidKeysOptions {
  /** `GCP_PROJECT` */
  project: string
  fetch?: typeof fetch
  log?: (line: Record<string, unknown>) => void
}

const TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token'

export async function ensureVapidKeys(options: VapidKeysOptions): Promise<{ created: boolean; publicKey?: string }> {
  const fetchImpl = options.fetch ?? fetch
  const log =
    options.log ??
    (({ severity, message, ...fields }) =>
      (severity === 'ERROR' ? sharedLog.error : sharedLog.info)(String(message), fields))
  const secret = `https://secretmanager.googleapis.com/v1/projects/${options.project}/secrets/VAPID_PRIVATE_KEY`

  const tokenResponse = await fetchImpl(TOKEN_URL, { headers: { 'Metadata-Flavor': 'Google' } })
  if (!tokenResponse.ok) throw new Error(`metadata access token failed (HTTP ${tokenResponse.status})`)
  const { access_token: token } = (await tokenResponse.json()) as { access_token: string }
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

  const listed = await fetchImpl(`${secret}/versions`, { headers })
  if (!listed.ok) throw new Error(`Secret Manager list VAPID_PRIVATE_KEY versions failed (HTTP ${listed.status})`)
  const { versions = [] } = (await listed.json()) as { versions?: Array<{ name: string; state: string }> }
  const liveVersions = versions.filter((version) => version.state !== 'DESTROYED')
  if (liveVersions.length) {
    log({
      severity: 'INFO',
      message: 'VAPID_PRIVATE_KEY already has a version; VAPID_PUBLIC_KEY is unchanged',
      versions: liveVersions.map((version) => version.name)
    })
    return { created: false }
  }

  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  const privateKey = ecdh.getPrivateKey()
  const privateKeyBase64url = Buffer.concat([Buffer.alloc(32 - privateKey.length), privateKey]).toString('base64url')
  const publicKey = ecdh.getPublicKey().toString('base64url')

  const added = await fetchImpl(`${secret}:addVersion`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ payload: { data: Buffer.from(privateKeyBase64url, 'utf8').toString('base64') } })
  })
  if (!added.ok) throw new Error(`Secret Manager add VAPID_PRIVATE_KEY version failed (HTTP ${added.status})`)
  log({ severity: 'INFO', message: 'vapid public key', VAPID_PUBLIC_KEY: publicKey })
  return { created: true, publicKey }
}
