'use client'

import { useCallback, useState, type ReactNode } from 'react'
import type { BrandState } from '@skyclause/elements'
import type { Principal, CallView } from '@skyclause/contracts'
import { formatDateTime, formatNumber, formatTime } from '@skyclause/i18n/format'
import { DownloadIcon, RefreshCwIcon } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '#ui/sheet'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '#ui/alert-dialog'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '#ui/hover-card'
import { Button } from '#ui/button'
import { InputAgeChip } from '../data-components/input-age-chip'
import { ModeBadge } from '../brand/mode-badge'
import { StatusMark } from '../brand/status-mark'
import { apiFetch, type Evidence } from '../ledger/operations'
import { useRead } from '../ledger/use-read'
import { Failure, Loading } from '../ledger/feedback'
import { canApproveReply, requestState } from '../ledger/model'
import { EntryMark, Missing, SpanTimes } from '../ledger/table'
import { saveDownload } from '../ledger/download'
import { t } from '../ledger/i18n'
import { problemMessage } from '../ledger/problem'

/** A request's state as a status mark: the pending ring while it waits or assembles, the ring once replied. */
const STATE_GLYPH: Record<ReturnType<typeof requestState>, BrandState> = {
  notReviewed: 'no_call',
  waiting: 'pending',
  assembling: 'pending',
  replied: 'fresh'
}

export function RequestStatus({
  request,
  guest,
  locale
}: {
  request: Parameters<typeof requestState>[0]
  guest: boolean
  locale: 'en' | 'ms'
}) {
  const state = requestState(request, guest)
  return (
    <span className="evidence-status" data-state={state}>
      <StatusMark
        state={STATE_GLYPH[state]}
        variant="plain"
        locale={locale}
        label={t(
          `evidence.status.${state}`,
          state === 'replied' && request.replied_at ? { time: formatTime(request.replied_at, locale) } : {},
          locale
        )}
      />
    </span>
  )
}

export function EvidenceSheet({
  id,
  projectId,
  projectName,
  principal,
  guest,
  locale,
  finalFocus,
  onClose
}: {
  id: string | null
  projectId: string
  projectName: string
  principal: Principal | null
  guest: boolean
  locale: 'en' | 'ms'
  finalFocus: () => HTMLElement | null
  onClose: () => void
}) {
  return (
    <Sheet
      open={!!id}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent className="ledger-sheet" lang={locale} finalFocus={finalFocus}>
        <SheetHeader>
          <SheetTitle>{t('evidence.pack', {}, locale)}</SheetTitle>
          <SheetDescription>{t('evidence.project', { name: projectName }, locale)}</SheetDescription>
        </SheetHeader>
        {id && <PackBody key={id} id={id} projectId={projectId} principal={principal} guest={guest} locale={locale} />}
      </SheetContent>
    </Sheet>
  )
}

