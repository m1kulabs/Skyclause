'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDate, formatDateTime, formatTime } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Skeleton } from '#ui/skeleton'
import { SourceError } from '../data-components'
import { ApiProblem } from '../../lib/api-fetch'
import { t } from './i18n'
import { apiFetch, labelValues, type LabelValue, type ProbationFrame, type ProbationStatus } from './operations'

export type LabellerMode = 'label' | 'resolve'

interface LabellerProps {
  sourceId: string
  mode: LabellerMode
  locale?: 'en' | 'ms'
  /** Every recorded label returns the camera's status; the panel keeps the latest for progress. */
  onStatus(status: ProbationStatus): void
  /** Resolve view only: a new frame awaiting agreement reached this labeller. */
  onDisagreement?(frameId: string): void
  /** Resolve view only: this labeller recorded the agreed answer for the frame. */
  onResolved?(frameId: string): void
}

type View =
  | { kind: 'loading' }
  | {
      kind: 'frame'
      frame: ProbationFrame
      url: string | null
      saving: LabelValue | null
      imageStatus: number | null
      failedAt: string | null
      /** The label post failed: the frame stays, and this retries the same post. */
      retryLabel: (() => void) | null
    }
  | { kind: 'empty' }
  | { kind: 'not-labeller' }
  /** The next frame could not be read: a failed read, named, never an empty state. */
  | { kind: 'read-failure'; status: number | null; at: string; retry: () => void }

/** A phone's frame is 4:3 (the masked canvas); loading holds that space so nothing jumps when the frame lands. */
const FRAME_SKELETON = 'aspect-[4/3] w-full rounded-xl'
const ANSWER = 'probation-answer h-auto min-h-14 whitespace-normal px-5 py-2 text-center transition-transform'

