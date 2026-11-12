import { brandMetadata } from '../features/brand/metadata'
import { headers } from 'next/headers'
import { RequestRootLayout } from '../components/request-root-layout'
import { NotFoundContent } from '../features/public-chrome/errors'
import { PublicChrome } from '../features/public-chrome/frame'

export const metadata = { ...brandMetadata, title: 'Skyclause' }
export const instant = false

export default async function GlobalNotFound() {
  const locale = (await headers()).get('x-skyclause-locale') === 'ms' ? 'ms' : 'en'

  return (
    <RequestRootLayout routeGroup="public" locale={locale}>
      <PublicChrome locale={locale}>
        <NotFoundContent locale={locale} />
      </PublicChrome>
    </RequestRootLayout>
  )
}
