import { createHash, createDecipheriv, createCipheriv, randomBytes } from 'node:crypto'
import { KeyManagementServiceClient } from '@google-cloud/kms'

// @skyclause/config/crypto (Spec §1, D39, TRD "BYOK and model routing"): envelope encryption for AI keys, sealing for
// both web and worker and opening for the worker only. A fresh 256-bit DEK encrypts the provider key with
// AES-256-GCM, with AAD of owner ID, provider and key ID; the KEK for the caller's purpose wraps the DEK.
// The web service account is only a KMS encrypter and the worker's the only decrypter (infra kms.tf), so a web
// process's `openSecret` is denied at KMS, never in this file.

// Spec §1 delivery block, D39.
export interface Sealed {
  ciphertext: string
  wrappedDek: string
  kekVersion: string
}
export type SealSecret = (purpose: 'ai_key' | 'webhook', plaintext: string, aad: string) => Promise<Sealed>
export type OpenSecret = (purpose: 'ai_key' | 'webhook', sealed: Sealed, aad: string) => Promise<string>

/** The one KMS call each side makes; tests inject a double (NFR-15), never the live client. */
export interface KmsPort {
  wrapDek(keyId: string, dek: Buffer): Promise<{ wrapped: Buffer; version: string }>
  unwrapDek(keyId: string, wrapped: Buffer): Promise<Buffer>
}

const keyEnv = { ai_key: 'KMS_AI_KEYS_KEY', webhook: 'KMS_WEBHOOK_KEY' } as const

function keyResource(purpose: 'ai_key' | 'webhook'): string {
  const id = process.env[keyEnv[purpose]]
  if (!id) throw new Error(`${keyEnv[purpose]} is not set`)
  return id
}

let client: KeyManagementServiceClient | undefined
function liveClient(): KeyManagementServiceClient {
  client ??= new KeyManagementServiceClient()
  return client
}

/** Production KMS: `wrapDek` encrypts under the key's primary version, reporting which version that is. */
export const liveKms: KmsPort = {
  async wrapDek(keyId, dek) {
    const [response] = await liveClient().encrypt({ name: keyId, plaintext: dek })
    if (!response.ciphertext) throw new Error('KMS encrypt returned no ciphertext')
    const version = /cryptoKeyVersions\/(\d+)$/.exec(response.name ?? '')?.[1]
    if (!version) throw new Error('KMS encrypt returned no key version')
    return { wrapped: Buffer.from(response.ciphertext as Uint8Array), version }
  },
  async unwrapDek(keyId, wrapped) {
    const [response] = await liveClient().decrypt({ name: keyId, ciphertext: wrapped })
    if (!response.plaintext) throw new Error('KMS decrypt returned no plaintext')
    return Buffer.from(response.plaintext as Uint8Array)
  }
}

let port: KmsPort = liveKms

/** Tests inject their KMS double; production never calls this. */
export function setKmsPort(next: KmsPort): void {
  port = next
}

/** Restores the live KMS client, for a test file that injected a double. */
export function resetKmsPort(): void {
  port = liveKms
}

/** One KMS key version behind the rotation auditor. */
export interface KekVersionInfo {
  version: string
  createdAt: Date
  enabled: boolean
}

export interface KekLister {
  listVersions(keyId: string): Promise<KekVersionInfo[]>
}

const liveLister: KekLister = {
  async listVersions(keyId) {
    const [versions] = await liveClient().listCryptoKeyVersions({ parent: keyId })
    return versions.map((v) => ({
      version: /cryptoKeyVersions\/(\d+)$/.exec(v.name ?? '')?.[1] ?? '?',
      createdAt: new Date(Number(v.createTime?.seconds ?? 0) * 1000),
      enabled: v.state === 'ENABLED'
    }))
  }
}

let lister: KekLister = liveLister

/** Tests inject their KMS double; production never calls this. */
export function setKekLister(next: KekLister): void {
  lister = next
}

/** Restores the live KMS client, for a test file that injected a double. */
export function resetKekLister(): void {
  lister = liveLister
}

/** The purpose key's versions, oldest first, for the `kek_rotation` auditor check. */
export function listKekVersions(purpose: 'ai_key' | 'webhook'): Promise<KekVersionInfo[]> {
  return lister.listVersions(keyResource(purpose))
}

/** The AAD binds a sealed row to its owner, provider and key ID: opening with another AAD fails (D39). */
export const sealAad = (ownerId: string, provider: string, keyId: string) => [ownerId, provider, keyId].join('\n')

export const sealSecret: SealSecret = async (purpose, plaintext, aad) => {
  const dek = randomBytes(32)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', dek, iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const { wrapped, version } = await port.wrapDek(keyResource(purpose), dek)
  return {
    ciphertext: Buffer.concat([iv, tag, body]).toString('base64'),
    wrappedDek: wrapped.toString('base64'),
    kekVersion: version
  }
}

export const openSecret: OpenSecret = async (purpose, sealed, aad) => {
  const dek = await port.unwrapDek(keyResource(purpose), Buffer.from(sealed.wrappedDek, 'base64'))
  const raw = Buffer.from(sealed.ciphertext, 'base64')
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const body = raw.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', dek, iv)
  decipher.setAuthTag(tag)
  decipher.setAAD(Buffer.from(aad, 'utf8'))
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
}

/** The first 12 hex digits of the key's SHA-256 (ticket decision): the fingerprint stored beside a sealed key. */
export const fingerprintKey = (plaintext: string): string =>
  createHash('sha256').update(plaintext, 'utf8').digest('hex').slice(0, 12)
