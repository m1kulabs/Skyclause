import { brandMetadata } from '../../features/brand/metadata'
import { headers } from 'next/headers'
import type { ReactNode } from 'react'
import { RequestRootLayout } from '../../components/request-root-layout'
import { PublicChrome } from '../../features/public-chrome/frame'

export const metadata = { ...brandMetadata, title: 'Skyclause' }
export const instant = false

export default async function Layout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers()
  const locale = requestHeaders.get('x-skyclause-locale') === 'ms' ? 'ms' : 'en'
  const includeSafetyLine = requestHeaders.get('x-skyclause-public-path') !== '/legal/terms'

  return (
    <RequestRootLayout routeGroup="public" locale={locale}>
      <PublicChrome locale={locale} includeSafetyLine={includeSafetyLine}>
        {children}
      </PublicChrome>
    </RequestRootLayout>
  )
}