function PackBody({
  id,
  projectId,
  principal,
  guest,
  locale
}: {
  id: string
  projectId: string
  principal: Principal | null
  guest: boolean
  locale: 'en' | 'ms'
}) {
  const read = useCallback(
    async (signal: AbortSignal) => {
      const request = await apiFetch('getEvidenceRequest', { params: { id }, signal })
      if (request.project_id !== projectId) throw new Error('Evidence project mismatch')
      return request
    },
    [id, projectId]
  )
  const resource = useRead(read, true)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const request = resource.data
  // Approving releases the pack to the requester and cannot be taken back, so it asks first.
  const approve = async () => {
    setConfirming(false)
    setBusy(true)
    setError('')
    try {
      await apiFetch('approveEvidenceRequest', { params: { id } })
      resource.retry()
    } catch (error) {
      setError(problemMessage(error, locale))
    } finally {
      setBusy(false)
    }
  }
  if (resource.loading)
    return (
      <div className="ledger-sheet-body">
        <Loading locale={locale} />
      </div>
    )
  if (!request)
    return (
      <div className="ledger-sheet-body">
        <Failure source="pack" error={resource.error} at={resource.failedAt} retry={resource.retry} locale={locale} />
      </div>
    )
  const pack = request.pack
  return (
    <div className="ledger-sheet-body">
      <div className="evidence-head">
        <h3 className="evidence-span">
          <span>{t('evidence.for', {}, locale)}</span>
          <SpanTimes from={request.span.from} to={request.span.to} locale={locale} />
        </h3>
        <p role="status">
          <RequestStatus request={request} guest={guest} locale={locale} />
        </p>
        <p className="ledger-sub" translate="no">
          {t('evidence.packFor', { id: request.id }, locale)}
        </p>
        {pack?.window_id && (
          <p className="ledger-sub" translate="no">
            {t('evidence.window', { id: pack.window_id }, locale)}
          </p>
        )}
      </div>
      <ol className="evidence-times">
        {(['received', 'drafted', 'approved', 'replied'] as const).map((key) => {
          const at = request[`${key}_at`]
          return (
            <li key={key} data-done={at ? '' : undefined}>
              <span className="evidence-step" aria-hidden="true" />
              <span className="evidence-step-label">{t(`evidence.${key}`, {}, locale)}</span>
              {at ? <time dateTime={at}>{formatDateTime(at, locale)}</time> : <Missing locale={locale} />}
            </li>
          )
        })}
      </ol>
      <div className="ledger-actions">
        {canApproveReply(principal, request) && (
          <>
            <Button disabled={busy} onClick={() => setConfirming(true)}>
              {t(busy ? 'evidence.approving' : 'evidence.approve', {}, locale)}
            </Button>
            <AlertDialog open={confirming} onOpenChange={setConfirming}>
              <AlertDialogContent lang={locale}>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('evidence.confirmTitle', {}, locale)}</AlertDialogTitle>
                  <AlertDialogDescription>{t('evidence.confirmBody', {}, locale)}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('evidence.cancel', {}, locale)}</AlertDialogCancel>
                  <Button onClick={() => void approve()}>{t('evidence.approve', {}, locale)}</Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
        <Button
          variant={canApproveReply(principal, request) ? 'outline' : 'default'}
          onClick={() =>
            saveDownload(
              JSON.stringify(request, null, 2),
              'application/json',
              t('evidence.filename', { id: request.id }, locale)
            )
          }
        >
          <DownloadIcon data-icon="inline-start" aria-hidden="true" />
          {t('evidence.download', {}, locale)}
        </Button>
        <Button variant="ghost" onClick={resource.retry}>
          <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
          {t('evidence.refreshPack', {}, locale)}
        </Button>
      </div>
      {error && (
        <p role="alert" className="ledger-invalid">
          {error}
        </p>
      )}
      {pack ? <PackContents pack={pack} locale={locale} /> : <p>{t('evidence.pending', {}, locale)}</p>}
    </div>
  )
}

