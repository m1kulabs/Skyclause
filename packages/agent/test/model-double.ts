// Test doubles at the model seam: the AI SDK's own mock language model, scripted per call.
import type { ModelEntry } from '@skyclause/contracts'
import { MockLanguageModelV4 } from 'ai/test'

type Reply = string | Error | { text: string; finishReason?: 'stop' | 'length'; input?: number; output?: number }

export const entry = (over: Partial<ModelEntry> = {}): ModelEntry => ({
  provider: 'google',
  model: 'gemini-3.8-flash',
  keyId: '019a4300-5a80-7000-8000-0000000000b1',
  declaredTier: 'paid',
  ...over
})

/** Plays `replies` in order, repeating the last; an `Error` is thrown as a provider failure. */
export function scripted(replies: Reply[], modelId = 'mock-model') {
  let call = 0
  return new MockLanguageModelV4({
    provider: 'mock',
    modelId,
    doGenerate: async () => {
      const reply = replies[Math.min(call++, replies.length - 1)]!
      if (reply instanceof Error) throw reply
      const {
        text,
        finishReason = 'stop',
        input = 1200,
        output = 300
      } = typeof reply === 'string' ? { text: reply } : reply
      return {
        content: [{ type: 'text', text }],
        finishReason: { unified: finishReason, raw: undefined },
        usage: {
          inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: output, text: output, reasoning: undefined }
        },
        warnings: []
      }
    }
  })
}

/** The text of every message the model received on call `n`, in order. */
export function promptText(model: MockLanguageModelV4, n = 0): string {
  return model.doGenerateCalls[n]!.prompt.map((message) =>
    typeof message.content === 'string'
      ? message.content
      : message.content.map((part) => ('text' in part ? part.text : '')).join('')
  ).join('\n')
}
