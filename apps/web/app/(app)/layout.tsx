import type { ReactNode } from 'react'
import { Providers } from '../../components/providers'
import { RequestRootLayout } from '../../components/request-root-layout'
import { headers } from 'next/headers'
import { AppShell } from '../../features/shell'
import { loadShellData } from '../../features/shell/load'
import { ApprovalsCount } from '../../features/org-live'
import { CommandPalette } from '../../features/palette'
import { t } from '../../features/shell/i18n'

export const metadata = { title: t('app-shell.brand') }
export const instant = false

export default async function Layout({ children }: { children: ReactNode }) {
  const data = await loadShellData(new Headers(await headers()))
  return (
    <RequestRootLayout routeGroup="app">
      <Providers>
        <AppShell data={data} approvalsCount={<ApprovalsCount />} palette={<CommandPalette />}>
          {children}
        </AppShell>
      </Providers>
    </RequestRootLayout>
  )
}
