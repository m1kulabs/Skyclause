import { createHash } from 'node:crypto'
import { afterEach, expect, test } from 'vitest'
import {
  fingerprintKey,
  openSecret,
  resetKmsPort,
  sealAad,
  sealSecret,
  setKmsPort,
  type KmsPort
} from '../src/placeholders/e-byok-api'

// The KMS double (NFR-15): XOR under a fixed pad, versioned, so tests never reach Cloud KMS.
const double = (version = '3'): KmsPort & { versions: string[] } => {
  const pad = Buffer.alloc(32, 0x5a)
  return {
    versions: [],
    async wrapDek(_keyId: string, dek: Buffer) {
      return { wrapped: Buffer.from(dek.map((byte, i) => byte ^ pad[i]!)), version }
    },
    async unwrapDek(_keyId: string, wrapped: Buffer) {
      return Buffer.from(wrapped.map((byte, i) => byte ^ pad[i]!))
    }
  }
}

const KEY = 'test-only-kms-ai-keys-key'
const WEBHOOK = 'test-only-kms-webhook-key'

afterEach(() => {
  resetKmsPort()
  delete process.env.KMS_AI_KEYS_KEY
  delete process.env.KMS_WEBHOOK_KEY
})

test('seal and open round-trip with the KMS double, reporting its version', async () => {
  process.env.KMS_AI_KEYS_KEY = KEY
  const kms = double('7')
  setKmsPort(kms)
  const sealed = await sealSecret('ai_key', 'AIza-secret-key-material', sealAad('owner-1', 'google_ai_studio', 'k1'))
  expect(sealed.kekVersion).toBe('7')
  expect(sealed.ciphertext).not.toContain('AIza-secret-key-material')
  expect(sealed.wrappedDek).not.toContain('AIza-secret-key-material')
  await expect(openSecret('ai_key', sealed, sealAad('owner-1', 'google_ai_studio', 'k1'))).resolves.toBe(
    'AIza-secret-key-material'
  )
})

test('each seal mints its own DEK and IV: the same plaintext seals differently twice', async () => {
  process.env.KMS_AI_KEYS_KEY = KEY
  setKmsPort(double())
  const aad = sealAad('owner-1', 'openai', 'k1')
  const first = await sealSecret('ai_key', 'sk-same', aad)
  const second = await sealSecret('ai_key', 'sk-same', aad)
  expect(first.ciphertext).not.toBe(second.ciphertext)
  expect(first.wrappedDek).not.toBe(second.wrappedDek)
})

test('a changed AAD fails to open', async () => {
  process.env.KMS_AI_KEYS_KEY = KEY
  setKmsPort(double())
  const sealed = await sealSecret('ai_key', 'sk-same', sealAad('owner-1', 'openai', 'k1'))
  await expect(openSecret('ai_key', sealed, sealAad('owner-1', 'openai', 'k2'))).rejects.toThrow()
  await expect(openSecret('ai_key', sealed, sealAad('owner-2', 'openai', 'k1'))).rejects.toThrow()
})

test('purposes use their own KMS key', async () => {
  process.env.KMS_AI_KEYS_KEY = KEY
  process.env.KMS_WEBHOOK_KEY = WEBHOOK
  const seen: string[] = []
  setKmsPort({
    async wrapDek(keyId, dek) {
      seen.push(keyId)
      return { wrapped: dek, version: '1' }
    },
    async unwrapDek(_keyId, wrapped) {
      return wrapped
    }
  })
  await sealSecret('ai_key', 'a', sealAad('o', 'p', 'k'))
  await sealSecret('webhook', 'b', sealAad('o', 'p', 'k'))
  expect(seen).toEqual([KEY, WEBHOOK])
})

test('missing key resource fails loudly, never with an empty wrap', async () => {
  setKmsPort(double())
  await expect(sealSecret('ai_key', 'x', 'aad')).rejects.toThrow(/KMS_AI_KEYS_KEY is not set/)
})

test('fingerprint is the first 12 hex digits of the SHA-256', () => {
  const key = 'sk-test-key-material'
  expect(fingerprintKey(key)).toBe(createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 12))
  expect(fingerprintKey(key)).toMatch(/^[0-9a-f]{12}$/)
})
