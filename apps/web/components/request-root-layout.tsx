import type { ReactNode } from 'react'
import { headers, cookies } from 'next/headers'
import type { RouteGroup } from '@skyclause/contracts/analytics'
import { DEFAULT_APPEARANCE, resolveAppearance, type Appearance } from '../lib/theme'
import { RootDocument } from './root-document'

interface Props {
  children: ReactNode
  routeGroup?: RouteGroup
}

export async function RequestRootLayout({ children, routeGroup }: Props) {
  // These roots set instant=false so request hints resolve before their document starts streaming.
  const requestHeaders = await headers()
  let appearance = DEFAULT_APPEARANCE
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
  const resolved = resolveAppearance(appearance, {
    colorScheme: hint('sec-ch-prefers-color-scheme'),
    contrast: hint('sec-ch-prefers-contrast'),
    motion: hint('sec-ch-prefers-reduced-motion')
  })
  return (
    <RootDocument
      appearance={appearance}
      resolved={resolved}
      routeGroup={routeGroup}
      nonce={requestHeaders.get('x-nonce') ?? undefined}
    >
      {children}
    </RootDocument>
  )
}
