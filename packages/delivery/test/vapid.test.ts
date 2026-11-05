import { webcrypto } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { ensureVapidKeys } from '../src/vapid'

const secret = 'https://secretmanager.googleapis.com/v1/projects/skyclause/secrets/VAPID_PRIVATE_KEY'

// Doubles of the metadata token endpoint and Secret Manager's REST API for one secret.
function secretManager(initial: Array<{ state: string; data: string }> = []) {
  const versions = [...initial]
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const auth = new Headers(init?.headers).get('authorization')
    if (url.startsWith('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token')) {
      return Response.json({ access_token: 'ya29.double', expires_in: 3599, token_type: 'Bearer' })
    }
    if (auth !== 'Bearer ya29.double') return Response.json({ error: { code: 401 } }, { status: 401 })
    if (url.startsWith(`${secret}/versions`) && (init?.method ?? 'GET') === 'GET') {
      return Response.json(
        versions.length
          ? { versions: versions.map((v, i) => ({ name: `${secret}/versions/${i + 1}`, state: v.state })) }
          : {}
      )
    }
    if (url === `${secret}:addVersion` && init?.method === 'POST') {
      const { payload } = JSON.parse(String(init.body)) as { payload: { data: string } }
      versions.push({ state: 'ENABLED', data: Buffer.from(payload.data, 'base64').toString('utf8') })
      return Response.json({ name: `${secret}/versions/${versions.length}`, state: 'ENABLED' })
    }
    return Response.json({ error: { code: 404 } }, { status: 404 })
  }
  return { versions, fetch }
}

describe('vapid-keys', () => {
  test('creates one P-256 pair, stores only the private key and prints the public key; a rerun adds nothing', async () => {
    const sm = secretManager()
    const lines: string[] = []
    const log = (line: Record<string, unknown>) => lines.push(JSON.stringify(line))

    const first = await ensureVapidKeys({ project: 'skyclause', fetch: sm.fetch, log })
    const second = await ensureVapidKeys({ project: 'skyclause', fetch: sm.fetch, log })

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(sm.versions).toHaveLength(1)

    const publicKey = Buffer.from(first.publicKey ?? '', 'base64url')
    expect(publicKey).toHaveLength(65)
    expect(publicKey[0]).toBe(0x04)
    const privateKey = sm.versions[0]?.data ?? ''
    expect(Buffer.from(privateKey, 'base64url')).toHaveLength(32)

    // The stored scalar signs what the printed point verifies, so the two belong together.
    const jwk = {
      kty: 'EC',
      crv: 'P-256',
      d: privateKey,
      x: publicKey.subarray(1, 33).toString('base64url'),
      y: publicKey.subarray(33).toString('base64url')
    }
    const ecdsa = { name: 'ECDSA', namedCurve: 'P-256' }
    const signer = await webcrypto.subtle.importKey('jwk', jwk, ecdsa, false, ['sign'])
    const verifier = await webcrypto.subtle.importKey('raw', publicKey, ecdsa, false, ['verify'])
    const data = new TextEncoder().encode('skyclause')
    const signature = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signer, data)
    expect(await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verifier, signature, data)).toBe(true)

    expect(lines.join('\n')).toContain(first.publicKey)
    expect(lines.join('\n')).not.toContain(privateKey)
  })

  test('a disabled version still counts, so the key never rotates by itself', async () => {
    const sm = secretManager([{ state: 'DISABLED', data: 'kept' }])
    const result = await ensureVapidKeys({ project: 'skyclause', fetch: sm.fetch, log: () => {} })
    expect(result.created).toBe(false)
    expect(sm.versions).toHaveLength(1)
  })

  test('a Secret Manager error names the call and status', async () => {
    const fetch = async (input: string | URL | Request) =>
      String(input).includes('/token')
        ? Response.json({ access_token: 'ya29.double' })
        : Response.json({ error: { code: 403, status: 'PERMISSION_DENIED' } }, { status: 403 })
    await expect(ensureVapidKeys({ project: 'skyclause', fetch, log: () => {} })).rejects.toThrow(
      'Secret Manager list VAPID_PRIVATE_KEY versions failed (HTTP 403)'
    )
  })
})
