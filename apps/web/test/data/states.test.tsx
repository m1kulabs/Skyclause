import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import '../../features/data-components/catalogue'
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
