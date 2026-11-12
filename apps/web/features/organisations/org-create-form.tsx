'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Field, FieldLabel, FieldError, FieldGroup, FieldDescription } from '#ui/field'
import { Alert, AlertDescription } from '#ui/alert'
import { ApiProblem } from '../../lib/api-fetch'
import { t, type Locale } from './catalogue'
import { apiFetch } from './operations'
import { slugErrorMessage, suggestSlug, validateSlugInput, type SlugError } from './slug'

/** `/new`: name plus an editable slug suggested from it. Format and reserved errors show as you type; taken
 * (and a reserved slug that landed after typing) shows on submit, with focus moved to the field (ORG-1). */
export function OrgCreateForm({ locale = 'en' }: { locale?: Locale }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [error, setError] = useState<Exclude<SlugError, null> | null>(null)
  const [failed, setFailed] = useState(false)
  const [nameMissing, setNameMissing] = useState(false)
  const [saving, setSaving] = useState(false)
  const slugRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const alertRef = useRef<HTMLDivElement>(null)

  // A failure that is not about a field has no field to focus: its alert takes focus instead.
  useEffect(() => {
    if (failed) alertRef.current?.focus()
  }, [failed])

  const liveError = validateSlugInput(slug)
  const shown: Exclude<SlugError, null> | null = error ?? liveError

  function focusSlug() {
    requestAnimationFrame(() => slugRef.current?.focus())
  }

  return (
    <form
      noValidate
      aria-label={t('organisations.create.title', {}, locale)}
      className="flex min-w-0 flex-col gap-6 rounded-xl bg-card p-5 max-sm:p-4"
      onSubmit={async (event) => {
        event.preventDefault()
        if (saving) return
        // Nothing is blocked while it is empty: a missing name or slug says what is missing, and where.
        if (!name.trim()) {
          setNameMissing(true)
          requestAnimationFrame(() => nameRef.current?.focus())
          return
        }
        const live = slug.length === 0 ? 'format' : validateSlugInput(slug)
        if (live) {
          setError(live)
          focusSlug()
          return
        }
        setError(null)
        setNameMissing(false)
        setFailed(false)
        setSaving(true)
        try {
          const created = await apiFetch('createOrganisation', { body: { name: name.trim(), slug } })
          // Busy until the next page takes over, so a second click cannot create it twice.
          router.push(`/${encodeURIComponent(created.slug)}/new`)
        } catch (failure) {
          if (failure instanceof ApiProblem && failure.status === 409) {
            const slugProblem = (failure.body.type as string | undefined) ?? ''
            setError(slugProblem.endsWith('/slug-taken') ? 'taken' : 'reserved')
            focusSlug()
          } else {
            setFailed(true)
          }
          setSaving(false)
        }
      }}
    >
      <FieldGroup>
        <Field data-invalid={nameMissing}>
          <FieldLabel htmlFor="org-name">{t('organisations.create.name', {}, locale)}</FieldLabel>
          <Input
            ref={nameRef}
            id="org-name"
            name="name"
            type="text"
            autoComplete="organization"
            required
            minLength={1}
            readOnly={saving}
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setNameMissing(false)
              if (!slugTouched) setSlug(suggestSlug(event.target.value))
            }}
            aria-invalid={nameMissing}
            aria-describedby={`org-name-help${nameMissing ? ' org-name-error' : ''}`}
          />
          <FieldDescription id="org-name-help">{t('organisations.create.nameHint', {}, locale)}</FieldDescription>
          {nameMissing && (
            <FieldError id="org-name-error">{t('organisations.create.nameRequired', {}, locale)}</FieldError>
          )}
        </Field>
        <Field data-invalid={shown !== null}>
          <FieldLabel htmlFor="org-slug">{t('organisations.create.slug', {}, locale)}</FieldLabel>
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
            readOnly={saving}
            value={slug}
            onChange={(event) => {
              setSlug(event.target.value.toLowerCase())
              setSlugTouched(true)
              setError(null)
            }}
            aria-invalid={shown !== null}
            aria-describedby={`org-slug-help${shown ? ' org-slug-error' : ''}`}
          />
          <FieldDescription id="org-slug-help">{t('organisations.create.slugHint', {}, locale)}</FieldDescription>
          {shown && <FieldError id="org-slug-error">{slugErrorMessage(shown, slug, locale)}</FieldError>}
        </Field>
      </FieldGroup>
      {failed && (
        <Alert variant="destructive" ref={alertRef} tabIndex={-1}>
          <AlertDescription>{t('organisations.create.failed', {}, locale)}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <p role="status" className="type-small text-muted-foreground">
          {saving ? t('organisations.create.creating', {}, locale) : ''}
        </p>
        <Button type="submit" disabled={saving}>
          {t(saving ? 'organisations.create.creating' : 'organisations.create.submit', {}, locale)}
        </Button>
      </div>
    </form>
  )
}
