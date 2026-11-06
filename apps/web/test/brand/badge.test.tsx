import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { ModeBadge } from '../../features/brand/mode-badge'
import * as glyphs from '../../features/brand/glyphs'

test('ModeBadge replaces its placeholder with a hidden glyph and sentence-case word', () => {
  const html = renderToStaticMarkup(<ModeBadge mode="commute_disruption" />)
  expect(html).not.toContain('data-unbuilt')
  expect(html).toContain('aria-hidden="true"')
  expect(html).toContain('Commute disruption')
  expect(html).toContain('data-status="critical"')
  expect(html).not.toContain('tabindex')
})

test('an explicit pack disambiguates badges with a translated complete phrase and protected brand', () => {
  const html = renderToStaticMarkup(<ModeBadge mode="normal" pack="sky" locale="ms" />)
  expect(html).toContain('Sky: Biasa')
  expect(html).toContain('translate="no"')
  expect(html).toContain('lang="ms"')
})

test('all nine existing glyph exports preserve SVG props and fixed geometry', () => {
  for (const [name, Glyph] of Object.entries(glyphs)) {
    const html = renderToStaticMarkup(<Glyph className="test-glyph" width={24} />)
    expect(html, name).not.toContain('data-unbuilt')
    expect(html).toContain('viewBox="0 0 12 12"')
    expect(html).toContain('width="24"')
    expect(html).toContain('stroke-width="1.5"')
    expect(html).toContain('class="test-glyph"')
    expect(html).toContain('aria-hidden="true"')
  }
})
