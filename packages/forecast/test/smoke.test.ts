import { expect, test } from 'vitest'

test('@skyclause/forecast resolves through its package exports', async () => {
  await expect(import('@skyclause/forecast')).resolves.toBeTypeOf('object')
})
