import { NotBuiltError } from '@skyclause/contracts'
import { expect, it } from 'vitest'
import { assertPublicUrl, safeFetch } from '@skyclause/config/net'

it('exports network placeholders from the config/net subpath', () => {
  for (const call of [() => assertPublicUrl(''), () => safeFetch('')]) {
    expect(call).toThrow(NotBuiltError)
    expect(call).toThrow(expect.objectContaining({ owner: 'a-hardening' }))
  }
})
