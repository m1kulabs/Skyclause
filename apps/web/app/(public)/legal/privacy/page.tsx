import { PrivacyNoticePage } from '../../../../features/legal'
import { pageMetadata } from '../../../../features/share-previews/pages'

export const generateMetadata = () => pageMetadata('privacy', 'en')

export default function PrivacyPage() {
  return <PrivacyNoticePage locale="en" />
}
