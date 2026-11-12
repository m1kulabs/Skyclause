'use client'

import { useState } from 'react'
import { authRequest } from '../account/auth-api'

export type SignOutState = 'idle' | 'busy' | 'failed'

/**
 * Signs out this session only (Better Auth's `/sign-out`), then opens the sign-in page; Security keeps "Sign out
 * everywhere" for the account's other sessions. A failed request leaves the person where they were, told so.
 */
export function useSignOut() {
  const [state, setState] = useState<SignOutState>('idle')
  async function signOut() {
    if (state === 'busy') return
    setState('busy')
    try {
      await authRequest('/sign-out', { method: 'POST', body: {} })
      // Replaced, not pushed: Back from sign-in would only reopen a signed-out page.
      window.location.replace('/sign-in')
    } catch {
      setState('failed')
    }
  }
  return { state, signOut }
}

/**
 * What the status line beside the control says in each state, from the shell's catalogue. The control itself always
 * reads Sign out, so its name stays the action.
 */
export const signOutStatus = {
  idle: null,
  busy: 'app-shell.signingOut',
  failed: 'app-shell.signOutFailed'
} as const satisfies Record<SignOutState, string | null>
