'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '#ui/button'
import { Progress, ProgressLabel } from '#ui/progress'
import { onboardingApi, type OnboardingView } from './operations'
import { progressForSteps } from './model'
import { t } from './catalogue'
import styles from './onboarding.module.css'

type Step = OnboardingView['steps'][number]['step']

export interface FirstRunProgressProps {
  org: string
  /** The first project route resumes at its first outstanding owner route after a reload. */
  redirectFromProject?: boolean
}

export function FirstRunProgress({ org, redirectFromProject = false }: FirstRunProgressProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [onboarding, setOnboarding] = useState<OnboardingView | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [working, setWorking] = useState<Step | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const result = await onboardingApi('getOnboarding', { params: { org } })
      setOnboarding(result)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [org])

  useEffect(() => {
    void reload()
    const refresh = () => void reload()
    window.addEventListener('onboarding:changed', refresh)
    return () => window.removeEventListener('onboarding:changed', refresh)
  }, [reload])

  useEffect(() => {
    if (!redirectFromProject || !onboarding || failed || loading) return
    const project = onboarding.steps.find((item) => item.step === 'project')
    if (!project?.completed_at || pathname !== `/${encodeURIComponent(org)}/new`) return
    const next = onboarding.steps.find((item) => !item.completed_at && !item.skipped)
    if (next && next.step !== 'project' && next.href !== pathname) router.replace(next.href)
  }, [failed, loading, onboarding, org, pathname, redirectFromProject, router])

  async function changeSkipped(step: Step, skipped: boolean) {
    if (working) return
    setWorking(step)
    setFailed(false)
    try {
      const result = await onboardingApi(skipped ? 'skipOnboardingStep' : 'resumeOnboardingStep', {
        params: { org, step }
      })
      setOnboarding(result)
    } catch {
      setFailed(true)
    } finally {
      setWorking(null)
    }
  }

  if (loading && !onboarding)
    return (
      <p className={styles.status} role="status">
        {t('onboarding.first_run')}
      </p>
    )
  if (failed || !onboarding) {
    return (
      <div className={styles.status} role="alert">
        <p>{t('onboarding.load_error')}</p>
        <Button type="button" variant="outline" onClick={() => void reload()}>
          {t('onboarding.retry')}
        </Button>
      </div>
    )
  }

  const progress = progressForSteps(onboarding.steps)
  const allActuallyDone = onboarding.steps.every((step) => !!step.completed_at)
  if (allActuallyDone) return null

  return (
    <section className={styles.progressCard} aria-label={t('onboarding.first_run')} data-first-run-progress>
      <div className={styles.progressHeader}>
        <div>
          <h2>{t('onboarding.first_run')}</h2>
          <p>{t('onboarding.progress', { completed: progress.completed, total: progress.total })}</p>
        </div>
      </div>
      <Progress
        value={progress.percentage}
        aria-label={t('onboarding.progress', { completed: progress.completed, total: progress.total })}
      >
        <ProgressLabel>{t('onboarding.first_run')}</ProgressLabel>
        <span className="ml-auto text-[13px] text-muted-foreground tabular-nums" aria-hidden="true">
          {`${progress.completed}/${progress.total}`}
        </span>
      </Progress>
      <ol className={styles.stepList}>
        {onboarding.steps.map((item) => {
          const step = item.step as Step
          const label = t(`onboarding.step_${step}`)
          const done = !!item.completed_at
          return (
            <li className={styles.step} key={step} data-complete={done || item.skipped}>
              <div className={styles.stepText}>
                <h3>{label}</h3>
                {item.skipped ? (
                  <p className={styles.stepResult}>{t('onboarding.skipped')}</p>
                ) : done ? (
                  <p className={styles.stepResult}>{item.result ?? t('onboarding.done')}</p>
                ) : null}
              </div>
              <div className={styles.stepActions}>
                {item.skipped ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={working !== null}
                    onClick={() => void changeSkipped(step, false)}
                  >
                    {working === step ? t('onboarding.saving') : t('onboarding.resume')}
                  </Button>
                ) : !done ? (
                  <>
                    <Link className={styles.stepLink} href={item.href}>
                      {t('onboarding.continue')}
                    </Link>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={working !== null}
                      onClick={() => void changeSkipped(step, true)}
                    >
                      {working === step ? t('onboarding.saving') : t('onboarding.skip')}
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export default FirstRunProgress
