import { NotBuilt } from '../../../data-components/states'
import { t } from '../../../project-settings/catalogue'

/**
 * The public project page is not available yet (`d-public-project-page`), and neither are share links
 * (`listShareLinks`): say so plainly rather than draw a form, or a way to share links, that does nothing.
 */
export default function Panel({ locale = 'en' }: { locale?: 'en' | 'ms' } = {}) {
  return (
    <div data-unbuilt="d-public-project-page" className="-m-5 grid min-w-0 [overflow-wrap:anywhere]">
      <NotBuilt title={t('project-settings.public_page', {}, locale)} />
    </div>
  )
}
