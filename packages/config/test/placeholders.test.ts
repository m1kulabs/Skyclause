import { openSecret, sealSecret } from '@skyclause/config/crypto'
import { NotBuiltError } from '@skyclause/contracts'
import { expect, it } from 'vitest'

it('exports crypto placeholders from the config/crypto subpath', () => {
  const calls = [
    () => sealSecret('ai_key', '', ''),
    () => openSecret('webhook', { ciphertext: '', wrappedDek: '', kekVersion: '' }, '')
  ]
  for (const call of calls) {
    expect(call).toThrow(NotBuiltError)
    expect(call).toThrow(expect.objectContaining({ owner: 'e-byok-api' }))
  }
})
