import { expect, test } from 'vitest'
import enPalette from '../../../../packages/i18n/catalogue/en/palette.json'
import msPalette from '../../../../packages/i18n/catalogue/ms/palette.json'
import enBundles from '../../../../packages/i18n/catalogue/en/bundles.json'
import msBundles from '../../../../packages/i18n/catalogue/ms/bundles.json'

test('an empty palette and an empty bundle say so in a sentence, with no n= count', () => {
  for (const text of [
    enPalette.empty,
    enPalette.no_matches,
    msPalette.empty,
    msPalette.no_matches,
    enBundles.empty,
    enBundles.row_no_calls,
    msBundles.empty,
    msBundles.row_no_calls
  ])
    expect(text).not.toMatch(/n=\d/)
  expect(enPalette.empty).toBe('No commands match. Press Escape to close.')
})
