import { expect, test } from 'vitest'
import { marketingHref, signInLinks } from '../../features/sign-in/links'

const production = {
  HOST_MODE: 'multi',
  MARKETING_ORIGIN: 'https://skyclause.m1ku.tech',
  APP_ORIGIN: 'https://app.skyclause.m1ku.tech'
}

test('on the app host of a multi-host deploy, marketing pages are absolute to MARKETING_ORIGIN', () => {
  expect(marketingHref('/', production)).toBe('https://skyclause.m1ku.tech/')
  expect(signInLinks('en', production)).toEqual({
    home: 'https://skyclause.m1ku.tech/',
    privacy: 'https://skyclause.m1ku.tech/legal/privacy',
    terms: 'https://skyclause.m1ku.tech/legal/terms',
    credits: 'https://skyclause.m1ku.tech/#picture-credits'
  })
  expect(signInLinks('ms', production).privacy).toBe('https://skyclause.m1ku.tech/ms/legal/privacy')
})

test('on one host the links stay relative, whatever origins are set', () => {
  for (const env of [{}, { HOST_MODE: 'single', MARKETING_ORIGIN: 'https://skyclause.m1ku.tech' }]) {
    expect(signInLinks('en', env)).toEqual({
      home: '/',
      privacy: '/legal/privacy',
      terms: '/legal/terms',
      credits: '/#picture-credits'
    })
  }
})
