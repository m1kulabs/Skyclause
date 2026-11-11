import { t } from '@skyclause/i18n'
import { LandingSections } from '../../features/landing'

export default function Home() {
  return (
    <main>
      <section data-unbuilt="d-landing-hero" aria-label="Hero">
        <h1 className="type-landing-head" translate="no">
          {t('shell.product_name')}
        </h1>
      </section>
      <LandingSections />
    </main>
  )
}
