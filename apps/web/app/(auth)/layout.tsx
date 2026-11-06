import type { ReactNode } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div data-surface="auth" className="dark">
      <div className="auth-column">{children}</div>
    </div>
  )
}
