import type { ReactNode } from 'react'
import { headers, cookies } from 'next/headers'
import type { RouteGroup } from '@skyclause/contracts/analytics'
import { DEFAULT_APPEARANCE, resolveAppearance, type Appearance } from '../lib/theme'
import { RootDocument } from './root-document'

interface Props {
  children: ReactNode
  routeGroup?: RouteGroup
  locale?: 'en' | 'ms'
}

export async function RequestRootLayout({ children, routeGroup, locale: requestedLocale }: Props) {
  // These roots set instant=false so request hints resolve before their document starts streaming.
  const requestHeaders = await headers()
  const locale = requestedLocale ?? (requestHeaders.get('x-skyclause-locale') === 'ms' ? 'ms' : 'en')
  let appearance = routeGroup === 'public' ? { ...DEFAULT_APPEARANCE, theme: 'system' as const } : DEFAULT_APPEARANCE
  // No account storage before #99. The test-only cookie exercises SSR preferences without granting production controls.
  if (process.env.APP_ENV === 'test') {
    const value = (await cookies()).get('skyclause-test-appearance')?.value
    if (value) {
      try {
        const parsed: Partial<Appearance> = JSON.parse(value)
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
      resolved={resolved}
      colorScheme={
        appearance.theme === 'system' && colorSchemeHint ? (resolved.mode === 'light' ? 'light' : 'dark') : undefined
      }
      routeGroup={routeGroup}
      locale={locale}
      skipTarget={routeGroup === 'public' ? 'public-main' : 'main-content'}
    >
      {children}
    </RootDocument>
  )
}
