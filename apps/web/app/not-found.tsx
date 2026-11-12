import { NotFoundContent } from '../features/public-chrome/errors'
import { t } from '../features/share-previews/i18n'

export const metadata = { title: t('share-previews.pages.notFound.title'), robots: { index: false } }

export default function NotFound() {
  return <NotFoundContent locale="en" />
}
