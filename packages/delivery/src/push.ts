import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from 'node:crypto'
import type { PushTransport } from '@skyclause/contracts'

// #155 (c-approver-alerts): §1 `PushTransport` for approver alerts (D28), with node:crypto only. The payload is one
// RFC 8291 `aes128gcm` record; the push service is authorised by an RFC 8292 VAPID JWT from the pair the `vapid-keys`
// job made (#113). The caller deletes a subscription on 404 or 410.

const RECORD_SIZE = 4096

export interface PushTransportOptions {
  /** `VAPID_PUBLIC_KEY`: base64url uncompressed P-256 point. */
  publicKey: string
  /** `VAPID_PRIVATE_KEY`: base64url 32-byte scalar. */
  privateKey: string
  /** `VAPID_SUBJECT`: a URL or `mailto:` the push service can contact. */
  subject: string
  fetch?: typeof fetch
  now?: () => Date
}

/** RFC 8291 §3.4: one record for the subscription's keys; `o` fixes the salt and sender key (RFC 8291 §5's example). */
export function encryptPushPayload(
  plaintext: Uint8Array,
  subscription: { p256dh: string; auth: string },
  o: { salt?: Uint8Array; senderPrivateKey?: Uint8Array } = {}
): Uint8Array {
  const sender = createECDH('prime256v1')
  if (o.senderPrivateKey) sender.setPrivateKey(o.senderPrivateKey)
  else sender.generateKeys()
  const senderPublic = sender.getPublicKey()
  const receiverPublic = Buffer.from(subscription.p256dh, 'base64url')
  const salt = o.salt ?? randomBytes(16)

  const info = Buffer.concat([Buffer.from('WebPush: info\0'), receiverPublic, senderPublic])
  const auth = Buffer.from(subscription.auth, 'base64url')
  const ikm = Buffer.from(hkdfSync('sha256', sender.computeSecret(receiverPublic), auth, info, 32))
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16))
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12))

  const header = Buffer.alloc(21)
  Buffer.from(salt).copy(header)
  header.writeUInt32BE(RECORD_SIZE, 16)
  header.writeUInt8(senderPublic.length, 20)
  const cipher = createCipheriv('aes-128-gcm', cek, nonce)
  // The 0x02 delimiter marks the last (only) record.
  const sealed = Buffer.concat([cipher.update(plaintext), cipher.update(Buffer.from([2])), cipher.final()])
  return Buffer.concat([header, senderPublic, sealed, cipher.getAuthTag()])
}

/** RFC 8292 §2: an ES256 JWT for the push service's origin, valid 12 hours. */
function vapidToken(o: PushTransportOptions, endpoint: string, now: Date) {
  const point = Buffer.from(o.publicKey, 'base64url')
  const key = createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: o.privateKey,
      x: point.subarray(1, 33).toString('base64url'),
      y: point.subarray(33).toString('base64url')
    },
    format: 'jwk'
  })
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now.getTime() / 1000) + 12 * 3600,
    sub: o.subject
  })}`
  const signature = sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' })
  return `${unsigned}.${signature.toString('base64url')}`
}

export function createPushTransport(o: PushTransportOptions): PushTransport {
  const send = o.fetch ?? fetch
  return {
    async send(subscription, payload, { ttlS }) {
      const body = encryptPushPayload(Buffer.from(JSON.stringify(payload)), subscription)
      const response = await send(subscription.endpoint, {
        method: 'POST',
        headers: {
          authorization: `vapid t=${vapidToken(o, subscription.endpoint, (o.now ?? (() => new Date()))())}, k=${o.publicKey}`,
          ttl: String(ttlS),
          urgency: 'high',
          'content-encoding': 'aes128gcm',
          'content-type': 'application/octet-stream'
        },
        body,
        signal: AbortSignal.timeout(10_000)
      })
      await response.body?.cancel()
      return { status: response.status }
    }
  }
}
