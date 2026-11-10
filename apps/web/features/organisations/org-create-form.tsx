'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Field, FieldLabel, FieldError, FieldGroup, FieldDescription } from '#ui/field'
import { Alert, AlertDescription } from '#ui/alert'
import { ApiProblem } from '../../lib/api-fetch'
import { t } from './catalogue'
import { apiFetch } from './operations'
import { slugErrorMessage, suggestSlug, validateSlugInput, type SlugError } from './slug'

/** `/new`: name plus an editable slug suggested from it. Format and reserved errors show as you type; taken
 * (and a reserved slug that landed after typing) shows on submit, with focus moved to the field (ORG-1). */
export function OrgCreateForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [error, setError] = useState<Exclude<SlugError, null> | null>(null)
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const slugRef = useRef<HTMLInputElement>(null)

  const liveError = validateSlugInput(slug)
  const shown: Exclude<SlugError, null> | null = error ?? liveError

  function focusSlug() {
    requestAnimationFrame(() => slugRef.current?.focus())
  }

  return (
    <form
      noValidate
      aria-label={t('organisations.create.title')}
      onSubmit={async (event) => {
        event.preventDefault()
        if (saving) return
        const live = validateSlugInput(slug)
        if (live) {
          setError(live)
          focusSlug()
          return
        }
        setError(null)
        setFailed(false)
        setSaving(true)
        try {
          const created = await apiFetch('createOrganisation', { body: { name: name.trim(), slug } })
          router.push(`/${encodeURIComponent(created.slug)}/new`)
        } catch (failure) {
          if (failure instanceof ApiProblem && failure.status === 409) {
            const slugProblem = (failure.body.type as string | undefined) ?? ''
            setError(slugProblem.endsWith('/slug-taken') ? 'taken' : 'reserved')
            focusSlug()
          } else {
            setFailed(true)
          }
        } finally {
          setSaving(false)
        }
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="org-name">{t('organisations.create.name')}</FieldLabel>
          <Input
            id="org-name"
            name="name"
            type="text"
            autoComplete="organization"
            required
            minLength={1}
            disabled={saving}
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              if (!slugTouched) setSlug(suggestSlug(event.target.value))
            }}
            aria-describedby="org-name-help"
          />
          <FieldDescription id="org-name-help">{t('organisations.create.nameHint')}</FieldDescription>
        </Field>
        <Field data-invalid={shown !== null}>
          <FieldLabel htmlFor="org-slug">{t('organisations.create.slug')}</FieldLabel>
          <Input
            ref={slugRef}
            id="org-slug"
            name="slug"
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            required
            disabled={saving}
            value={slug}
            onChange={(event) => {
              setSlug(event.target.value.toLowerCase())
              setSlugTouched(true)
              setError(null)
            }}
            aria-invalid={shown !== null}
            aria-describedby={`org-slug-help${shown ? ' org-slug-error' : ''}`}
          />
          <FieldDescription id="org-slug-help">{t('organisations.create.slugHint')}</FieldDescription>
          {shown && <FieldError id="org-slug-error">{slugErrorMessage(shown, slug)}</FieldError>}
        </Field>
      </FieldGroup>
      {failed && (
        <Alert variant="destructive">
          <AlertDescription>{t('organisations.general.loadError')}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={saving || name.trim().length === 0 || slug.length === 0}>
        {t(saving ? 'organisations.create.creating' : 'organisations.create.submit')}
      </Button>
      <p role="status">{saving ? t('organisations.create.creating') : ''}</p>
    </form>
  )
}
