import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { getPrincipal } from '../../lib/principal'
import { prefersMalay } from '../../lib/preferred-language'
import { signInLinks } from './links'
import { offeredMethods } from './methods'
import { continuePath, resolveAuthState, safeNext, type AuthSearchParams } from './model'
import { SignInPanel } from './panel'

export async function accountRoute(mode: 'sign-in' | 'sign-up', searchParams: Promise<AuthSearchParams>) {
  const params = await searchParams
  const nextValue = typeof params.next === 'string' ? params.next : undefined
  const next = safeNext(nextValue)
  const principal = await getPrincipal()

  // A guest stays: sign-up is how a guest account converts (#97 tracks `from_guest`).
  if (principal?.kind === 'session' && !principal.isGuest) redirect(continuePath(next))

  // The strip's clock and a sent link's state are this request's: render now, never from a prerender.
  await connection()
  const now = new Date()
  const state = mode === 'sign-in' ? resolveAuthState(params, now) : { kind: 'form' as const }
  const locale = prefersMalay((await headers()).get('accept-language')) ? 'ms' : 'en'
  return (
    <SignInPanel
      mode={mode}
      next={next}
      state={state}
      links={signInLinks(locale)}
      methods={await offeredMethods()}
      now={now.toISOString()}
      locale={locale}
    />
  )
}
