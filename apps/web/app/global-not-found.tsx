import { brandMetadata, brandViewport } from '../features/brand/metadata'
import { headers } from 'next/headers'
import { RequestRootLayout } from '../components/request-root-layout'
import { NotFoundContent } from '../features/public-chrome/errors'
import { PublicChrome } from '../features/public-chrome/frame'
import { t } from '../features/share-previews/i18n'

export async function generateMetadata() {
  const locale = (await headers()).get('x-skyclause-locale') === 'ms' ? 'ms' : 'en'
  return { ...brandMetadata, title: t('share-previews.pages.notFound.title', {}, locale), robots: { index: false } }
}
export const viewport = brandViewport
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
