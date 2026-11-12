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
import { Skeleton } from '#ui/skeleton'
import { TriageLayout, type TriageView } from '#ui/triage-layout'
import { formatNumber, formatTime } from '@skyclause/i18n/format'
import type { StripInput } from '@skyclause/elements'
import { ModeBadge } from '../brand/mode-badge'
import { useUnsavedChangesGuard } from '../settings/set-7/use-unsaved-changes-guard'
import { counted, t, type Locale } from './i18n'
import { useBundleReview, type InitialReview } from './use-bundle-review'
import { useProjectBundles, type BundleList as ListState } from './use-project-bundles'
import {
  approvalReach,
  approvedCalls,
  approvedReach,
  callMark,
  orderedCalls,
  canReviewCall,
  reviewCount
} from './model'
import { CallDetails, CallReview, callName } from './call-review'
import type { CallDetail, StripDetail } from './operations'
import { EditCallDialog } from './edit-call-dialog'
import { ApprovalBar, reachText } from './approval-bar'
import { BundleList } from './bundle-list'
import { ReviewTrace } from './review-trace'
import { RecheckDialog } from './recheck-dialog'
import { ReauthStep } from './reauth-step'
import { minutesText } from './time'
import './bundles.css'

const noDecision = {}
const PHONE = '(max-width: 640px)'
const MINUTE = 60_000
const APPROVED = ['approved', 'sending', 'sent', 'graded']
const ALERT_LEVELS = ['on_duty', 'next_approver', 'admins']
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
  /** The request's language, for every word and time on the page. */
  locale?: Locale
}

/** The bundle the approver should open next: another one waiting for review, the soonest SLA first. */
function nextWaiting(list: ListState, current: string) {
  if (list.status !== 'ready') return undefined
  return list.rows
    .filter((row) => row.id !== current && ['needs_review', 'reconfirm'].includes(row.state))
    .sort((a, b) => (a.sla_due_at ?? '9999').localeCompare(b.sla_due_at ?? '9999'))[0]
}

/** What approving did: when, how many notices to how many recipients, and where the record and the next bundle are. */
function approvalSummary(calls: CallDetail[], locale: Locale) {
  const reach = approvedReach(calls)
  const words = reachText(reach, locale)
  return {
    reach,
    lead: reach.approvedAt
      ? t('bundles.approved_at', { time: formatTime(reach.approvedAt, locale) }, locale)
      : t('bundles.approved', {}, locale),
    sent: !reach.notices
      ? t('bundles.approved_nothing', {}, locale)
      : reach.sentAt
        ? t('bundles.approved_sent', { ...words, time: formatTime(reach.sentAt, locale) }, locale)
        : t('bundles.approved_sending', words, locale),
    rejected: reach.rejected
      ? t(counted('bundles.approved_rejected', reach.rejected), { count: formatNumber(reach.rejected, locale) }, locale)
      : null
  }
}

/**
 * Bundle review, the approver's inbox: the project's bundles | the open bundle, its shadow check first, then one block
 * per call | what each call sends and the agent trace. The decision bar stays at the bottom of the screen. On a phone
 * one region shows at a time, the open bundle first.
 */
