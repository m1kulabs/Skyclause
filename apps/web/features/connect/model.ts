import { ApiProblem } from '../../lib/api-fetch'

export function safeConfig(config: string): string {
  if (/sk[cgw]_|\bauthorization\b["']?\s*[:=]/i.test(config)) throw new Error('Unsafe connect config')
  return config
}

/** #208 owns the meaning of result. Never derive a verification state from tested_at. */
export function verificationState(result: string | undefined) {
  if (!result) return 'not_verified'
  if (result === 'verified' || result === 'reverify_due' || result === 'not_verified') return result
  return 'unknown_verification'
}

export async function createWithStepUp<Value>(
  write: () => Promise<Value>,
  reauth: () => Promise<void>
): Promise<Value> {
  try {
    return await write()
  } catch (error) {
    if (
      !(error instanceof ApiProblem) ||
      error.status !== 401 ||
      error.body.type?.split('/').pop() !== 'reauth-required'
    )
      throw error
    await reauth()
    return write()
  }
}
