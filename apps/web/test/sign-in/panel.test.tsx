import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { SignInPanel } from '../../features/sign-in/panel'
import { signInLinks } from '../../features/sign-in/links'
import type { AuthState } from '../../features/sign-in/model'

function render(
  mode: 'sign-in' | 'sign-up',
  state: AuthState = { kind: 'form' },
  next: string | null = null,
  locale: 'en' | 'ms' = 'en',
  env: Record<string, string | undefined> = {}
) {
  return renderToStaticMarkup(
    <SignInPanel mode={mode} next={next} state={state} links={signInLinks(locale, env)} locale={locale} />
  )
}

test('sign-in renders a passkey-first email form, Google and the PDPA notice, and no guest entry', () => {
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
  expect(html).not.toContain('/guest')
  expect(html).not.toContain('Continue as guest')
  expect(html).toContain('href="/legal/privacy"')
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
  expect(stepUp).toContain('Confirm it’s you')
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

test('the page says what it is in one h1', () => {
  const html = render('sign-in')

  expect(html.match(/<h1/g)).toHaveLength(1)
  expect(html).toContain('lang="en"')
  expect(html).toContain('aria-labelledby="sign-in-title"')
})

test('Malay visitors get the Malay form and a Malay lang', () => {
  const html = render('sign-in', { kind: 'form' }, null, 'ms')

  expect(html).toContain('lang="ms"')
  expect(html).toContain('Log masuk ke Skyclause')
  expect(html).toContain('Alamat e-mel')
  expect(html).toContain('Teruskan dengan Google')
  expect(html).not.toContain('Sign in to Skyclause')
})

test('on the app host of a multi-host deploy, the wordmark and the privacy notice go to the marketing host', () => {
  const env = { HOST_MODE: 'multi', MARKETING_ORIGIN: 'https://skyclause.m1ku.tech' }
  for (const mode of ['sign-in', 'sign-up'] as const) {
    const html = render(mode, { kind: 'form' }, null, 'en', env)
    expect(html).toContain('href="https://skyclause.m1ku.tech/"')
    expect(html).toContain('href="https://skyclause.m1ku.tech/legal/privacy"')
    expect(html).not.toContain('href="/"')
    expect(html).not.toContain('href="/legal/privacy"')
  }
})
