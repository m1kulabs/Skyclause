'use client'

import { useCallback, useState, type FormEvent } from 'react'
import type { Grade } from '@skyclause/contracts'
import { formatNumber } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Skeleton } from '#ui/skeleton'
import { Textarea } from '#ui/textarea'
import { t } from './catalogue'
import { apiFetch, allPages, type Review } from './operations'
import { EmptyBlock, Failure, outcomeName } from './presentation'
import type { Locale } from './model'
import { useRead } from './use-read'

function Explanation({
  item,
  grade,
  canEdit,
  locale,
  org,
  onSaved
}: {
  item?: Review
  grade: Grade
  canEdit: boolean
  locale: Locale
  org: string
  onSaved: (id: string, explanation: string) => void
}) {
  const [text, setText] = useState(item?.explanation ?? '')
  const [saved, setSaved] = useState(item?.explanation ?? '')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const window = grade.window_id ?? grade.night_id ?? grade.id
  const label = t('analysis.explanation', { window }, locale)
  const explained = !!saved.trim()
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
          <h3 translate="no">{window}</h3>
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
          {status === 'saved' && <p role="status">{t('analysis.saved', {}, locale)}</p>}
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
  locale
}: {
  projectId: string
  org: string
  grades: Grade[]
  canEdit: boolean
  locale: Locale
}) {
  const read = useCallback(
    (signal: AbortSignal) =>
      allPages((cursor) => apiFetch('listReviewItems', { org, params: { id: projectId }, query: { cursor }, signal })),
    [org, projectId]
  )
  const result = useRead(read)
  // Explanations saved here count at once; the list keeps its order so nothing jumps under the cursor.
  const [savedHere, setSavedHere] = useState<Record<string, string>>({})
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
  const total = reviews.length + missing.length
  const done = reviews.filter((item) => (savedHere[item.id] ?? item.explanation).trim()).length
  return (
    <section aria-labelledby="analysis-review-title" className="analysis-review">
      <div className="analysis-section-head">
        <h2 id="analysis-review-title">
          {t('analysis.reviewTitle', {}, locale)}
          <span className="analysis-n" data-numeric>
            {t('analysis.n', { n: formatNumber(total, locale) }, locale)}
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
          {reviews.map((item) => (
            <Explanation
              key={item.id}
              item={item}
              grade={item.grade}
              canEdit={canEdit}
              locale={locale}
              org={org}
              onSaved={(id, explanation) => setSavedHere((previous) => ({ ...previous, [id]: explanation }))}
            />
          ))}
          {missing.map((grade) => (
            <Explanation key={grade.id} grade={grade} canEdit={false} locale={locale} org={org} onSaved={() => {}} />
          ))}
        </ol>
      ) : (
        <EmptyBlock message="reviewEmpty" locale={locale} />
      )}
    </section>
  )
}
