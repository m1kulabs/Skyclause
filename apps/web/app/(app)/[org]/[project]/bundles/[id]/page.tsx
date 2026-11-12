import { headers } from 'next/headers'
import { prefersMalay } from '../../../../../../lib/preferred-language'
import { BundleDetail } from '../../../../../../features/bundles/bundle-detail'
import { serverReview } from '../../../../../../features/bundles/server-review'

export default async function BundlePage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const [{ org, id }, requestHeaders] = await Promise.all([params, headers()])
  return (
    <BundleDetail
      bundleId={id}
      initial={await serverReview(org, id)}
      locale={prefersMalay(requestHeaders.get('accept-language')) ? 'ms' : 'en'}
    />
  )
}
