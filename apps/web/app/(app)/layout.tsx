import { brandMetadata, brandViewport } from '../../features/brand/metadata'
import type { ReactNode } from 'react'
import { Providers } from '../../components/providers'
import { RequestRootLayout } from '../../components/request-root-layout'
import { headers } from 'next/headers'
import { connection } from 'next/server'
import { AppShell } from '../../features/shell'
import { loadShellData } from '../../features/shell/load'
import { CommandPalette } from '../../features/palette'
import { t } from '../../features/shell/i18n'

export const metadata = { ...brandMetadata, title: t('app-shell.brand') }
export const viewport = brandViewport
export const instant = false

export default async function Layout({ children }: { children: ReactNode }) {
  const data = await loadShellData(new Headers(await headers()))
  // The bar's clock starts from the request's time, so it must never be read while prerendering.
  await connection()
  const now = new Date().toISOString()
  return (
    <RequestRootLayout routeGroup="app">
      <Providers>
        <AppShell data={data} now={now} palette={<CommandPalette />}>
          {children}
        </AppShell>
      </Providers>
    </RequestRootLayout>
  )
}
