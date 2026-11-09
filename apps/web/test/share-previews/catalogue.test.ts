import { describe, expect, test } from 'vitest'
import english from '../../../../packages/i18n/catalogue/en/share-previews.json'
import malay from '../../../../packages/i18n/catalogue/ms/share-previews.json'

function keyPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return []
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return [path, ...keyPaths(child, path)]
  })
}

describe('share preview catalogues', () => {
  test('Malay has every English key, including nested alt-text keys', () => {
    expect(keyPaths(malay).sort()).toEqual(keyPaths(english).sort())
  })
})
