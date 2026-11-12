import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { BrandLines, NotFoundContent, PublicChrome, PublicErrorContent } from '../../features/public-chrome'
import { t } from '@skyclause/i18n'

const hrefs = (html: string) => [...html.matchAll(/<a [^>]*?href="([^"]*)"/g)].map((match) => match[1])

test('the public frame carries a plain header, both brand lines and a footer that closes the page', () => {
  const page = renderToStaticMarkup(
    <PublicChrome locale="en">
      <main>
        <h1>{t('brand.name')}</h1>
      </main>
    </PublicChrome>
  )

  expect(page).toContain(t('brand.non_affiliation'))
  expect(page).toContain(t('brand.not_safety_service'))
  // The header has the wordmark home, the two legal pages and one action; the footer repeats the pages and adds the
  // other language.
  expect(hrefs(page)).toEqual([
    '/',
    '/legal/terms',
    '/legal/privacy',
    '/sign-in',
    '/legal/terms',
    '/legal/privacy',
    '/ms/legal/privacy'
  ])
  expect(page).toContain('Sign in')
  expect(page).toContain('Bahasa Melayu')
})

test('the footer returns the wordmark as the landing builds it: a capsule block per letter, named once', () => {
  const page = renderToStaticMarkup(<PublicChrome locale="en">{null}</PublicChrome>)
  const wordmark = page.match(/<div[^>]*role="img"[^>]*aria-label="Skyclause"[^>]*>(.*?)<\/div>/)

  expect(wordmark).not.toBeNull()
  // One row wide; two rows ("Sky", "clause") on a phone. Each spells the name, block by block.
  const [wide, narrow] = wordmark![1]!.split('</svg>')
  for (const svg of [wide!, narrow!]) {
    expect(svg).toContain('aria-hidden="true"')
    expect([...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]).join('')).toBe('Skyclause')
  }
  // Each row stands on its own strip: one under the wide row, one under each of the narrow rows.
  expect(wide!.match(/width="1000"/g)).toHaveLength(1)
  expect(narrow!.match(/width="400"/g)).toHaveLength(2)
})

test('the frame links only pages that exist', () => {
  const found = hrefs(renderToStaticMarkup(<PublicChrome locale="en">{null}</PublicChrome>))
  for (const missing of ['/status', '/docs', 'docs.skyclause.m1ku.tech', '/guest']) {
    expect(found.some((href) => href?.includes(missing))).toBe(false)
  }
})

test('the link to the page being read says so', () => {
  const page = renderToStaticMarkup(
    <PublicChrome locale="en" path="/legal/privacy">
      {null}
    </PublicChrome>
  )
  expect(page.match(/aria-current="page"/g)).toHaveLength(2)
  expect(page).toMatch(/<a href="\/legal\/privacy"[^>]*aria-current="page"/)
})

test('the language link names the page it opens: this page on the privacy notice, the notice anywhere else', () => {
  const language = (page: string) =>
    page.match(/<a href="\/(?:ms\/)?legal\/privacy" hrefLang="(?:ms|en)"[^>]*>[^<]*<\/a>/g)!.at(-1)!
  const privacy = language(
    renderToStaticMarkup(
      <PublicChrome locale="en" path="/legal/privacy">
        {null}
      </PublicChrome>
    )
  )
  expect(privacy).toContain('title="Read this page in Bahasa Melayu"')
  expect(privacy).toContain('>Bahasa Melayu</a>')
  // The Terms are English only, and a not-found page has no Malay twin: the link opens the Malay privacy notice.
  for (const path of ['/legal/terms', undefined]) {
    const other = language(
      renderToStaticMarkup(
        <PublicChrome locale="en" path={path}>
          {null}
        </PublicChrome>
      )
    )
    expect(other, String(path)).toMatch(/^<a href="\/ms\/legal\/privacy" hrefLang="ms" lang="ms"/)
    expect(other, String(path)).toContain('title="Read the privacy notice in Bahasa Melayu"')
    expect(other, String(path)).toContain('>Privasi dalam Bahasa Melayu</a>')
  }
  const malay = language(renderToStaticMarkup(<PublicChrome locale="ms">{null}</PublicChrome>))
  expect(malay).toContain('title="Baca notis privasi dalam bahasa Inggeris"')
  expect(malay).toContain('>Privacy notice in English</a>')
})

test('brand lines render their catalogue copy', () => {
  const page = renderToStaticMarkup(<BrandLines locale="en" />)
  expect(page).toContain(t('brand.non_affiliation'))
  expect(page).toContain(t('brand.not_safety_service'))
})

test('Malay public copy and the language link are catalogue-backed', () => {
  const frame = renderToStaticMarkup(
    <PublicChrome locale="ms" path="/ms/legal/privacy">
      <main>
        <h1>{t('brand.name', {}, 'ms')}</h1>
      </main>
    </PublicChrome>
  )

  expect(frame).toContain(t('brand.non_affiliation', {}, 'ms'))
  expect(frame).toContain(t('brand.not_safety_service', {}, 'ms'))
  // A missing Malay line would fall back to English and still pass the two checks above.
  expect(frame).not.toContain(t('brand.non_affiliation'))
  expect(frame).not.toContain(t('brand.not_safety_service'))
  expect(frame).toContain('Log masuk')
  expect(frame).toContain('Undang-undang dan bahasa')
  // The Malay reader's way back to English; the terms exist only in English, so their link says so.
  expect(frame).toMatch(/<a href="\/legal\/privacy" hrefLang="en" lang="en"[^>]*>English<\/a>/)
  expect(frame).toMatch(/<a href="\/legal\/terms" hrefLang="en"/)
})

test('the 404 keeps its heading and offers the one exit that exists', () => {
  const notFound = renderToStaticMarkup(<NotFoundContent locale="en" />)

  expect(notFound).toContain('data-status-code="404"')
  expect(notFound).toMatch(/<h1[^>]*>Page not found<\/h1>/)
  expect(notFound).toContain('This page may be missing or private.')
  expect(hrefs(notFound)).toEqual(['/'])
  expect(renderToStaticMarkup(<NotFoundContent locale="ms" />)).toContain('Halaman tidak ditemui')
})

test('the error page says what happened and offers a retry only when it can retry', () => {
  const plain = renderToStaticMarkup(<PublicErrorContent locale="en" />)
  const retryable = renderToStaticMarkup(<PublicErrorContent locale="en" reset={() => undefined} />)

  expect(plain).toContain('This page could not be loaded.')
  expect(plain).not.toContain('<button')
  expect(retryable).toContain('Try again')
  expect(hrefs(retryable)).toEqual(['/'])
  expect(renderToStaticMarkup(<PublicErrorContent locale="ms" />)).toContain('Halaman ini tidak dapat dimuatkan.')
})
