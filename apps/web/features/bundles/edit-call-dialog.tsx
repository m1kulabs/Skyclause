'use client'

import { useState } from 'react'
import type { Notice } from '@skyclause/contracts'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '#ui/dialog'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Textarea } from '#ui/textarea'
import { Label } from '#ui/label'
import type { CallDetail } from './operations'
import type { Decision } from './model'
import { t } from './i18n'

export function EditCallDialog({
  call,
  decision,
  onClose,
  onSave
}: {
  call: CallDetail
  decision: Decision
  onClose: () => void
  onSave: (decision: Decision) => void
}) {
  const [notices, setNotices] = useState<Notice[]>(decision.notices ?? call.notices)
  const [recipients, setRecipients] = useState(decision.recipients ?? call.recipients)
  const change = (index: number, key: 'body' | 'subject', value: string) =>
    setNotices((items) => items.map((notice, i) => (i === index ? { ...notice, [key]: value } : notice)))
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="bundle-edit" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {t('bundles.edit_title', { name: call.window?.title ?? t('bundles.call', { id: call.id }) })}
          </DialogTitle>
          <DialogDescription>{t('bundles.edit_help')}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            onSave({ ...decision, action: 'edit', notices, recipients })
            onClose()
          }}
        >
          {notices.map((notice, index) => (
            <fieldset key={notice.language} lang={notice.language}>
              <legend>{t(`bundles.language.${notice.language}`)}</legend>
              <Label htmlFor={`subject-${call.id}-${index}`}>
                {t('bundles.subject', { language: t(`bundles.language.${notice.language}`) })}
              </Label>
              <Input
                id={`subject-${call.id}-${index}`}
                name={`subject-${notice.language}`}
                autoComplete="off"
                value={notice.subject}
                maxLength={120}
                onChange={(event) => change(index, 'subject', event.target.value)}
              />
              <Label htmlFor={`body-${call.id}-${index}`}>
                {t('bundles.body', { language: t(`bundles.language.${notice.language}`) })}
              </Label>
              <Textarea
                id={`body-${call.id}-${index}`}
                name={`body-${notice.language}`}
                autoComplete="off"
                value={notice.body}
                maxLength={2000}
                onChange={(event) => change(index, 'body', event.target.value)}
              />
            </fieldset>
          ))}
          <fieldset>
            <legend>{t('bundles.recipients', { count: recipients.length })}</legend>
            {call.recipients.map((recipient) => (
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
                <span>{recipient}</span>
              </label>
            ))}
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('bundles.cancel')}
            </Button>
            <Button type="submit">{t('bundles.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
