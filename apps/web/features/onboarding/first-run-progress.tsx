'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { formatTime } from '@skyclause/i18n/format'
import { cn } from '#lib/utils'
import { Button, buttonVariants } from '#ui/button'
import { Skeleton } from '#ui/skeleton'
import { ApiProblem } from '../../lib/api-fetch'
import { SourceError } from '../data-components/states'
import { onboardingApi, type OnboardingView } from './operations'
import { firstRunFinished, progressForSteps, projectHomeHref, stepStates, type StepState } from './model'
import { t, type Locale } from './catalogue'
import styles from './onboarding.module.css'

type Step = OnboardingView['steps'][number]['step']

/** A result that would print something raw: a status code, a snake_case key such as `rain_5m_mm`. */
const RAW_RESULT = /\bHTTP\b|\b[a-z0-9]+_[a-z0-9_]+\b/

/**
 * A done step's line. The API words each result as an English sentence. The source step's names the source by its ID
 * and can carry its error, so the line says it is bound or needs attention instead; the channel step's names the
 * channel by its key. In every other language, and for any result that would print something raw, the line says when
 * the step was done.
 */
function DoneLine({ item, locale }: { item: OnboardingView['steps'][number]; locale: Locale }) {
  if (item.step === 'sources' && item.result) {
    return t(
      /·\s*error\b/.test(item.result) ? 'onboarding.step_needs_attention' : 'onboarding.source_bound',
      {},
      locale
    )
  }
  if (locale === 'en' && item.step !== 'channel' && item.result && !RAW_RESULT.test(item.result)) return item.result
  if (!item.completed_at) return t('onboarding.done', {}, locale)
  return (
    <time dateTime={item.completed_at}>
      {t('onboarding.done_at', { time: formatTime(item.completed_at, locale) }, locale)}
    </time>
  )
}

export interface FirstRunProgressProps {
  org: string
  locale?: Locale
  /**
   * The first project route resumes at its first outstanding owner route after a reload. Off when a link asked for
   * another project, and never while the project form holds a draft.
   */
  redirectFromProject?: boolean
  /**
   * On the page a finished first run lands on (the first project's overview): the steps stay to show every one done,
   * with this next action in place of Continue.
   */
  next?: { sentence: string; action: ReactNode }
}

/** The steps that open a settings page say which one, and what there completes them. */
const HINTED: ReadonlySet<Step> = new Set<Step>(['rota', 'channel'])

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

