import { expect, test } from 'vitest'

test('@skyclause/config resolves through its package exports', async () => {
  await expect(import('@skyclause/config')).resolves.toBeTypeOf('object')
})
