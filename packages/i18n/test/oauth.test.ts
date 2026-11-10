import en from '../catalogue/en/oauth.json'
import ms from '../catalogue/ms/oauth.json'
import { describe, expect, test } from 'vitest'

function leaves(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value).flatMap(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key))
}

describe('OAuth copy', () => {
  test('English and Malay catalogues have the same keys', () => {
    expect(leaves(ms).sort()).toEqual(leaves(en).sort())
  })

  test('consent includes the required approval boundary', () => {
    expect(en.consent.warning).toBe('No AI can approve a bundle or send to people')
  })
})
