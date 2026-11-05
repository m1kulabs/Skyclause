import { expect, test } from 'vitest'

test('@skyclause/clauses resolves through its package exports', async () => {
  await expect(import('@skyclause/clauses')).resolves.toBeTypeOf('object')
})
