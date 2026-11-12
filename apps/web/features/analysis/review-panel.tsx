'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Grade } from '@skyclause/contracts'
import { formatDate, formatNumber } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Skeleton } from '#ui/skeleton'
import { Textarea } from '#ui/textarea'
import { t } from './catalogue'
import { apiFetch, allPages, type Review } from './operations'
import { EmptyBlock, Failure, outcomeName } from './presentation'
import type { Locale } from './model'
import { useRead } from './use-read'

/** Lists never render more than 50 rows: the review list shows 50 windows at a time. */
const PAGE = 50

/**
 * A graded window or night by its date and kind. A grade read without its date (the analysis and review reads carry
 * none) falls back to the last characters of its window's ID, never the whole ID.
 */
type DatedGrade = Grade & { local_date?: string; graded_at?: string }

export function gradedName(grade: DatedGrade, locale: Locale) {
  const night = !!grade.night_id
  const date = grade.local_date ?? grade.graded_at
  if (date) return t(night ? 'analysis.nightOn' : 'analysis.windowOn', { date: formatDate(date, locale) }, locale)
  const id = grade.window_id ?? grade.night_id ?? grade.id
  return t(night ? 'analysis.nightRef' : 'analysis.windowRef', { id: id.slice(-6) }, locale)
}

function Explanation({
  item,
  grade,
  canEdit,
  locale,
  org,
  onSaved,
  onDirty
}: {
  item?: Review
  grade: DatedGrade
  canEdit: boolean
  locale: Locale
  org: string
  onSaved: (id: string, explanation: string) => void
  onDirty: (id: string, dirty: boolean) => void
}) {
  const [text, setText] = useState(item?.explanation ?? '')
  const [saved, setSaved] = useState(item?.explanation ?? '')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const name = gradedName(grade, locale)
  const label = t('analysis.explanation', { window: name }, locale)
  const explained = !!saved.trim()
  const dirty = text !== saved
  useEffect(() => {
    onDirty(grade.id, dirty)
  }, [grade.id, dirty, onDirty])
  useEffect(() => () => onDirty(grade.id, false), [grade.id, onDirty])
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!item || !canEdit || status === 'saving') return
    setStatus('saving')
    try {
      const updated = await apiFetch('updateReviewItem', { org, params: { id: item.id }, body: { explanation: text } })
      setText(updated.explanation)
      setSaved(updated.explanation)
      setStatus('saved')
      onSaved(item.id, updated.explanation)
    } catch {
      setStatus('error')
    }
  }
  return (
    <li>
      <form
        onSubmit={(event) => void save(event)}
        className="analysis-review-item"
        data-explained={explained ? '' : undefined}
      >
        <div className="analysis-review-head">
          <h3>{name}</h3>
          <span className="analysis-review-state">
            <span className="analysis-review-mark" aria-hidden="true" />
            {t(explained ? 'analysis.explained' : 'analysis.toExplain', {}, locale)}
          </span>
        </div>
        <p>{outcomeName(grade.outcome, grade.no_call, locale)}</p>
        <label htmlFor={`explanation-${grade.id}`}>{label}</label>
        <Textarea
          id={`explanation-${grade.id}`}
          name="explanation"
          autoComplete="off"
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setStatus('idle')
          }}
          readOnly={!canEdit || !item}
          disabled={status === 'saving'}
        />
        <div className="analysis-review-foot">
          {!item ? (
            <p className="analysis-sub">{t('analysis.reviewMissing', {}, locale)}</p>
          ) : canEdit ? (
            <Button
              type="submit"
              variant="outline"
              disabled={status === 'saving' || (text === saved && status !== 'error')}
            >
              {t(status === 'saving' ? 'analysis.saving' : 'analysis.save', {}, locale)}
            </Button>
          ) : (
            <p className="analysis-sub">{t('analysis.readOnly', {}, locale)}</p>
          )}
          {/* Mounted before its words, so a save is announced. */}
          <p role="status">{status === 'saved' ? t('analysis.saved', {}, locale) : null}</p>
          {status === 'error' && <p role="alert">{t('analysis.saveFailed', {}, locale)}</p>}
        </div>
      </form>
    </li>
  )
}

