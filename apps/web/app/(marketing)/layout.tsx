import { brandViewport } from '../../features/brand/metadata'
import { pageMetadata } from '../../features/share-previews/pages'
import { Suspense, type ReactNode } from 'react'
import { MarketingLanguageSuggestion } from './language-suggestion'
import { RootDocument } from '../../components/root-document'

export const generateMetadata = () => pageMetadata('landing', 'en')
export const viewport = brandViewport
export const instant = false

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootDocument routeGroup="marketing" skipTarget="landing-main">
      <div data-surface="marketing" className="dark landing-surface">
        <Suspense fallback={null}>
          <MarketingLanguageSuggestion />
        </Suspense>
        {children}
      </div>
    </RootDocument>
  )
}
