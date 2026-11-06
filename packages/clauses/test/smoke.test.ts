import { expect, test } from 'vitest'

// A cold import of the whole package can take several seconds when the full suite runs in parallel.

test('@skyclause/clauses resolves through its package exports', async () => {
  await expect(import('@skyclause/clauses')).resolves.toBeTypeOf('object')
}, 30_000)
