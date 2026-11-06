import type { ReactNode } from 'react'
import type { RouteGroup } from '@skyclause/contracts/analytics'
import { t } from '@skyclause/i18n'
import { Announcer } from '../lib/announce'
import { WebVitals } from '../features/quality/web-vitals'
import { APPEARANCE_SCRIPT, DEFAULT_APPEARANCE, resolveAppearance, type Appearance } from '../lib/theme'
import '../styles/globals.css'

export function RootDocument({
  children,
  appearance = DEFAULT_APPEARANCE,
  resolved = resolveAppearance(appearance),
  routeGroup
}: {
  children: ReactNode
  appearance?: Appearance
  resolved?: ReturnType<typeof resolveAppearance>
  routeGroup?: RouteGroup
}) {
  return (
    <html
      lang="en"
      className={resolved.className}
      style={{ colorScheme: resolved.mode }}
      data-theme={appearance.theme}
      data-contrast={appearance.contrast}
      data-motion-preference={appearance.motion}
      data-motion={resolved.motion}
      suppressHydrationWarning
    >
      {/* eslint-disable-next-line @next/next/no-head-element -- Shared App Router document; appearance runs before the body paints. */}
      <head
        // Keep the script-owned meta out of React's hoistable metadata cache: its prepaint content can change for HC.
        dangerouslySetInnerHTML={{
          __html: `<meta name="theme-color" content="${resolved.color}"><script>${APPEARANCE_SCRIPT}</script>`
        }}
      />
      <body>
        <a className="skip-link" href="#main-content">
          {t('shell.skip_to_content')}
        </a>
        <div id="main-content" tabIndex={-1}>
          {children}
        </div>
        <Announcer />
        <WebVitals routeGroup={routeGroup} />
      </body>
    </html>
  )
}