/** ANL-2 and ANL-4: the windows to explain, unexplained first, with how many are done. */
export function ReviewPanel({
  projectId,
  org,
  grades,
  canEdit,
  locale,
  onDirtyChange,
  guardNavigation = (action) => {
    action()
    return true
  }
}: {
  projectId: string
  org: string
  /** The period's graded windows from the grades read, which carry the dates the review read lacks. */
  grades: DatedGrade[]
  canEdit: boolean
  locale: Locale
  /** Whether an explanation holds unsaved text, so the page can ask before it is lost. */
  onDirtyChange?: (dirty: boolean) => void
  /** Runs an action that would drop unsaved explanations, after asking. */
  guardNavigation?: (action: () => void) => boolean
}) {
  const read = useCallback(
    (signal: AbortSignal) =>
      allPages((cursor) => apiFetch('listReviewItems', { org, params: { id: projectId }, query: { cursor }, signal })),
    [org, projectId]
  )
  const result = useRead(read)
  // Explanations saved here count at once; the list keeps its order so nothing jumps under the cursor.
  const [savedHere, setSavedHere] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState<ReadonlySet<string>>(new Set())
  const [page, setPage] = useState(0)
  const onDirty = useCallback((id: string, value: boolean) => {
    setDirty((previous) => {
      if (previous.has(id) === value) return previous
      const next = new Set(previous)
      if (value) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])
  useEffect(() => {
    onDirtyChange?.(dirty.size > 0)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])
  if (result.status === 'loading')
    return (
      <div role="status" className="analysis-loading" data-analysis-loading>
        <span className="sr-only">{t('analysis.loading', {}, locale)}</span>
        <Skeleton className="h-6 w-56 rounded-full" aria-hidden="true" />
        <Skeleton className="h-24 w-full rounded-md" aria-hidden="true" />
      </div>
    )
  if (result.status === 'error')
    return (
      <Failure
        source={t('analysis.sources.review', {}, locale)}
        error={result.error}
        at={result.at}
        retry={result.retry}
        locale={locale}
      />
    )
  const reviews = [...result.value].sort((a, b) => Number(!!a.explanation.trim()) - Number(!!b.explanation.trim()))
  const missing = grades.filter((grade) => grade.no_call && !reviews.some((item) => item.grade_id === grade.id))
  const items = [
    ...reviews.map((item) => ({
      key: item.id,
      item,
      grade: { ...item.grade, ...grades.find((grade) => grade.id === item.grade.id) }
    })),
    ...missing.map((grade) => ({ key: grade.id, item: undefined, grade }))
  ]
  const total = items.length
  const done = reviews.filter((item) => (savedHere[item.id] ?? item.explanation).trim()).length
  const pages = Math.ceil(total / PAGE)
  const current = Math.min(page, Math.max(0, pages - 1))
  const shown = items.slice(current * PAGE, current * PAGE + PAGE)
  // Turning the page unmounts the explanations on it: unsaved text asks first.
  const turn = (to: number) => guardNavigation(() => setPage(to))
  return (
    <section aria-labelledby="analysis-review-title" className="analysis-review">
      <div className="analysis-section-head">
        <h2 id="analysis-review-title">
          {t('analysis.reviewTitle', {}, locale)}
          <span className="analysis-n" data-numeric>
            {t('analysis.reviewCount', { n: formatNumber(total, locale) }, locale)}
          </span>
        </h2>
        {total > 0 && (
          <div className="analysis-progress">
            <p data-numeric>
              {t('analysis.explainedOf', { done: formatNumber(done, locale), n: formatNumber(total, locale) }, locale)}
            </p>
            <svg width="100%" height="8" aria-hidden="true" className="analysis-interval">
              <rect x="0" y="0" width="100%" height="8" rx="4" className="analysis-interval-track" />
              {done > 0 && (
                <rect
                  x="0"
                  y="0"
                  width={`${(done / total) * 100}%`}
                  height="8"
                  rx="4"
                  className="analysis-interval-fill"
                />
              )}
            </svg>
          </div>
        )}
      </div>
      {total > 0 ? (
        <ol className="analysis-review-list">
          {shown.map(({ key, item, grade }) => (
            <Explanation
              key={key}
              item={item}
              grade={grade}
              canEdit={!!item && canEdit}
              locale={locale}
              org={org}
              onDirty={onDirty}
              onSaved={(id, explanation) => setSavedHere((previous) => ({ ...previous, [id]: explanation }))}
            />
          ))}
        </ol>
      ) : (
        <EmptyBlock message="reviewEmpty" locale={locale} />
      )}
      {pages > 1 && (
        <div className="analysis-pager">
          <p role="status" className="analysis-muted" data-numeric>
            {t(
              'analysis.rowsShown',
              {
                from: formatNumber(current * PAGE + 1, locale),
                to: formatNumber(current * PAGE + shown.length, locale),
                n: formatNumber(total, locale)
              },
              locale
            )}
          </p>
          <Button variant="outline" disabled={current === 0} onClick={() => turn(current - 1)}>
            {t('analysis.previousRows', {}, locale)}
          </Button>
          <Button variant="outline" disabled={current >= pages - 1} onClick={() => turn(current + 1)}>
            {t('analysis.nextRows', {}, locale)}
          </Button>
        </div>
      )}
    </section>
  )
}
