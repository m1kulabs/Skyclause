'use client'

import { startTransition, useImperativeHandle, useState, type Ref, type KeyboardEvent } from 'react'
import { useParams } from 'next/navigation'
import { Alert, AlertTitle, AlertDescription } from '#ui/alert'
import { Button } from '#ui/button'
import { Kbd } from '#ui/kbd'
import { formatTime } from '@skyclause/i18n/format'
import { t } from './i18n'
import { useBundleReview } from './use-bundle-review'
import { orderedCalls, canReviewCall, reviewCount } from './model'
import { CallReview, callName, modeName } from './call-review'
import { EditCallDialog } from './edit-call-dialog'
import { ApprovalBar } from './approval-bar'
import { ReviewTrace } from './review-trace'
import { RecheckDialog } from './recheck-dialog'
import { ReauthStep } from './reauth-step'
import './bundles.css'

const noDecision = {}

export interface BundleDetailActions {
  approve: () => Promise<void>
  edit: () => void
  reject: () => Promise<void>
}

export interface BundleDetailProps {
  bundleId: string
  actionsRef?: Ref<BundleDetailActions>
}

export function BundleDetail({ bundleId, actionsRef }: BundleDetailProps) {
  const params = useParams<{ org?: string; project?: string }>()
  const review = useBundleReview(bundleId, params.org ?? '')
  const { data, now, decisions, editable, pending } = review
  const [focused, setFocused] = useState<string>()
  const [editing, setEditing] = useState<string>()
  const basePath = `/${encodeURIComponent(params.org ?? '')}/${encodeURIComponent(params.project ?? '')}`
  const focusedCall = data?.calls.find((call) => call.id === focused)
  const canAct =
    editable && !pending && !review.conflict && !review.reauth && focusedCall && canReviewCall(focusedCall, now)
  const edit = () => {
    if (canAct) startTransition(() => setEditing(focusedCall.id))
  }
  const reject = async () => {
    if (canAct)
      review.setDecisions((current) => ({
        ...current,
        [focusedCall.id]: { ...current[focusedCall.id], action: 'reject' }
      }))
  }
  const select = async () => {
    if (canAct)
      review.setDecisions((current) => ({
        ...current,
        [focusedCall.id]: { ...current[focusedCall.id], action: current[focusedCall.id]?.notices ? 'edit' : 'approve' }
      }))
  }
  useImperativeHandle(actionsRef, () => ({ approve: select, edit, reject }))

  function shortcuts(event: KeyboardEvent<HTMLOListElement>) {
    if (
      !data?.shortcuts ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.repeat ||
      !(event.target instanceof HTMLElement) ||
      event.target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
    )
      return
    const key = event.key.toLowerCase()
    if (!['a', 'e', 'r'].includes(key)) return
    event.preventDefault()
    if (key === 'a') void select()
    if (key === 'e') edit()
    if (key === 'r') void reject()
  }

  if (!data)
    return (
      <section className="bundle-detail" aria-busy={!review.loadError}>
        <h1>{t('bundles.title')}</h1>
        <p>{t(review.loadError ? 'bundles.load_error' : 'bundles.loading')}</p>
        {review.loadError && (
          <Button variant="outline" onClick={review.retry}>
            {t('bundles.retry')}
          </Button>
        )}
      </section>
    )

  const { bundle } = data
  const normal =
    data.calls.length > 0 &&
    data.calls.every(
      (call) => call.agrees && call.mode === 'normal' && !call.no_call?.length && !call.recommendations.length
    )
  const disagreements = orderedCalls(data.calls).filter((call) => !call.agrees)
  const editCall = data.calls.find((call) => call.id === editing)
  const count = reviewCount(data.calls, decisions, now)

  return (
    <section className="bundle-detail">
      <h1>{t('bundles.title')}</h1>
      <p>
        {t('bundles.trigger', {
          trigger: t(`bundles.triggers.${bundle.trigger}`),
          time: formatTime(bundle.triggered_at, 'en'),
          pack: t(`bundles.packs.${bundle.pack}`)
        })}
      </p>
      {!normal && disagreements.length > 0 && (
        <Alert className="bundle-disagreements">
          <AlertTitle>{t('bundles.disagreements', { count: disagreements.length })}</AlertTitle>
          <AlertDescription>
            {disagreements.map((call) => (
              <fieldset disabled={!editable || pending || !canReviewCall(call, now)} key={call.id}>
                <legend>{t('bundles.choose', { name: callName(call) })}</legend>
                {(['agent', 'shadow'] as const).map((choice) => (
                  <label className="bundle-choice" key={choice}>
                    <input
                      type="radio"
                      name={`verdict-${bundleId}-${call.id}`}
                      checked={decisions[call.id]?.chosen === choice}
                      onChange={() =>
                        review.setDecisions((current) => ({
                          ...current,
                          [call.id]: { ...current[call.id], chosen: choice }
                        }))
                      }
                    />
                    <span>
                      {t(`bundles.${choice}`, {
                        mode:
                          choice === 'agent'
                            ? modeName(call)
                            : t(`bundles.modes.${call.shadow.mode ?? (call.shadow.watch ? 'storm_watch' : 'no_call')}`)
                      })}
                    </span>
                  </label>
                ))}
              </fieldset>
            ))}
          </AlertDescription>
        </Alert>
      )}
      {bundle.sla_due_at && <p>{t('bundles.sla', { time: formatTime(bundle.sla_due_at, 'en') })}</p>}
      {bundle.alerts.map((alert, index) => (
        <p key={index}>
          {t('bundles.alerts', {
            account: alert.account_id,
            time: formatTime(alert.notified_at, 'en'),
            level: alert.level
          })}
        </p>
      ))}
      {bundle.draft_only && <p>{t('bundles.draft_only')}</p>}
      {bundle.state === 'superseded' && (
        <Alert role="note">
          <AlertTitle>{t('bundles.superseded')}</AlertTitle>
          <AlertDescription>
            {bundle.superseded_by ? (
              <a href={`${basePath}/bundles/${encodeURIComponent(bundle.superseded_by)}`}>{t('bundles.successor')}</a>
            ) : (
              data.calls.map(
                (call) =>
                  call.superseded_by_call_id && (
                    <a key={call.id} href={`${basePath}/calls/${encodeURIComponent(call.superseded_by_call_id)}`}>
                      {t('bundles.successor_call')}
                    </a>
                  )
              )
            )}
          </AlertDescription>
        </Alert>
      )}
      {bundle.state === 'expired' && <p>{t('bundles.expired')}</p>}
      {['approved', 'sending', 'sent', 'graded'].includes(bundle.state) && <p>{t('bundles.approved')}</p>}
      {bundle.state === 'closed' && !normal && <p>{t('bundles.closed')}</p>}
      {data.errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>{t('bundles.load_error')}</AlertTitle>
          <AlertDescription>
            {data.errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
            <Button variant="outline" onClick={review.retry}>
              {t('bundles.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {bundle.calls.length === 0 && <p>{t('bundles.empty')}</p>}
      {!normal && data.calls.length > 0 && (
        <>
          <h2>{t('bundles.calls')}</h2>
          {/* The list scopes the documented A/E/R keys; each call is a keyboard focus stop. */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
          <ol className="bundle-call-list" onKeyDown={shortcuts} aria-label={t('bundles.calls')}>
            {orderedCalls(data.calls).map((call) => (
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- A focused call scopes A/E/R to that call.
              <li key={call.id} tabIndex={0} data-call-id={call.id} onFocus={() => setFocused(call.id)}>
                <CallReview
                  call={call}
                  decision={decisions[call.id] ?? noDecision}
                  expired={Date.parse(call.expires_at) <= now}
                  basePath={basePath}
                  error={review.error?.callIds.includes(call.id) ? review.error.message : undefined}
                />
                {editable && canReviewCall(call, now) && (
                  <div className="bundle-call-actions">
                    <Button
                      disabled={pending}
                      variant="outline"
                      onClick={() =>
                        review.setDecisions((current) => ({
                          ...current,
                          [call.id]: { ...current[call.id], action: current[call.id]?.notices ? 'edit' : 'approve' }
                        }))
                      }
                    >
                      {t(decisions[call.id]?.action === 'reject' ? 'bundles.restore' : 'bundles.select')}
                      {data.shortcuts && <Kbd>{t('bundles.key_a')}</Kbd>}
                    </Button>
                    <Button
                      disabled={pending}
                      variant="outline"
                      onClick={() => startTransition(() => setEditing(call.id))}
                    >
                      {t('bundles.edit')}
                      {data.shortcuts && <Kbd>{t('bundles.key_e')}</Kbd>}
                    </Button>
                    <Button
                      disabled={pending}
                      variant="outline"
                      onClick={() =>
                        review.setDecisions((current) => ({
                          ...current,
                          [call.id]: { ...current[call.id], action: 'reject' }
                        }))
                      }
                    >
                      {t('bundles.reject')}
                      {data.shortcuts && <Kbd>{t('bundles.key_r')}</Kbd>}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
      <ReviewTrace calls={data.calls} run={data.run} normal={normal} />
      {review.error && (
        <Alert variant="destructive">
          <AlertTitle>{review.error.message}</AlertTitle>
          <AlertDescription>
            <Button onClick={review.retry} variant="outline">
              {t('bundles.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {review.missingChoice && <p>{t('bundles.choice_required')}</p>}
      {editable && !normal && (
        <ApprovalBar
          count={count}
          disabled={review.blocked || pending || !!review.conflict || !!review.reauth}
          pending={pending}
          shortcuts={data.shortcuts}
          sla={bundle.sla_due_at}
          onApprove={() => void review.approve()}
        />
      )}
      <a href={basePath}>{t('bundles.project')}</a>
      {editCall && editable && (
        <EditCallDialog
          key={editCall.id}
          call={editCall}
          decision={decisions[editCall.id] ?? {}}
          onClose={() => setEditing(undefined)}
          onSave={(decision) => review.setDecisions((current) => ({ ...current, [editCall.id]: decision }))}
        />
      )}
      {review.conflict && (
        <RecheckDialog
          conflict={review.conflict}
          pending={pending}
          onCancel={() => review.setConflict(undefined)}
          onConfirm={() => void review.approve(true)}
        />
      )}
      {review.reauth && (
        <Alert>
          <AlertTitle>{t('bundles.reauth')}</AlertTitle>
          <AlertDescription>
            <p>{t('bundles.reauth_help')}</p>
            <ReauthStep onSuccess={review.retryAfterReauth} onCancel={() => review.setReauth(undefined)} />
            <Button variant="outline" onClick={() => review.setReauth(undefined)}>
              {t('bundles.cancel')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </section>
  )
}
