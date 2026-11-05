import { expect, test } from 'vitest'

test('@skyclause/delivery resolves through its package exports', async () => {
  await expect(import('@skyclause/delivery')).resolves.toBeTypeOf('object')
})
