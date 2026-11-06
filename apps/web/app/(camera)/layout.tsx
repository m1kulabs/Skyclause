import type { ReactNode } from 'react'
import { RequestRootLayout } from '../../components/request-root-layout'
import { brandMetadata } from '../../features/brand/metadata'

export const instant = false
// WEB-1's icons on every root. The camera PWA keeps its own per-source manifest, set by its page (#129).
export const metadata = { icons: brandMetadata.icons }
export default function Layout({ children }: { children: ReactNode }) {
  return <RequestRootLayout>{children}</RequestRootLayout>
}
