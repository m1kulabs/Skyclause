import { expect, test } from 'vitest'

test('@skyclause/i18n resolves through its package exports', async () => {
  await expect(import('@skyclause/i18n')).resolves.toBeTypeOf('object')
})
