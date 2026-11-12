'use client'

import {
  startTransition,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
  type KeyboardEvent
} from 'react'
import { useParams } from 'next/navigation'
import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react'
import { Alert, AlertTitle, AlertDescription } from '#ui/alert'
import { Button } from '#ui/button'
import { Kbd } from '#ui/kbd'
import { Skeleton } from '#ui/skeleton'
import { TriageLayout, type TriageView } from '#ui/triage-layout'
import { formatTime } from '@skyclause/i18n/format'
import type { StripInput } from '@skyclause/elements'
import { ModeBadge } from '../brand/mode-badge'
import { t } from './i18n'
import { useBundleReview, type InitialReview } from './use-bundle-review'
import { useProjectBundles } from './use-project-bundles'
import { callMark, orderedCalls, canReviewCall, reviewCount } from './model'
import { CallDetails, CallReview, callName } from './call-review'
import type { StripDetail } from './operations'
import { EditCallDialog } from './edit-call-dialog'
import { ApprovalBar } from './approval-bar'
import { BundleList } from './bundle-list'
import { ReviewTrace } from './review-trace'
import { RecheckDialog } from './recheck-dialog'
import { ReauthStep } from './reauth-step'
import { minutesText } from './time'
import './bundles.css'

const noDecision = {}
const PHONE = '(max-width: 640px)'
const MINUTE = 60_000
// The open bundle takes the width the sheet's fixed list (306) and details (320) columns leave: 542px at 1440.
const triage =
  'bundle-triage min-[641px]:grid-cols-[minmax(240px,280px)_minmax(0,1fr)] min-[1100px]:grid-cols-[306px_minmax(0,1fr)_320px]'

function toStripInput(strip?: StripDetail): StripInput | undefined {
  if (!strip) return undefined
  return {
    from: strip.range.from,
    to: strip.range.to,
    now: strip.range.to,
    window: strip.window ? { from: strip.window.starts_at, to: strip.window.ends_at } : null,
    rain5: (strip.series['site.rain_5m_mm'] ?? []).map(([at, value]) => ({
      at,
      value,
      state: value === null ? 'missed' : 'received'
    })),
    rain60: (strip.series['site.rain_60m_mm'] ?? []).map(([at, value]) => ({ at, value }))
  }
}

export interface BundleDetailActions {
  approve: () => Promise<void>
  edit: () => void
  reject: () => Promise<void>
}

export interface BundleDetailProps {
  bundleId: string
  actionsRef?: Ref<BundleDetailActions>
  /** The server's read for the first render (#372); the client still reads the bundle again on load. */
  initial?: InitialReview
}

/**
 * Bundle review, the approver's inbox: the project's bundles | the open bundle, its shadow check first, then one block
 * per call | what each call sends and the agent trace. The decision bar stays at the bottom of the screen. On a phone
 * one region shows at a time, the open bundle first.
 */
