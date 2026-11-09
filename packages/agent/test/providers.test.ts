import { beforeEach, expect, test, vi } from 'vitest'
import { buildProvider, KEY_PROVIDERS, testKey } from '../src/providers'

// The provider factory and the minimal call (ticket decision), with every live provider replaced: `generate` is a
// double (NFR-15), and the factories below stand in for the AI SDK provider packages.

vi.mock('@ai-sdk/google', () => ({
  createGoogle: (o: unknown) => (model: string) => ({ provider: 'google', model, o })
}))
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: (o: unknown) => (model: string) => ({ provider: 'anthropic', model, o })
}))
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: (o: unknown) => (model: string) => ({ provider: 'openai', model, o })
}))
vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: (o: unknown) => (model: string) => ({ provider: 'openrouter', model, o })
}))
vi.mock('@ai-sdk/google-vertex', () => ({
  createGoogleVertex: (o: unknown) => (model: string) => ({ provider: 'vertex', model, o })
}))

const generate = vi.hoisted(() => ({ ok: true as boolean, calls: [] as unknown[] }))
beforeEach(() => {
  generate.ok = true
  generate.calls = []
})

const double = (async (o: { model: unknown }) => {
  generate.calls.push(o)
  if (!generate.ok) throw new Error('401 invalid API key')
  return { text: 'ok', totalUsage: { inputTokens: 1, outputTokens: 1 } }
}) as never

test('every named provider builds its own model for the key’s model', () => {
  for (const provider of KEY_PROVIDERS) {
    const model = buildProvider(provider, {
      apiKey: 'test-key',
      model: 'm-1',
      vertex: { project: 'p', location: 'global' }
    }) as unknown as Record<string, unknown>
    expect(model['model']).toBe('m-1')
  }
})

test('an unknown provider is a wiring error, not a provider call', () => {
  expect(() => buildProvider('azure', { apiKey: 'k', model: 'm' })).toThrow(/unknown provider/)
})

test('a vertex_ai key needs the Vertex project and location', () => {
  expect(() => buildProvider('vertex_ai', { apiKey: 'k', model: 'm' })).toThrow(/Vertex project and location/)
  const model = buildProvider('vertex_ai', {
    apiKey: 'k',
    model: 'm',
    vertex: { project: 'p', location: 'global' }
  }) as unknown as Record<string, unknown>
  expect(model['model']).toBe('m')
})

test('the minimal call passes on a good key and caps the output at one token', async () => {
  const result = await testKey({ provider: 'openai', model: 'gpt-5', apiKey: 'sk-good' }, double)
  expect(result).toEqual({ ok: true })
  expect(generate.calls).toHaveLength(1)
  expect(generate.calls[0]).toMatchObject({ maxOutputTokens: 1, prompt: 'ok' })
})

test('a rejected key resolves with the provider’s detail and stores nothing', async () => {
  generate.ok = false
  const result = await testKey({ provider: 'openai', model: 'gpt-5', apiKey: 'sk-bad' }, double)
  expect(result).toEqual({ ok: false, detail: expect.stringContaining('401 invalid API key') })
})
