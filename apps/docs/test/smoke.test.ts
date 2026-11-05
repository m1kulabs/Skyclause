import { expect, test } from 'vitest'

test('@skyclause/docs resolves through its package exports', async () => {
  await expect(import('@skyclause/docs')).resolves.toBeTypeOf('object')
})