export function BundleDetail({ bundleId, actionsRef, initial }: BundleDetailProps) {
  const params = useParams<{ org?: string; project?: string }>()
  const org = params.org ?? ''
  const refreshList = useRef<() => void>(undefined)
  const review = useBundleReview(bundleId, org, initial, () => refreshList.current?.())
  const { data, now, decisions, editable, pending } = review
  const bundles = useProjectBundles(
    data?.bundle.project_id,
    org,
    initial?.list,
    review.loadError ? params.project : undefined
  )
  useEffect(() => {
    refreshList.current = bundles.refresh
  })
  const [view, setView] = useState<TriageView>('item')
  const [focused, setFocused] = useState<string>()
  const [editing, setEditing] = useState<string>()
  const listScroll = useRef<number | null>(null)
  const basePath = `/${encodeURIComponent(org)}/${encodeURIComponent(params.project ?? '')}`
  const scrollKey = `skyclause:bundle-list:${basePath}`
  // The strip's "now" moves once a minute, so the calls' strips redraw once a minute, not every second.
  const minute = new Date(Math.floor(now / MINUTE) * MINUTE).toISOString()

  const ordered = useMemo(() => (data ? orderedCalls(data.calls) : []), [data])
  const reviewable = ordered.filter((call) => canReviewCall(call, now))
  // A, E and R act on the focused call only; the bar's Edit and Reject on it too, else on the first open call.
  const focusedCall = reviewable.find((call) => call.id === focused)
  const current = focusedCall ?? reviewable[0]
  const canAct = editable && !pending && !review.conflict && !review.reauth && !!focusedCall
  const decide = (id: string, action: 'approve' | 'reject') =>
    review.setDecisions((items) => ({
      ...items,
      [id]: { ...items[id], action: action === 'reject' ? 'reject' : items[id]?.notices ? 'edit' : 'approve' }
    }))
  const edit = () => {
    if (canAct) startTransition(() => setEditing(focusedCall.id))
  }
  const reject = async () => {
    if (canAct) decide(focusedCall.id, 'reject')
  }
  const select = async () => {
    if (canAct) decide(focusedCall.id, 'approve')
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

  // On a phone, leaving the list keeps its place; coming back restores it, or brings the open bundle's row into view.
  function show(next: TriageView) {
    if (view === 'list') listScroll.current = window.scrollY
    setView(next)
  }
  const shown = useRef(view)
  useEffect(() => {
    if (shown.current === view || !window.matchMedia(PHONE).matches) return
    shown.current = view
    const saved = listScroll.current ?? Number(sessionStorage.getItem(scrollKey) ?? Number.NaN)
    if (view !== 'list') window.scrollTo(0, 0)
    else if (Number.isFinite(saved)) window.scrollTo(0, saved)
    else document.querySelector('.bundle-list [aria-current="true"]')?.scrollIntoView({ block: 'center' })
  }, [view, scrollKey])
  function choose(id: string) {
    if (view === 'list') sessionStorage.setItem(scrollKey, String(window.scrollY))
    if (id === bundleId) show('item')
  }

  const list = (
    <BundleList
      list={bundles.list}
      current={bundleId}
      now={now}
      basePath={basePath}
      onRetry={bundles.retry}
      onChoose={choose}
    />
  )
  const labels = {
    list: t('bundles.region_list'),
    item: t('bundles.region_item'),
    details: t('bundles.region_details')
  }

  if (!data)
    return (
      <section className="bundle-detail" aria-busy={!review.loadError}>
        <h1 className="bundle-title">{t('bundles.title')}</h1>
        <TriageLayout
          className={triage}
          view={view}
          labels={labels}
          list={list}
          item={
            review.loadError ? (
              <div className="bundle-item">
                <p className="bundle-statement">{t('bundles.load_error')}</p>
                <Button variant="outline" className="self-start" onClick={review.retry}>
                  {t('bundles.retry')}
                </Button>
              </div>
            ) : (
              <div className="bundle-item" role="status">
                <p className="sr-only">{t('bundles.loading')}</p>
                <Skeleton className="h-7 w-72 max-w-full rounded-full" />
                <Skeleton className="h-8 w-40 rounded-full" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            )
          }
        />
      </section>
    )

  const { bundle } = data
  const strip = toStripInput(data.strip)
  const normal =
    data.calls.length > 0 &&
    data.calls.every(
      (call) => call.agrees && call.mode === 'normal' && !call.no_call?.length && !call.recommendations.length
    )
  const disagreements = ordered.filter((call) => !call.agrees)
  const editCall = data.calls.find((call) => call.id === editing)
  const count = reviewCount(data.calls, decisions, now)
  const waiting = ['needs_review', 'reconfirm'].includes(bundle.state)
  const slaLeft = bundle.sla_due_at ? Date.parse(bundle.sla_due_at) - now : null
  const statement = (() => {
    if (bundle.state === 'superseded') return t('bundles.superseded')
    if (bundle.state === 'expired') return t('bundles.expired')
    if (['approved', 'sending', 'sent', 'graded'].includes(bundle.state)) return t('bundles.approved')
    if (normal) return t('bundles.normal_statement', { count: data.calls.length })
    if (bundle.state === 'closed') return t('bundles.closed')
    return null
  })()

  const item = (
    <div className="bundle-item">
      <nav className="bundle-phone-nav" aria-label={labels.item}>
        <Button variant="ghost" onClick={() => show('list')}>
          <ArrowLeftIcon aria-hidden="true" />
          {t('bundles.back_to_list')}
        </Button>
        <Button variant="ghost" onClick={() => show('details')}>
          {t(normal ? 'bundles.open_trace' : 'bundles.open_details')}
          <ArrowRightIcon aria-hidden="true" />
        </Button>
      </nav>
      <header className="bundle-item-head">
        <h2>
          {t('bundles.trigger', {
            trigger: t(`bundles.triggers.${bundle.trigger}`),
            time: formatTime(bundle.triggered_at, 'en'),
            pack: t(`bundles.packs.${bundle.pack}`)
          })}
        </h2>
        {waiting && bundle.sla_due_at && slaLeft !== null && !statement ? (
          <p className="bundle-lead">
            <time dateTime={bundle.sla_due_at} className="bundle-lead-figure" data-numeric>
              {minutesText(slaLeft)}
            </time>
            <span>
              {t(slaLeft > 0 ? 'bundles.sla_before' : 'bundles.sla_past', {
                time: formatTime(bundle.sla_due_at, 'en')
              })}
            </span>
          </p>
        ) : statement ? (
          <p className="bundle-lead bundle-statement">{statement}</p>
        ) : null}
        {!normal && data.calls.length > 0 && (
          <p className="bundle-item-sub">
            {t('bundles.summary', { count: data.calls.length, disagreements: disagreements.length })}
          </p>
        )}
      </header>
      {bundle.draft_only && <p className="bundle-status">{t('bundles.draft_only')}</p>}
      {bundle.alerts.length > 0 && (
        <ul className="bundle-alerts">
          {bundle.alerts.map((alert, index) => (
            <li key={index}>
              {t('bundles.alerts', {
                account: alert.account_id,
                time: formatTime(alert.notified_at, 'en'),
                level: alert.level
              })}
            </li>
          ))}
        </ul>
      )}
      {bundle.state === 'superseded' && (
        <Alert role="note">
          <AlertTitle>{t('bundles.superseded')}</AlertTitle>
          <AlertDescription>
            {bundle.superseded_by ? (
              <a className="bundle-link" href={`${basePath}/bundles/${encodeURIComponent(bundle.superseded_by)}`}>
                {t('bundles.successor')}
              </a>
            ) : (
              data.calls.map(
                (call) =>
                  call.superseded_by_call_id && (
                    <a
                      className="bundle-link"
                      key={call.id}
                      href={`${basePath}/calls/${encodeURIComponent(call.superseded_by_call_id)}`}
                    >
                      {t('bundles.successor_call')}
                    </a>
                  )
              )
            )}
          </AlertDescription>
        </Alert>
      )}
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
      {!normal && disagreements.length > 0 && (
        <section className="bundle-disagreements" aria-labelledby="bundle-shadow-heading">
          <h3 id="bundle-shadow-heading">{t('bundles.disagreements', { count: disagreements.length })}</h3>
          {disagreements.map((call) => {
            const shadowMode = call.shadow.mode ?? (call.shadow.watch ? 'storm_watch' : 'no_call')
            return (
              <fieldset disabled={!editable || pending || !canReviewCall(call, now)} key={call.id}>
                <legend>{t('bundles.choose', { name: callName(call) })}</legend>
                <div className="bundle-choices">
                  {(['agent', 'shadow'] as const).map((choice) => {
                    const mode = choice === 'agent' ? callMark(call) : shadowMode
                    return (
                      <label className="bundle-choice" key={choice}>
                        <input
                          type="radio"
                          className="native-check"
                          name={`verdict-${bundleId}-${call.id}`}
                          aria-label={t(`bundles.${choice}`, { mode: t(`bundles.modes.${mode}`) })}
                          checked={decisions[call.id]?.chosen === choice}
                          onChange={() =>
                            review.setDecisions((items) => ({
                              ...items,
                              [call.id]: { ...items[call.id], chosen: choice }
                            }))
                          }
                        />
                        <span className="bundle-choice-who">{t(`bundles.${choice}_who`)}</span>
                        <ModeBadge mode={mode} />
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            )
          })}
        </section>
      )}
      {bundle.calls.length === 0 && <p className="bundle-statement">{t('bundles.empty')}</p>}
      {!normal && data.calls.length > 0 && (
        /* The list scopes the documented A/E/R keys; each call is a keyboard focus stop. */
        /* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */
        <ol className="bundle-call-list" onKeyDown={shortcuts} aria-label={t('bundles.calls')}>
          {ordered.map((call) => (
            <li
              key={call.id}
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- A focused call scopes A/E/R to that call.
              tabIndex={0}
              data-call-id={call.id}
              data-current={(editable && call.id === current?.id) || undefined}
              onFocus={() => setFocused(call.id)}
            >
              <CallReview
                call={call}
                strip={strip}
                now={minute}
                decision={decisions[call.id] ?? noDecision}
                expired={Date.parse(call.expires_at) <= now}
                basePath={basePath}
                error={review.error?.callIds.includes(call.id) ? review.error.message : undefined}
              />
              {editable && canReviewCall(call, now) && (
                <div className="bundle-call-actions">
                  <Button disabled={pending} variant="outline" onClick={() => decide(call.id, 'approve')}>
                    {t(decisions[call.id]?.action === 'reject' ? 'bundles.restore' : 'bundles.select')}
                    {data.shortcuts && <Kbd className="bundle-kbd">{t('bundles.key_a')}</Kbd>}
                  </Button>
                  <Button
                    disabled={pending}
                    variant="outline"
                    onClick={() => startTransition(() => setEditing(call.id))}
                  >
                    {t('bundles.edit')}
                    {data.shortcuts && <Kbd className="bundle-kbd">{t('bundles.key_e')}</Kbd>}
                  </Button>
                  <Button disabled={pending} variant="ghost" onClick={() => decide(call.id, 'reject')}>
                    {t('bundles.reject')}
                    {data.shortcuts && <Kbd className="bundle-kbd">{t('bundles.key_r')}</Kbd>}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {normal && (
        <ul className="bundle-normal-calls" aria-label={t('bundles.calls')}>
          {ordered.map((call) => (
            <li key={call.id}>
              <ModeBadge mode={callMark(call)} />
              <span>{callName(call)}</span>
              {call.window && (
                <time dateTime={call.window.starts_at} className="bundle-quiet">
                  {t('bundles.window', {
                    start: formatTime(call.window.starts_at, 'en'),
                    end: formatTime(call.window.ends_at, 'en')
                  })}
                </time>
              )}
            </li>
          ))}
        </ul>
      )}
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
      <a className="bundle-link bundle-project-link" href={basePath}>
        {t('bundles.project')}
      </a>
    </div>
  )

  const details = (
    <div className="bundle-details">
      <nav className="bundle-phone-nav" aria-label={labels.details}>
        <Button variant="ghost" onClick={() => show('item')}>
          <ArrowLeftIcon aria-hidden="true" />
          {t('bundles.back_to_calls')}
        </Button>
      </nav>
      {!normal && data.calls.length > 0 && (
        <section className="bundle-sends" aria-labelledby="bundle-sends-heading">
          <h2 id="bundle-sends-heading">{t('bundles.details_title')}</h2>
          {ordered.map((call) => (
            <CallDetails key={call.id} call={call} decision={decisions[call.id] ?? noDecision} />
          ))}
        </section>
      )}
      <ReviewTrace calls={data.calls} run={data.run} normal={normal} />
    </div>
  )

  return (
    <section className="bundle-detail" data-view={view}>
      <h1 className="bundle-title">{t('bundles.title')}</h1>
      <TriageLayout className={triage} view={view} labels={labels} list={list} item={item} details={details} />
      {editable && !normal && (
        <ApprovalBar
          count={count}
          disabled={review.blocked || pending || !!review.conflict || !!review.reauth}
          pending={pending}
          shortcuts={data.shortcuts}
          sla={bundle.sla_due_at}
          now={now}
          reason={
            review.missingChoice
              ? t('bundles.choice_required')
              : review.includesTeachingLine
                ? t('bundles.teaching_forbidden')
                : undefined
          }
          call={
            current && {
              name: callName(current),
              rejected: decisions[current.id]?.action === 'reject',
              onEdit: () => startTransition(() => setEditing(current.id)),
              onReject: () => decide(current.id, decisions[current.id]?.action === 'reject' ? 'approve' : 'reject')
            }
          }
          onApprove={() => void review.approve()}
        />
      )}
      {editCall && editable && (
        <EditCallDialog
          key={editCall.id}
          call={editCall}
          decision={decisions[editCall.id] ?? {}}
          onClose={() => setEditing(undefined)}
          onSave={(decision) => review.setDecisions((items) => ({ ...items, [editCall.id]: decision }))}
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
      {review.reauth && <ReauthStep onCancel={review.setReauth} />}
    </section>
  )
}
