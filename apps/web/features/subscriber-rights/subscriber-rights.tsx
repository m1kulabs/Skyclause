'use client'

import type { SubscriberData } from '@skyclause/contracts'
import { formatDateTime, formatList, formatTimeZoneName } from '@skyclause/i18n/format'
import { CircleAlertIcon } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button, buttonVariants } from '#ui/button'
import { Input } from '#ui/input'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '#ui/table'
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

/** The most rows a table here renders; the download holds every record. */
const ROW_LIMIT = 50

/** The latest `ROW_LIMIT` records, newest first. */
function latest<T extends { at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.at.localeCompare(a.at)).slice(0, ROW_LIMIT)
}

/**
 * One table of the shared kind; on a phone each row becomes a two-line item and every value after the first keeps its
 * column's name. Past `ROW_LIMIT` records it says how many it shows.
 */
function DataTable({
  caption,
  columns,
  rows,
  count,
  empty,
  locale
}: {
  caption: string
  columns: string[]
  rows: { key: string; cells: ReactNode[] }[]
  count: number
  empty: string
  locale: Locale
}) {
  return (
    <>
      <Table>
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead scope="col" key={column}>
                {column}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map(({ key, cells }) => (
              <TableRow key={key}>
                {cells.map((cell, index) => (
                  <TableCell key={index} className="whitespace-normal" data-label={index ? columns[index] : undefined}>
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="whitespace-normal">
                {empty}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {count > rows.length ? (
        <p className="auth-hint">
          {label('showing_latest', locale, { shown: String(rows.length), count: String(count) })}
        </p>
      ) : null}
    </>
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
  const [emailRejected, setEmailRejected] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const resultRef = useRef<HTMLHeadingElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const locale: Locale = data.subscriber.language === 'ms' ? 'ms' : 'en'
  const base = `/api/subscribe/${encodeURIComponent(token)}/data`

  useEffect(() => {
    if (deleted) resultRef.current?.focus()
  }, [deleted])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setSaveError('')
    setEmailRejected(false)
    setMessage('')
    try {
      const response = await fetch(base, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, role })
      })
      // A refused correction is almost always the address: say so beside it and put the reader back there.
      if (response.status === 400 || response.status === 422) {
        setEmailRejected(true)
        emailRef.current?.focus()
        return
      }
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
        reason: label(`reason_${data.suppression.reason}`, locale),
        time: date(data.suppression.at, locale)
      })
    : label('none', locale)
  const status = label(`status_${data.subscriber_status}`, locale)
  // Windows by title, never by ID; a selected window the project has since removed is not listed.
  const selectedWindows = formatList(
    data.subscriber.window_ids.flatMap((id) => data.windows.find((window) => window.id === id)?.title ?? []),
    locale
  )
  const channels = formatList(
    data.subscriber.channels.map((channel) => label(`channel_${channel}`, locale)),
    locale
  )
  const summary: [string, string][] = [
    ['email', data.subscriber.email],
    ['role', data.subscriber.role || '—'],
    ['windows_selected', selectedWindows || '—'],
    ['channels', channels || '—'],
    ['language', label(`language_${data.subscriber.language}`, locale)],
    ['status', status],
    ['suppression', suppression]
  ]
  const column = (key: string) => label(key, locale)
  const deliveries = latest(data.delivery_history)
  const replies = latest(data.crowd_replies)

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
        {/* Each label reads with its value, so on a phone this table keeps its two columns. */}
        <Table data-phone="scroll">
          <TableCaption className="sr-only">{label('overview', locale)}</TableCaption>
          <TableBody>
            {summary.map(([key, value]) => (
              <TableRow key={key}>
                <TableHead scope="row" className="w-1/3 whitespace-normal">
                  {column(key)}
                </TableHead>
                <TableCell className="whitespace-normal">{value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className={styles.section} aria-labelledby="rights-correct">
        <h2 id="rights-correct" className="auth-h2">
          {label('correct', locale)}
        </h2>
        <form className={`auth-form ${styles.form}`} onSubmit={save}>
          <div className="auth-field">
            <label htmlFor="rights-email">{column('email')}</label>
            <Input
              ref={emailRef}
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
              aria-invalid={emailRejected || undefined}
              aria-describedby={emailRejected ? 'rights-email-error' : undefined}
              onChange={(event) => {
                setEmail(event.target.value)
                setEmailRejected(false)
              }}
            />
            {emailRejected ? (
              <p className="auth-error" id="rights-email-error" role="alert">
                <CircleAlertIcon aria-hidden="true" />
                {label('email_rejected', locale)}
              </p>
            ) : null}
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
          columns={[column('windows'), column('starts'), column('ends'), column('time_zone')]}
          rows={data.windows.slice(0, ROW_LIMIT).map((row) => ({
            key: row.id,
            cells: [
              label('window_title', locale, { title: row.title, kind: label(`window_kind_${row.kind}`, locale) }),
              date(row.starts_at, locale),
              date(row.ends_at, locale),
              formatTimeZoneName(row.tz, locale)
            ]
          }))}
          count={data.windows.length}
          empty={label('no_windows', locale)}
          locale={locale}
        />
      </section>

      <section className={styles.section} aria-labelledby="rights-consent">
        <h2 id="rights-consent" className="auth-h2">
          {column('consent')}
        </h2>
        <DataTable
          caption={column('consent')}
          columns={[column('time'), column('form'), column('notice_version'), column('language')]}
          rows={latest(data.consent_records).map((row, index) => ({
            key: `${row.at}-${index}`,
            cells: [
              date(row.at, locale),
              label(`form_${row.form}`, locale),
              row.notice_version,
              label(`language_${row.language}`, locale)
            ]
          }))}
          count={data.consent_records.length}
          empty={label('no_consent', locale)}
          locale={locale}
        />
      </section>

      <section className={styles.section} aria-labelledby="rights-delivery">
        <h2 id="rights-delivery" className="auth-h2">
          {column('delivery')}
        </h2>
        <DataTable
          caption={column('delivery')}
          columns={[column('time'), column('kind'), column('channel'), column('delivery_status')]}
          rows={deliveries.map((row) => ({
            key: row.id,
            cells: [
              date(row.at, locale),
              label(`notice_${row.kind}`, locale),
              label(`channel_${row.channel}`, locale),
              <>
                {label(`delivery_${row.status}`, locale)}
                {row.accepted_at ? ` · ${column('accepted')} ${date(row.accepted_at, locale)}` : ''}
              </>
            ]
          }))}
          count={data.delivery_history.length}
          empty={label('no_delivery', locale)}
          locale={locale}
        />
      </section>

      <section className={styles.section} aria-labelledby="rights-replies">
        <h2 id="rights-replies" className="auth-h2">
          {column('replies')}
        </h2>
        <DataTable
          caption={column('replies')}
          columns={[column('time'), column('window'), column('reply'), column('shift_to')]}
          rows={replies.map((row) => ({
            key: row.id,
            cells: [
              date(row.at, locale),
              data.windows.find((window) => window.id === row.window_id)?.title ?? '—',
              label(`reply_${row.kind}`, locale),
              row.shift_to ? date(row.shift_to, locale) : '—'
            ]
          }))}
          count={data.crowd_replies.length}
          empty={label('no_replies', locale)}
          locale={locale}
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

export function SubscriberRightsLinkError({ expired, locale }: { expired: boolean; locale: Locale }) {
  return (
    <SubscribeColumn locale={locale} wide>
      <AuthHeader title={label(expired ? 'expired' : 'unavailable', locale)} statement locale={locale} />
    </SubscribeColumn>
  )
}
