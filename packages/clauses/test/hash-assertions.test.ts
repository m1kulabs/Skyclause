import { test } from 'vitest'
import { runHashAssertions } from './hash-assertions'

test('shared hash assertions cover JSON domain and official SHA byte vectors', () => {
  runHashAssertions()
})
