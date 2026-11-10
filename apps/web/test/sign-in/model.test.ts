import { expect, test } from 'vitest'
import { AUTH_ROUTE_PATHS, continuePath, isAuthRoute, resolveAuthState, safeNext } from '../../features/sign-in/model'

test('next accepts same-origin paths and drops external or ambiguous URLs', () => {
  expect(safeNext('/commons?tab=windows#new')).toBe('/commons?tab=windows#new')
  for (const value of ['https://evil.example/path', '//evil.example/path', '/\\evil.example/path', ' /commons']) {
    expect(safeNext(value)).toBeNull()
  }
})

test('continue and account links preserve only a safe next path', () => {
  expect(continuePath('/commons?tab=windows')).toBe('/api/auth/continue?next=%2Fcommons%3Ftab%3Dwindows')
  expect(continuePath('//evil.example')).toBe('/api/auth/continue')
})

test('URL states select link confirmation, expiry, pending-link and Google error copy', () => {
  expect(resolveAuthState({ link: 'token', for: 'step-up' })).toEqual({
    kind: 'confirm',
    link: 'token',
    stepUp: true
  })
  expect(resolveAuthState({ state: 'link-expired', resend: 'handle' })).toEqual({ kind: 'expired', resend: 'handle' })
  expect(resolveAuthState({ state: 'link-expired', for: 'step-up' })).toEqual({ kind: 'expired', stepUp: true })
  expect(resolveAuthState({ state: 'link-pending' })).toEqual({ kind: 'link-pending' })
  expect(resolveAuthState({ state: 'google-failed' })).toEqual({ kind: 'google-failed' })
})

test('the password-free crawl list covers current and planned auth routes', () => {
  expect(AUTH_ROUTE_PATHS).toEqual(['/sign-in', '/sign-up', '/guest', '/device', '/oauth/consent', '/invite/[token]'])
  expect(isAuthRoute('/sign-in')).toBe(true)
  expect(isAuthRoute('/invite/invite-token')).toBe(true)
  expect(isAuthRoute('/invite/token/extra')).toBe(false)
  expect(isAuthRoute('/new')).toBe(false)
})
