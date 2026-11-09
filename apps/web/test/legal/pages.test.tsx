import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { expect, test } from 'vitest'
import { PRIVACY_NOTICE_VERSION, TERMS_VERSION } from '@skyclause/contracts'
import { PrivacyNoticePage, TermsPage } from '../../features/legal'

const html = (node: ReactNode) => renderToStaticMarkup(node)

test('the English privacy notice publishes every required processor, region, right and retention period', () => {
  const page = html(<PrivacyNoticePage locale="en" />)

  expect(page).toContain('Notice version:')
  expect(page).toContain(`<time dateTime="${PRIVACY_NOTICE_VERSION}">${PRIVACY_NOTICE_VERSION}</time>`)
  for (const item of [
    'email address',
    'role',
    'selected windows',
    'notice language',
    'device budget token',
    'hashed IP address',
    'Amazon SES',
    'Sydney, Australia',
    'ap-southeast-2',
    'Neon',
    'AWS Singapore',
    'Stripe',
    'Model providers',
    'Cloudflare Turnstile',
    'asia-southeast1',
    'up to one day',
    'We do not promise that data will stay in one country or region.',
    '72 hours',
    '7 days',
    '183 days',
    '24 hours',
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
  expect(page).toContain(`<time dateTime="${PRIVACY_NOTICE_VERSION}">${PRIVACY_NOTICE_VERSION}</time>`)
  for (const item of [
    'Amazon SES',
    'Sydney, Australia',
    'ap-southeast-2',
    'Neon',
    'AWS Singapore',
    'Stripe',
    'Cloudflare Turnstile',
    'asia-southeast1',
    '72 jam',
    '7 hari',
    '14 hari',
    '30 hari',
    '183 hari',
    '24 jam'
  ]) {
    expect(page).toContain(item)
  }
  for (const englishHeading of ['What we collect', 'Where data is stored', 'Your rights', 'Breach notification']) {
    expect(page).not.toContain(englishHeading)
  }
})

test('terms publish all proposal prices and the linked service details', () => {
  const page = html(<TermsPage locale="en" />)

  expect(page).toContain('id="plans"')
  expect(page).toContain('id="service"')
  expect(page).toContain(`<time dateTime="${TERMS_VERSION}">${TERMS_VERSION}</time>`)
  expect(page.match(/proposal, untested/g)).toHaveLength(4)
  for (const item of [
    'RM 49 a month per organisation',
    'RM 900 a month per campus, billed yearly',
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
    'six-hour restore window',
    'dropped at ingest and never stored',
    'not a safety or emergency service'
  ]) {
    expect(page).toContain(item)
  }
})
