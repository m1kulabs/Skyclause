import { t } from '@skyclause/i18n'

export default function Home() {
  return (
    <main>
      <h1 className="type-landing-head" translate="no">
        {t('shell.product_name')}
      </h1>
    </main>
  )
}
