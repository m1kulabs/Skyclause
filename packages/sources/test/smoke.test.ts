import { expect, test } from 'vitest'

// A cold import of the whole package can take several seconds when the full suite runs in parallel.

test('@skyclause/sources resolves through its package exports', async () => {
  await expect(import('@skyclause/sources')).resolves.toBeTypeOf('object')
}, 30_000)

test('canonical APIMS registration exposes pure discovery and real map parsing', async () => {
  const { getAdapter } = await import('@skyclause/sources')
  const { readFileSync } = await import('node:fs')
  const adapter = getAdapter('apims')
  const body = readFileSync(new URL('./fixtures/mapcaqm-20261105T1313Z.json', import.meta.url))
  expect(adapter.discover).toBeUndefined()
  expect(adapter.latestSlot!.discover!(body)).toHaveLength(68)
  expect(adapter.batch).toBe('all_bound')
})
