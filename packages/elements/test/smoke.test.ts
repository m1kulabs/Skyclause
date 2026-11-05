import { expect, test } from 'vitest'

test('@skyclause/elements resolves through its package exports', async () => {
  await expect(import('@skyclause/elements')).resolves.toBeTypeOf('object')
})
