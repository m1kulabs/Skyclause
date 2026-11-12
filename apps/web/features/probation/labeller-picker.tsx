'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '#ui/button'
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor
} from '#ui/combobox'
import { SourceError } from '../data-components'
import { ApiProblem } from '../../lib/api-fetch'
import { t } from './i18n'
import { apiFetch, type Member, type ProbationStatus } from './operations'

interface PickerProps {
  org: string
  sourceId: string
  status: ProbationStatus | null
  editable: boolean
  locale?: 'en' | 'ms'
  onStatus(status: ProbationStatus): void
}

function displayName(member: Member): string {
  return member.name.trim() || member.email
}

async function readMembers(org: string, signal: AbortSignal): Promise<Member[]> {
  const members: Member[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await apiFetch('listMembers', { params: { org }, query: { cursor }, signal })
    members.push(...page.data)
    cursor = page.next_cursor ?? undefined
    if (cursor && seen.has(cursor)) throw new Error('Repeated members cursor')
    if (cursor) seen.add(cursor)
  } while (cursor)
  return members
}

type MembersState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; members: Member[] }

export function LabellerPicker({ org, sourceId, status, editable, locale = 'en', onStatus }: PickerProps) {
  const [members, setMembers] = useState<MembersState>({ kind: 'loading' })
  const [selected, setSelected] = useState<string[]>(status?.labeller_ids ?? [])
  const [limitRefused, setLimitRefused] = useState(false)
  const [needTwo, setNeedTwo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const anchor = useComboboxAnchor()
  const actions = useRef<{ unmount(): void; close(): void } | null>(null)
  const [filter, setFilter] = useState('')

  const reload = useCallback(
    (signal: AbortSignal) => {
      setMembers({ kind: 'loading' })
      readMembers(org, signal).then(
        (list) => {
          if (!signal.aborted) setMembers({ kind: 'ready', members: list })
        },
        () => {
          if (!signal.aborted) setMembers({ kind: 'error' })
        }
      )
    },
    [org]
  )

  useEffect(() => {
    const controller = new AbortController()
    reload(controller.signal)
    return () => controller.abort()
  }, [reload])

  const byId = new Map(members.kind === 'ready' ? members.members.map((member) => [member.account_id, member]) : [])
  const readyMembers = members.kind === 'ready' ? members.members : []
  const names = (ids: string[]) => ids.map((id) => byId.get(id)).filter((m) => m !== undefined)

  const save = useCallback(async () => {
    if (selected.length !== 2) {
      setNeedTwo(true)
      return
    }
    setNeedTwo(false)
    setSaving(true)
    setSaveError(false)
    try {
      const next = await apiFetch('setSourceProbation', {
        params: { id: sourceId },
        body: { labeller_ids: [selected[0]!, selected[1]!] }
      })
      onStatus(next)
      setAnnouncement(t('probation.picker_saved', {}, locale))
    } catch (error) {
      if (error instanceof ApiProblem && error.status === 403) {
        // The role changed under us; the read-only pair below stays the source of truth.
        setAnnouncement(t('probation.picker_save_error', {}, locale))
      }
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }, [selected, sourceId, onStatus, locale])

  // A reader with no pair on record has nothing to see here.
  if (!editable && !status) return null

  return (
    <section
      aria-labelledby="labeller-picker-heading"
      className="probation-picker flex max-w-2xl flex-col gap-gap rounded-xl bg-card p-pad"
    >
      <div className="flex flex-col gap-1">
        <h2 id="labeller-picker-heading" className="type-section">
          {t('probation.picker_heading', {}, locale)}
        </h2>
        <p className="type-body text-muted-foreground">{t('probation.picker_description', {}, locale)}</p>
      </div>
      <div className="flex flex-col gap-3">
        {status && names(status.labeller_ids).length > 0 && (
          <p>
            {t('probation.picker_current', { names: names(status.labeller_ids).map(displayName).join(', ') }, locale)}
          </p>
        )}
        {status && names(status.labeller_ids).length === 0 && (
          <p>{t('probation.picker_current', { names: status.labeller_ids.join(', ') }, locale)}</p>
        )}
        {members.kind === 'loading' && <p>{t('probation.picker_loading', {}, locale)}</p>}
        {members.kind === 'error' && editable && (
          <div className="probation-failure">
            <SourceError
              source={t('probation.source_members', {}, locale)}
              at={new Date().toISOString()}
              locale={locale}
              retry={
                <Button
                  variant="outline"
                  onClick={() => {
                    const controller = new AbortController()
                    reload(controller.signal)
                  }}
                >
                  {t('probation.retry', {}, locale)}
                </Button>
              }
            />
          </div>
        )}
        {members.kind === 'ready' && editable && (
          <>
            <Combobox
              multiple
              actionsRef={actions}
              onOpenChange={(open) => {
                // Finish closing before another search can reopen with keyboard navigation disabled.
                if (!open) actions.current?.unmount()
              }}
              value={selected}
              onValueChange={(next) => {
                if (next.length > 2) {
                  setLimitRefused(true)
                  return
                }
                setLimitRefused(false)
                setSelected(next)
              }}
              onInputValueChange={(value) => {
                setFilter(value)
              }}
              inputValue={filter}
              isItemEqualToValue={(a, b) => a === b}
            >
              <div ref={anchor}>
                <ComboboxChips>
                  {selected.map((id) => (
                    <ComboboxChip key={id}>{byId.get(id) ? displayName(byId.get(id)!) : id}</ComboboxChip>
                  ))}
                  <ComboboxChipsInput
                    name="labeller_search"
                    autoComplete="off"
                    aria-label={t('probation.picker_search', {}, locale)}
                    placeholder={t('probation.picker_search', {}, locale)}
                  />
                </ComboboxChips>
              </div>
              <ComboboxContent anchor={anchor}>
                <ComboboxList>
                  {readyMembers
                    .filter((member) => {
                      const q = filter.trim().toLowerCase()
                      if (!q) return true
                      return member.name.toLowerCase().includes(q) || member.email.toLowerCase().includes(q)
                    })
                    .map((member) => (
                      <ComboboxItem key={member.account_id} value={member.account_id}>
                        {displayName(member)}
                      </ComboboxItem>
                    ))}
                  <ComboboxEmpty>{t('probation.picker_none', {}, locale)}</ComboboxEmpty>
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            {limitRefused && (
              <p role="alert" className="font-medium">
                {t('probation.picker_limit', {}, locale)}
              </p>
            )}
            {needTwo && selected.length !== 2 && (
              <p role="alert" className="font-medium">
                {t('probation.picker_need_two', {}, locale)}
              </p>
            )}
            <div>
              <Button disabled={saving} onClick={save}>
                {t(saving ? 'probation.picker_saving' : 'probation.picker_save', {}, locale)}
              </Button>
            </div>
            {saveError && (
              <p role="alert" className="font-medium">
                {t('probation.picker_save_error', {}, locale)}
              </p>
            )}
          </>
        )}
        <p role="status">{announcement}</p>
      </div>
    </section>
  )
}
