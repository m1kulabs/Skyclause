'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDate, formatDateTime, formatTime } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
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
  | { kind: 'frame'; frame: ProbationFrame; url: string | null; saving: LabelValue | null; imageStatus: number | null }
  | { kind: 'empty' }
  | { kind: 'not-labeller' }
  | { kind: 'failure'; key: string; vars?: Record<string, string | number>; retry: () => void }

function statusKey(
  view: View,
  mode: LabellerMode,
  locale: 'en' | 'ms'
): { key: string; vars?: Record<string, string | number> } {
  switch (view.kind) {
    case 'loading':
      return { key: 'probation.loading_frame' }
    case 'frame':
      if (view.imageStatus !== null)
        return {
          key: 'probation.frame_error',
          vars: { time: formatTime(view.frame.observed_at, locale), status: view.imageStatus }
        }
      return view.saving ? { key: 'probation.saving' } : { key: 'probation.loading_frame' }
    case 'empty':
      return { key: mode === 'resolve' ? 'probation.empty_resolve' : 'probation.empty_label' }
    case 'not-labeller':
      return { key: 'probation.not_labeller' }
    case 'failure':
      return { key: view.key, vars: view.vars }
  }
}

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
          setView({ kind: 'frame', frame, url, saving: null, imageStatus: null })
          return
        }
      } catch {
        if (signal.aborted) return
        imageStatus = imageStatus ?? 0
      }
      if (signal.aborted) return
      // A network failure has no HTTP status; surface it as a failed frame load.
      setView({ kind: 'frame', frame, url: null, saving: null, imageStatus })
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
            kind: 'failure',
            key: 'probation.next_error',
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
        setView({ kind: 'frame', frame: result, url: null, saving: null, imageStatus: null })
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

  const vote = useCallback(
    (frame: ProbationFrame, label: LabelValue) => {
      const post = async (signal: AbortSignal) => {
        setView({ kind: 'frame', frame, url: objectUrl.current, saving: label, imageStatus: null })
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
          setView({ kind: 'failure', key: 'probation.label_error', retry: () => vote(frame, label) })
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

  const status = statusKey(view, mode, locale)
  const heading = t(mode === 'resolve' ? 'probation.resolve_heading' : 'probation.label_heading', {}, locale)
  const headingId = `${mode}-frame-heading`

  return (
    <section aria-labelledby={headingId} className="probation-labeller">
      <h2 id={headingId} ref={headingRef} tabIndex={-1}>
        {heading}
      </h2>
      {view.kind === 'frame' && (
        <>
          <p className="probation-datetime">
            <time dateTime={view.frame.observed_at}>{formatDateTime(view.frame.observed_at, locale)}</time>
          </p>
          {view.url ? (
            // A fetched object URL: next/image cannot optimise a blob, and the frame must render at true aspect.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="probation-frame"
              src={view.url}
              alt={t('probation.frame_alt', {
                date: formatDate(view.frame.observed_at, locale),
                time: formatTime(view.frame.observed_at, locale)
              })}
            />
          ) : view.imageStatus !== null ? (
            <div className="probation-failure">
              <p role="status">
                {t('probation.frame_error', {
                  time: formatTime(view.frame.observed_at, locale),
                  status: view.imageStatus
                })}
              </p>
              <Button variant="outline" onClick={() => retryImage(view.frame)}>
                {t('probation.retry', {}, locale)}
              </Button>
            </div>
          ) : null}
          <div className="probation-actions">
            {labelValues.map((label) => (
              <Button
                key={label}
                variant="outline"
                className="transition-transform"
                disabled={view.url === null || view.saving !== null}
                onClick={() => vote(view.frame, label)}
              >
                {view.saving === label
                  ? t('probation.saving', {}, locale)
                  : t(`probation.option_${label === 'landmark_visible' ? 'visible' : 'obscured'}`, {}, locale)}
              </Button>
            ))}
          </div>
        </>
      )}
      {view.kind === 'empty' && <p role="status">{t(status.key, {}, locale)}</p>}
      {view.kind === 'not-labeller' && <p role="status">{t(status.key, {}, locale)}</p>}
      {view.kind === 'failure' && (
        <div className="probation-failure">
          <p role="status">{t(view.key, view.vars, locale)}</p>
          <Button variant="outline" onClick={view.retry}>
            {t('probation.retry', {}, locale)}
          </Button>
        </div>
      )}
      {view.kind === 'loading' && <p role="status">{t('probation.loading_frame', {}, locale)}</p>}
      {view.kind === 'frame' && !view.url && view.imageStatus === null && !view.saving && (
        <p role="status">{t('probation.loading_frame', {}, locale)}</p>
      )}
    </section>
  )
}
