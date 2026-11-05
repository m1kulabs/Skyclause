// Keyless AWS (D42): the service account's Google ID token from the metadata server, exchanged by
// AssumeRoleWithWebIdentity for AWS_ROLE_ARN. infra/aws/iam.tf trusts the web and worker accounts'
// unique IDs with the role ARN as the token audience.

export interface AwsCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  expiration: Date
}

export interface WebIdentityOptions {
  /** `AWS_ROLE_ARN`, also the ID token's audience. */
  roleArn: string
  /** `SES_REGION`: STS is called in the same region. */
  region: string
  fetch?: typeof fetch
  now?: () => number
}

const IDENTITY_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity'
const REFRESH_BEFORE_MS = 5 * 60_000

function xmlField(xml: string, name: string) {
  return xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]
}

/** An AWS SDK credential provider; it caches and refreshes 5 minutes before expiry. */
export function webIdentityCredentials(options: WebIdentityOptions): () => Promise<AwsCredentials> {
  const fetchImpl = options.fetch ?? fetch
  const now = options.now ?? Date.now
  let current: AwsCredentials | undefined
  let pending: Promise<AwsCredentials> | undefined

  async function exchange(): Promise<AwsCredentials> {
    const identity = new URL(IDENTITY_URL)
    identity.searchParams.set('audience', options.roleArn)
    identity.searchParams.set('format', 'full')
    const tokenResponse = await fetchImpl(identity, { headers: { 'Metadata-Flavor': 'Google' } })
    if (!tokenResponse.ok) throw new Error(`metadata identity token failed (HTTP ${tokenResponse.status})`)
    const token = (await tokenResponse.text()).trim()

    const stsResponse = await fetchImpl(`https://sts.${options.region}.amazonaws.com/`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        Action: 'AssumeRoleWithWebIdentity',
        Version: '2011-06-15',
        RoleArn: options.roleArn,
        RoleSessionName: 'skyclause',
        WebIdentityToken: token
      }).toString()
    })
    const xml = await stsResponse.text()
    if (!stsResponse.ok) {
      throw new Error(
        `STS AssumeRoleWithWebIdentity failed: ${xmlField(xml, 'Code') ?? 'Unknown'} (HTTP ${stsResponse.status})`
      )
    }
    const accessKeyId = xmlField(xml, 'AccessKeyId')
    const secretAccessKey = xmlField(xml, 'SecretAccessKey')
    const sessionToken = xmlField(xml, 'SessionToken')
    const expiration = xmlField(xml, 'Expiration')
    if (!accessKeyId || !secretAccessKey || !sessionToken || !expiration) {
      throw new Error('STS AssumeRoleWithWebIdentity returned no credentials')
    }
    return { accessKeyId, secretAccessKey, sessionToken, expiration: new Date(expiration) }
  }

  return async () => {
    if (current && current.expiration.getTime() - REFRESH_BEFORE_MS > now()) return current
    pending ??= exchange().finally(() => (pending = undefined))
    current = await pending
    return current
  }
}
