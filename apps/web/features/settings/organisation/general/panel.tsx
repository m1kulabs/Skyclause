'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { t } from '@skyclause/i18n'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Skeleton } from '#ui/skeleton'
import { t as organisations } from '../../../organisations/catalogue'
import { apiFetch } from '../../../organisations/operations'
import { useUnsavedChangesGuard } from '../../set-7'
import {
  SettingsAside,
  SettingsField,
  SettingsLoading,
  SettingsParts,
  SettingsReadError,
  SettingsStatus,
  SettingsSummaryLine
} from '../../parts'
import { FieldGroup } from '#ui/field'
import '../../catalogue'

const NAME_LIMIT = 100

/** The organisation rename panel: the name is editable (`org.manage`), the slug is shown read-only. */
export default function Panel({ org, locale = 'en' }: { org: string; locale?: 'en' | 'ms' }) {
  const copy = (key: string, vars: Record<string, string | number> = {}) => t(`settings.general.${key}`, vars, locale)
  const [name, setName] = useState<string | null>(null)
  const [stored, setStored] = useState('')
  const [slug, setSlug] = useState('')
  const [failure, setFailure] = useState<{ error: unknown; at: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unchanged, setUnchanged] = useState(false)
  useUnsavedChangesGuard(name !== null && name.trim() !== stored, locale)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setFailure(null)
      try {
        const page = await apiFetch('listMyMemberships', { org, query: {}, signal })
        const membership = page.data.find((item) => item.org_slug === org)
        if (!membership) {
          setFailure({ error: null, at: new Date().toISOString() })
          return
        }
        setName(membership.org_name)
        setStored(membership.org_name)
        setSlug(membership.org_slug)
      } catch (cause) {
        if (!signal?.aborted) setFailure({ error: cause, at: new Date().toISOString() })
      }
    },
    [org]
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || name === null) return
    setSaved(false)
    setUnchanged(false)
    if (name.trim().length === 0) {
      setError(copy('nameRequired'))
      return
    }
    if (name.trim() === stored) {
      setError(null)
      setUnchanged(true)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const updated = await apiFetch('updateOrganisation', { org, body: { name: name.trim() } })
      setName(updated.name)
      setStored(updated.name)
      setSlug(updated.slug)
      setSaved(true)
    } catch {
      setError(copy('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (failure)
    return (
      <SettingsReadError
        source={copy('source')}
        error={failure.error}
        at={failure.at}
        locale={locale}
        onRetry={() => void load()}
      />
    )

  const loading = name === null

  return (
    <div aria-busy={loading || saving}>
      {!loading && (
        <SettingsAside>
          <SettingsSummaryLine label={copy('summaryName')}>{stored}</SettingsSummaryLine>
          <SettingsSummaryLine label={copy('summarySlug')}>{slug}</SettingsSummaryLine>
        </SettingsAside>
      )}
      <form noValidate onSubmit={save} aria-label={copy('title')}>
        <SettingsParts className="gap-6">
          <FieldGroup>
            <SettingsField
              label={organisations('organisations.general.name', {}, locale)}
              hint={copy('nameHint', { limit: NAME_LIMIT })}
              error={error}
            >
              {(aria) =>
                name === null ? (
                  <SettingsLoading locale={locale}>
                    <Skeleton className="h-10 w-full rounded-md" />
                  </SettingsLoading>
                ) : (
                  <Input
                    {...aria}
                    name="name"
                    type="text"
                    autoComplete="organization"
                    maxLength={NAME_LIMIT}
                    required
                    disabled={saving}
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value)
                      setSaved(false)
                      setUnchanged(false)
                      setError(null)
                    }}
                  />
                )
              }
            </SettingsField>
            <SettingsField
              label={organisations('organisations.general.slug', {}, locale)}
              hint={organisations('organisations.general.slugHint', {}, locale)}
            >
              {(aria) =>
                loading ? (
                  <Skeleton className="h-10 w-full rounded-md" />
                ) : (
                  <Input
                    {...aria}
                    name="slug"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={slug}
                    readOnly
                    aria-readonly
                  />
                )
              }
            </SettingsField>
          </FieldGroup>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={name === null || saving} aria-busy={saving}>
              {organisations(saving ? 'organisations.general.saving' : 'organisations.general.save', {}, locale)}
            </Button>
            {saved ? <SettingsStatus>{organisations('organisations.general.saved', {}, locale)}</SettingsStatus> : null}
            {unchanged ? <SettingsStatus>{copy('unchanged')}</SettingsStatus> : null}
          </div>
        </SettingsParts>
      </form>
    </div>
  )
}
