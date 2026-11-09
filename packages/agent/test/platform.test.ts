import { beforeEach, expect, test, vi } from 'vitest'
import { draftBundle } from '../src/draft'
import { replayBundle, replayInput } from './fixtures/replay'
import { entry, promptText, scripted } from './model-double'

// The model seam for keyId null: the Vertex provider factory, replaced so no test reaches Google.
const vertex = vi.hoisted(() => ({ settings: [] as unknown[], model: undefined as unknown, ids: [] as string[] }))
vi.mock('@ai-sdk/google-vertex', () => ({
  createGoogleVertex: (settings: unknown) => {
    vertex.settings.push(settings)
    return (id: string) => {
      vertex.ids.push(id)
      return vertex.model
    }
  }
}))

beforeEach(() => {
  vertex.settings = []
  vertex.ids = []
  vertex.model = scripted([JSON.stringify(replayBundle())])
})

test('a keyId null entry drafts on this package’s Vertex model, never through modelFor', async () => {
  const modelFor = vi.fn()
  const platform = entry({ provider: 'vertex', model: 'gemini-3.8-flash', keyId: null, declaredTier: 'paid' })
  const result = await draftBundle(replayInput(), {
    chain: [platform],
    modelFor,
    vertex: { project: 'skyclause', location: 'global' }
  })
  expect(result).toMatchObject({ ok: true, provider: 'vertex', model: 'gemini-3.8-flash', fallbackUsed: false })
  expect(vertex.settings).toEqual([{ project: 'skyclause', location: 'global' }])
  expect(vertex.ids).toEqual(['gemini-3.8-flash'])
  expect(modelFor).not.toHaveBeenCalled()
})

test('falls back from the platform model to an organisation key, naming both', async () => {
  vertex.model = scripted([new Error('503 Vertex unavailable')])
  const key = entry({ provider: 'google', model: 'gemini-3.8-flash' })
  const result = await draftBundle(replayInput(), {
    chain: [entry({ provider: 'vertex', keyId: null }), key],
    modelFor: async () => scripted([JSON.stringify(replayBundle())]),
    vertex: { project: 'skyclause', location: 'global' }
  })
  expect(result).toMatchObject({ ok: true, provider: 'google', fallbackUsed: true })
  expect(result.attempts.map((a) => [a.provider, a.keyId, a.outcome])).toEqual([
    ['vertex', null, 'provider_error'],
    ['google', key.keyId, 'ok']
  ])
})

test('a keyId null entry without the Vertex settings is a wiring error, not a provider error', async () => {
  await expect(draftBundle(replayInput(), { chain: [entry({ keyId: null })], modelFor: vi.fn() })).rejects.toThrow(
    /vertex project and location/
  )
})

test("the platform's own Vertex model keeps recipient roles whatever tier the entry declares", async () => {
  await draftBundle(replayInput(), {
    chain: [entry({ provider: 'vertex', keyId: null, declaredTier: 'platform' })],
    modelFor: vi.fn(),
    vertex: { project: 'skyclause', location: 'global' }
  })
  expect(promptText(vertex.model as ReturnType<typeof scripted>)).toContain('"role":"student"')
})
