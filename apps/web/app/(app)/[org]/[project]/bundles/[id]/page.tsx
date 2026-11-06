import { BundleDetail } from '../../../../../../features/bundles/bundle-detail'

export default async function BundlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <BundleDetail bundleId={id} />
}
