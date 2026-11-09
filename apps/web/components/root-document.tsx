import type { ReactNode } from 'react'
import type { RouteGroup } from '@skyclause/contracts/analytics'
import { DEFAULT_PREFERENCES, type Preferences } from '@skyclause/contracts'
import { t } from '@skyclause/i18n'
import { Announcer } from '../lib/announce'
import { WebVitals } from '../features/quality/web-vitals'
import { APPEARANCE_SCRIPT, DEFAULT_APPEARANCE, resolveAppearance, type Appearance } from '../lib/theme'
import '../styles/globals.css'

export function RootDocument({
  children,
  appearance = DEFAULT_APPEARANCE,
  preferences = DEFAULT_PREFERENCES,
  resolved = resolveAppearance(appearance),
  routeGroup
}: {
  children: ReactNode
  appearance?: Appearance
  preferences?: Preferences
  resolved?: ReturnType<typeof resolveAppearance>
  routeGroup?: RouteGroup
}) {
  return (
    <html
      lang={preferences.language}
      className={resolved.className}
      style={{ colorScheme: resolved.mode }}
      data-theme={appearance.theme}
      data-contrast={appearance.contrast}
      data-motion-preference={appearance.motion}
      data-motion={resolved.motion}
      data-density={preferences.density}
      data-shortcuts={String(preferences.shortcuts)}
      data-sidebar-collapsed={String(preferences.sidebar_collapsed)}
      suppressHydrationWarning
    >
      {/* eslint-disable-next-line @next/next/no-head-element -- Shared App Router document; appearance runs before the body paints. */}
      <head>
        {/* JavaScript owns the live meta; keeping it out of React's hoist cache avoids a duplicate after prepaint. */}
        <noscript dangerouslySetInnerHTML={{ __html: `<meta name="theme-color" content="${resolved.color}">` }} />
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} />
      </head>
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
