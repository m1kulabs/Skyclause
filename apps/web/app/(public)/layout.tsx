import { brandMetadata } from '../../features/brand/metadata'
import { headers } from 'next/headers'
import type { ReactNode } from 'react'
import { RequestRootLayout } from '../../components/request-root-layout'
import { PublicChrome } from '../../features/public-chrome/frame'

export const metadata = { ...brandMetadata, title: 'Skyclause' }
export const instant = false

export default async function Layout({ children }: { children: ReactNode }) {
  const locale = (await headers()).get('x-skyclause-locale') === 'ms' ? 'ms' : 'en'

  return (
    <RequestRootLayout routeGroup="public" locale={locale}>
      <PublicChrome locale={locale}>{children}</PublicChrome>
    </RequestRootLayout>
  )
}
