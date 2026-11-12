import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { expect, test } from 'vitest'
import { PRIVACY_NOTICE_VERSION, TERMS_VERSION } from '@skyclause/contracts'
import { t } from '@skyclause/i18n'
import { formatDate } from '@skyclause/i18n/format'
import { PrivacyNoticePage, TermsPage } from '../../features/legal'

const html = (node: ReactNode) => renderToStaticMarkup(node)
// A version prints as the reader's locale writes a date; the ISO date stays in `dateTime`.
const version = (iso: string, locale: 'en' | 'ms') =>
  `<time dateTime="${iso}">${formatDate(`${iso}T12:00:00+08:00`, locale)}</time>`

test('the English privacy notice publishes every required processor, region, right and retention period', () => {
  const page = html(<PrivacyNoticePage locale="en" />)

  expect(page).toContain('Notice version:')
  expect(page).toContain(version(PRIVACY_NOTICE_VERSION!, 'en'))
  for (const item of [
    'email address',
    'role',
    'selected windows',
    'notice language',
    'device budget token',
    'hashed IP address',
    'Resend',
    'Tokyo, Japan',
    'ap-northeast-1',
    'Neon',
    'AWS Singapore',
    'Stripe',
    'Model providers',
    'Cloudflare Turnstile',
    'asia-southeast1',
    'We do not promise that data will stay in one country or region.',
    '72 hours',
    '7 days',
    '183\u00a0days',
    '24\u00a0hours',
    '14 days',
    '30 days',
    '7 days',
    'hashed suppression entry'
  ]) {
    expect(page).toContain(item)
  }
})

test('the Malay privacy notice is fully translated and publishes the same version and required data', () => {
  const page = html(<PrivacyNoticePage locale="ms" />)

  expect(page).toContain('lang="ms"')
  expect(page).toContain('Versi notis:')
  expect(page).toContain(version(PRIVACY_NOTICE_VERSION!, 'ms'))
  for (const item of [
    'Resend',
    'Tokyo, Jepun',
    'ap-northeast-1',
    'Neon',
    'AWS Singapore',
    'Stripe',
    'Cloudflare Turnstile',
    'asia-southeast1',
    '72 jam',
    '7 hari',
    '14 hari',
    '30 hari',
    '183\u00a0hari',
    '24\u00a0jam'
  ]) {
    expect(page).toContain(item)
  }
  for (const heading of [
    'collectionHeading',
    'processorsHeading',
    'regionHeading',
    'rightsHeading',
    'retentionHeading',
    'breachHeading'
  ]) {
    expect(page).not.toContain(t(`legal.privacy.${heading}`))
  }
})

test('terms publish all proposal prices and the linked service details', () => {
  const page = html(<TermsPage locale="en" />)

  expect(page).toContain('id="plans"')
  expect(page).toContain('id="service"')
  expect(page).toContain(version(TERMS_VERSION, 'en'))
  expect(page.match(/proposal, untested/g)).toHaveLength(4)
  for (const item of [
    'RM\u00a0299 a month per organisation',
    'RM\u00a01,900 a month per campus, billed yearly',
    'JPS',
    'MET',
    'APIMS',
    'Rapid Rail',
    'GTFS Realtime',
    'GoLive',
    'Wikipedia',
    '4 requests a minute per API',
    'every 5 minutes',
    'every 10 minutes',
    'in daylight',
    'configured schedule',
    'every 15 minutes',
    'D+1',
    '23:55 MYT',
    '06:30 MYT',
    '20 runs',
    '10 evidence requests',
    '5 active guest windows',
    '14 days',
    '30 days',
    '6-hour restore window',
    'dropped at ingest and never stored',
    'not a safety or emergency service'
  ]) {
    expect(page).toContain(item)
  }
})

test('a legal page is set for reading: one h1, a contents list whose links all land, no eyebrow', () => {
  for (const [page, locale] of [
    [<PrivacyNoticePage locale="en" key="en" />, 'en'],
    [<PrivacyNoticePage locale="ms" key="ms" />, 'ms'],
    [<TermsPage locale="en" key="terms" />, 'en']
  ] as const) {
    const markup = html(page)
    const targets = [...markup.matchAll(/<a href="#([^"]+)"/g)].map((match) => match[1]!)

    expect(markup.match(/<h1/g)).toHaveLength(1)
    expect(markup).toContain(`lang="${locale}"`)
    expect(markup).toContain(t('legal.contents', {}, locale))
    expect(targets.length).toBeGreaterThanOrEqual(2)
    for (const target of targets) expect(markup).toContain(`id="${target}"`)
    expect(markup).not.toMatch(/LEGAL ·|UNDANG-UNDANG ·/)
  }
})

test('identifiers in legal sentences are never translated, and the version is a date in words', () => {
  const page = html(<PrivacyNoticePage locale="en" />)
  for (const identifier of ['ap-northeast-1', 'asia-southeast1', 'LECTID']) {
    expect(page).toContain(`<span translate="no">${identifier}</span>`)
  }
  expect(page).not.toContain(`>${PRIVACY_NOTICE_VERSION}</time>`)
})

test('the terms say plans in dates, not roadmap phases', () => {
  const page = html(<TermsPage locale="en" />)
  expect(page).not.toMatch(/\bP[0-3]\b|\bGA\b|general availability|next_update/)
  for (const plain of ['Planned from May 2027', 'Planned after May 2027', 'The beta, until February 2027']) {
    expect(page).toContain(plain)
  }
})

test('the retention periods are a real table with a name, a period and what happens after', () => {
  for (const locale of ['en', 'ms'] as const) {
    const markup = html(<PrivacyNoticePage locale={locale} />)
    const table = markup.match(/<table[^>]*>.*<\/table>/)![0]

    expect(table.match(/<th[^>]*scope="col"/g)).toHaveLength(3)
    expect(table.match(/<th[^>]*scope="row"/g)).toHaveLength(11)
    expect(table.match(/<td /g)).toHaveLength(22)
    expect(table).toContain(t('legal.privacy.retention.columnKept', {}, locale))
  }
  expect(html(<TermsPage locale="en" />)).toContain('<table')
})
