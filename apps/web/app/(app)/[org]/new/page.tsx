import { requireSettings } from '../../../../features/settings/gate'
import { settingsLocale } from '../../../../features/settings/locale'
import { FirstRunProgress } from '../../../../features/onboarding/first-run-progress'
import { ProjectForm } from '../../../../features/onboarding/project-form'
import '../../../../features/onboarding/catalogue'
import { t } from '@skyclause/i18n'
import styles from '../../../../features/onboarding/onboarding.module.css'
import { cn } from '#lib/utils'

export async function generateMetadata() {
  return { title: t('onboarding.title', {}, await settingsLocale()) }
}

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const principal = await requireSettings({ scope: 'organisation', section: 'general', orgId: org })
  const locale = await settingsLocale()
  return (
    <div
      className={styles.firstRunPage}
      data-project-create-page
      data-role={principal?.kind === 'session' ? principal.role : undefined}
    >
      <header className={styles.pageHeading}>
        <h1 className="type-title">{t('onboarding.title', {}, locale)}</h1>
        <p className="type-text">{t('onboarding.project_form_description', {}, locale)}</p>
      </header>
      <div className={styles.firstRunMain}>
        <ProjectForm org={org} locale={locale} />
        <p className={cn(styles.helper, 'type-small')}>{t('onboarding.no_sample_data', {}, locale)}</p>
      </div>
      <div className={styles.firstRunSteps}>
        <FirstRunProgress org={org} locale={locale} redirectFromProject />
      </div>
    </div>
  )
}
