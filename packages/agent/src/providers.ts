import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogle } from '@ai-sdk/google'
import { createGoogleVertex } from '@ai-sdk/google-vertex'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateText, type LanguageModel } from 'ai'
import { DRAFT_MODEL, type VertexSettings } from './models'

// TRD "BYOK and model routing": the provider is built per call from the opened key, and the key test uses this same
// factory (ticket decision). `ai` and the five provider packages are TRD's pinned stack.

/** The five providers a saved key can name (contract `aiProvider`: Google AI Studio, Vertex AI, Anthropic, OpenAI). */
export const KEY_PROVIDERS = ['google_ai_studio', 'vertex_ai', 'anthropic', 'openai', 'openrouter'] as const
export type KeyProvider = (typeof KEY_PROVIDERS)[number]

/** The platform default chain entry: Gemini through Vertex AI, with a null key (spec §1, TRD). */
export const PLATFORM_DEFAULT = {
  provider: 'vertex' as const,
  model: DRAFT_MODEL.model,
  keyId: null as string | null,
  declaredTier: 'paid' as const
}

/**
 * Builds the AI SDK model for one call from a plaintext key. The key never leaves this call: callers pass the opened
 * secret (worker) or the submitted plaintext (a key test), and nothing here stores it.
 */
export function buildProvider(
  provider: string,
  o: { apiKey: string; model: string; vertex?: VertexSettings }
): LanguageModel {
  switch (provider) {
    case 'google_ai_studio':
      return createGoogle({ apiKey: o.apiKey })(o.model)
    case 'vertex_ai':
      return createGoogleVertex({ apiKey: o.apiKey })(o.model)
    case 'anthropic':
      return createAnthropic({ apiKey: o.apiKey })(o.model)
    case 'openai':
      return createOpenAI({ apiKey: o.apiKey })(o.model)
    case 'openrouter':
      return createOpenRouter({ apiKey: o.apiKey })(o.model)
    default:
      throw new TypeError(`buildProvider: unknown provider ${provider}`)
  }
}

/** A test double replaces this in tests (NFR-15); production runs the provider built above. */
export type GenerateText = typeof generateText

const TEST_TIMEOUT_MS = 10_000
const TEST_MAX_TOKENS = 1

/**
 * The minimal call (ticket decision): one generation capped at 1 output token on the key's own model, with a 10 s
 * timeout. Resolves ok when the provider answers, with the detail when it rejects the key or times out.
 */
export async function testKey(
  o: { provider: string; model: string; apiKey: string; vertex?: VertexSettings },
  generate: GenerateText = generateText
): Promise<{ ok: true } | { ok: false; detail: string }> {
  let model: LanguageModel
  try {
    model = buildProvider(o.provider, o)
  } catch {
    return { ok: false, detail: 'The provider could not be configured for this key.' }
  }
  const controller = new AbortController()
  const timeoutDetail = 'The provider did not answer within 10 s.'
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<{ ok: false; detail: string }>(
    (resolve) =>
      (timer = setTimeout(() => {
        controller.abort()
        resolve({ ok: false, detail: timeoutDetail })
      }, TEST_TIMEOUT_MS))
  )
  const call = (async (): Promise<{ ok: true } | { ok: false; detail: string }> => {
    try {
      await generate({
        model,
        prompt: 'ok',
        maxOutputTokens: TEST_MAX_TOKENS,
        maxRetries: 0,
        abortSignal: controller.signal
      })
      return { ok: true }
    } catch {
      // Provider errors can echo credentials, including partial or encoded keys. Keep them out of responses and rows.
      return {
        ok: false,
        detail: controller.signal.aborted
          ? timeoutDetail
          : 'The provider rejected the key or could not complete the test.'
      }
    }
  })()
  try {
    return await Promise.race([call, timeout])
  } finally {
    clearTimeout(timer!)
  }
}
