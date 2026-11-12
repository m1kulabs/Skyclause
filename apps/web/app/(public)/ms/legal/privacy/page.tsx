import { t } from '@skyclause/i18n'
import { brandMetadata } from '../../../../../features/brand/metadata'
import { PrivacyNoticePage } from '../../../../../features/legal'

export const metadata = { ...brandMetadata, title: t('legal.privacy.metadataTitle', {}, 'ms') }

export default function MalayPrivacyPage() {
  return <PrivacyNoticePage locale="ms" />
}
