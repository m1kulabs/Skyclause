import { notBuilt } from '@skyclause/contracts'

// Spec §1, D39: AES-256-GCM, with the DEK wrapped by the purpose's KMS key.
export interface Sealed {
  ciphertext: string
  wrappedDek: string
  kekVersion: string
}
export type SealSecret = (purpose: 'ai_key' | 'webhook', plaintext: string, aad: string) => Promise<Sealed>
export type OpenSecret = (purpose: 'ai_key' | 'webhook', sealed: Sealed, aad: string) => Promise<string>

export const sealSecret: SealSecret = notBuilt('e-byok-api')
export const openSecret: OpenSecret = notBuilt('e-byok-api')
