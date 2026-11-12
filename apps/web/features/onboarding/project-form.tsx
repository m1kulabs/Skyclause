'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Field, FieldError, FieldGroup, FieldLabel } from '#ui/field'
import { Input } from '#ui/input'
import { Button } from '#ui/button'
import { ApiProblem } from '../../lib/api-fetch'
import { onboardingApi } from './operations'
import { t } from './catalogue'
import styles from './onboarding.module.css'

type Draft = {
  name: string
  slug: string
  site_name: string
  site_lat: string
  site_lon: string
  time_zone: string
  packs: Array<'sky' | 'crowd'>
}
type FieldName = keyof Omit<Draft, 'packs'> | 'packs'
type Errors = Partial<Record<FieldName | 'form', string>>

const INITIAL: Draft = {
  name: '',
  slug: '',
  site_name: '',
  site_lat: '',
  site_lon: '',
  time_zone: 'Asia/Kuala_Lumpur',
  packs: ['sky']
}

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function validate(draft: Draft): Errors {
  const errors: Errors = {}
  for (const field of ['name', 'slug', 'site_name', 'site_lat', 'site_lon', 'time_zone'] as const) {
    if (!draft[field].trim()) errors[field] = 'required'
  }
  if (draft.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug)) errors.slug = 'invalid_slug'
  const latitude = Number(draft.site_lat)
  const longitude = Number(draft.site_lon)
  if (draft.site_lat && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90))
    errors.site_lat = 'invalid_coordinates'
  if (draft.site_lon && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))
    errors.site_lon = 'invalid_coordinates'
  if (draft.packs.length === 0) errors.packs = 'required'
  return errors
}

function apiSlugError(error: unknown): string | null {
  if (!(error instanceof ApiProblem)) return null
  const code = error.body.type?.split('/').pop()
  if (code === 'slug-reserved') return 'slug_reserved'
  if (code === 'slug-taken') return 'slug_taken'
  const field = error.body.field
  if (field === 'slug') {
    const reason = error.body.reason
    if (reason === 'reserved') return 'slug_reserved'
    if (reason === 'taken') return 'slug_taken'
  }
  return null
}

