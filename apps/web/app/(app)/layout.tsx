import type { ReactNode } from 'react'
import { Providers } from '../../components/providers'
import { RequestRootLayout } from '../../components/request-root-layout'

export const metadata = { title: 'Skyclause' }
export const instant = false

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RequestRootLayout routeGroup="app">
      <Providers>{children}</Providers>
    </RequestRootLayout>
  )
}
