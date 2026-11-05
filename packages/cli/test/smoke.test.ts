import { expect, test } from 'vitest'

test('@skyclause/cli resolves through its package exports', async () => {
  await expect(import('@skyclause/cli')).resolves.toBeTypeOf('object')
})
