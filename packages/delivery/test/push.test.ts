import { createECDH, createPublicKey, verify } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { createPushTransport, encryptPushPayload } from '../src/push'

const b64 = (value: string) => Buffer.from(value.replace(/\s+/g, ''), 'base64url')

// RFC 8291 §5 and Appendix A (https://www.rfc-editor.org/rfc/rfc8291.txt, fetched 9 November 2026).
const rfc = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcx aOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg', // gitleaks:allow -- RFC 8291 §5's published example auth secret.
  body: `DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml
    mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT
    pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN`
}

// A VAPID pair in the `vapid-keys` job's encoding (#113): base64url private scalar and uncompressed public point.
function vapidPair() {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  return {
    privateKey: ecdh.getPrivateKey().toString('base64url'),
    publicKey: ecdh.getPublicKey().toString('base64url')
  }
}

function captureFetch(status: number) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    return new Response(null, { status })
  }
  return { calls, fetch: fetch as typeof globalThis.fetch }
}

describe('encryptPushPayload', () => {
  test('matches RFC 8291 §5 for its keys and salt', () => {
    const body = encryptPushPayload(
      Buffer.from(rfc.plaintext),
      { p256dh: rfc.uaPublic.replace(/\s+/g, ''), auth: rfc.auth },
      { salt: b64(rfc.salt), senderPrivateKey: b64(rfc.asPrivate) }
    )
    expect(Buffer.from(body).toString('base64url')).toBe(rfc.body.replace(/\s+/g, ''))
  })
})

describe('createPushTransport', () => {
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/device-1', p256dh: '', auth: rfc.auth }
  subscription.p256dh = rfc.uaPublic.replace(/\s+/g, '')
  const payload = {
    title: '2 calls need review · Bukit Jalil',
    body: 'Body',
    url: 'https://app.test/o/p/bundles/1',
    tag: 'b1'
  }

  test('posts an aes128gcm body with TTL, high urgency and a VAPID JWT signed for the endpoint origin', async () => {
    const vapid = vapidPair()
    const { calls, fetch } = captureFetch(201)
    const now = new Date('2026-11-09T07:00:00Z')
    const push = createPushTransport({ ...vapid, subject: 'https://app.skyclause.m1ku.tech', fetch, now: () => now })

    expect(await push.send(subscription, payload, { ttlS: 540 })).toEqual({ status: 201 })

    const [call] = calls
    expect(call!.url).toBe(subscription.endpoint)
    const headers = new Headers(call!.init.headers)
    expect(call!.init.method).toBe('POST')
    expect(headers.get('ttl')).toBe('540')
    expect(headers.get('urgency')).toBe('high')
    expect(headers.get('content-encoding')).toBe('aes128gcm')
    const [, token, key] = headers.get('authorization')!.match(/^vapid t=([^,]+), k=(.+)$/)!
    expect(key).toBe(vapid.publicKey)
    const [header, claims, signature] = token!.split('.')
    expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(JSON.parse(Buffer.from(claims!, 'base64url').toString())).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: now.getTime() / 1000 + 12 * 3600,
      sub: 'https://app.skyclause.m1ku.tech'
    })
    const point = b64(vapid.publicKey)
    const publicKey = createPublicKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: point.subarray(1, 33).toString('base64url'),
        y: point.subarray(33).toString('base64url')
      },
      format: 'jwk'
    })
    const signed = Buffer.from(`${header}.${claims}`)
    expect(verify('sha256', signed, { key: publicKey, dsaEncoding: 'ieee-p1363' }, b64(signature!))).toBe(true)

    // The user agent's private key decrypts the record back to the payload (RFC 8291 §3.4, RFC 8188 §2).
    const record = Buffer.from(call!.init.body as Uint8Array)
    const salt = record.subarray(0, 16)
    const senderPublic = record.subarray(21, 86)
    const ua = createECDH('prime256v1')
    ua.setPrivateKey(b64(rfc.uaPrivate))
    const { hkdfSync, createDecipheriv } = await import('node:crypto')
    const secret = ua.computeSecret(senderPublic)
    const info = Buffer.concat([Buffer.from('WebPush: info\0'), b64(subscription.p256dh), senderPublic])
    const ikm = Buffer.from(hkdfSync('sha256', secret, b64(rfc.auth), info, 32))
    const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16))
    const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12))
    const sealed = record.subarray(86)
    const decipher = createDecipheriv('aes-128-gcm', cek, nonce)
    decipher.setAuthTag(sealed.subarray(-16))
    const plain = Buffer.concat([decipher.update(sealed.subarray(0, -16)), decipher.final()])
    expect(plain.at(-1)).toBe(2)
    expect(JSON.parse(plain.subarray(0, -1).toString())).toEqual(payload)
  })

  test.each([404, 410, 429, 500])('answers the push service status %i', async (status) => {
    const push = createPushTransport({
      ...vapidPair(),
      subject: 'mailto:ops@skyclause.m1ku.tech',
      ...captureFetch(status)
    })
    expect(await push.send(subscription, payload, { ttlS: 60 })).toEqual({ status })
  })
})
