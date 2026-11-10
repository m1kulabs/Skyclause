export interface VerifyOptions {
  now?: number | Date
  toleranceS?: number
}

function signatureBytes(value: string): Uint8Array | undefined {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return undefined
  const bytes = new Uint8Array(value.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }
  return difference === 0
}

function headerValue(headers: HeadersInit, name: string): string | null {
  return new Headers(headers).get(name)
}

/** Verify Skyclause's v1 webhook signature using the full secret as UTF-8 key bytes. */
export async function verifyWebhook(
  rawBody: string,
  headers: HeadersInit,
  secret: string,
  options: VerifyOptions = {}
): Promise<boolean> {
  const id = headerValue(headers, 'Skyclause-Webhook-Id')
  const timestamp = headerValue(headers, 'Skyclause-Webhook-Timestamp')
  const signatureHeader = headerValue(headers, 'Skyclause-Signature')
  if (!id || !timestamp || !signatureHeader || !/^\d+$/.test(timestamp)) return false

  const timestampSeconds = Number(timestamp)
  const nowSeconds = options.now instanceof Date ? options.now.getTime() / 1000 : (options.now ?? Date.now() / 1000)
  const tolerance = options.toleranceS ?? 300
  if (!Number.isFinite(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > tolerance) return false

  const match = signatureHeader.trim().match(/^v1=([0-9a-f]+)$/i)
  if (!match) return false
  const provided = signatureBytes(match[1]!)
  if (!provided) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signingInput = `${id}.${timestamp}.${rawBody}`
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput)))
  return constantTimeEqual(signed, provided)
}

export const webhooks = { verify: verifyWebhook }
