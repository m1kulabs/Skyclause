'use client'

import { useCallback, useState, type ReactNode } from 'react'
import type { Principal, CallView } from '@skyclause/contracts'
import { formatDateTime, formatNumber, formatTime } from '@skyclause/i18n/format'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '#ui/sheet'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '#ui/hover-card'
import { Button } from '#ui/button'
import { InputAgeChip } from '../data-components/input-age-chip'
import { ModeBadge } from '../brand/mode-badge'
import { apiFetch, type Evidence } from '../ledger/operations'
import { useRead } from '../ledger/use-read'
import { Failure, Loading } from '../ledger/feedback'
import { canApproveReply, requestState } from '../ledger/model'
import { saveDownload } from '../ledger/download'
import { t } from '../ledger/i18n'
import { problemMessage } from '../ledger/problem'

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
    <span>
      {t(
        `evidence.status.${state}`,
        state === 'replied' && request.replied_at ? { time: formatTime(request.replied_at, locale) } : {},
        locale
      )}
    </span>
  )
}

export function EvidenceSheet({
  id,
  projectId,
  principal,
  guest,
  locale,
  finalFocus,
  onClose
}: {
  id: string | null
  projectId: string
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
          <SheetDescription>{t('evidence.project', { id: projectId }, locale)}</SheetDescription>
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
  const [error, setError] = useState('')
  const request = resource.data
  if (resource.loading)
    return (
      <div className="ledger-sheet-body">
        <Loading locale={locale} />
      </div>
    )
  if (!request)
    return (
      <div className="ledger-sheet-body">
        <Failure error={resource.error} retry={resource.retry} locale={locale} />
      </div>
    )
  const pack = request.pack
  return (
    <div className="ledger-sheet-body">
      <p role="status">
        <RequestStatus request={request} guest={guest} locale={locale} />
      </p>
      <h3>{t('evidence.packFor', { id: request.id }, locale)}</h3>
      {pack?.window_id && <p>{t('evidence.window', { id: pack.window_id }, locale)}</p>}
      <p>
        <time dateTime={request.span.from}>{formatDateTime(request.span.from, locale)}</time>
      </p>
      <p>
        <time dateTime={request.span.to}>{formatDateTime(request.span.to, locale)}</time>
      </p>
      <dl className="evidence-times">
        {(['received', 'drafted', 'approved', 'replied'] as const).map((key) => (
          <div key={key}>
            <dt>{t(`evidence.${key}`, {}, locale)}</dt>
            <dd>
              {request[`${key}_at`] ? (
                <time dateTime={request[`${key}_at`]!}>{formatDateTime(request[`${key}_at`]!, locale)}</time>
              ) : (
                t('ledger.noValue', {}, locale)
              )}
            </dd>
          </div>
        ))}
      </dl>
      <div className="ledger-actions">
        {canApproveReply(principal, request) ? (
          <Button
            disabled={busy}
            onClick={async () => {
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
            }}
          >
            {t(busy ? 'evidence.approving' : 'evidence.approve', {}, locale)}
          </Button>
        ) : (
          <Button
            onClick={() =>
              saveDownload(
                JSON.stringify(request, null, 2),
                'application/json',
                t('evidence.filename', { id: request.id }, locale)
              )
            }
          >
            {t('evidence.download', {}, locale)}
          </Button>
        )}
        <Button variant="outline" onClick={resource.retry}>
          {t('evidence.refreshPack', {}, locale)}
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
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
    return ids.length ? ids.map(readingRef) : <p>{t('evidence.provenanceMissing', {}, locale)}</p>
  }
  const section = (key: string, content: ReactNode[], empty?: string) => (
    <section className="evidence-section">
      <h3>{t(`evidence.${key}`, {}, locale)}</h3>
      {content.length ? content : <p>{t(empty ?? 'evidence.none', {}, locale)}</p>}
    </section>
  )
  return (
    <>
      {section(
        'readings',
        pack.readings.map((reading) => (
          <article key={reading.id} id={`reading-${reading.id}`}>
            <p>{reading.metric}</p>
            <p>
              {t(
                'evidence.value',
                {
                  value:
                    reading.value !== null
                      ? formatNumber(reading.value, locale)
                      : (reading.value_text ??
                        (reading.value_json !== null
                          ? JSON.stringify(reading.value_json)
                          : t('ledger.noValue', {}, locale))),
                  unit: reading.unit ?? ''
                },
                locale
              )}
            </p>
            <p translate="no">
              {t(
                'evidence.source',
                { station: reading.station_id ?? reading.source_id, source: reading.source_id },
                locale
              )}
            </p>
            {readingRef(reading.id)}
          </article>
        ))
      )}
      {section(
        'warnings',
        pack.warnings.map((warning, index) => (
          <article key={`${warning.reading_id}-${index}`}>
            <blockquote lang="ms">{warning.text}</blockquote>
            <p>{warning.gloss ?? t('evidence.noGloss', {}, locale)}</p>
            <p>
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
        'calls',
        pack.calls.map((call) => (
          <article key={call.id}>
            <p translate="no">{call.id}</p>
            {call.mode && (
              <>
                <ModeBadge mode={call.mode} />
                <p>{t(`ledger.modes.${call.mode}`, {}, locale)}</p>
              </>
            )}
            <p>{call.reason}</p>
            {callRefs(call)}
            {call.shadow.clauses.flatMap((clause) =>
              clause.inputs.map((input, index) => (
                <InputAgeChip key={`${clause.key}-${input.name}-${index}`} input={input} />
              ))
            )}
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
            <p>{grade.id}</p>
            <p>{grade.outcome}</p>
            {callRefs(pack.calls.find((call) => call.id === grade.call_id))}
          </article>
        ))
      )}
      {section(
        'ledger',
        pack.ledger.map((entry) => (
          <article key={entry.id}>
            <p>{t('ledger.entry', { id: entry.id }, locale)}</p>
            <p>
              <time dateTime={entry.at}>{formatDateTime(entry.at, locale)}</time>
            </p>
            <pre>{JSON.stringify(entry.body, null, 2)}</pre>
            {entry.refs.reading_id
              ? readingRef(entry.refs.reading_id)
              : callRefs(pack.calls.find((call) => call.id === entry.refs.call_id))}
          </article>
        ))
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
