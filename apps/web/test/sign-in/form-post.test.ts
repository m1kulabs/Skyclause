import { expect, test } from 'vitest'
import {
  confirmLinkFromForm,
  resendLinkFromForm,
  sendLinkFromForm,
  startGoogleFromForm,
  type FormPostDependencies
} from '../../features/sign-in/form-post'

const APP = 'https://app.skyclause.m1ku.tech'
const NOW = new Date('2026-11-13T02:10:00.000Z')

function fake(answer: (request: Request) => Response) {
  const calls: Array<{ url: string; headers: Headers; body: unknown }> = []
  const deps: FormPostDependencies = {
    appOrigin: () => APP,
    now: () => NOW,
    auth: async (request) => {
      calls.push({ url: request.url, headers: request.headers, body: await request.clone().json() })
      return answer(request)
    }
  }
  return { deps, calls }
}

function post(path: string, fields: Record<string, string>, headers: Record<string, string> = { origin: APP }) {
  return new Request(`${APP}${path}`, { method: 'POST', headers, body: new URLSearchParams(fields) })
}

test('a sent link lands on /sign-in saying until when it works, fifteen minutes from before the send', async () => {
  const { deps, calls } = fake(() => Response.json({ status: true }))
  const response = await sendLinkFromForm(
    post(
      '/sign-in/link',
      { email: ' reader@example.org ', next: '/commons?tab=windows' },
      {
        origin: APP,
        'x-forwarded-for': '203.0.113.9',
        cookie: 'a=b'
      }
    ),
    deps
  )
  expect(response.status).toBe(303)
  expect(response.headers.get('location')).toBe(
    '/sign-in?state=link-sent&until=2026-11-13T02%3A25%3A00.000Z&next=%2Fcommons%3Ftab%3Dwindows'
  )
  expect(calls).toHaveLength(1)
  expect(calls[0]!.url).toBe(`${APP}/api/auth/sign-in/magic-link`)
  expect(calls[0]!.body).toEqual({
    email: 'reader@example.org',
    callbackURL: '/api/auth/continue?next=%2Fcommons%3Ftab%3Dwindows'
  })
  expect(calls[0]!.headers.get('x-forwarded-for')).toBe('203.0.113.9')
  expect(calls[0]!.headers.get('cookie')).toBe('a=b')
  expect(calls[0]!.headers.get('origin')).toBe(APP)
})

test('each refusal says what happened in a state the page renders, never a status', async () => {
  const cases: Array<[Response, string]> = [
    [
      new Response(null, { status: 429, headers: { 'Retry-After': '600' } }),
      'state=send-limited&retry=2026-11-13T02%3A20%3A00.000Z&email=reader%40example.org'
    ],
    [new Response(null, { status: 429 }), 'state=send-limited&email=reader%40example.org'],
    [Response.json({ code: 'VALIDATION_ERROR' }, { status: 400 }), 'state=email-invalid&email=reader%40example.org'],
    [Response.json({ code: 'EMAIL_NOT_SENT' }, { status: 502 }), 'state=send-failed&email=reader%40example.org'],
    [new Response(null, { status: 500 }), 'state=send-failed&email=reader%40example.org']
  ]
  for (const [answer, location] of cases) {
    const { deps } = fake(() => answer)
    const response = await sendLinkFromForm(post('/sign-in/link', { email: 'reader@example.org' }), deps)
    expect(response.headers.get('location')).toBe(`/sign-in?${location}`)
  }
})

test('a refusal carries the typed address back to the field, so nobody retypes it', async () => {
  const { deps } = fake(() => new Response(null, { status: 500 }))
  const failed = await sendLinkFromForm(post('/sign-in/link', { email: ' reader@example.org ', next: '/new' }), deps)
  expect(failed.headers.get('location')).toBe('/sign-in?state=send-failed&email=reader%40example.org&next=%2Fnew')
  const empty = await sendLinkFromForm(post('/sign-in/link', {}), deps)
  expect(empty.headers.get('location')).toBe('/sign-in?state=email-invalid')
})

