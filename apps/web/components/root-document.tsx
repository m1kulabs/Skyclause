import type { ReactNode } from 'react'
import { connection } from 'next/server'
import type { RouteGroup } from '@skyclause/contracts/analytics'
import { t } from '@skyclause/i18n'
import { Announcer } from '../lib/announce'
import { WebVitals } from '../features/quality/web-vitals'
import { APPEARANCE_SCRIPT, DEFAULT_APPEARANCE, resolveAppearance, type Appearance } from '../lib/theme'
import '../styles/globals.css'

export async function RootDocument({
  children,
  appearance = DEFAULT_APPEARANCE,
  resolved = resolveAppearance(appearance),
  routeGroup,
  nonce
}: {
  children: ReactNode
  appearance?: Appearance
  resolved?: ReturnType<typeof resolveAppearance>
  routeGroup?: RouteGroup
  /** The per-request CSP nonce for the inline appearance script. */
  nonce?: string
}) {
  // A static Cache Components shell cannot carry the nonce from this request.
  await connection()

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
      <head>
        {/* JavaScript owns the live meta; keeping it out of React's hoist cache avoids a duplicate after prepaint. */}
        <noscript dangerouslySetInnerHTML={{ __html: `<meta name="theme-color" content="${resolved.color}">` }} />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} />
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
