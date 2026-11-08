import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { DRAFT_MODEL, MODELS, platformModel } from '../src/models'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
// Built from parts so this file doesn't name them itself.
const retired = [['gemini-3.6', '-flash'].join(''), ['gemini-2.5', '-'].join('')]

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (['node_modules', 'dist', '.next', '.turbo', 'test-results', 'playwright-report'].includes(name)) return []
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })
}

test('pins gemini-3.8-flash for drafts with its retirement floor, and no gemini-4-argon (D26)', () => {
  expect(DRAFT_MODEL).toEqual({
    use: 'draft',
    provider: 'vertex',
    model: 'gemini-3.8-flash',
    releasedOn: '2026-09-02',
    retiresNoEarlierThan: '2027-09-02'
  })
  expect(MODELS.map((m) => m.model)).not.toContain('gemini-4-argon')
})

// pilot/ is P0's and kept apart (D10); docs/ records why these models are never used.
test('no code, infra or workflow file names a retiring or deprecated Gemini model', () => {
  const offenders = ['apps', 'packages', 'infra', 'scripts', '.github']
    .flatMap((dir) => files(join(root, dir)))
    .filter((path) => retired.some((id) => readFileSync(path, 'utf8').includes(id)))
    .map((path) => relative(root, path))
  expect(offenders).toEqual([])
})

test('the platform model is Vertex at the location passed in, with the pinned model', () => {
  const model = platformModel({ project: 'skyclause', location: 'global' })
  expect(model).toMatchObject({ provider: 'google.vertex.chat', modelId: 'gemini-3.8-flash' })
  // The provider's own base URL: `global` has no regional host (@ai-sdk/google-vertex 5.0.132).
  expect((model as unknown as { config: { baseURL: string } }).config.baseURL).toBe(
    'https://aiplatform.googleapis.com/v1beta1/projects/skyclause/locations/global/publishers/google'
  )
})
