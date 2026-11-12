'use client'

import { useId, useRef, useState, type FormEvent } from 'react'
import { WEBHOOK_EVENT_TYPES, type WebhookEventType } from '@skyclause/contracts'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Checkbox } from '#ui/checkbox'
import { Field, FieldLabel, FieldGroup, FieldSet, FieldLegend, FieldError } from '#ui/field'
import { ApiProblem } from '../../lib/api-fetch'
import { apiFetch, type Endpoint, type WebhookProject } from './operations'
import { t } from './catalogue'

export function problemKey(error: unknown) {
  if (error instanceof ApiProblem) {
    const type = String(error.body.type ?? '')
      .split(/[/#:]/)
      .pop()
    if (type === 'unsafe-url') return 'unsafe_url'
    if (type === 'validation-failed') return 'validation_failed'
    if (type === 'webhook-unverified') return 'unverified'
    if (type === 'no-event-yet') return 'no_event'
  }
  return 'action_failed'
}

export function RegisterForm({
  org,
  projects,
  onCreated,
  onCancel
}: {
  org: string
  projects: WebhookProject[]
  onCreated: (endpoint: Endpoint, secret: string) => void
  onCancel?: () => void
}) {
  const id = useId()
  const urlRef = useRef<HTMLInputElement>(null)
  const eventsRef = useRef<HTMLButtonElement>(null)
  const projectRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<WebhookEventType[]>([])
  const [allProjects, setAllProjects] = useState(true)
  const [projectIds, setProjectIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const inFlight = useRef(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    if (!url.startsWith('https://')) {
      setError('https_required')
      urlRef.current?.focus()
      return
    }
    if (!events.length) {
      setError('events_required')
      eventsRef.current?.focus()
      return
    }
    if (!allProjects && !projectIds.length) {
      setError('projects_required')
      projectRef.current?.focus()
      return
    }
    inFlight.current = true
    setBusy(true)
    setError(undefined)
    try {
      const { secret, ...endpoint } = await apiFetch('createWebhook', {
        org,
        body: { url, events, project_ids: allProjects ? [] : projectIds }
      })
      onCreated(endpoint, secret)
      setUrl('')
      setEvents([])
      setProjectIds([])
      setAllProjects(true)
    } catch (caught) {
      setError(problemKey(caught))
      urlRef.current?.focus()
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  const urlError = error && !['events_required', 'projects_required'].includes(error)

  return (
    <form onSubmit={submit} aria-label={t('webhooks.register')} className="webhook-form">
      <FieldGroup>
        <Field data-invalid={!!urlError}>
          <FieldLabel htmlFor={`${id}-url`}>{t('webhooks.url')}</FieldLabel>
          <Input
            ref={urlRef}
            id={`${id}-url`}
            name="webhook-url"
            type="url"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            autoCapitalize="none"
            translate="no"
            required
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            aria-invalid={!!urlError}
            aria-describedby={urlError ? `${id}-url-error` : undefined}
          />
          {urlError && <FieldError id={`${id}-url-error`}>{t(`webhooks.${error}`)}</FieldError>}
        </Field>
        <FieldSet data-webhook-events aria-describedby={error === 'events_required' ? `${id}-events-error` : undefined}>
          <FieldLegend>{t('webhooks.events')}</FieldLegend>
          <div className="webhook-event-choices">
            {WEBHOOK_EVENT_TYPES.map((type, index) => (
              <Field key={type} orientation="horizontal">
                <Checkbox
                  ref={index === 0 ? eventsRef : undefined}
                  id={`${id}-${type}`}
                  name="webhook-events"
                  value={type}
                  checked={events.includes(type)}
                  onCheckedChange={(checked) =>
                    setEvents((previous) =>
                      checked ? [...previous, type] : previous.filter((value) => value !== type)
                    )
                  }
                  aria-invalid={error === 'events_required'}
                />
                <FieldLabel htmlFor={`${id}-${type}`} translate="no">
                  {t('webhooks.event_type', { type })}
                </FieldLabel>
              </Field>
            ))}
          </div>
          {error === 'events_required' && (
            <FieldError id={`${id}-events-error`}>{t('webhooks.events_required')}</FieldError>
          )}
        </FieldSet>
        <FieldSet>
          <FieldLegend>{t('webhooks.projects')}</FieldLegend>
          <Field orientation="horizontal">
            <input
              ref={projectRef}
              id={`${id}-all`}
              type="radio"
              className="native-check"
              name="webhook-project-scope"
              value="all"
              checked={allProjects}
              onChange={() => setAllProjects(true)}
            />
            <FieldLabel htmlFor={`${id}-all`}>{t('webhooks.all_projects')}</FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <input
              id={`${id}-chosen`}
              type="radio"
              className="native-check"
              name="webhook-project-scope"
              value="chosen"
              checked={!allProjects}
              onChange={() => setAllProjects(false)}
            />
            <FieldLabel htmlFor={`${id}-chosen`}>{t('webhooks.chosen_projects')}</FieldLabel>
          </Field>
          {!allProjects &&
            projects.map((project) => (
              <Field orientation="horizontal" key={project.id}>
                <Checkbox
                  id={`${id}-${project.id}`}
                  name="webhook-projects"
                  value={project.id}
                  checked={projectIds.includes(project.id)}
                  onCheckedChange={(checked) =>
                    setProjectIds((previous) =>
                      checked ? [...previous, project.id] : previous.filter((value) => value !== project.id)
                    )
                  }
                />
                <FieldLabel htmlFor={`${id}-${project.id}`}>{project.name}</FieldLabel>
              </Field>
            ))}
          {!allProjects && !projects.length && <p>{t('webhooks.no_projects')}</p>}
          {error === 'projects_required' && <FieldError>{t('webhooks.projects_required')}</FieldError>}
        </FieldSet>
        <div className="webhook-actions">
          <Button type="submit" disabled={busy} aria-busy={busy}>
            {t(busy ? 'webhooks.saving' : 'webhooks.save')}
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t('webhooks.cancel')}
            </Button>
          )}
        </div>
      </FieldGroup>
    </form>
  )
}
