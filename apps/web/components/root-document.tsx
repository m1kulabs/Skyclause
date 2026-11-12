import type { ReactNode } from 'react'
import { connection } from 'next/server'
import type { RouteGroup } from '@skyclause/contracts/analytics'
import { DEFAULT_PREFERENCES, type Preferences } from '@skyclause/contracts'
import { t } from '@skyclause/i18n'
import { Announcer } from '../lib/announce'
import { WebVitals } from '../features/quality/web-vitals'
import { roundo } from '../lib/fonts'
import { APPEARANCE_SCRIPT, DEFAULT_APPEARANCE, resolveAppearance, type Appearance } from '../lib/theme'
import '../styles/globals.css'

type Locale = 'en' | 'ms'

export async function RootDocument({
  children,
  appearance = DEFAULT_APPEARANCE,
  preferences = DEFAULT_PREFERENCES,
  resolved = resolveAppearance(appearance),
  colorScheme,
  routeGroup,
  locale,
  skipTarget = 'main-content',
  nonce
}: {
  children: ReactNode
  appearance?: Appearance
  preferences?: Preferences
  resolved?: ReturnType<typeof resolveAppearance>
  colorScheme?: 'light' | 'dark' | 'light dark'
  routeGroup?: RouteGroup
  /** The public pages' route locale; other roots follow the stored language. */
  locale?: Locale
  skipTarget?: string
  /** The per-request CSP nonce for the inline appearance script. */
  nonce?: string
}) {
  // A static Cache Components shell cannot carry the nonce from this request.
  await connection()

  return (
    <html
      lang={locale ?? preferences.language}
      className={resolved.className}
      style={{
        colorScheme: colorScheme ?? (appearance.theme === 'system' ? 'light dark' : resolved.mode)
      }}
      data-theme={appearance.theme}
      data-contrast={appearance.contrast}
      data-motion-preference={appearance.motion}
      data-motion={resolved.motion}
      data-density={preferences.density}
      data-shortcuts={String(preferences.shortcuts)}
      suppressHydrationWarning
    >
      {/* eslint-disable-next-line @next/next/no-head-element -- Shared App Router document; appearance runs before the body paints. */}
      <head>
        {/* JavaScript owns the live meta; keeping it out of React's hoist cache avoids a duplicate after prepaint. */}
        <noscript dangerouslySetInnerHTML={{ __html: `<meta name="theme-color" content="${resolved.color}">` }} />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} />
      </head>
      <body className={roundo.className}>
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
