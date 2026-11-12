import { t } from '@skyclause/i18n'
import { NotBuilt } from '../../../data-components/states'
import '../../catalogue'

/** Not built yet: the plain state from the foundation, never a form that looks as if it worked. */
export default function Panel({ locale = 'en' }: { locale?: 'en' | 'ms' }) {
  return (
    <div data-unbuilt="a-keys-ui" className="-m-5">
      <NotBuilt thing={t('settings.unbuilt.organisationAi', {}, locale)} locale={locale} />
    </div>
  )
}