function PackContents({ pack, locale }: { pack: NonNullable<Evidence['pack']>; locale: 'en' | 'ms' }) {
  const readingRef = (id: string) => <ReadingRef key={id} id={id} pack={pack} locale={locale} />
  const callRefs = (call?: CallView) => {
    const ids = [
      ...new Set(call?.shadow.clauses.flatMap((clause) => clause.inputs.flatMap((input) => input.reading_ids)) ?? [])
    ]
    return ids.length ? (
      <span className="evidence-refs">{ids.map(readingRef)}</span>
    ) : (
      <p className="ledger-sub">{t('evidence.provenanceMissing', {}, locale)}</p>
    )
  }
  const section = (key: string, content: ReactNode[], empty?: string) => (
    <PackSection key={key} name={key} content={content} empty={empty} locale={locale} />
  )
  return (
    <>
      {/* The answer first: the record's own entries for this span, then what they rest on. */}
      {section(
        'ledger',
        pack.ledger.map((entry) => (
          <article key={entry.id} className="evidence-entry">
            <p className="evidence-entry-line">
              <time dateTime={entry.at}>{formatDateTime(entry.at, locale)}</time>
              <EntryMark kind={entry.kind} locale={locale} />
              <span className="ledger-sub" data-numeric>
                {t('ledger.seq', { n: formatNumber(entry.seq, locale) }, locale)}
              </span>
            </p>
            <p className="ledger-sub" translate="no">
              {t('ledger.entry', { id: entry.id }, locale)}
            </p>
            <details className="evidence-body">
              <summary>{t('evidence.body', {}, locale)}</summary>
              <pre>{JSON.stringify(entry.body, null, 2)}</pre>
            </details>
            {entry.refs.reading_id
              ? readingRef(entry.refs.reading_id)
              : callRefs(pack.calls.find((call) => call.id === entry.refs.call_id))}
          </article>
        ))
      )}
      {section(
        'calls',
        pack.calls.map((call) => (
          <article key={call.id}>
            <p className="evidence-entry-line">
              <span translate="no">{t('ledger.callRef', { id: call.id }, locale)}</span>
              {call.mode && <ModeBadge mode={call.mode} locale={locale} />}
            </p>
            <p>{call.reason}</p>
            {callRefs(call)}
            <span className="evidence-refs">
              {call.shadow.clauses.flatMap((clause) =>
                clause.inputs.map((input, index) => (
                  <InputAgeChip
                    key={`${clause.key}-${input.name}-${index}`}
                    input={input}
                    ageSeconds={input.age_s}
                    locale={locale}
                  />
                ))
              )}
            </span>
          </article>
        ))
      )}
      {section(
        'approvals',
        pack.approvals.map((approval) => (
          <article key={approval.id}>
            <p>
              {t(
                'evidence.approval',
                { id: approval.id, by: approval.approved_by, time: formatDateTime(approval.approved_at, locale) },
                locale
              )}
            </p>
            {callRefs(pack.calls.find((call) => call.id === approval.call_id))}
          </article>
        ))
      )}
      {section(
        'grades',
        pack.grades.map((grade) => (
          <article key={grade.id}>
            <p className="evidence-entry-line">
              <span translate="no">{grade.id}</span>
              <span>
                {grade.outcome in OUTCOMES ? t(`ledger.outcomes.${grade.outcome}`, {}, locale) : grade.outcome}
              </span>
            </p>
            {callRefs(pack.calls.find((call) => call.id === grade.call_id))}
          </article>
        ))
      )}
      {section(
        'readings',
        pack.readings.map((reading) => (
          <article key={reading.id} id={`reading-${reading.id}`}>
            <p className="evidence-entry-line">
              <span>{reading.metric}</span>
              <span className="evidence-value" data-numeric>
                {(() => {
                  const value =
                    reading.value !== null
                      ? formatNumber(reading.value, locale)
                      : (reading.value_text ??
                        (reading.value_json !== null
                          ? JSON.stringify(reading.value_json)
                          : t('ledger.noValue', {}, locale)))
                  return reading.unit ? t('evidence.value', { value, unit: reading.unit }, locale) : value
                })()}
              </span>
            </p>
            <p className="ledger-sub" translate="no">
              {t(
                'evidence.source',
                { station: reading.station_id ?? reading.source_id, source: reading.source_id },
                locale
              )}
            </p>
            <span className="evidence-refs">
              {readingRef(reading.id)}
              {/* The source link stays in the reading itself, where a keyboard and a finger reach it. */}
              {reading.source_url && (
                <a className="evidence-reading-ref" href={reading.source_url}>
                  {t('evidence.sourceLink', {}, locale)}
                </a>
              )}
            </span>
          </article>
        ))
      )}
      {section(
        'warnings',
        pack.warnings.map((warning, index) => (
          <article key={`${warning.reading_id}-${index}`}>
            <blockquote lang="ms">{warning.text}</blockquote>
            <p>{warning.gloss ?? t('evidence.noGloss', {}, locale)}</p>
            <p className="ledger-sub">
              {t(
                'evidence.valid',
                { from: formatDateTime(warning.valid_from, locale), to: formatDateTime(warning.valid_to, locale) },
                locale
              )}
            </p>
            {readingRef(warning.reading_id)}
          </article>
        )),
        'evidence.noWarnings'
      )}
      {section(
        'frames',
        pack.frames.map((frame) => (
          <article key={`${frame.reading_id}-${frame.captured_at}`}>
            <a href={frame.url}>
              {t('evidence.frame', { id: frame.reading_id, time: formatDateTime(frame.captured_at, locale) }, locale)}
            </a>
            {readingRef(frame.reading_id)}
          </article>
        ))
      )}
    </>
  )
}

