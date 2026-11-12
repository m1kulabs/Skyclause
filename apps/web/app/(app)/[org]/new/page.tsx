import { requireSettings } from '../../../../features/settings/gate'
import { FirstRunProgress } from '../../../../features/onboarding/first-run-progress'
import { ProjectForm } from '../../../../features/onboarding/project-form'
import '../../../../features/onboarding/catalogue'
import { t } from '@skyclause/i18n'
import styles from '../../../../features/onboarding/onboarding.module.css'

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const principal = await requireSettings({ scope: 'organisation', section: 'general', orgId: org })
  return (
    <div
      className={styles.firstRunPage}
      data-project-create-page
      data-role={principal?.kind === 'session' ? principal.role : undefined}
    >
      <div className={styles.firstRunAside}>
        <header className={styles.pageHeading}>
          <h1 className="type-title">{t('onboarding.title')}</h1>
          <p className="type-text">{t('onboarding.project_form_description')}</p>
        </header>
        <FirstRunProgress org={org} redirectFromProject />
      </div>
      <div className={styles.firstRunMain}>
        <ProjectForm org={org} />
        <p className={`${styles.helper} type-small`}>{t('onboarding.no_sample_data')}</p>
      </div>
    </div>
  )
}
