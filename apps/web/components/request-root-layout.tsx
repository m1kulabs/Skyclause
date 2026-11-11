import type { ReactNode } from 'react'
import { headers, cookies } from 'next/headers'
import type { RouteGroup } from '@skyclause/contracts/analytics'
import { DEFAULT_PREFERENCES, Preferences, type Preferences as PreferenceValues } from '@skyclause/contracts'
import { getSessionForRequest } from '@skyclause/auth'
import { DEFAULT_APPEARANCE, resolveAppearance, type Appearance } from '../lib/theme'
import { preferencesToAppearance } from '../features/account/presentation'
import { RootDocument } from './root-document'

interface Props {
  children: ReactNode
  routeGroup?: RouteGroup
  locale?: 'en' | 'ms'
}

export async function RequestRootLayout({ children, routeGroup, locale }: Props) {
  // These roots set instant=false so request hints resolve before their document starts streaming.
  const requestHeaders = await headers()
  let preferences: PreferenceValues = DEFAULT_PREFERENCES
  // Public pages follow the visitor's system colour scheme until stored preferences say otherwise.
  let appearance = routeGroup === 'public' ? { ...DEFAULT_APPEARANCE, theme: 'system' as const } : DEFAULT_APPEARANCE
  const testOverride =
    process.env.APP_ENV === 'test' ? (await cookies()).get('skyclause-test-appearance')?.value : undefined
  if (testOverride) {
    try {
      const parsed: Partial<Appearance> = JSON.parse(testOverride)
      appearance = {
        theme: ['dark', 'light', 'system'].includes(parsed.theme ?? '') ? parsed.theme! : appearance.theme,
        contrast: ['system', 'standard', 'more'].includes(parsed.contrast ?? '')
          ? parsed.contrast!
          : appearance.contrast,
        motion: ['system', 'reduce', 'full'].includes(parsed.motion ?? '') ? parsed.motion! : appearance.motion
      }
    } catch {
      /* A malformed test preference uses the signed-out defaults. */
    }
  } else {
    try {
      const current = await getSessionForRequest(new Headers(requestHeaders))
      const stored = current?.user.preferences
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
        const partial = Preferences.partial().safeParse(stored)
        if (partial.success) {
          preferences = Preferences.parse({ ...DEFAULT_PREFERENCES, ...partial.data })
          appearance = preferencesToAppearance(preferences)
        }
      }
    } catch {
      // Signed-out requests and unavailable sessions use the documented visitor defaults.
    }
  }
  const hint = (key: string) => requestHeaders.get(key)?.replaceAll('"', '')
  const colorSchemeHint = hint('sec-ch-prefers-color-scheme')
  const resolved = resolveAppearance(appearance, {
    colorScheme: colorSchemeHint,
    contrast: hint('sec-ch-prefers-contrast'),
    motion: hint('sec-ch-prefers-reduced-motion')
  })
  return (
    <RootDocument
      appearance={appearance}
      preferences={preferences}
      resolved={resolved}
      colorScheme={
        appearance.theme === 'system' && colorSchemeHint ? (resolved.mode === 'light' ? 'light' : 'dark') : undefined
      }
      routeGroup={routeGroup}
      locale={locale}
      skipTarget={routeGroup === 'public' ? 'public-main' : 'main-content'}
      nonce={requestHeaders.get('x-nonce') ?? undefined}
    >
      {children}
    </RootDocument>
  )
}
