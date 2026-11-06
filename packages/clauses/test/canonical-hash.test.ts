import { expect, test } from 'vitest'
import { canonicalHash } from '../src/index'
import { canonicalVectors } from './canonical-vectors'

test.each(canonicalVectors)('canonicalHash matches $name', ({ value, digest }) => {
  expect(canonicalHash(value)).toBe(digest)
})
