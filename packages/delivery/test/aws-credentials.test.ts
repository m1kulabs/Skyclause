import { describe, expect, test } from 'vitest'
import { webIdentityCredentials } from '../src/aws-credentials'

const roleArn = 'arn:aws:iam::776566309118:role/skyclause-production-email'
const metadataUrl = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity'
const stsUrl = 'https://sts.ap-southeast-2.amazonaws.com/'
const start = Date.parse('2026-11-06T10:00:00Z')

// The response shape is AWS's AssumeRoleWithWebIdentity example; the key values are AWS's documented
// example keys, so nothing here is a credential.
function stsResponse(expiration: string, n: number) {
  return `<AssumeRoleWithWebIdentityResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
  <AssumeRoleWithWebIdentityResult>
    <AssumedRoleUser>
      <Arn>arn:aws:sts::776566309118:assumed-role/skyclause-production-email/skyclause</Arn>
      <AssumedRoleId>AROACLKWSDQRAOEXAMPLE:skyclause</AssumedRoleId>
    </AssumedRoleUser>
    <Credentials>
      <SessionToken>session-token-${n}</SessionToken>
      <SecretAccessKey>wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY</SecretAccessKey>
      <Expiration>${expiration}</Expiration>
      <AccessKeyId>ASIAIOSFODNN7EXAMPLE</AccessKeyId>
    </Credentials>
    <Provider>accounts.google.com</Provider>
  </AssumeRoleWithWebIdentityResult>
  <ResponseMetadata><RequestId>ad4156e9-bce1-11e2-82e6-6b6efEXAMPLE</RequestId></ResponseMetadata>
</AssumeRoleWithWebIdentityResponse>`
}

// Doubles of the metadata server and STS, routed by URL.
function endpoints(options: { lifetimeMs?: number; sts?: (body: URLSearchParams) => Response } = {}) {
  const calls: Array<{ url: string; headers: Headers; body: string }> = []
  let clock = start
  let tokens = 0
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const body = String(init?.body ?? '')
    calls.push({ url, headers: new Headers(init?.headers), body })
    if (url.startsWith(metadataUrl)) return new Response(`google-id-token-${++tokens}`)
    if (url === stsUrl) {
      const params = new URLSearchParams(body)
      if (options.sts) return options.sts(params)
      const expiration = new Date(clock + (options.lifetimeMs ?? 3_600_000)).toISOString()
      return new Response(stsResponse(expiration, tokens), { headers: { 'content-type': 'text/xml' } })
    }
    return new Response('not found', { status: 404 })
  }
  return {
    calls,
    advance: (ms: number) => (clock += ms),
    provider: () => webIdentityCredentials({ roleArn, region: 'ap-southeast-2', fetch, now: () => clock })
  }
}

describe('webIdentityCredentials (D42)', () => {
  test('exchanges a metadata ID token for the role through STS', async () => {
    const doubles = endpoints()
    const credentials = await doubles.provider()()

    expect(credentials).toEqual({
      accessKeyId: 'ASIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      sessionToken: 'session-token-1',
      expiration: new Date('2026-11-06T11:00:00.000Z')
    })
    const [identity, sts] = doubles.calls
    const identityUrl = new URL(identity?.url ?? '')
    expect(identityUrl.searchParams.get('audience')).toBe(roleArn)
    expect(identityUrl.searchParams.get('format')).toBe('full')
    expect(identity?.headers.get('metadata-flavor')).toBe('Google')
    const params = new URLSearchParams(sts?.body)
    expect(Object.fromEntries(params)).toMatchObject({
      Action: 'AssumeRoleWithWebIdentity',
      Version: '2011-06-15',
      RoleArn: roleArn,
      WebIdentityToken: 'google-id-token-1'
    })
    expect(params.get('RoleSessionName')).toMatch(/^[\w+=,.@-]{2,64}$/)
  })

  test('reuses the credentials until 5 minutes before they expire, then refreshes', async () => {
    const doubles = endpoints()
    const credentials = doubles.provider()

    await credentials()
    doubles.advance(54 * 60_000)
    expect((await credentials()).sessionToken).toBe('session-token-1')
    expect(doubles.calls).toHaveLength(2)

    doubles.advance(60_000 + 1)
    expect((await credentials()).sessionToken).toBe('session-token-2')
    expect(doubles.calls).toHaveLength(4)
  })

  test('concurrent callers share one exchange', async () => {
    const doubles = endpoints()
    const credentials = doubles.provider()
    await Promise.all([credentials(), credentials(), credentials()])
    expect(doubles.calls).toHaveLength(2)
  })

  test('an STS refusal names STS, its error code and the status', async () => {
    const doubles = endpoints({
      sts: () =>
        new Response(
          '<ErrorResponse><Error><Type>Sender</Type><Code>AccessDenied</Code><Message>Not authorized to perform sts:AssumeRoleWithWebIdentity</Message></Error></ErrorResponse>',
          { status: 403 }
        )
    })
    await expect(doubles.provider()()).rejects.toThrow('STS AssumeRoleWithWebIdentity failed: AccessDenied (HTTP 403)')
  })
})
