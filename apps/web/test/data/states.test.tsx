import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { t } from '../../features/data-components/catalogue'
import { NotBuilt, SourceError } from '../../features/data-components/states'

describe('NotBuilt', () => {
  test('says what is not available yet in the caller’s whole sentence, without claiming a read failed', () => {
    const en = renderToStaticMarkup(<NotBuilt title="AI keys are not available yet." />)
    expect(en).toContain('AI keys are not available yet.')
    expect(en).toContain('data-not-built')
    expect(en).not.toContain('Couldn’t read')
    expect(en).not.toMatch(/not built/i)
  })

  test('is not the source error that a failed read shows', () => {
    expect(renderToStaticMarkup(<SourceError source="the windows list" status={503} />)).not.toContain('data-not-built')
  })
})

describe('SourceError', () => {
  const retry = <button type="button">{t('data.source_error.retry')}</button>

  test('offers the retry a failed read passes, and never prints its status', () => {
    const markup = renderToStaticMarkup(
      <SourceError source="the windows list" status={503} at="2026-11-12T07:31:00Z" retry={retry} />
    )
    expect(markup).toContain('Couldn’t read the windows list just now.')
    expect(markup).toContain('Tried at 15:31 MYT.')
    expect(markup).toContain('Try again')
    expect(markup).toContain('data-source-error="503"')
    expect(markup).not.toMatch(/>[^<]*503/)
  })

  test('a 501 is not available yet: no retry, no failure, no status, in either language', () => {
    const markup = renderToStaticMarkup(
      <SourceError source="the windows list" status={501} at="2026-11-12T07:31:00Z" retry={retry} />
    )
    expect(markup).toContain('Skyclause can’t show the windows list yet.')
    expect(markup).toContain('data-source-error="501"')
    expect(markup).not.toContain('Try again')
    expect(markup).not.toContain('Couldn’t read')
    expect(markup).not.toMatch(/not built|answered|>[^<]*501/i)
    expect(renderToStaticMarkup(<SourceError source="senarai tetingkap" status={501} locale="ms" />)).toContain(
      'Skyclause belum dapat menunjukkan senarai tetingkap.'
    )
  })
})
