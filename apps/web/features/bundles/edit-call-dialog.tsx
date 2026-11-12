'use client'

import { useState, type FormEvent } from 'react'
import type { Notice } from '@skyclause/contracts'
import { formatNumber } from '@skyclause/i18n/format'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '#ui/dialog'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Textarea } from '#ui/textarea'
import { Label } from '#ui/label'
import type { CallDetail } from './operations'
import type { Decision } from './model'
import { callName } from './call-review'
import { t, type Locale } from './i18n'

/** Lists never render more than 50 rows: the recipients' checkboxes page through 50 at a time. */
const PAGE = 50

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id) => b.includes(id))

export function EditCallDialog({
  call,
  decision,
  onClose,
  onSave,
  locale = 'en'
}: {
  call: CallDetail
  decision: Decision
  onClose: () => void
  onSave: (decision: Decision) => void
  locale?: Locale
}) {
  const initialNotices = decision.notices ?? call.notices
  const initialRecipients = decision.recipients ?? call.recipients
  const [notices, setNotices] = useState<Notice[]>(initialNotices)
  const [recipients, setRecipients] = useState(initialRecipients)
  const [missing, setMissing] = useState<string[]>([])
  const [page, setPage] = useState(0)
  const name = callName(call, locale)
  const dirty =
    !same(recipients, initialRecipients) ||
    notices.some(
      (notice, index) =>
        notice.subject !== initialNotices[index]?.subject || notice.body !== initialNotices[index]?.body
    )
  const change = (index: number, key: 'body' | 'subject', value: string) => {
    setNotices((items) => items.map((notice, i) => (i === index ? { ...notice, [key]: value } : notice)))
    setMissing((items) => items.filter((id) => id !== `${key}-${index}`))
  }
  // Esc, the backdrop and Cancel all leave through here: edited wording is never dropped without a word.
  const dismiss = () => {
    if (!dirty || window.confirm(t('bundles.discard_edits', { name }, locale))) onClose()
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const empty = notices.flatMap((notice, index) => [
      ...(notice.subject.trim() ? [] : [`subject-${index}`]),
      ...(notice.body.trim() ? [] : [`body-${index}`])
    ])
    setMissing(empty)
    if (empty.length) {
      event.currentTarget.querySelector<HTMLElement>(`#${CSS.escape(`${empty[0]}-${call.id}`)}`)?.focus()
      return
    }
    onSave({ ...decision, action: 'edit', notices, recipients })
    onClose()
  }
  const pages = Math.ceil(call.recipients.length / PAGE)
  const current = Math.min(page, Math.max(0, pages - 1))
  const shown = call.recipients.slice(current * PAGE, current * PAGE + PAGE)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) dismiss()
      }}
    >
      <DialogContent className="bundle-edit" showCloseButton={false} lang={locale}>
        <DialogHeader>
          <DialogTitle>{t('bundles.edit_title', { name }, locale)}</DialogTitle>
          <DialogDescription>{t('bundles.edit_help', {}, locale)}</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={submit}>
          {notices.map((notice, index) => {
            const language = t(`bundles.language.${notice.language}`, {}, locale)
            const field = (key: 'subject' | 'body') => {
              const id = `${key}-${index}-${call.id}`
              const invalid = missing.includes(`${key}-${index}`)
              return { id, invalid, error: `${id}-error` }
            }
            const subject = field('subject')
            const body = field('body')
            return (
              <fieldset key={notice.language} lang={notice.language}>
                <legend>{language}</legend>
                <Label htmlFor={subject.id}>{t('bundles.subject', { language }, locale)}</Label>
                <Input
                  id={subject.id}
                  name={`subject-${notice.language}`}
                  autoComplete="off"
                  required
                  value={notice.subject}
                  maxLength={120}
                  aria-invalid={subject.invalid || undefined}
                  aria-describedby={subject.invalid ? subject.error : undefined}
                  onChange={(event) => change(index, 'subject', event.target.value)}
                />
                {subject.invalid && (
                  <p id={subject.error} className="bundle-field-error">
                    {t('bundles.required_subject', { language }, locale)}
                  </p>
                )}
                <Label htmlFor={body.id}>{t('bundles.body', { language }, locale)}</Label>
                <Textarea
                  id={body.id}
                  name={`body-${notice.language}`}
                  autoComplete="off"
                  required
                  value={notice.body}
                  maxLength={2000}
                  aria-invalid={body.invalid || undefined}
                  aria-describedby={body.invalid ? body.error : undefined}
                  onChange={(event) => change(index, 'body', event.target.value)}
                />
                {body.invalid && (
                  <p id={body.error} className="bundle-field-error">
                    {t('bundles.required_body', { language }, locale)}
                  </p>
                )}
              </fieldset>
            )
          })}
          <fieldset>
            <legend>{t('bundles.recipients', { count: formatNumber(recipients.length, locale) }, locale)}</legend>
            {shown.map((recipient) => (
              <label className="bundle-recipient" key={recipient}>
                <input
                  type="checkbox"
                  className="native-check"
                  name="recipients"
                  value={recipient}
                  checked={recipients.includes(recipient)}
                  onChange={(event) =>
                    setRecipients((items) =>
                      event.target.checked ? [...items, recipient] : items.filter((item) => item !== recipient)
                    )
                  }
                />
                <span translate="no">{recipient}</span>
              </label>
            ))}
            {pages > 1 && (
              <div className="bundle-recipient-pager">
                <p role="status" data-numeric>
                  {t(
                    'bundles.recipients_page',
                    {
                      from: formatNumber(current * PAGE + 1, locale),
                      to: formatNumber(current * PAGE + shown.length, locale),
                      count: formatNumber(call.recipients.length, locale)
                    },
                    locale
                  )}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={current === 0}
                  onClick={() => setPage(current - 1)}
                >
                  {t('bundles.recipients_previous', {}, locale)}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={current >= pages - 1}
                  onClick={() => setPage(current + 1)}
                >
                  {t('bundles.recipients_next', {}, locale)}
                </Button>
              </div>
            )}
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={dismiss}>
              {t('bundles.cancel', {}, locale)}
            </Button>
            <Button type="submit">{t('bundles.save', {}, locale)}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
