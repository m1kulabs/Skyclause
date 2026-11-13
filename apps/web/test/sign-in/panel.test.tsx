import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { SignInPanel } from '../../features/sign-in/panel'
import { AuthMessage } from '../../features/public-chrome/auth'
import { t } from '../../features/sign-in/i18n'
import { signInLinks } from '../../features/sign-in/links'
import type { AuthState } from '../../features/sign-in/model'

const NOW = '2026-11-13T02:10:00.000Z'

function render(
  mode: 'sign-in' | 'sign-up',
  state: AuthState = { kind: 'form' },
  next: string | null = null,
  locale: 'en' | 'ms' = 'en',
  env: Record<string, string | undefined> = {},
  methods = { email: true, google: true }
) {
  return renderToStaticMarkup(
    <SignInPanel
      mode={mode}
      next={next}
      state={state}
      links={signInLinks(locale, env)}
      methods={methods}
      now={NOW}
      locale={locale}
    />
  )
}

test('sign-in leads with the email link, then Google and a passkey, the legal line and no guest entry', () => {
  const html = render('sign-in')
  const normalized = html.toLowerCase()

  expect(html).toMatch(/<h1[^>]*>Sign in<\/h1>/)
  expect(html).toContain('Sign in with a passkey')
  expect(html).toContain('type="email"')
  expect(html).toContain('name="email"')
  expect(normalized).toContain('inputmode="email"')
  expect(normalized).toContain('autocomplete="username webauthn"')
  expect(normalized).toContain('spellcheck="false"')
  expect(normalized).toContain('novalidate=""')
  expect(html).toContain('action="/sign-in/link"')
  expect(html).toContain('Continue with Google')
  expect(html).not.toContain('/guest')
  expect(html).not.toContain('Continue as guest')
  expect(html).toContain('href="/legal/privacy"')
  expect(html).toContain('href="/legal/terms"')
  // A first visit has no passkey for this site yet: Google is the likelier second way in.
  expect(html.indexOf('Email address')).toBeLessThan(html.indexOf('Continue with Google'))
  expect(html.indexOf('Continue with Google')).toBeLessThan(html.indexOf('Sign in with a passkey'))
  // The hint sits under the field it describes, before the button.
  expect(html.indexOf('New to Skyclause?')).toBeLessThan(html.indexOf('Send sign-in link'))
  expect(html).toContain('The call for each class, event or commute window you plan.')
  expect(html).not.toMatch(/type="password"|autocomplete="(?:current|new)-password"/)
})

test('sign-up is the same page with the same verb, omits passkey and preserves next in its sign-in link', () => {
  const html = render('sign-up', { kind: 'form' }, '/commons?tab=windows')

  expect(html).toContain('Sign in or create your account')
  expect(html).not.toContain('Sign in with a passkey')
  expect(html).toContain('href="/sign-in?next=%2Fcommons%3Ftab%3Dwindows"')
  expect(html).toContain('name="next" value="/commons?tab=windows"')
  expect(html).toContain('href="/legal/privacy"')
})

test('the emailed link’s page says it is their link, until when it works, and offers the one action', () => {
  const normal = render('sign-in', { kind: 'confirm', link: 'token', stepUp: false })
  expect(normal).toMatch(/<h1[^>]*>Your sign-in link<\/h1>/)
  expect(normal).toContain('This is the link we emailed you. Press Sign in to finish signing in on this browser.')
  expect(normal.match(/<button/g)).toHaveLength(1)
  expect(normal).toMatch(/<button[^>]*>Sign in<\/button>/)
  expect(normal).not.toContain('Sign in with a passkey')
  expect(normal).not.toContain('type="email"')
  expect(normal).not.toContain('It works until')
  // No address is shown: the visitor holding the link did not type it here.
  expect(normal).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/)

  // When the server knows the link's end, the page and the strip say it, and the strip draws what is left.
  const known = render('sign-in', { kind: 'confirm', link: 'token', stepUp: false, until: '2026-11-13T02:20:00.000Z' })
  expect(known).toMatch(/It works until <time datetime="2026-11-13T02:20:00.000Z">10:20<\/time>\u00a0MYT\./i)
  expect(known).toContain('data-sign-in-strip="link"')
  expect(known).toContain('10\u00a0min left')

  const stepUp = render('sign-in', { kind: 'confirm', link: 'token', stepUp: true })
  expect(stepUp).toMatch(/<h1[^>]*>Your confirmation link<\/h1>/)
  expect(stepUp).toContain('Confirm it’s you')
  expect(render('sign-in', { kind: 'step-up-confirmed' })).toContain(
    'Confirmed. Go back to the tab that asked and press Continue.'
  )
})