export function BundleDetail({ bundleId, actionsRef, initial, locale = 'en' }: BundleDetailProps) {
  const params = useParams<{ org?: string; project?: string }>()
  const org = params.org ?? ''
  const refreshList = useRef<() => void>(undefined)
  const review = useBundleReview(bundleId, org, initial, () => refreshList.current?.(), locale)
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
  const summaryRef = useRef<HTMLDivElement>(null)
  const wasEditable = useRef(editable)
  // Decisions not yet approved are lost on leaving: links, Back and a reload ask first.
  useUnsavedChangesGuard(editable && !pending && Object.keys(decisions).length > 0, locale)
  const basePath = `/${encodeURIComponent(org)}/${encodeURIComponent(params.project ?? '')}`
  const scrollKey = `skyclause:bundle-list:${basePath}`
  // The strip's "now" moves once a minute, so the calls' strips redraw once a minute, not every second.
  const minute = new Date(Math.floor(now / MINUTE) * MINUTE).toISOString()

  const approvedState = !!data && APPROVED.includes(data.bundle.state)
  // Approve unmounts the bar; focus moves to what approving did instead of falling to the page.
  useEffect(() => {
    if (wasEditable.current && !editable && approvedState) summaryRef.current?.focus()
    wasEditable.current = editable
  }, [editable, approvedState])

  const ordered = useMemo(() => (data ? orderedCalls(data.calls) : []), [data])
  const reviewable = ordered.filter((call) => canReviewCall(call, now))
  // E and R act on the focused call only; the bar's Edit and Reject on it too, else on the first open call.
  const focusedCall = reviewable.find((call) => call.id === focused)
  const current = focusedCall ?? reviewable[0]
  const canAct = editable && !pending && !review.conflict && !review.reauth && !!focusedCall
  const decide = (id: string, action: 'approve' | 'reject') =>
    review.setDecisions((items) => ({
      ...items,
      [id]: { ...items[id], action: action === 'reject' ? 'reject' : items[id]?.notices ? 'edit' : 'approve' }
    }))
  /** Reject a call, or restore a rejected one into the approval. */
  const toggleReject = (id: string) => decide(id, decisions[id]?.action === 'reject' ? 'approve' : 'reject')
  const edit = () => {
    if (canAct) startTransition(() => setEditing(focusedCall.id))
  }
  const reject = async () => {
    if (canAct) toggleReject(focusedCall.id)
  }
  useImperativeHandle(actionsRef, () => ({ approve: () => review.approve(), edit, reject }))

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
    if (!['e', 'r'].includes(key)) return
    event.preventDefault()
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
      locale={locale}
    />
  )
  const labels = {
    list: t('bundles.region_list', {}, locale),
    item: t('bundles.region_item', {}, locale),
    details: t('bundles.region_details', {}, locale)
  }

  if (!data)
    return (
      <section className="bundle-detail" aria-busy={!review.loadError} lang={locale}>
        <h1 className="bundle-title">{t('bundles.title', {}, locale)}</h1>
        <TriageLayout
          className={triage}
          view={view}
          labels={labels}
          list={list}
          item={
            review.loadError ? (
              <div className="bundle-item">
                <p className="bundle-statement" role="alert">
                  {t('bundles.load_error', {}, locale)}
                </p>
                <Button variant="outline" className="self-start" onClick={review.retry}>
                  {t('bundles.retry', {}, locale)}
                </Button>
              </div>
            ) : (
              <div className="bundle-item" role="status">
                <p className="sr-only">{t('bundles.loading', {}, locale)}</p>
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
  const reach = approvalReach(data.calls, decisions, now)
  const waiting = ['needs_review', 'reconfirm'].includes(bundle.state)
  const slaLeft = bundle.sla_due_at ? Date.parse(bundle.sla_due_at) - now : null
  const summary = approvedState && !normal ? approvalSummary(data.calls, locale) : null
  const next = summary ? nextWaiting(bundles.list, bundleId) : undefined
  const approvedCall = approvedCalls(data.calls)[0]
  const statement = (() => {
    if (bundle.state === 'superseded') return t('bundles.superseded', {}, locale)
    if (bundle.state === 'expired') return t('bundles.expired', {}, locale)
    if (summary) return summary.lead
    if (approvedState) return t('bundles.approved', {}, locale)
    if (normal) return t('bundles.normal_statement', { count: formatNumber(data.calls.length, locale) }, locale)
    if (bundle.state === 'closed') return t('bundles.closed', {}, locale)
    return null
  })()

  const item = (
    <div className="bundle-item">
      <nav className="bundle-phone-nav" aria-label={labels.item}>
        <Button variant="ghost" onClick={() => show('list')}>
          <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
          {t('bundles.back_to_list', {}, locale)}
        </Button>
        <Button variant="ghost" onClick={() => show('details')}>
          {t(normal ? 'bundles.open_trace' : 'bundles.open_details', {}, locale)}
          <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
        </Button>
      </nav>
      <header className="bundle-item-head">
        <h2>
          {t(
            'bundles.trigger',
            {
              trigger: t(`bundles.triggers.${bundle.trigger}`, {}, locale),
              time: formatTime(bundle.triggered_at, locale),
              pack: t(`bundles.packs.${bundle.pack}`, {}, locale)
            },
            locale
          )}
        </h2>
        {waiting && bundle.sla_due_at && slaLeft !== null && !statement ? (
          <p className="bundle-lead">
            <time dateTime={bundle.sla_due_at} className="bundle-lead-figure" data-numeric>
              {minutesText(slaLeft, locale)}
            </time>
            <span>
              {t(
                slaLeft > 0 ? 'bundles.sla_before' : 'bundles.sla_past',
                { time: formatTime(bundle.sla_due_at, locale) },
                locale
              )}
            </span>
          </p>
        ) : summary ? null : statement ? (
          <p className="bundle-lead bundle-statement">{statement}</p>
        ) : null}
        {!normal && !summary && data.calls.length > 0 && (
          <p className="bundle-item-sub">
            {t(
              'bundles.summary',
              {
                count: formatNumber(data.calls.length, locale),
                disagreements: formatNumber(disagreements.length, locale)
              },
              locale
            )}
          </p>
        )}
      </header>
      {summary && (
        <div className="bundle-approved" ref={summaryRef} tabIndex={-1} data-approved>
          <p className="bundle-lead bundle-statement">{summary.lead}</p>
          <p>{summary.sent}</p>
          {summary.rejected && <p className="bundle-quiet">{summary.rejected}</p>}
          <p className="bundle-approved-links">
            {approvedCall && (
              <a
                className="bundle-link"
                href={`${basePath}/ledger?call=${encodeURIComponent(approvedCall.id)}`}
                data-ledger-link
              >
                {t('bundles.ledger_link', {}, locale)}
              </a>
            )}
            {next ? (
              <a className="bundle-link" href={`${basePath}/bundles/${encodeURIComponent(next.id)}`} data-next-bundle>
                {t('bundles.next_bundle', {}, locale)}
              </a>
            ) : bundles.list.status === 'ready' ? (
              <span className="bundle-quiet">{t('bundles.no_next', {}, locale)}</span>
            ) : null}
          </p>
        </div>
      )}
      {bundle.draft_only && <p className="bundle-status">{t('bundles.draft_only', {}, locale)}</p>}
      {bundle.alerts.length > 0 && (
        <ul className="bundle-alerts">
          {bundle.alerts.map((alert, index) => (
            <li key={index}>
              {t(
                'bundles.alerts',
                {
                  who: t(
                    `bundles.alert_levels.${ALERT_LEVELS.includes(alert.level) ? alert.level : 'other'}`,
                    {},
                    locale
                  ),
                  time: formatTime(alert.notified_at, locale)
                },
                locale
              )}
            </li>
          ))}
        </ul>
      )}
      {bundle.state === 'superseded' && (
        <Alert role="note">
          <AlertTitle>{t('bundles.superseded', {}, locale)}</AlertTitle>
          <AlertDescription>
            {bundle.superseded_by ? (
              <a className="bundle-link" href={`${basePath}/bundles/${encodeURIComponent(bundle.superseded_by)}`}>
                {t('bundles.successor', {}, locale)}
              </a>
            ) : (
              data.calls.map(
                (call) =>
                  call.superseded_by_call_id && (
                    <a
                      className="bundle-link"
                      key={call.id}
                      href={`${basePath}/calls/${encodeURIComponent(call.superseded_by_call_id)}`}
                      aria-describedby={`bundle-call-${call.id}`}
                    >
                      {t('bundles.successor_call', {}, locale)}
                    </a>
                  )
              )
            )}
          </AlertDescription>
        </Alert>
      )}
      {data.errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>{t('bundles.load_error', {}, locale)}</AlertTitle>
          <AlertDescription>
            {data.errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
            <Button variant="outline" onClick={review.retry}>
              {t('bundles.retry', {}, locale)}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {!normal && disagreements.length > 0 && (
        <section className="bundle-disagreements" aria-labelledby="bundle-shadow-heading">
          <h3 id="bundle-shadow-heading">
            {t(
              counted('bundles.disagreements', disagreements.length),
              { count: formatNumber(disagreements.length, locale) },
              locale
            )}
          </h3>
          {disagreements.map((call) => {
            const shadowMode = call.shadow.mode ?? (call.shadow.watch ? 'storm_watch' : 'no_call')
            return (
              <fieldset disabled={!editable || pending || !canReviewCall(call, now)} key={call.id}>
                <legend>{t('bundles.choose', { name: callName(call, locale) }, locale)}</legend>
                <div className="bundle-choices">
                  {(['agent', 'shadow'] as const).map((choice) => {
                    const mode = choice === 'agent' ? callMark(call) : shadowMode
                    return (
                      <label className="bundle-choice" key={choice}>
                        <input
                          type="radio"
                          className="native-check"
                          name={`verdict-${bundleId}-${call.id}`}
                          aria-label={t(`bundles.${choice}`, { mode: t(`bundles.modes.${mode}`, {}, locale) }, locale)}
                          checked={decisions[call.id]?.chosen === choice}
                          onChange={() =>
                            review.setDecisions((items) => ({
                              ...items,
                              [call.id]: { ...items[call.id], chosen: choice }
                            }))
                          }
                        />
                        <span className="bundle-choice-who">{t(`bundles.${choice}_who`, {}, locale)}</span>
                        <ModeBadge mode={mode} locale={locale} />
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            )
          })}
        </section>
      )}
      {bundle.calls.length === 0 && <p className="bundle-statement">{t('bundles.empty', {}, locale)}</p>}
      {!normal && data.calls.length > 0 && data.shortcuts && editable && reviewable.length > 0 && (
        <p className="bundle-quiet bundle-keys">{t('bundles.keys_hint', {}, locale)}</p>
      )}
      {!normal && data.calls.length > 0 && (
        /* The list scopes the documented E and R keys; each call is a keyboard focus stop. */
        /* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */
        <ol className="bundle-call-list" onKeyDown={shortcuts} aria-label={t('bundles.calls', {}, locale)}>
          {ordered.map((call) => {
            const open = editable && canReviewCall(call, now)
            const heading = `bundle-call-${call.id}`
            return (
              <li
                key={call.id}
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- A focused call scopes E and R to that call.
                tabIndex={0}
                aria-labelledby={heading}
                aria-keyshortcuts={open && data.shortcuts ? 'e r' : undefined}
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
                  reviewing={open}
                  locale={locale}
                />
                {open && (
                  <div className="bundle-call-actions">
                    <Button
                      disabled={pending}
                      variant="outline"
                      aria-describedby={heading}
                      onClick={() => startTransition(() => setEditing(call.id))}
                    >
                      {t('bundles.edit', {}, locale)}
                    </Button>
                    <Button
                      disabled={pending}
                      variant="ghost"
                      aria-describedby={heading}
                      onClick={() => toggleReject(call.id)}
                    >
                      {t(decisions[call.id]?.action === 'reject' ? 'bundles.restore' : 'bundles.reject', {}, locale)}
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
      {normal && (
        <ul className="bundle-normal-calls" aria-label={t('bundles.calls', {}, locale)}>
          {ordered.map((call) => (
            <li key={call.id}>
              <ModeBadge mode={callMark(call)} locale={locale} />
              <span>{callName(call, locale)}</span>
              {call.window && (
                <time dateTime={call.window.starts_at} className="bundle-quiet">
                  {t(
                    'bundles.window',
                    { start: formatTime(call.window.starts_at, locale), end: formatTime(call.window.ends_at, locale) },
                    locale
                  )}
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
              {t('bundles.retry', {}, locale)}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <a className="bundle-link bundle-project-link" href={basePath}>
        {t('bundles.project', {}, locale)}
      </a>
    </div>
  )

  const details = (
    <div className="bundle-details">
      <nav className="bundle-phone-nav" aria-label={labels.details}>
        <Button variant="ghost" onClick={() => show('item')}>
          <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
          {t('bundles.back_to_calls', {}, locale)}
        </Button>
      </nav>
      {!normal && data.calls.length > 0 && (
        <section className="bundle-sends" aria-labelledby="bundle-sends-heading">
          <h2 id="bundle-sends-heading">{t('bundles.details_title', {}, locale)}</h2>
          {ordered.map((call) => (
            <CallDetails key={call.id} call={call} decision={decisions[call.id] ?? noDecision} locale={locale} />
          ))}
        </section>
      )}
      <ReviewTrace calls={data.calls} run={data.run} normal={normal} locale={locale} />
    </div>
  )

  return (
    <section className="bundle-detail" data-view={view} lang={locale}>
      <h1 className="bundle-title">{t('bundles.title', {}, locale)}</h1>
      <TriageLayout className={triage} view={view} labels={labels} list={list} item={item} details={details} />
      {editable && !normal && (
        <ApprovalBar
          count={count}
          reach={reach}
          disabled={review.blocked || pending || !!review.conflict || !!review.reauth}
          pending={pending}
          sla={bundle.sla_due_at}
          now={now}
          locale={locale}
          reason={
            review.missingChoice
              ? t('bundles.choice_required', {}, locale)
              : review.includesTeachingLine
                ? t('bundles.teaching_forbidden', {}, locale)
                : undefined
          }
          call={
            current && {
              name: callName(current, locale),
              rejected: decisions[current.id]?.action === 'reject',
              onEdit: () => startTransition(() => setEditing(current.id)),
              onReject: () => toggleReject(current.id)
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
          locale={locale}
          onClose={() => setEditing(undefined)}
          onSave={(decision) => review.setDecisions((items) => ({ ...items, [editCall.id]: decision }))}
        />
      )}
      {review.conflict && (
        <RecheckDialog
          conflict={review.conflict}
          calls={data.calls}
          pending={pending}
          locale={locale}
          onCancel={() => review.setConflict(undefined)}
          onConfirm={() => void review.approve(true)}
        />
      )}
      {review.reauth && <ReauthStep onCancel={review.setReauth} />}
    </section>
  )
}
