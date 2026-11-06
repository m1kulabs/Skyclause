import type { ReactNode } from 'react'
import { WebVitals } from '../features/quality/web-vitals'

export const metadata = { title: 'Skyclause' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <WebVitals />
      </body>
    </html>
  )
}
