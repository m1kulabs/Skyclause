import { expect, test } from 'vitest'

test('@skyclause/auth resolves through its package exports', async () => {
  await expect(import('@skyclause/auth')).resolves.toBeTypeOf('object')
})
