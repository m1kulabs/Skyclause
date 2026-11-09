import { BundleDetail } from '../../../../../../features/bundles/bundle-detail'
import { serverReview } from '../../../../../../features/bundles/server-review'

export default async function BundlePage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params
  return <BundleDetail bundleId={id} initial={await serverReview(org, id)} />
}
