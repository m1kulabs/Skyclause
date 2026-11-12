'use client'

import { useState } from 'react'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Field, FieldLabel, FieldError, FieldGroup, FieldDescription } from '#ui/field'
import { Alert, AlertDescription } from '#ui/alert'
import { useUnsavedChangesGuard } from '../settings/set-7'
import { windowsApi } from './operations'
import { ApiProblem } from '../../lib/api-fetch'
import { t } from './catalogue'

export function ImportForm({
  projectId,
  onSaved,
  registerClose
}: {
  projectId: string
  onSaved: () => void
  registerClose: (guard: () => boolean) => void
}) {
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File>()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [errorField, setErrorField] = useState('url')
  const [failed, setFailed] = useState(false)
  const { guardNavigation } = useUnsavedChangesGuard(!!url || !!file)
  registerClose(() => !saving && guardNavigation(() => {}))
  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault()
        if (saving) return
        function invalid(field: string, message: string) {
          setErrorField(field)
          setError(message)
          requestAnimationFrame(() => document.getElementById(`window-${field}`)?.focus())
        }
        if (file && url) {
          invalid('url', 'choose_import')
          return
        }
        if (file) {
          if (!file.name.toLowerCase().endsWith('.ics') || file.size === 0 || file.size > 5 * 1024 * 1024) {
            invalid('file', 'file_invalid')
            return
          }
        } else {
          try {
            if (new URL(url).protocol !== 'https:') throw new Error()
          } catch {
            invalid('url', 'url_invalid')
            return
          }
        }
        setError('')
        setFailed(false)
        setSaving(true)
        try {
          const body = file ? { file: { name: file.name, content: await file.text() } } : { url }
          await windowsApi('createIcsFeed', { params: { id: projectId }, body })
          setUrl('')
          setFile(undefined)
          onSaved()
        } catch (failure) {
          if (failure instanceof ApiProblem && failure.status === 422) invalid(file ? 'file' : 'url', 'server_error')
          setFailed(true)
        } finally {
          setSaving(false)
        }
      }}
    >
      <FieldGroup>
        <Field data-invalid={!!error && errorField === 'url'}>
          <FieldLabel htmlFor="window-url">{t('windows.import_url')}</FieldLabel>
          <Input
            id="window-url"
            name="url"
            type="url"
            autoComplete="url"
            spellCheck={false}
            disabled={saving}
            value={url}
            onChange={(event) => {
              setUrl(event.target.value)
              setError('')
            }}
            aria-invalid={!!error && errorField === 'url'}
            aria-describedby={`window-import-help${error && errorField === 'url' ? ' window-url-error' : ''}`}
          />
          <FieldDescription id="window-import-help">{t('windows.import_help')}</FieldDescription>
          {error && errorField === 'url' && <FieldError id="window-url-error">{t(`windows.${error}`)}</FieldError>}
        </Field>
        <Field data-invalid={!!error && errorField === 'file'}>
          <FieldLabel htmlFor="window-file">{t('windows.import_file')}</FieldLabel>
          <Input
            id="window-file"
            name="file"
            type="file"
            accept=".ics,text/calendar"
            disabled={saving}
            onChange={(event) => {
              setFile(event.target.files?.[0])
              setError('')
            }}
            aria-invalid={!!error && errorField === 'file'}
            aria-describedby={error && errorField === 'file' ? 'window-file-error' : 'window-import-help'}
          />
          {error && errorField === 'file' && <FieldError id="window-file-error">{t(`windows.${error}`)}</FieldError>}
        </Field>
      </FieldGroup>
      {failed && (
        <Alert variant="destructive">
          <AlertDescription>{t('windows.save_error')}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={saving}>
        {t(saving ? 'windows.saving' : 'windows.import_save')}
      </Button>
      <p role="status">{saving ? t('windows.saving') : ''}</p>
    </form>
  )
}