export function FrameLabeller({ sourceId, mode, locale = 'en', onStatus, onDisagreement, onResolved }: LabellerProps) {
  const [view, setView] = useState<View>({ kind: 'loading' })
  const headingRef = useRef<HTMLHeadingElement>(null)
  const previousFrame = useRef<string | null>(null)
  const objectUrl = useRef<string | null>(null)
  const run = useRef<AbortController | null>(null)

  const startRun = useCallback((task: (signal: AbortSignal) => void) => {
    run.current?.abort()
    const controller = new AbortController()
    run.current = controller
    task(controller.signal)
  }, [])

  useEffect(() => () => run.current?.abort(), [])

  const loadImage = useCallback((frame: ProbationFrame, signal: AbortSignal) => {
    const read = async () => {
      let imageStatus: number | null = null
      try {
        const response = await fetch(frame.frame_url, { signal })
        if (!response.ok) imageStatus = response.status
        else {
          const blob = await response.blob()
          if (signal.aborted) return
          if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
          const url = URL.createObjectURL(blob)
          objectUrl.current = url
          setView({ kind: 'frame', frame, url, saving: null, imageStatus: null, failedAt: null, retryLabel: null })
          return
        }
      } catch {
        if (signal.aborted) return
        imageStatus = imageStatus ?? 0
      }
      if (signal.aborted) return
      // A network failure has no HTTP status: 0 here, named as unreachable.
      setView({
        kind: 'frame',
        frame,
        url: null,
        saving: null,
        imageStatus,
        failedAt: new Date().toISOString(),
        retryLabel: null
      })
    }
    void read()
  }, [])

  const loadNext = useCallback(
    (signal: AbortSignal) => {
      const read = async () => {
        setView({ kind: 'loading' })
        let result
        try {
          result = await apiFetch('getNextProbationFrame', { params: { id: sourceId }, signal })
        } catch (error) {
          if (signal.aborted) return
          if (error instanceof ApiProblem && error.status === 403) {
            setView({ kind: 'not-labeller' })
            return
          }
          setView({
            kind: 'read-failure',
            status: error instanceof ApiProblem ? error.status : null,
            at: new Date().toISOString(),
            retry: () => startRun(loadNext)
          })
          return
        }
        if (signal.aborted) return
        if ('empty' in result) {
          setView({ kind: 'empty' })
          return
        }
        if (mode === 'resolve') onDisagreement?.(result.frame_reading_id)
        setView({
          kind: 'frame',
          frame: result,
          url: null,
          saving: null,
          imageStatus: null,
          failedAt: null,
          retryLabel: null
        })
        loadImage(result, signal)
      }
      void read()
    },
    [sourceId, mode, onDisagreement, loadImage, startRun]
  )

  useEffect(() => {
    startRun(loadNext)
  }, [startRun, loadNext])

  // After a label posts, the next frame's heading takes focus in reading order.
  const frameId = view.kind === 'frame' ? view.frame.frame_reading_id : null
  useEffect(() => {
    if (frameId && previousFrame.current && frameId !== previousFrame.current) headingRef.current?.focus()
    if (frameId) previousFrame.current = frameId
  }, [frameId])

  // The last label empties the queue: the answer buttons that held focus are gone, so the heading takes it.
  useEffect(() => {
    if ((view.kind === 'empty' || view.kind === 'not-labeller') && previousFrame.current) headingRef.current?.focus()
  }, [view.kind])

  const vote = useCallback(
    (frame: ProbationFrame, label: LabelValue) => {
      const post = async (signal: AbortSignal) => {
        setView({
          kind: 'frame',
          frame,
          url: objectUrl.current,
          saving: label,
          imageStatus: null,
          failedAt: null,
          retryLabel: null
        })
        try {
          const saved = await apiFetch('createProbationLabel', {
            params: { id: sourceId },
            body: { frame_reading_id: frame.frame_reading_id, label },
            signal
          })
          if (signal.aborted) return
          onStatus(saved.probation)
          if (mode === 'resolve') onResolved?.(frame.frame_reading_id)
          startRun(loadNext)
        } catch {
          if (signal.aborted) return
          setView({
            kind: 'frame',
            frame,
            url: objectUrl.current,
            saving: null,
            imageStatus: null,
            failedAt: null,
            retryLabel: () => vote(frame, label)
          })
        }
      }
      startRun(post)
    },
    [sourceId, mode, onStatus, onResolved, startRun, loadNext]
  )

  const retryImage = useCallback(
    (frame: ProbationFrame) => startRun((signal) => loadImage(frame, signal)),
    [startRun, loadImage]
  )

  const heading = t(mode === 'resolve' ? 'probation.resolve_heading' : 'probation.label_heading', {}, locale)
  const headingId = `${mode}-frame-heading`
  const retry = (onClick: () => void) => (
    <Button variant="outline" onClick={onClick}>
      {t('probation.retry', {}, locale)}
    </Button>
  )

  return (
    <section aria-labelledby={headingId} className="probation-labeller flex flex-col gap-gap">
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className="type-section outline-none">
        {heading}
      </h2>
      {view.kind === 'frame' && view.imageStatus !== null ? (
        <div className="probation-failure">
          <SourceError
            source={t('probation.source_frame', { time: formatTime(view.frame.observed_at, locale) }, locale)}
            status={view.imageStatus === 0 ? null : view.imageStatus}
            at={view.failedAt}
            retry={retry(() => retryImage(view.frame))}
            locale={locale}
          />
        </div>
      ) : view.kind === 'frame' || view.kind === 'loading' ? (
        <div className="grid gap-gap lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          {view.kind === 'frame' && view.url ? (
            // A fetched object URL: next/image cannot optimise a blob, and the frame must render at true aspect.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="probation-frame block aspect-[4/3] h-auto w-full rounded-xl bg-card"
              src={view.url}
              // The masked canvas is 640 by 480: the frame keeps its space whatever the file's own size says.
              width={640}
              height={480}
              alt={t(
                'probation.frame_alt',
                {
                  date: formatDate(view.frame.observed_at, locale),
                  time: formatTime(view.frame.observed_at, locale)
                },
                locale
              )}
            />
          ) : (
            <Skeleton className={FRAME_SKELETON} />
          )}
          {view.kind === 'loading' ? (
            <div className="flex flex-col gap-gap">
              <p role="status" className="sr-only">
                {t('probation.loading_frame', {}, locale)}
              </p>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-1" aria-hidden="true">
                <Skeleton className="h-14 rounded-full" />
                <Skeleton className="h-14 rounded-full" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-gap">
              {view.kind === 'frame' && (
                <p className="type-body flex flex-col text-muted-foreground">
                  <span>{t('probation.captured', {}, locale)}</span>
                  <time dateTime={view.frame.observed_at} className="text-foreground">
                    {formatDateTime(view.frame.observed_at, locale)}
                  </time>
                </p>
              )}
              <div className="probation-actions grid grid-cols-2 gap-3 lg:grid-cols-1">
                {labelValues.map((label) => (
                  <Button
                    key={label}
                    variant="outline"
                    size="lg"
                    className={ANSWER}
                    disabled={view.kind !== 'frame' || view.url === null || view.saving !== null}
                    onClick={() => view.kind === 'frame' && vote(view.frame, label)}
                  >
                    {view.kind === 'frame' && view.saving === label
                      ? t('probation.saving', {}, locale)
                      : t(`probation.option_${label === 'landmark_visible' ? 'visible' : 'obscured'}`, {}, locale)}
                  </Button>
                ))}
              </div>
              {view.kind === 'frame' && !view.url && !view.saving && (
                <p role="status" className="type-small text-muted-foreground">
                  {t('probation.loading_frame', {}, locale)}
                </p>
              )}
              {view.kind === 'frame' && view.retryLabel && (
                <div className="probation-failure flex flex-col items-start gap-2">
                  <p role="alert" className="font-medium">
                    {t('probation.label_error', {}, locale)}
                  </p>
                  {retry(view.retryLabel)}
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
      {view.kind === 'read-failure' && (
        <div className="probation-failure">
          <SourceError
            source={t('probation.source_next_frame', {}, locale)}
            status={view.status}
            at={view.at}
            retry={retry(view.retry)}
            locale={locale}
          />
        </div>
      )}
      {/* Mounted before its message, so a screen reader announces it when the queue runs out. */}
      <div role="status">
        {(view.kind === 'empty' || view.kind === 'not-labeller') && (
          <p className="type-text max-w-prose rounded-xl bg-card p-pad">
            {t(
              view.kind === 'not-labeller'
                ? 'probation.not_labeller'
                : mode === 'resolve'
                  ? 'probation.empty_resolve'
                  : 'probation.empty_label',
              {},
              locale
            )}
          </p>
        )}
      </div>
    </section>
  )
}
