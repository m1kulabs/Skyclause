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
      if (!o.vertex) throw new TypeError('buildProvider: a vertex_ai key needs the Vertex project and location')
      return createGoogleVertex({ project: o.vertex.project, location: o.vertex.location })(o.model)
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
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) }
  }
  const timeout = new Promise<{ ok: false; detail: string }>((resolve) =>
    setTimeout(() => resolve({ ok: false, detail: 'the provider did not answer within 10 s' }), TEST_TIMEOUT_MS)
  )
  const call = (async (): Promise<{ ok: true } | { ok: false; detail: string }> => {
    try {
      await generate({ model, prompt: 'ok', maxOutputTokens: TEST_MAX_TOKENS })
      return { ok: true }
    } catch (error) {
      const detail = (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 500)
      return { ok: false, detail }
    }
  })()
  return Promise.race([call, timeout])
}