test('a malformed address or a cross-site post never reaches Better Auth', async () => {
  const { deps, calls } = fake(() => Response.json({ status: true }))
  const invalid = await sendLinkFromForm(post('/sign-in/link', { email: 'not-an-email', next: '//evil.example' }), deps)
  expect(invalid.headers.get('location')).toBe('/sign-in?state=email-invalid&email=not-an-email')
  const forged = await sendLinkFromForm(
    post('/sign-in/link', { email: 'reader@example.org' }, { origin: 'https://evil.example' }),
    deps
  )
  expect(forged.status).toBe(403)
  expect(calls).toHaveLength(0)
})

test('Google without script hands the browser to Google with Better Auth’s state cookie, or says it failed', async () => {
  const { deps, calls } = fake(
    () =>
      new Response(JSON.stringify({ url: 'https://accounts.google.com/o/oauth2/auth?state=s', redirect: true }), {
        headers: { 'content-type': 'application/json', 'set-cookie': '__Secure-better-auth.state=s; Path=/; HttpOnly' }
      })
  )
  const response = await startGoogleFromForm(post('/sign-in/google', { next: '/new' }), deps)
  expect(response.status).toBe(303)
  expect(response.headers.get('location')).toBe('https://accounts.google.com/o/oauth2/auth?state=s')
  expect(response.headers.getSetCookie()).toEqual(['__Secure-better-auth.state=s; Path=/; HttpOnly'])
  expect(calls[0]!.body).toEqual({ provider: 'google', callbackURL: '/api/auth/continue?next=%2Fnew' })

  const failed = fake(() => Response.json({ message: 'Provider not found' }, { status: 404 }))
  const refused = await startGoogleFromForm(post('/sign-in/google', {}), failed.deps)
  expect(refused.headers.get('location')).toBe('/sign-in?state=google-failed')
})

test('the emailed link’s Sign in posts its token as JSON and passes Better Auth’s redirect and cookie through', async () => {
  const { deps, calls } = fake(
    () =>
      new Response(null, {
        status: 303,
        headers: { Location: '/api/auth/continue?next=%2Fnew', 'Set-Cookie': '__Secure-session=s; Path=/; HttpOnly' }
      })
  )
  const response = await confirmLinkFromForm(post('/sign-in/confirm', { link: 'token', resend: 'handle' }), deps)
  expect(response.status).toBe(303)
  expect(response.headers.get('location')).toBe('/api/auth/continue?next=%2Fnew')
  expect(response.headers.getSetCookie()).toEqual(['__Secure-session=s; Path=/; HttpOnly'])
  expect(calls[0]!.url).toBe(`${APP}/api/auth/magic-link/confirm`)
  expect(calls[0]!.body).toEqual({ link: 'token', resend: 'handle' })

  const stepUp = fake(() => Response.json({ status: true }))
  const confirmed = await confirmLinkFromForm(post('/sign-in/confirm', { link: 't', for: 'step-up' }), stepUp.deps)
  expect(stepUp.calls[0]!.url).toBe(`${APP}/api/auth/step-up/magic-link/confirm`)
  expect(confirmed.headers.get('location')).toBe('/sign-in?state=step-up-confirmed')
})

test('a resend lands on the sent page with the new link’s end, or back on the expired one saying it failed', async () => {
  const { deps, calls } = fake(() => Response.json({ status: true }))
  const sent = await resendLinkFromForm(post('/sign-in/resend', { resend: 'handle' }), deps)
  expect(sent.headers.get('location')).toBe('/sign-in?state=link-sent&until=2026-11-13T02%3A25%3A00.000Z')
  expect(calls[0]!.body).toEqual({ resend: 'handle' })

  const failing = fake(() => new Response(null, { status: 500 }))
  const failed = await resendLinkFromForm(post('/sign-in/resend', { resend: 'handle' }), failing.deps)
  expect(failed.headers.get('location')).toBe('/sign-in?state=link-expired&resend=handle&failed=resend')
})