test('expired, pending and Google failure states explain the failure and next action', () => {
  const expired = render('sign-in', { kind: 'expired', resend: 'handle' })
  expect(expired).toContain('This sign-in link has expired or was already used.')
  expect(expired).toContain('Send a new link')
  expect(expired).not.toContain('Resend')
  expect(expired).not.toContain('type="email"')
  // An expiry is a result, not an error, with the clock glyph.
  const tile = expired.slice(expired.lastIndexOf('<div', expired.indexOf('This sign-in link has expired')))
  expect(tile).toContain('role="status"')
  expect(tile).not.toContain('text-destructive')

  const stepUpExpired = render('sign-in', { kind: 'expired', stepUp: true })
  expect(stepUpExpired).toContain('Go back to the tab that asked and send a new link from there.')

  const pending = render('sign-in', { kind: 'link-pending' })
  expect(pending).toContain('Use email sign-in for this account')

  const googleFailed = render('sign-in', { kind: 'google-failed' })
  expect(googleFailed).toContain('Try Google again or use email sign-in')
})

test('a protected page’s return path says why the visitor is here, in one line above the form', () => {
  expect(render('sign-in', { kind: 'form' }, '/new')).toContain('Sign in to open the page you asked for.')
  expect(render('sign-in')).not.toContain('Sign in to open the page you asked for.')
})

test('without script, the posted form lands on a page that says what happened', () => {
  const sent = render('sign-in', { kind: 'link-sent', until: '2026-11-13T02:25:00.000Z' })
  expect(sent).toMatch(/<h1[^>]*>Check your email<\/h1>/)
  expect(sent.match(/<h[1-6]/g)).toHaveLength(1)
  expect(sent).toContain('Nothing yet? Look in your spam or junk folder, or send a new link.')
  expect(sent).toContain('We sent a sign-in link to the address you entered.')
  expect(sent).toMatch(/It works until <time datetime="2026-11-13T02:25:00.000Z">10:25<\/time>\u00a0MYT\./i)
  expect(sent).toMatch(/Your link works until <time[^>]*>10:25<\/time>\u00a0MYT/)
  expect(sent).toContain('15\u00a0min left')
  expect(sent).not.toContain('type="email"')

  const lapsed = render('sign-in', { kind: 'link-sent', until: '2026-11-13T02:05:00.000Z' })
  expect(lapsed).toMatch(/Your sign-in link expired at <time[^>]*>10:05<\/time>\u00a0MYT\./)
  expect(lapsed).toContain('type="email"')
  // The strip keeps the closed window where it was, from the link's start to its end.
  expect(lapsed).toContain('data-sign-in-strip="closed"')
  expect(lapsed).toContain('data-sign-in-window="closed"')
  expect(lapsed).toMatch(/data-shown="true">Your link expired at <time[^>]*>10:05<\/time>\u00a0MYT</)

  const invalid = render('sign-in', { kind: 'email-invalid' })
  expect(invalid).toContain('Enter an email address like name@example.com.')
  expect(invalid).toContain('aria-invalid="true"')
  expect(invalid).toContain('data-invalid="true"')

  expect(render('sign-in', { kind: 'send-failed' })).toContain('We couldn’t send the sign-in link just now.')
  expect(render('sign-in', { kind: 'send-limited', retryAt: '2026-11-13T02:50:00.000Z' })).toMatch(
    /You can ask again at <time[^>]*>10:50<\/time>\u00a0MYT\./
  )
})

test('only the ways in the server can serve are offered, and a missing email link is said in words', () => {
  const noGoogle = render('sign-in', { kind: 'form' }, null, 'en', {}, { email: true, google: false })
  expect(noGoogle).not.toContain('Continue with Google')
  expect(noGoogle).toContain('action="/sign-in/link"')

  const noMail = render('sign-in', { kind: 'form' }, null, 'en', {}, { email: false, google: true })
  expect(noMail).not.toContain('type="email"')
  expect(noMail).toContain('Email sign-in isn’t available right now. Use a passkey or Google instead.')

  const neither = render('sign-up', { kind: 'form' }, null, 'en', {}, { email: false, google: false })
  expect(neither).toContain('Email sign-in isn’t available right now. Try again later.')
})

