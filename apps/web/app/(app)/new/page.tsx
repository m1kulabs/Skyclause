import { redirect } from 'next/navigation'
import { OrgCreateForm } from '../../../features/organisations/org-create-form'
import { t } from '../../../features/organisations/catalogue'
import { FirstRunOutline } from '../../../features/onboarding/first-run-progress'
import '../../../features/onboarding/catalogue'
import { getPrincipal } from '../../../lib/principal'
import { settingsLocale } from '../../../features/settings/locale'
import styles from '../../../features/onboarding/onboarding.module.css'

export const metadata = { title: t('organisations.create.title') }

/** `/new`: guests are sent to `/sign-up`; a signed-in account gets the name-and-slug form beside the first run. */
export default async function Page() {
  const principal = await getPrincipal()
  if (principal?.kind !== 'session' || principal.isGuest) redirect('/sign-up')
  const locale = await settingsLocale()
  return (
    <div className={styles.firstRunPage}>
      <header className={styles.pageHeading}>
        <h1 className="type-title">{t('organisations.create.title', {}, locale)}</h1>
        <p className="type-text">{t('organisations.create.description', {}, locale)}</p>
      </header>
      <div className={styles.firstRunMain}>
        <OrgCreateForm locale={locale} />
      </div>
      <div className={styles.firstRunSteps}>
        <FirstRunOutline locale={locale} />
      </div>
    </div>
  )
}
