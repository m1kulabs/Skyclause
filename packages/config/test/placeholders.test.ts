import { openSecret, sealSecret } from '@skyclause/config/crypto'
import { assertPublicUrl, safeFetch } from '@skyclause/config/net'
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

it('exports network placeholders from the config/net subpath', () => {
  for (const call of [() => assertPublicUrl(''), () => safeFetch('')]) {
    expect(call).toThrow(NotBuiltError)
    expect(call).toThrow(expect.objectContaining({ owner: 'a-hardening' }))
  }
})
