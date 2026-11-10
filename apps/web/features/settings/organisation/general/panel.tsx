'use client'

import { useEffect, useState } from 'react'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Field, FieldLabel, FieldDescription } from '#ui/field'
import { Alert, AlertDescription } from '#ui/alert'
import { t } from '../../../organisations/catalogue'
import { apiFetch } from '../../../organisations/operations'

/** The organisation rename panel: the name is editable (`org.manage`), the slug is shown read-only. */
export default function Panel({ org }: { org: string }) {
  const [name, setName] = useState<string | null>(null)
  const [slug, setSlug] = useState('')
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function load(signal?: AbortSignal) {
    setFailed(false)
    try {
      const page = await apiFetch('listMyMemberships', { org, query: {}, signal })
      const membership = page.data.find((item) => item.org_slug === org)
      if (!membership) {
        setFailed(true)
        return
      }
      setName(membership.org_name)
      setSlug(membership.org_slug)
    } catch {
      if (!signal?.aborted) setFailed(true)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [org])

  if (failed)
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('organisations.general.loadError')}</AlertDescription>
        <Button variant="outline" onClick={() => void load()}>
          {t('organisations.general.retry')}
        </Button>
      </Alert>
    )
  if (name === null) return <p role="status">{t('organisations.general.name')}</p>

  return (
    <form
      noValidate
      onSubmit={async (event) => {
        event.preventDefault()
        if (saving || name.trim().length === 0) return
        setSaving(true)
        setSaved(false)
        try {
          const updated = await apiFetch('updateOrganisation', { org, body: { name: name.trim() } })
          setName(updated.name)
          setSlug(updated.slug)
          setSaved(true)
        } finally {
          setSaving(false)
        }
      }}
    >
      <Field>
        <FieldLabel htmlFor="org-general-name">{t('organisations.general.name')}</FieldLabel>
        <Input
          id="org-general-name"
          name="name"
          type="text"
          autoComplete="organization"
          required
          disabled={saving}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setSaved(false)
          }}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="org-general-slug">{t('organisations.general.slug')}</FieldLabel>
        <Input id="org-general-slug" name="slug" type="text" value={slug} readOnly aria-readonly spellCheck={false} />
        <FieldDescription>{t('organisations.general.slugHint')}</FieldDescription>
      </Field>
      <Button type="submit" disabled={saving || name.trim().length === 0}>
        {t(saving ? 'organisations.general.saving' : 'organisations.general.save')}
      </Button>
      {saved && <p role="status">{t('organisations.general.saved')}</p>}
    </form>
  )
}
