'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '#lib/utils'
import { Button, buttonVariants } from '#ui/button'
import { Skeleton } from '#ui/skeleton'
import { ApiProblem } from '../../lib/api-fetch'
import { SourceError } from '../data-components/states'
import { onboardingApi, type OnboardingView } from './operations'
import { progressForSteps, stepStates, type StepState } from './model'
import { t } from './catalogue'
import styles from './onboarding.module.css'

type Step = OnboardingView['steps'][number]['step']

export interface FirstRunProgressProps {
  org: string
  /** The first project route resumes at its first outstanding owner route after a reload. */
  redirectFromProject?: boolean
}

/** The six steps as a strip of capsules: filled when done, dashed when skipped, edged in ink for the next one. */
function ProgressStrip({ states, label, done }: { states: readonly StepState[]; label: string; done: number }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={states.length}
      aria-valuenow={done}
      aria-valuetext={label}
      aria-label={label}
      className={styles.strip}
    >
      {states.map((state, index) => (
        <span key={index} className={styles.capsule} data-state={state} />
      ))}
    </div>
  )
}

function ProgressSkeleton() {
  return (
    <section className={styles.progress} aria-busy="true" data-first-run-progress>
      <header className={styles.progressHead}>
        <h2 className="type-section">{t('onboarding.first_run')}</h2>
      </header>
      <p className="sr-only" role="status">
        {t('onboarding.loading_steps')}
      </p>
      <div className={styles.strip} aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className={cn(styles.capsule, 'rounded-full')} />
        ))}
      </div>
      <div className="flex flex-col gap-2" aria-hidden="true">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-11 w-full" />
        ))}
      </div>
    </section>
  )
}

export function FirstRunProgress({ org, redirectFromProject = false }: FirstRunProgressProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [onboarding, setOnboarding] = useState<OnboardingView | null>(null)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<{ status: number | null; at: string } | null>(null)
  const [working, setWorking] = useState<Step | null>(null)

  const fail = (error: unknown) =>
    setFailure({ status: error instanceof ApiProblem ? error.status : null, at: new Date().toISOString() })

  const reload = useCallback(async () => {
    setLoading(true)
    setFailure(null)
    try {
      const result = await onboardingApi('getOnboarding', { params: { org } })
      setOnboarding(result)
    } catch (error) {
      fail(error)
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
    if (!redirectFromProject || !onboarding || failure || loading) return
    const project = onboarding.steps.find((item) => item.step === 'project')
    if (!project?.completed_at || pathname !== `/${encodeURIComponent(org)}/new`) return
    const next = onboarding.steps.find((item) => !item.completed_at && !item.skipped)
    if (next && next.step !== 'project' && next.href !== pathname) router.replace(next.href)
  }, [failure, loading, onboarding, org, pathname, redirectFromProject, router])

  async function changeSkipped(step: Step, skipped: boolean) {
    if (working) return
    setWorking(step)
    setFailure(null)
    try {
      const result = await onboardingApi(skipped ? 'skipOnboardingStep' : 'resumeOnboardingStep', {
        params: { org, step }
      })
      setOnboarding(result)
    } catch (error) {
      fail(error)
    } finally {
      setWorking(null)
    }
  }

  if (loading && !onboarding) return <ProgressSkeleton />
  if (failure || !onboarding) {
    return (
      <section className={styles.progress} data-first-run-progress>
        <header className={styles.progressHead}>
          <h2 className="type-section">{t('onboarding.first_run')}</h2>
        </header>
        <SourceError
          source={t('onboarding.steps_source')}
          status={failure?.status ?? null}
          at={failure?.at ?? null}
          retry={
            <Button type="button" variant="outline" onClick={() => void reload()}>
              {t('onboarding.retry')}
            </Button>
          }
        />
      </section>
    )
  }

  const progress = progressForSteps(onboarding.steps)
  const allActuallyDone = onboarding.steps.every((step) => !!step.completed_at)
  if (allActuallyDone) return null
  const states = stepStates(onboarding.steps)
  const label = t('onboarding.progress', { completed: progress.completed, total: progress.total })

  return (
    <section className={styles.progress} aria-labelledby="first-run-title" data-first-run-progress>
      <header className={styles.progressHead}>
        <h2 id="first-run-title" className="type-section">
          {t('onboarding.first_run')}
        </h2>
        <p className="type-small text-muted-foreground" data-numeric>
          {label}
        </p>
      </header>
      <ProgressStrip states={states} label={label} done={progress.completed} />
      <ol className={styles.steps}>
        {onboarding.steps.map((item, index) => {
          const step = item.step as Step
          const state = states[index]!
          const here = item.href === pathname
          return (
            <li
              className={styles.step}
              key={step}
              data-state={state}
              data-complete={state === 'done' || state === 'skipped'}
            >
              <span className={styles.mark} data-state={state} aria-hidden="true" />
              <div className={styles.stepText}>
                <h3>{t(`onboarding.step_${step}`)}</h3>
                {state === 'skipped' ? (
                  <p className={styles.stepResult}>{t('onboarding.skipped')}</p>
                ) : state === 'done' ? (
                  <p className={styles.stepResult}>{item.result ?? t('onboarding.done')}</p>
                ) : state === 'current' ? (
                  <p className={styles.stepResult}>{here ? t('onboarding.here') : t('onboarding.next_step')}</p>
                ) : null}
              </div>
              <div className={styles.stepActions}>
                {state === 'skipped' ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={working !== null}
                    onClick={() => void changeSkipped(step, false)}
                  >
                    {working === step ? t('onboarding.saving') : t('onboarding.resume')}
                  </Button>
                ) : state !== 'done' ? (
                  <>
                    {here ? null : (
                      <Link className={state === 'current' ? buttonVariants() : styles.stepLink} href={item.href}>
                        {t('onboarding.continue')}
                      </Link>
                    )}
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

/**
 * `/new`, before an organisation exists: the six first-run steps (ORG-6) with the first one open and no actions, so the
 * form beside it stays the one thing to do. Nothing is read: there is no organisation to read them for yet.
 */
export function FirstRunOutline() {
  const steps = ['organisation', 'project', 'sources', 'window', 'rota', 'channel'] as const
  const states: StepState[] = steps.map((_, index) => (index === 0 ? 'current' : 'todo'))
  const label = t('onboarding.step_of', { current: 1, total: steps.length })
  return (
    <section className={styles.progress} aria-labelledby="first-run-title" data-first-run-outline>
      <header className={styles.progressHead}>
        <h2 id="first-run-title" className="type-section">
          {t('onboarding.first_run')}
        </h2>
        <p className="type-small text-muted-foreground" data-numeric>
          {label}
        </p>
      </header>
      <ProgressStrip states={states} label={label} done={0} />
      <ol className={styles.steps}>
        {steps.map((step, index) => (
          <li className={styles.step} key={step} data-state={states[index]}>
            <span className={styles.mark} data-state={states[index]} aria-hidden="true" />
            <div className={styles.stepText}>
              <h3>{t(`onboarding.step_${step}`)}</h3>
              {index === 0 ? <p className={styles.stepResult}>{t('onboarding.here')}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default FirstRunProgress
