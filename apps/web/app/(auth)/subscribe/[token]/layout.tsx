import type { ReactNode } from 'react'
import './subscribe.css'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <main className="subscribe-ground">
      <div className="subscribe-column">{children}</div>
    </main>
  )
}