function ProgressSkeleton({ locale }: { locale: Locale }) {
  return (
    <section className={styles.progress} aria-busy="true" data-first-run-progress>
      <header className={styles.progressHead}>
        <h2 className="type-section">{t('onboarding.first_run', {}, locale)}</h2>
      </header>
      <p className="sr-only" role="status">
        {t('onboarding.loading_steps', {}, locale)}
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

export function FirstRunProgress({ org, locale = 'en', redirectFromProject = false, next }: FirstRunProgressProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [onboarding, setOnboardingView] = useState<OnboardingView | null>(null)
  // A step was still open while this page showed the steps: finishing it here leads on to the project's overview.
  const [sawOpen, setSawOpen] = useState(false)
  const setOnboarding = useCallback((view: OnboardingView) => {
    setOnboardingView(view)
    if (!firstRunFinished(view.steps)) setSawOpen(true)
  }, [])
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
  }, [org, setOnboarding])

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
    if (!next || next.step === 'project' || next.href === pathname) return
    // A form someone has started typing in stays: replacing it would drop the draft and the focus.
    if (document.querySelector('[data-project-create][data-dirty]')) return
    router.replace(next.href)
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
      // The button that was pressed is replaced by the next step's: keep focus in the list, on its action.
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('[data-first-run-progress] [data-step-action]')?.focus()
      )
    } catch (error) {
      fail(error)
    } finally {
      setWorking(null)
    }
  }

  if (loading && !onboarding) return <ProgressSkeleton locale={locale} />
  if (failure || !onboarding) {
    return (
      <section className={styles.progress} data-first-run-progress>
        <header className={styles.progressHead}>
          <h2 className="type-section">{t('onboarding.first_run', {}, locale)}</h2>
        </header>
        <SourceError
          source={t('onboarding.steps_source', {}, locale)}
          status={failure?.status ?? null}
          at={failure?.at ?? null}
          locale={locale}
          // A 501 is "not built": reading again cannot change the answer.
          retry={
            failure?.status === 501 ? undefined : (
              <Button type="button" variant="outline" onClick={() => void reload()}>
                {t('onboarding.retry', {}, locale)}
              </Button>
            )
          }
        />
      </section>
    )
  }

  const progress = progressForSteps(onboarding.steps)
  const finished = firstRunFinished(onboarding.steps)
  const allActuallyDone = onboarding.steps.every((step) => !!step.completed_at)
  if (allActuallyDone && !next && !sawOpen) return null
  const home = projectHomeHref(onboarding.steps) ?? `/${encodeURIComponent(org)}`
  const states = stepStates(onboarding.steps)
  const label = t('onboarding.progress', { completed: progress.completed, total: progress.total }, locale)

  return (
    <section className={styles.progress} aria-labelledby="first-run-title" data-first-run-progress>
      <header className={styles.progressHead}>
        <h2 id="first-run-title" className="type-section">
          {t('onboarding.first_run', {}, locale)}
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
                <h3 id={`first-run-step-${step}`}>{t(`onboarding.step_${step}`, {}, locale)}</h3>
                {state === 'skipped' ? (
                  <p className={styles.stepResult}>{t('onboarding.skipped', {}, locale)}</p>
                ) : state === 'done' ? (
                  <p className={styles.stepResult}>
                    <DoneLine item={item} locale={locale} />
                  </p>
                ) : state === 'current' ? (
                  <>
                    <p className={styles.stepResult}>
                      {here ? t('onboarding.here', {}, locale) : t('onboarding.next_step', {}, locale)}
                    </p>
                    {HINTED.has(step) ? (
                      <p className={styles.stepResult}>{t(`onboarding.hint_${step}`, {}, locale)}</p>
                    ) : null}
                  </>
                ) : null}
              </div>
              <div className={styles.stepActions}>
                {state === 'skipped' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={working !== null}
                    aria-describedby={`first-run-step-${step}`}
                    onClick={() => void changeSkipped(step, false)}
                  >
                    {working === step ? t('onboarding.saving', {}, locale) : t('onboarding.resume', {}, locale)}
                  </Button>
                ) : state === 'current' ? (
                  <>
                    {here ? null : (
                      <Link
                        className={buttonVariants()}
                        href={item.href}
                        aria-describedby={`first-run-step-${step}`}
                        data-step-action
                      >
                        {t('onboarding.continue', {}, locale)}
                      </Link>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={working !== null}
                      aria-describedby={`first-run-step-${step}`}
                      data-step-action={here ? '' : undefined}
                      onClick={() => void changeSkipped(step, true)}
                    >
                      {working === step ? t('onboarding.saving', {}, locale) : t('onboarding.skip', {}, locale)}
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
      {finished ? (
        <div className={styles.finish} data-first-run-finished>
          <p id="first-run-finished" className={styles.finishText}>
            <strong>{t('onboarding.finished', {}, locale)}</strong>
            <span>{next ? next.sentence : t('onboarding.finished_overview', {}, locale)}</span>
          </p>
          <div className={styles.stepActions}>
            {next ? (
              next.action
            ) : (
              <Link
                className={buttonVariants()}
                href={`${home}?first-run=done`}
                aria-describedby="first-run-finished"
                data-step-action
              >
                {t('onboarding.continue', {}, locale)}
              </Link>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}

/**
 * `/new`, before an organisation exists: the six first-run steps (ORG-6) with the first one open and no actions, so the
 * form beside it stays the one thing to do. Nothing is read: there is no organisation to read them for yet.
 */
export function FirstRunOutline({ locale = 'en' }: { locale?: Locale }) {
  const steps = ['organisation', 'project', 'sources', 'window', 'rota', 'channel'] as const
  const states: StepState[] = steps.map((_, index) => (index === 0 ? 'current' : 'todo'))
  const label = t('onboarding.step_of', { current: 1, total: steps.length }, locale)
  return (
    <section className={styles.progress} aria-labelledby="first-run-title" data-first-run-outline>
      <header className={styles.progressHead}>
        <h2 id="first-run-title" className="type-section">
          {t('onboarding.first_run', {}, locale)}
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
              <h3>{t(`onboarding.step_${step}`, {}, locale)}</h3>
              {index === 0 ? <p className={styles.stepResult}>{t('onboarding.here', {}, locale)}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default FirstRunProgress
