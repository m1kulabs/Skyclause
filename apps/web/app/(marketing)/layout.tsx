import type { ReactNode } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div data-surface="marketing" className="dark">
      {children}
    </div>
  )
}
