import { TermsPage } from '../../../../features/legal'
import { pageMetadata } from '../../../../features/share-previews/pages'

export const generateMetadata = () => pageMetadata('terms', 'en')

export default function TermsRoute() {
  return <TermsPage locale="en" />
}
