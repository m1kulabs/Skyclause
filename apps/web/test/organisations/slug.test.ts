import { expect, test } from 'vitest'
import { suggestSlug, validateSlugInput } from '../../features/organisations/slug'

test('suggests an editable slug from the name', () => {
  expect(suggestSlug('River Watch')).toBe('river-watch')
  expect(suggestSlug('  Bukit Jalil APU! ')).toBe('bukit-jalil-apu')
  expect(suggestSlug('a--b')).toBe('a-b')
})

test('flags format and reserved slugs as you type, from slugs.ts', () => {
  expect(validateSlugInput('')).toBeNull()
  expect(validateSlugInput('river-watch')).toBeNull()
  expect(validateSlugInput('ab')).toBeNull()
  expect(validateSlugInput('A')).toBe('format')
  expect(validateSlugInput('a')).toBe('format')
  expect(validateSlugInput('-ab')).toBe('format')
  expect(validateSlugInput('ab-')).toBe('format')
  expect(validateSlugInput('a--b')).toBe('format')
  expect(validateSlugInput('a'.repeat(40))).toBe('format')
  expect(validateSlugInput('new')).toBe('reserved')
  expect(validateSlugInput('api')).toBe('reserved')
})
