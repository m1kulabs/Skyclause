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
      window.location.assign('/sign-in')
    } catch {
      setState('failed')
    }
  }
  return { state, signOut }
}

/** The control's words for each state, from the shell's catalogue. */
export const signOutLabel = {
  idle: 'app-shell.signOut',
  busy: 'app-shell.signingOut',
  failed: 'app-shell.signOutFailed'
} as const satisfies Record<SignOutState, string>