test('the room shows one credited photograph of Bukit Jalil and, at rest, the window a link sent now would have', () => {
  const html = render('sign-in')
  expect(html).toContain('alt="Bukit Jalil LRT station under a blue afternoon sky with tall white clouds"')
  expect(html).toMatch(/<img[^>]*width="1400"[^>]*height="1050"/)
  expect(html).toContain('href="/#picture-credits"')
  expect(html).toContain('Photo by *angys*, CC BY-SA 4.0')
  expect(html).toMatch(/Now <time datetime="2026-11-13T02:10:00.000Z">10:10<\/time>\u00a0MYT/i)
  // Rendered for the request's time, so the page without script says it too.
  expect(html).toContain('data-sign-in-strip="rest"')
  expect(html).toMatch(
    /data-shown="true">A link sent now works until <time datetime="2026-11-13T02:25:00.000Z">10:25<\/time>\u00a0MYT</i
  )
  // The would-be window runs from now (10:10, 10 of the strip's 80 minutes from 10:00) for the link's 15 minutes.
  expect(html).toMatch(/data-sign-in-window="ready"[^>]*style="left:12.500%;width:18.750%"/)
})

test('the page says what it is in one h1', () => {
  const html = render('sign-in')

  expect(html.match(/<h1/g)).toHaveLength(1)
  expect(html).toContain('lang="en"')
  expect(html).toContain('aria-labelledby="sign-in-title"')
})

test('Malay visitors get the Malay form, the Malay privacy notice and a Malay lang', () => {
  const html = render('sign-in', { kind: 'form' }, null, 'ms')

  expect(html).toContain('lang="ms"')
  expect(html).toMatch(/<h1[^>]*>Log masuk<\/h1>/)
  expect(html).toContain('Alamat e-mel')
  expect(html).toContain('Teruskan dengan Google')
  expect(html).toContain('href="/ms/legal/privacy"')
  expect(html).not.toContain('Sign in with a passkey')
})

test('on the app host of a multi-host deploy, every marketing link goes to the marketing host', () => {
  const env = { HOST_MODE: 'multi', MARKETING_ORIGIN: 'https://skyclause.m1ku.tech' }
  for (const mode of ['sign-in', 'sign-up'] as const) {
    const html = render(mode, { kind: 'form' }, null, 'en', env)
    expect(html).toContain('href="https://skyclause.m1ku.tech/"')
    expect(html).toContain('href="https://skyclause.m1ku.tech/legal/privacy"')
    expect(html).toContain('href="https://skyclause.m1ku.tech/legal/terms"')
    expect(html).toContain('href="https://skyclause.m1ku.tech/#picture-credits"')
    expect(html).not.toContain('href="/"')
    expect(html).not.toContain('href="/legal/privacy"')
  }
})

test('a result (a confirmation, an expiry) is set in the plain style; only an error takes the error style', () => {
  const result = renderToStaticMarkup(<AuthMessage tone="result">{t('sign-in.confirm_done')}</AuthMessage>)
  expect(result).toContain('role="status"')
  expect(result).not.toContain('text-destructive')
  const error = renderToStaticMarkup(<AuthMessage>{t('sign-in.send_failed')}</AuthMessage>)
  expect(error).toContain('role="alert"')
  expect(error).toContain('text-destructive')
  // The product's glyphs, not a generic icon set: the cross for a failure, the clock for what ends or waits.
  expect(error).toContain('m2 2 8 8m0-8-8 8')
  expect(renderToStaticMarkup(<AuthMessage glyph="clock">{t('sign-in.send_rate_limited')}</AuthMessage>)).toContain(
    'M6 3v3h2.5'
  )
  expect(error).not.toContain('lucide')
  const lapsed = render('sign-in', { kind: 'link-sent', until: '2026-11-13T02:05:00.000Z' })
  const message = lapsed.slice(0, lapsed.indexOf('Your sign-in link expired'))
  const tag = message.slice(message.lastIndexOf('<div'))
  expect(tag).toContain('data-slot="alert"')
  expect(tag).toContain('role="status"')
  expect(tag).not.toContain('text-destructive')
})
