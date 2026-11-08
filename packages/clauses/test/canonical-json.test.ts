import { expect, test } from 'vitest'
import { canonicalJson } from '../src/index'

// RFC 8785's text itself, for callers that hash it with other bytes (the ledger's prev_hash ‖ JCS, D11).
test('canonicalJson writes the RFC 8785 text: sorted members, no whitespace', () => {
  expect(canonicalJson({ z: [{ b: 2, a: 1 }, null], a: { y: false, x: 'yes' }, n: 1e21 })).toBe(
    '{"a":{"x":"yes","y":false},"n":1e+21,"z":[{"a":1,"b":2},null]}'
  )
})

test('canonicalJson refuses what JSON cannot hold', () => {
  expect(() => canonicalJson({ a: undefined })).toThrow(TypeError)
  expect(() => canonicalJson('\ud800')).toThrow('Lone Unicode surrogate')
})
