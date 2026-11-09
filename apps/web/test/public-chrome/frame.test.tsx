import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { BrandLines, NotFoundContent, PublicChrome, PublicErrorContent } from '../../features/public-chrome'
import { t } from '@skyclause/i18n'

test('the public frame carries the shared header, both brand lines and the five footer exits', () => {
  const page = renderToStaticMarkup(
    <PublicChrome locale="en">
      <main>
        <h1>{t('brand.name')}</h1>
      </main>
    </PublicChrome>
  )

  expect(page).toContain('href="/"')
  expect(page).toContain('Skyclause')
  expect(page).toContain(t('brand.non_affiliation'))
  expect(page).toContain(t('brand.not_safety_service'))
  for (const label of ['Docs', 'Status', 'Terms', 'Privacy', 'Bahasa Melayu']) expect(page).toContain(label)
})

test('brand lines retain their catalogue copy on the landing page', () => {
  const page = renderToStaticMarkup(<BrandLines locale="en" />)
  expect(page).toContain(t('brand.non_affiliation'))
  expect(page).toContain(t('brand.not_safety_service'))
})

test('Malay public copy and the 404 exits are catalogue-backed', () => {
  const frame = renderToStaticMarkup(
    <PublicChrome locale="ms">
      <main>
        <h1>{t('brand.name', {}, 'ms')}</h1>
      </main>
    </PublicChrome>
  )
  const notFound = renderToStaticMarkup(<NotFoundContent locale="en" />)
  const error = renderToStaticMarkup(<PublicErrorContent locale="en" />)

  expect(frame).toContain(t('brand.non_affiliation', {}, 'ms'))
  expect(frame).toContain(t('brand.not_safety_service', {}, 'ms'))
  expect(frame).toContain('Dokumen')
  expect(notFound).toContain('404')
  expect(notFound.match(/<a /g)).toHaveLength(3)
  expect(notFound).toContain('This page may be missing or private.')
  expect(error).toContain('This page could not be loaded.')
  expect(error.match(/<a /g)).toHaveLength(3)
})
