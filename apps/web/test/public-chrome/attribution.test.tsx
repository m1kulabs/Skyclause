import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { t } from '@skyclause/i18n'
import { Attribution, AttributionList } from '../../features/public-chrome'
import { sourceFixture, sourceKinds } from './source-fixtures'

describe('public attribution', () => {
  test('each source value links to its complete attribution and a no-JavaScript list', () => {
    for (const kind of sourceKinds) {
      const item = sourceFixture(kind)
      const html = renderToStaticMarkup(
        <>
          <Attribution source={item}>{item.name}</Attribution>
          <AttributionList sources={[item]} />
        </>
      )

      expect(html).toContain('href="#attribution"')
      expect(html).toContain('id="attribution"')
      expect(html).toContain(item.name)
      expect(html).toContain(`<dd translate="no">${item.external_id}</dd>`)
      expect(html).toContain(item.url)
      expect(html).toContain(item.licence_label)
    }
  })

  // The fixture's 'Derived only' label would satisfy a bare 'Derived', so the label is swapped out here.
  test.each(['jps_rain', 'apims', 'golive'] as const)('%s is marked as derived', (kind) => {
    const html = renderToStaticMarkup(
      <AttributionList sources={[{ ...sourceFixture(kind), licence_label: 'Label' }]} />
    )
    expect(html).toContain(t('legal.attribution.derived'))
  })

  test('a CC BY source is not marked as derived', () => {
    const html = renderToStaticMarkup(
      <AttributionList sources={[{ ...sourceFixture('met_warning'), licence_label: 'Label' }]} />
    )
    expect(html).not.toContain(t('legal.attribution.derived'))
  })

  test('Wikipedia attribution explains share-alike on derived listings', () => {
    const html = renderToStaticMarkup(<AttributionList sources={[sourceFixture('wikipedia')]} />)
    expect(html).toContain('Share-alike applies to derived listings.')
    expect(html).toContain('https://creativecommons.org/licenses/by-sa/4.0/')
  })
})
