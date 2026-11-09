import { t } from '@skyclause/i18n'
import { brandMetadata } from '../../../../features/brand/metadata'
import { TermsPage } from '../../../../features/legal'

export const metadata = { ...brandMetadata, title: t('legal.terms.metadataTitle') }

export default function TermsRoute() {
  return <TermsPage locale="en" />
}
