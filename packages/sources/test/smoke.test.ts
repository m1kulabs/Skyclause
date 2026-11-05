import { expect, test } from 'vitest'

test('@skyclause/sources resolves through its package exports', async () => {
  await expect(import('@skyclause/sources')).resolves.toBeTypeOf('object')
})
