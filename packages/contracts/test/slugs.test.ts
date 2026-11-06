import { expect, test } from 'vitest'
import { RESERVED_SLUGS, SLUG_REGEX, slugSchema } from '../src/slugs'

test('accepts the shortest valid slug and rejects malformed or reserved slugs', () => {
  expect(slugSchema.safeParse('ab').success).toBe(true)
  for (const slug of ['a', '-ab', 'a--b', 'v1']) {
    expect(slugSchema.safeParse(slug).success).toBe(false)
  }

  for (const slug of RESERVED_SLUGS) {
    expect(slugSchema.safeParse(slug).success).toBe(false)
  }
})

test('exports the documented slug format regular expression', () => {
  expect(SLUG_REGEX.test('ab')).toBe(true)
  expect(SLUG_REGEX.test('a--b')).toBe(false)
  expect(RESERVED_SLUGS).toEqual([
    'new',
    'account',
    'developers',
    'connect',
    'approvals',
    'projects',
    'analysis',
    'settings',
    'api',
    'commons',
    'admin',
    'p',
    'c',
    'embed',
    'docs',
    'status',
    'guest',
    'device',
    'sign-in',
    'sign-up',
    'invite',
    'share',
    'subscribe',
    'oauth',
    'ms',
    'legal',
    'skills',
    'oembed',
    'openapi.json',
    '.well-known',
    'v1',
    'mcp',
    'health',
    'healthz',
    'window',
    'elements'
  ])
})
