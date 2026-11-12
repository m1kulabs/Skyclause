import { PrivacyNoticePage } from '../../../../../features/legal'
import { pageMetadata } from '../../../../../features/share-previews/pages'

export const generateMetadata = () => pageMetadata('privacy', 'ms')

export default function MalayPrivacyPage() {
  return <PrivacyNoticePage locale="ms" />
}
