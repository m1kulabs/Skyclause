import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { t } from '../../features/data-components/catalogue'
import { NotBuilt, SourceError } from '../../features/data-components/states'

describe('NotBuilt', () => {
  test('says what is not built, in either language, without claiming a read failed', () => {
    const en = renderToStaticMarkup(<NotBuilt thing="The key panel" />)
    expect(en).toContain('The key panel is not built yet.')
    expect(en).toContain('data-not-built')
    expect(en).not.toContain('Couldn’t read')
    expect(renderToStaticMarkup(<NotBuilt thing="Panel kunci" locale="ms" />)).toContain('Panel kunci belum dibina.')
  })

  test('is not the source error that a failed read shows', () => {
    expect(renderToStaticMarkup(<SourceError source="the windows list" status={503} />)).not.toContain('data-not-built')
  })
})

describe('SourceError', () => {
  const retry = <button type="button">{t('data.source_error.retry')}</button>

  test('offers the retry a failed read passes', () => {
    expect(renderToStaticMarkup(<SourceError source="the windows list" status={503} retry={retry} />)).toContain(
      'Try again'
    )
  })

  test('never offers a retry on a 501, which no retry can change', () => {
    const markup = renderToStaticMarkup(<SourceError source="the windows list" status={501} retry={retry} />)
    expect(markup).toContain('Not built yet')
    expect(markup).not.toContain('Try again')
  })
})
