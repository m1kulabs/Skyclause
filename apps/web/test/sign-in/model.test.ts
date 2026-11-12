import { expect, test } from 'vitest'
import {
  AUTH_ROUTE_PATHS,
  continuePath,
  isAuthRoute,
  isEmailAddress,
  resolveAuthState,
  safeNext
} from '../../features/sign-in/model'

test('next accepts same-origin paths and drops external or ambiguous URLs', () => {
  expect(safeNext('/commons?tab=windows#new')).toBe('/commons?tab=windows#new')
  for (const value of ['https://evil.example/path', '//evil.example/path', '/\\evil.example/path', ' /commons']) {
    expect(safeNext(value)).toBeNull()
  }
})

test('next refuses what Better Auth refuses in a callback URL, and anything past 2,000 characters', () => {
  for (const value of [
    '/commons\u0000',
    '/commons\u001fx',
    '/commons\u007f',
    '/commons\u0085',
    '/%2fevil.example',
    '/%2Fevil.example',
    '/commons%5cevil',
    `/${'a'.repeat(2000)}`
  ]) {
    expect(safeNext(value), JSON.stringify(value.slice(0, 20))).toBeNull()
  }
  // An encoded slash after the path is a query value, as Better Auth allows; a path of exactly 2,000 is kept.
  expect(safeNext('/commons?next=%2Fwindows')).toBe('/commons?next=%2Fwindows')
  expect(safeNext(`/${'a'.repeat(1999)}`)).toHaveLength(2000)
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

test('the no-script form’s answers select their states, and a sent link’s end is drawn only within one lifetime', () => {
  const now = new Date('2026-11-13T02:10:00.000Z')
  expect(resolveAuthState({ state: 'link-sent', until: '2026-11-13T02:25:00.000Z' }, now)).toEqual({
    kind: 'link-sent',
    until: '2026-11-13T02:25:00.000Z'
  })
  expect(resolveAuthState({ state: 'link-sent', until: '2026-11-14T02:25:00.000Z' }, now)).toEqual({ kind: 'form' })
  expect(resolveAuthState({ state: 'link-sent', until: 'soon' }, now)).toEqual({ kind: 'form' })
  expect(resolveAuthState({ state: 'email-invalid' })).toEqual({ kind: 'email-invalid' })
  expect(resolveAuthState({ state: 'send-failed' })).toEqual({ kind: 'send-failed' })
  expect(resolveAuthState({ state: 'send-limited', retry: '2026-11-13T03:10:00.000Z' })).toEqual({
    kind: 'send-limited',
    retryAt: '2026-11-13T03:10:00.000Z'
  })
  expect(resolveAuthState({ state: 'send-limited' })).toEqual({ kind: 'send-limited' })
  expect(resolveAuthState({ state: 'step-up-confirmed' })).toEqual({ kind: 'step-up-confirmed' })
  expect(resolveAuthState({ state: 'link-expired', resend: 'handle', failed: 'resend' })).toEqual({
    kind: 'expired',
    resend: 'handle',
    resendFailed: true
  })
})

test('an email address needs one @ with something either side and a dotted domain', () => {
  for (const value of ['reader@example.org', `reader+${'x'.repeat(96)}@example.org`])
    expect(isEmailAddress(value)).toBe(true)
  for (const value of ['', 'not-an-email', 'reader@example', '@example.org', 'a b@example.org']) {
    expect(isEmailAddress(value)).toBe(false)
  }
})
