import { redirect } from 'next/navigation'
import { OrgCreateForm } from '../../../features/organisations/org-create-form'
import { t } from '../../../features/organisations/catalogue'
import { FirstRunOutline } from '../../../features/onboarding/first-run-progress'
import '../../../features/onboarding/catalogue'
import { getPrincipal } from '../../../lib/principal'
import styles from '../../../features/onboarding/onboarding.module.css'

export const metadata = { title: t('organisations.create.title') }

/** `/new`: guests are sent to `/sign-up`; a signed-in account gets the name-and-slug form beside the first run. */
export default async function Page() {
  const principal = await getPrincipal()
  if (principal?.kind !== 'session' || principal.isGuest) redirect('/sign-up')
  return (
    <div className={styles.firstRunPage}>
      <div className={styles.firstRunAside}>
        <header className={styles.pageHeading}>
          <h1 className="type-title">{t('organisations.create.title')}</h1>
          <p className="type-text">{t('organisations.create.description')}</p>
        </header>
        <FirstRunOutline />
      </div>
      <div className={styles.firstRunMain}>
        <OrgCreateForm />
      </div>
    </div>
  )
}
