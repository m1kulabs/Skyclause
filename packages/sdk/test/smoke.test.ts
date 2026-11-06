import { expect, test } from 'vitest'

// A cold import of the whole package can take several seconds when the full suite runs in parallel.

test('@skyclause/sdk resolves through its package exports', async () => {
  await expect(import('@skyclause/sdk')).resolves.toBeTypeOf('object')
}, 30_000)
