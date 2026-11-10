import { brandMetadata } from '../../features/brand/metadata'
import { Suspense, type ReactNode } from 'react'
import { MarketingLanguageSuggestion } from './language-suggestion'
import { RootDocument } from '../../components/root-document'

export const metadata = { ...brandMetadata, title: 'Skyclause' }
export const instant = false

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootDocument routeGroup="marketing">
      <div data-surface="marketing" className="dark">
        <Suspense fallback={null}>
          <MarketingLanguageSuggestion />
        </Suspense>
        {children}
      </div>
    </RootDocument>
  )
}
