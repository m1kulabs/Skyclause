import { expect, test } from 'vitest'

test('@skyclause/contracts resolves through its package exports', async () => {
  await expect(import('@skyclause/contracts')).resolves.toBeTypeOf('object')
})