/** Lists never render more than 50 rows: a section of the pack shows 50 of its records at a time. */
const PAGE = 50

function PackSection({
  name,
  content,
  empty,
  locale
}: {
  name: string
  content: ReactNode[]
  empty?: string
  locale: 'en' | 'ms'
}) {
  const [page, setPage] = useState(0)
  const pages = Math.ceil(content.length / PAGE)
  const current = Math.min(page, Math.max(0, pages - 1))
  const shown = content.slice(current * PAGE, current * PAGE + PAGE)
  return (
    <section className="evidence-section" aria-labelledby={`evidence-${name}`}>
      <h3 id={`evidence-${name}`}>
        {t(`evidence.${name}`, {}, locale)}
        <span className="ledger-n" data-numeric>
          {t('evidence.count', { n: formatNumber(content.length, locale) }, locale)}
        </span>
      </h3>
      {content.length ? shown : <p className="ledger-sub">{t(empty ?? 'evidence.none', {}, locale)}</p>}
      {pages > 1 && (
        <div className="evidence-pager">
          <p role="status" className="ledger-sub" data-numeric>
            {t(
              'evidence.shown',
              {
                from: formatNumber(current * PAGE + 1, locale),
                to: formatNumber(current * PAGE + shown.length, locale),
                n: formatNumber(content.length, locale)
              },
              locale
            )}
          </p>
          <Button variant="ghost" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
            {t('evidence.previousItems', {}, locale)}
          </Button>
          <Button variant="ghost" size="sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            {t('evidence.nextItems', {}, locale)}
          </Button>
        </div>
      )}
    </section>
  )
}

const OUTCOMES = new Set([
  'hit',
  'miss',
  'false_alarm',
  'correct_normal',
  'in_band',
  'out_of_band',
  'unlisted_surge',
  'no_call',
  'pending'
])

function ReadingRef({ id, pack, locale }: { id: string; pack: NonNullable<Evidence['pack']>; locale: 'en' | 'ms' }) {
  const [open, setOpen] = useState(false)
  const reading = pack.readings.find((item) => item.id === id)
  const label = t(
    'evidence.reading',
    { id, time: reading ? formatDateTime(reading.observed_at, locale) : t('ledger.noValue', {}, locale) },
    locale
  )
  return (
    <HoverCard open={open} onOpenChange={setOpen}>
      <HoverCardTrigger
        render={
          <a
            aria-label={label}
            href={`#reading-${id}`}
            className="evidence-reading-ref"
            data-reading-trigger
            translate="no"
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                setOpen(false)
              }
            }}
          />
        }
      >
        {label}
      </HoverCardTrigger>
      <HoverCardContent>
        <p>{label}</p>
        {reading && (
          <>
            <p translate="no">
              {t(
                'evidence.source',
                { station: reading.station_id ?? reading.source_id, source: reading.source_id },
                locale
              )}
            </p>
            {reading.source_url && <a href={reading.source_url}>{t('evidence.sourceLink', {}, locale)}</a>}
          </>
        )}
      </HoverCardContent>
    </HoverCard>
  )
}
