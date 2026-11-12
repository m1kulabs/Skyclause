'use client'

import type { SubscriberData } from '@skyclause/contracts'
import { formatDateTime } from '@skyclause/i18n/format'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button, buttonVariants } from '#ui/button'
import { Input } from '#ui/input'
import { AuthHeader, AuthMessage } from '../public-chrome/auth'
import { SubscribeColumn } from '../subscribe/column'
import { t } from './i18n'
import styles from './subscriber-rights.module.css'

type Locale = 'en' | 'ms'

const label = (key: string, locale: Locale, vars: Record<string, string> = {}) =>
  t(`subscriber-rights.${key}`, vars, locale)

function date(value: string | null, locale: Locale) {
  if (!value) return '—'
  return formatDateTime(value, locale)
}

/** A real table; on a phone each row stacks under its first cell and every value keeps its column's name. */
function DataTable({
  caption,
  columns,
  rows,
  empty
}: {
  caption: string
  columns: string[]
  rows: { key: string; cells: ReactNode[] }[]
  empty: string
}) {
  return (
    <table className={styles.table}>
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th scope="col" key={column}>
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length ? (
          rows.map(({ key, cells }) => (
            <tr key={key}>
              {cells.map((cell, index) => (
                <td key={index} data-label={columns[index]}>
                  {cell}
                </td>
              ))}
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={columns.length}>{empty}</td>
          </tr>
        )}
      </tbody>
    </table>
  )
}

export function SubscriberRights({ initialData, token }: { initialData: SubscriberData; token: string }) {
  const [data, setData] = useState(initialData)
  const [email, setEmail] = useState(initialData.subscriber.email)
  const [role, setRole] = useState(initialData.subscriber.role ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [message, setMessage] = useState('')
  const [saveError, setSaveError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const resultRef = useRef<HTMLHeadingElement>(null)
  const locale: Locale = data.subscriber.language === 'ms' ? 'ms' : 'en'
  const base = `/api/subscribe/${encodeURIComponent(token)}/data`

  useEffect(() => {
    if (deleted) resultRef.current?.focus()
  }, [deleted])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setSaveError('')
    setMessage('')
    try {
      const response = await fetch(base, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, role })
      })
      if (!response.ok) throw new Error('save')
      const result = (await response.json()) as SubscriberData
      setData(result)
      setRole(result.subscriber.role ?? '')
      setMessage(result.address_confirmation_sent ? label('address_confirmation', locale) : label('saved', locale))
    } catch {
      setSaveError(label('save_error', locale))
    } finally {
      setSaving(false)
    }
  }

  async function erase() {
    setDeleting(true)
    setDeleteError('')
    try {
      const response = await fetch(base, { method: 'DELETE' })
      if (!response.ok) throw new Error('delete')
      setDeleted(true)
      setConfirming(false)
    } catch {
      setDeleteError(label('delete_error', locale))
      setDeleting(false)
    }
  }

  if (deleted) {
    return (
      <SubscribeColumn locale={locale} wide>
        <AuthHeader title={label('deleted', locale)} titleRef={resultRef} statement locale={locale} />
      </SubscribeColumn>
    )
  }

  const suppression = data.suppression
    ? label('suppression_value', locale, {
        reason: data.suppression.reason,
        time: date(data.suppression.at, locale),
        hash: data.suppression.email_hash
      })
    : label('none', locale)
  const status = label(`status_${data.subscriber_status}`, locale)
  const selectedWindows = data.subscriber.window_ids
    .map((id) => {
      const row = data.windows.find((window) => window.id === id)
      return row ? `${row.title} (${id})` : id
    })
    .join(', ')
  const summary: [string, string][] = [
    ['subscriber_id', data.subscriber.id],
    ['email', data.subscriber.email],
    ['role', data.subscriber.role || '—'],
    ['windows_selected', selectedWindows || '—'],
    ['channels', data.subscriber.channels.join(', ') || '—'],
    ['language', data.subscriber.language],
    ['status', status],
    ['suppression', suppression]
  ]
  const column = (key: string) => label(key, locale)

  return (
    <SubscribeColumn locale={locale} wide>
      <AuthHeader
        title={label('title', locale)}
        lead={label('description', locale, { project: data.project_name })}
        locale={locale}
      />

      <section className={styles.section} aria-labelledby="rights-overview">
        <h2 id="rights-overview" className="auth-h2">
          {label('overview', locale)}
        </h2>
        <table className={`${styles.table} ${styles.summary}`}>
          <caption>{label('overview', locale)}</caption>
          <tbody>
            {summary.map(([key, value]) => (
              <tr key={key}>
                <th scope="row">{column(key)}</th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.section} aria-labelledby="rights-correct">
        <h2 id="rights-correct" className="auth-h2">
          {label('correct', locale)}
        </h2>
        <form className={`auth-form ${styles.form}`} onSubmit={save}>
          <div className="auth-field">
            <label htmlFor="rights-email">{column('email')}</label>
            <Input
              id="rights-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              className="h-12 text-base md:text-base"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="rights-role">{column('role')}</label>
            <Input
              id="rights-role"
              name="role"
              autoComplete="organization-title"
              className="h-12 text-base md:text-base"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            />
          </div>
          <Button size="lg" className="w-full" disabled={saving} type="submit">
            {saving ? label('sending', locale) : label('save', locale)}
          </Button>
        </form>
        {message && <AuthMessage tone="result">{message}</AuthMessage>}
        {saveError && <AuthMessage>{saveError}</AuthMessage>}
      </section>

      <section className={styles.section} aria-labelledby="rights-windows">
        <h2 id="rights-windows" className="auth-h2">
          {column('windows')}
        </h2>
        <DataTable
          caption={column('windows')}
          columns={[column('id'), column('windows'), column('starts'), column('ends'), column('time_zone')]}
          rows={data.windows.map((row) => ({
            key: row.id,
            cells: [
              row.id,
              label('window_title', locale, { title: row.title, kind: row.kind }),
              date(row.starts_at, locale),
              date(row.ends_at, locale),
              <span className="whitespace-nowrap">{row.tz}</span>
            ]
          }))}
          empty={label('no_windows', locale)}
        />
      </section>

      <section className={styles.section} aria-labelledby="rights-consent">
        <h2 id="rights-consent" className="auth-h2">
          {column('consent')}
        </h2>
        <DataTable
          caption={column('consent')}
          columns={[column('time'), column('form'), column('notice_version'), column('language')]}
          rows={data.consent_records.map((row, index) => ({
            key: `${row.at}-${index}`,
            cells: [date(row.at, locale), row.form, row.notice_version, row.language]
          }))}
          empty={label('no_consent', locale)}
        />
      </section>

      <section className={styles.section} aria-labelledby="rights-delivery">
        <h2 id="rights-delivery" className="auth-h2">
          {column('delivery')}
        </h2>
        <DataTable
          caption={column('delivery')}
          columns={[
            column('id'),
            column('time'),
            column('kind'),
            column('call'),
            column('channel'),
            column('delivery_status')
          ]}
          rows={data.delivery_history.map((row) => ({
            key: row.id,
            cells: [
              row.id,
              date(row.at, locale),
              row.kind,
              row.call_permalink ? <a href={row.call_permalink}>{row.call_id}</a> : '—',
              row.channel,
              <>
                {row.status}
                {row.accepted_at ? ` · ${column('accepted')} ${date(row.accepted_at, locale)}` : ''}
              </>
            ]
          }))}
          empty={label('no_delivery', locale)}
        />
      </section>

      <section className={styles.section} aria-labelledby="rights-replies">
        <h2 id="rights-replies" className="auth-h2">
          {column('replies')}
        </h2>
        <DataTable
          caption={column('replies')}
          columns={[
            column('id'),
            column('time'),
            column('window'),
            column('call'),
            column('reply'),
            column('shift_to')
          ]}
          rows={data.crowd_replies.map((row) => ({
            key: row.id,
            cells: [
              row.id,
              date(row.at, locale),
              data.windows.find((window) => window.id === row.window_id)?.title ?? row.window_id,
              <a href={`/c/${row.call_id}`}>{row.call_id}</a>,
              row.kind,
              row.shift_to ? date(row.shift_to, locale) : '—'
            ]
          }))}
          empty={label('no_replies', locale)}
        />
      </section>

      <section className={styles.section} aria-labelledby="rights-export">
        <h2 id="rights-export" className="auth-h2">
          {column('export_erase')}
        </h2>
        <div className={styles.actions}>
          <a className={buttonVariants({ size: 'lg', variant: 'outline' })} href={`${base}/export`}>
            {column('download')}
          </a>
          <Button size="lg" variant="destructive" type="button" onClick={() => setConfirming(true)}>
            {column('delete')}
          </Button>
        </div>
        {confirming && (
          <div className="auth-tile">
            <p className="m-0">{label('delete_explanation', locale, { project: data.project_name })}</p>
            <div className={styles.actions}>
              <Button size="lg" variant="destructive" disabled={deleting} type="button" onClick={() => void erase()}>
                {deleting ? column('deleting') : label('confirm_delete', locale, { project: data.project_name })}
              </Button>
              <Button
                size="lg"
                variant="outline"
                disabled={deleting}
                type="button"
                onClick={() => setConfirming(false)}
              >
                {column('cancel')}
              </Button>
            </div>
          </div>
        )}
        {deleteError && <AuthMessage>{deleteError}</AuthMessage>}
      </section>
      <p className="auth-hint m-0">{column('not_a_safety_service')}</p>
    </SubscribeColumn>
  )
}

export function SubscriberRightsLinkError({ expired }: { expired: boolean }) {
  return (
    <SubscribeColumn locale="en" wide>
      <AuthHeader title={label(expired ? 'expired' : 'unavailable', 'en')} statement />
    </SubscribeColumn>
  )
}
