import { t } from '@skyclause/i18n'
import { BrandLines } from '../../features/public-chrome/frame'

export default function Home() {
  return (
    <main>
      <h1 className="type-landing-head" translate="no">
        {t('shell.product_name')}
      </h1>
      <BrandLines locale="en" />
    </main>
  )
}
