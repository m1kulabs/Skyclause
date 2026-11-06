import type { ReactNode } from 'react'
import { headers, cookies } from 'next/headers'
import { t } from '@skyclause/i18n'
import { Announcer } from '../lib/announce'
import { WebVitals } from '../features/quality/web-vitals'
import { APPEARANCE_SCRIPT, DEFAULT_APPEARANCE, resolveAppearance, type Appearance } from '../lib/theme'
import '../styles/globals.css'

export const metadata = { title: 'Skyclause' }

export default async function RootLayout({ children }: { children: ReactNode }) {
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
      <head>
        <meta name="theme-color" content={resolved.color} suppressHydrationWarning />
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
        <WebVitals />
      </body>
    </html>
  )
}
