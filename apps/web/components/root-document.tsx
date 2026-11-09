import type { ReactNode } from 'react'
import type { RouteGroup } from '@skyclause/contracts/analytics'
import { t } from '@skyclause/i18n'
import { Announcer } from '../lib/announce'
import { WebVitals } from '../features/quality/web-vitals'
import { APPEARANCE_SCRIPT, DEFAULT_APPEARANCE, resolveAppearance, type Appearance } from '../lib/theme'
import '../styles/globals.css'

type Locale = 'en' | 'ms'

export function RootDocument({
  children,
  appearance = DEFAULT_APPEARANCE,
  resolved = resolveAppearance(appearance),
  routeGroup,
  locale = 'en',
  skipTarget = 'main-content'
}: {
  children: ReactNode
  appearance?: Appearance
  resolved?: ReturnType<typeof resolveAppearance>
  routeGroup?: RouteGroup
  locale?: Locale
  skipTarget?: string
}) {
  return (
    <html
      lang={locale}
      className={resolved.className}
      style={{ colorScheme: appearance.theme === 'system' ? 'light dark' : resolved.mode }}
      data-theme={appearance.theme}
      data-contrast={appearance.contrast}
      data-motion-preference={appearance.motion}
      data-motion={resolved.motion}
      suppressHydrationWarning
    >
      {/* eslint-disable-next-line @next/next/no-head-element -- Shared App Router document; appearance runs before the body paints. */}
      <head>
        {/* JavaScript owns the live meta; keeping it out of React's hoist cache avoids a duplicate after prepaint. */}
        <noscript dangerouslySetInnerHTML={{ __html: `<meta name="theme-color" content="${resolved.color}">` }} />
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} />
      </head>
      <body>
        <a className="skip-link" href={`#${skipTarget}`}>
          {t('shell.skip_to_content', {}, locale)}
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