export function ProjectForm({ org }: { org: string }) {
  const router = useRouter()
  const [draft, setDraft] = useState(INITIAL)
  const [slugEdited, setSlugEdited] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const focusRequested = useRef(false)

  useLayoutEffect(() => {
    if (!focusRequested.current) return
    document.querySelector<HTMLElement>('[data-project-create] [aria-invalid="true"]')?.focus()
    focusRequested.current = false
  }, [errors])

  function change<K extends keyof Draft>(field: K, value: Draft[K]) {
    const next = { ...draft, [field]: value }
    if (field === 'name' && !slugEdited) next.slug = slugify(value as string)
    setDraft(next)
    const nextErrors = { ...errors }
    delete nextErrors[field]
    delete nextErrors.form
    if (field === 'name' && !slugEdited) delete nextErrors.slug
    setErrors(nextErrors)
  }

  function fail(next: Errors) {
    focusRequested.current = true
    setErrors(next)
  }

  return (
    <form
      className={styles.projectForm}
      data-project-create
      noValidate
      onSubmit={async (event) => {
        event.preventDefault()
        if (saving) return
        const nextErrors = validate(draft)
        if (Object.keys(nextErrors).length) {
          fail(nextErrors)
          return
        }
        setSaving(true)
        setErrors({})
        try {
          const project = await onboardingApi('createProject', {
            params: { org },
            body: {
              name: draft.name.trim(),
              slug: draft.slug.trim(),
              site_name: draft.site_name.trim(),
              site_lat: Number(draft.site_lat),
              site_lon: Number(draft.site_lon),
              time_zone: draft.time_zone.trim(),
              packs: draft.packs
            }
          })
          const prefix = `/${encodeURIComponent(org)}/${encodeURIComponent(project.slug)}/settings/packs`
          router.push(draft.packs.includes('crowd') ? `${prefix}?pack=crowd` : prefix)
        } catch (error) {
          const slugError = apiSlugError(error)
          if (slugError) fail({ slug: slugError })
          else fail({ form: 'save_error' })
        } finally {
          setSaving(false)
        }
      }}
    >
      <FieldGroup inert={saving}>
        <div className={styles.fieldsGrid}>
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="project-name">{t('onboarding.project_name')}</FieldLabel>
            <Input
              id="project-name"
              name="name"
              autoComplete="organization"
              maxLength={200}
              value={draft.name}
              onChange={(event) => change('name', event.target.value)}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'project-name-error' : undefined}
            />
            {errors.name && <FieldError id="project-name-error">{t(`onboarding.${errors.name}`)}</FieldError>}
          </Field>
          <Field data-invalid={!!errors.slug}>
            <FieldLabel htmlFor="project-slug">{t('onboarding.project_slug')}</FieldLabel>
            <Input
              id="project-slug"
              name="slug"
              autoComplete="off"
              spellCheck={false}
              maxLength={80}
              value={draft.slug}
              onChange={(event) => {
                setSlugEdited(true)
                change('slug', event.target.value)
              }}
              aria-invalid={!!errors.slug}
              aria-describedby={errors.slug ? 'project-slug-error' : undefined}
            />
            {errors.slug && <FieldError id="project-slug-error">{t(`onboarding.${errors.slug}`)}</FieldError>}
          </Field>
          <Field className={styles.wideField} data-invalid={!!errors.site_name}>
            <FieldLabel htmlFor="project-site-name">{t('onboarding.site_name')}</FieldLabel>
            <Input
              id="project-site-name"
              name="site_name"
              autoComplete="organization-title"
              maxLength={200}
              value={draft.site_name}
              onChange={(event) => change('site_name', event.target.value)}
              aria-invalid={!!errors.site_name}
              aria-describedby={errors.site_name ? 'project-site-name-error' : undefined}
            />
            {errors.site_name && (
              <FieldError id="project-site-name-error">{t(`onboarding.${errors.site_name}`)}</FieldError>
            )}
          </Field>
          <Field data-invalid={!!errors.site_lat}>
            <FieldLabel htmlFor="project-latitude">{t('onboarding.latitude')}</FieldLabel>
            <Input
              id="project-latitude"
              name="site_lat"
              type="number"
              inputMode="decimal"
              autoComplete="off"
              step="any"
              value={draft.site_lat}
              onChange={(event) => change('site_lat', event.target.value)}
              aria-invalid={!!errors.site_lat}
              aria-describedby={errors.site_lat ? 'project-latitude-error' : undefined}
            />
            {errors.site_lat && (
              <FieldError id="project-latitude-error">{t(`onboarding.${errors.site_lat}`)}</FieldError>
            )}
          </Field>
          <Field data-invalid={!!errors.site_lon}>
            <FieldLabel htmlFor="project-longitude">{t('onboarding.longitude')}</FieldLabel>
            <Input
              id="project-longitude"
              name="site_lon"
              type="number"
              inputMode="decimal"
              autoComplete="off"
              step="any"
              value={draft.site_lon}
              onChange={(event) => change('site_lon', event.target.value)}
              aria-invalid={!!errors.site_lon}
              aria-describedby={errors.site_lon ? 'project-longitude-error' : undefined}
            />
            {errors.site_lon && (
              <FieldError id="project-longitude-error">{t(`onboarding.${errors.site_lon}`)}</FieldError>
            )}
          </Field>
          <Field className={styles.wideField} data-invalid={!!errors.time_zone}>
            <FieldLabel htmlFor="project-time-zone">{t('onboarding.time_zone')}</FieldLabel>
            <Input
              id="project-time-zone"
              name="time_zone"
              autoComplete="off"
              value={draft.time_zone}
              onChange={(event) => change('time_zone', event.target.value)}
              aria-invalid={!!errors.time_zone}
              aria-describedby={errors.time_zone ? 'project-time-zone-error' : undefined}
            />
            {errors.time_zone && (
              <FieldError id="project-time-zone-error">{t(`onboarding.${errors.time_zone}`)}</FieldError>
            )}
          </Field>
        </div>
        <Field data-invalid={!!errors.packs}>
          <FieldLabel>{t('onboarding.packs')}</FieldLabel>
          <div className={styles.packChoices}>
            {(['sky', 'crowd'] as const).map((pack) => (
              <label className={styles.checkLabel} key={pack}>
                <input
                  type="checkbox"
                  className="native-check"
                  name="packs"
                  value={pack}
                  checked={draft.packs.includes(pack)}
                  onChange={(event) => {
                    const selected = event.target.checked
                      ? [...draft.packs, pack]
                      : draft.packs.filter((value) => value !== pack)
                    change('packs', selected)
                  }}
                  aria-invalid={!!errors.packs}
                />
                <span>{t(`onboarding.${pack}`)}</span>
              </label>
            ))}
          </div>
          {errors.packs && <FieldError>{t(`onboarding.${errors.packs}`)}</FieldError>}
        </Field>
      </FieldGroup>
      <div className={styles.formActions}>
        {errors.form && (
          <p className={styles.error} role="alert">
            {t(`onboarding.${errors.form}`)}
          </p>
        )}
        <Button type="submit" disabled={saving}>
          {saving ? t('onboarding.saving') : t('onboarding.create_project')}
        </Button>
      </div>
    </form>
  )
}

export default ProjectForm
