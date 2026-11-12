import { brandMetadata, brandViewport } from '../../features/brand/metadata'
import type { ReactNode } from 'react'
import { Providers } from '../../components/providers'
import { RequestRootLayout } from '../../components/request-root-layout'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { AppShell } from '../../features/shell'
import { loadShellData } from '../../features/shell/load'
import { CommandPalette } from '../../features/palette'
import { t } from '../../features/shell/i18n'
import { accountPath } from '../../features/sign-in/model'
import { APP_PATH_HEADER } from '../../lib/hosts'
import { prefersMalay } from '../../lib/preferred-language'
import { getPrincipal } from '../../lib/principal'

export const metadata = { ...brandMetadata, title: t('app-shell.brand') }
export const viewport = brandViewport
export const instant = false

export default async function Layout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers()
  // No credential at all: sign in first, then back to this page. A share link, a guest or a test principal is a
  // credential, and each page decides what it may see.
  if (!(await getPrincipal())) redirect(accountPath('/sign-in', requestHeaders.get(APP_PATH_HEADER)))
  const data = await loadShellData(new Headers(requestHeaders))
  const locale = prefersMalay(requestHeaders.get('accept-language')) ? 'ms' : 'en'
  // The bar's clock starts from the request's time, so it must never be read while prerendering.
  await connection()
  const now = new Date().toISOString()
  return (
    <RequestRootLayout routeGroup="app">
      <Providers>
        <AppShell data={data} now={now} locale={locale} palette={<CommandPalette locale={locale} />}>
          {children}
        </AppShell>
      </Providers>
    </RequestRootLayout>
  )
}
