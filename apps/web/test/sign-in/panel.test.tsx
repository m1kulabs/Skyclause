import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { SignInPanel } from '../../features/sign-in/panel'
import type { AuthState } from '../../features/sign-in/model'

function render(mode: 'sign-in' | 'sign-up', state: AuthState = { kind: 'form' }, next: string | null = null) {
  return renderToStaticMarkup(<SignInPanel mode={mode} next={next} state={state} />)
}

test('sign-in renders a passkey-first email form, Google, guest entry and PDPA notice', () => {
  const html = render('sign-in')
  const normalized = html.toLowerCase()

  expect(html).toContain('Sign in to Skyclause')
  expect(html).toContain('Sign in with a passkey')
  expect(html).toContain('type="email"')
  expect(html).toContain('name="email"')
  expect(normalized).toContain('inputmode="email"')
  expect(normalized).toContain('autocomplete="username webauthn"')
  expect(normalized).toContain('spellcheck="false"')
  expect(html).toContain('Continue with Google')
  expect(html).toContain('href="/guest"')
  expect(html).toContain('href="/legal/privacy"')
  expect(html.match(/Continue as guest/g)).toHaveLength(1)
  expect(html.indexOf('Sign in with a passkey')).toBeLessThan(html.indexOf('Email address'))
  expect(html.indexOf('Email address')).toBeLessThan(html.indexOf('Continue with Google'))
  expect(html).not.toMatch(/type="password"|autocomplete="(?:current|new)-password"/)
})

test('sign-up omits passkey and preserves next in its sign-in link', () => {
  const html = render('sign-up', { kind: 'form' }, '/commons?tab=windows')

  expect(html).toContain('Create an account')
  expect(html).not.toContain('Sign in with a passkey')
  expect(html).toContain('href="/sign-in?next=%2Fcommons%3Ftab%3Dwindows"')
  expect(html).toContain('href="/legal/privacy"')
})

test('link confirmation renders only the token action and uses step-up copy when requested', () => {
  const normal = render('sign-in', { kind: 'confirm', link: 'token', stepUp: false })
  expect(normal).toContain('Sign in')
  expect(normal).not.toContain('Sign in with a passkey')
  expect(normal).not.toContain('type="email"')

  const stepUp = render('sign-in', { kind: 'confirm', link: 'token', stepUp: true })
  expect(stepUp).toContain('Confirm it&#x27;s you')
})

test('expired, pending and Google failure states explain the failure and next action', () => {
  const expired = render('sign-in', { kind: 'expired', resend: 'handle' })
  expect(expired).toContain('This link has expired. Request a new one.')
  expect(expired).toContain('Resend')
  expect(expired).not.toContain('type="email"')

  const stepUpExpired = render('sign-in', { kind: 'expired', stepUp: true })
  expect(stepUpExpired).toContain('Go back to the tab that requested it and choose Send again')

  const pending = render('sign-in', { kind: 'link-pending' })
  expect(pending).toContain('Use email sign-in for this account')

  const googleFailed = render('sign-in', { kind: 'google-failed' })
  expect(googleFailed).toContain('Try Google again or use email sign-in')
})
