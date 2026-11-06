import type { Ref } from 'react'

export interface BundleDetailActions {
  approve: () => Promise<void>
  edit: () => void
  reject: () => Promise<void>
}

export interface BundleDetailProps {
  bundleId: string
  actionsRef?: Ref<BundleDetailActions>
}

export function BundleDetail(_props: BundleDetailProps) {
  return <div data-unbuilt="c-bundle-ui" />
}
