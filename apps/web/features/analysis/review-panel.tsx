'use client'

import { useCallback, useState, type FormEvent } from 'react'
import type { Grade } from '@skyclause/contracts'
import { Button } from '#ui/button'
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
  org
}: {
  item?: Review
  grade: Grade
  canEdit: boolean
  locale: Locale
  org: string
}) {
  const [text, setText] = useState(item?.explanation ?? '')
  const [saved, setSaved] = useState(item?.explanation ?? '')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const window = grade.window_id ?? grade.night_id ?? grade.id
  const label = t('analysis.explanation', { window }, locale)
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!item || !canEdit || status === 'saving') return
    setStatus('saving')
    try {
      const updated = await apiFetch('updateReviewItem', { org, params: { id: item.id }, body: { explanation: text } })
      setText(updated.explanation)
      setSaved(updated.explanation)
      setStatus('saved')
    } catch {
      setStatus('error')
    }
  }
  return (
    <form onSubmit={(event) => void save(event)} className="analysis-review-item">
      <h3>{window}</h3>
      <p>{outcomeName(grade.outcome, grade.no_call, locale)}</p>
      <label htmlFor={`explanation-${grade.id}`}>{label}</label>
      <Textarea
        id={`explanation-${grade.id}`}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          setStatus('idle')
        }}
        readOnly={!canEdit || !item}
        disabled={status === 'saving'}
      />
      {!item ? (
        <p>{t('analysis.reviewMissing', {}, locale)}</p>
      ) : canEdit ? (
        <Button
          type="submit"
          variant="outline"
          disabled={status === 'saving' || (text === saved && status !== 'error')}
        >
          {t(status === 'saving' ? 'analysis.saving' : 'analysis.save', {}, locale)}
        </Button>
      ) : (
        <p>{t('analysis.readOnly', {}, locale)}</p>
      )}
      {status === 'saved' && <p role="status">{t('analysis.saved', {}, locale)}</p>}
      {status === 'error' && <p role="alert">{t('analysis.saveFailed', {}, locale)}</p>}
    </form>
  )
}

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
  if (result.status === 'loading') return <p role="status">{t('analysis.loading', {}, locale)}</p>
  if (result.status === 'error')
    return <Failure operation={t('analysis.reviewTitle', {}, locale)} error={result.error} locale={locale} />
  const reviews = result.value
  const missing = grades.filter((grade) => grade.no_call && !reviews.some((item) => item.grade_id === grade.id))
  return (
    <section aria-labelledby="analysis-review-title">
      <h2 id="analysis-review-title">{t('analysis.reviewTitle', {}, locale)}</h2>
      <p>{t('analysis.n', { n: reviews.length + missing.length }, locale)}</p>
      {reviews.map((item) => (
        <Explanation key={item.id} item={item} grade={item.grade} canEdit={canEdit} locale={locale} org={org} />
      ))}
      {missing.map((grade) => (
        <Explanation key={grade.id} grade={grade} canEdit={false} locale={locale} org={org} />
      ))}
      {!reviews.length && !missing.length && <EmptyBlock message="reviewEmpty" locale={locale} />}
    </section>
  )
}
