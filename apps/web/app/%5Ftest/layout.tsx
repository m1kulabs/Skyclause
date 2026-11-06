import type { ReactNode } from 'react'
import { RequestRootLayout } from '../../components/request-root-layout'

export const metadata = { title: 'Skyclause' }
export const instant = false

export default function Layout({ children }: { children: ReactNode }) {
  return <RequestRootLayout>{children}</RequestRootLayout>
}
