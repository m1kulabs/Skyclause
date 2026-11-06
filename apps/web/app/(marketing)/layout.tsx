import { Suspense, type ReactNode } from 'react'
import { MarketingLanguageSuggestion } from './language-suggestion'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div data-surface="marketing" className="dark">
      {/* Root theme hints currently require request rendering; keep this request-only hole separate. */}
      <Suspense fallback={null}>
        <MarketingLanguageSuggestion />
      </Suspense>
      {children}
    </div>
  )
}
