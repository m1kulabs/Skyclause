import { expect, test } from 'vitest'
import { assertValidResponse } from '../../e2e/harness/stub-api'
import { testRegistry } from './registry'

test('response validation rejects a body missing a required field', () => {
  expect(() =>
    assertValidResponse(testRegistry.getProjects, {
      type: 'https://example.test/problems/invalid-request',
      title: 'Invalid request',
      status: 422,
      detail: 'Check the request and try again.'
    })
  ).toThrow()
})
