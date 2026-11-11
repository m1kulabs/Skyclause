import { redirect } from 'next/navigation'
import { getPrincipal } from '../../lib/principal'
import { continuePath, resolveAuthState, safeNext, type AuthSearchParams } from './model'
import { SignInPanel } from './panel'

export async function accountRoute(mode: 'sign-in' | 'sign-up', searchParams: Promise<AuthSearchParams>) {
  const params = await searchParams
  const nextValue = typeof params.next === 'string' ? params.next : undefined
  const next = safeNext(nextValue)
  const principal = await getPrincipal()

  // A guest stays: sign-up is how a guest account converts (#97 tracks `from_guest`).
  if (principal?.kind === 'session' && !principal.isGuest) redirect(continuePath(next))

  const state = mode === 'sign-in' ? resolveAuthState(params) : { kind: 'form' as const }
  return <SignInPanel mode={mode} next={next} state={state} />
}
