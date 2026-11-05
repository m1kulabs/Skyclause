import { expect, test } from 'vitest'

test('@skyclause/skills resolves through its package exports', async () => {
  await expect(import('@skyclause/skills')).resolves.toBeTypeOf('object')
})
