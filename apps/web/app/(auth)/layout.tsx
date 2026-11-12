import { brandMetadata, brandViewport } from '../../features/brand/metadata'
import type { ReactNode } from 'react'
import { RequestRootLayout } from '../../components/request-root-layout'
import '../../features/public-chrome/auth.css'

export const metadata = { ...brandMetadata, title: 'Skyclause' }
export const viewport = brandViewport
export const instant = false

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RequestRootLayout routeGroup="auth">
      <div data-surface="auth" className="dark">
        <div className="auth-column">{children}</div>
      </div>
    </RequestRootLayout>
  )
}
