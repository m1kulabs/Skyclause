import { t } from '@skyclause/i18n'
import { SourceError } from '../../../data-components/states'
import '../../catalogue'

/** Not built yet: the plain state from the foundation, never a form that looks as if it worked. */
export default function Panel({ locale = 'en' }: { locale?: 'en' | 'ms' }) {
  return (
    <div data-unbuilt="a-keys-ui" className="-m-5">
      <SourceError source={t('settings.unbuilt.accountApi', {}, locale)} status={501} locale={locale} />
    </div>
  )
}
