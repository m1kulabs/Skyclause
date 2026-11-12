'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDate, formatList, formatTime } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Card, CardContent } from '#ui/card'
import { CodeBlock, CodeBlockContent, CodeBlockHeader } from '#ui/code-block'
import { Skeleton } from '#ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#ui/table'
import { cn } from '#lib/utils'
import { Glyph } from '../brand/glyph'
import { t, type Locale } from './i18n'
import { apiFetch, targets, readTools, type Target, type Transport, type Verification } from './operations'
import { UnsafeConfigError, safeConfig, verificationState } from './model'
import { useResource } from './resource'
import { CopyButton } from './copy-button'
import { Failure } from './failure'
import { startListening, type Listening } from './listen'
import { Enterprise } from './enterprise'
import './connect.css'

async function readVerifications(signal: AbortSignal) {
  const records: Verification[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await apiFetch('listConnectVerifications', { query: { cursor }, signal })
    records.push(...page.data)
    cursor = page.next_cursor ?? undefined
    if (cursor && seen.has(cursor)) throw new Error('Repeated verification cursor')
    if (cursor) seen.add(cursor)
  } while (cursor)
  return records
}

type VerificationState = ReturnType<typeof verificationState>

/** The most tool rows the list draws; the server's own tool list is far shorter. */
const TOOL_ROWS = 50

const verificationGlyph = { verified: 'fresh', reverify_due: 'stale' } as const

function VerificationGlyph({ state }: { state: VerificationState }) {
  return <Glyph state={state === 'verified' || state === 'reverify_due' ? verificationGlyph[state] : 'pending'} />
}

function Config({ target, transport, locale }: { target: Target; transport: Transport; locale: Locale }) {
  const copy = (key: string, vars: Record<string, string | number> = {}) => t(key, vars, locale)
  const read = useCallback(
    async (signal: AbortSignal) => {
      const response = await apiFetch('getConnectConfig', { query: { target, transport }, signal })
      if (response.target !== target || response.transport !== transport)
        throw new Error('Config does not match selection')
      return safeConfig(response.config)
    },
    [target, transport]
  )
  const [config, retry] = useResource(read)
  return (
    <section aria-labelledby="config-title" className="grid min-w-0 gap-4" data-connect-config>
      <h2 id="config-title" className="type-card-title">
        {copy('connect.config')}
      </h2>
      {config.kind === 'loading' ? (
        <div className="grid gap-2">
          <Skeleton className="h-5 w-full rounded-full" />
          <Skeleton className="h-5 w-4/5 rounded-full" />
          <Skeleton className="h-5 w-3/5 rounded-full" />
          <p role="status" className="sr-only">
            {copy('connect.loading_config')}
          </p>
        </div>
      ) : config.kind === 'error' ? (
        config.error instanceof UnsafeConfigError ? (
          <div className="grid justify-items-start gap-3">
            <p role="alert" className="flex items-start gap-2 font-medium">
              <Glyph state="error" className="mt-1.5" />
              <span>{copy('connect.config_error')}</span>
            </p>
            <Button variant="outline" onClick={retry}>
              {copy('connect.retry')}
            </Button>
          </div>
        ) : (
          <Failure
            source={copy('connect.source_config')}
            error={config.error}
            at={config.at}
            retry={retry}
            locale={locale}
          />
        )
      ) : (
        <CodeBlock>
          <CodeBlockHeader className="justify-end">
            <CopyButton key={config.value} value={config.value} label="copy_config" locale={locale} />
          </CodeBlockHeader>
          <CodeBlockContent wrap translate="no">
            {config.value}
          </CodeBlockContent>
        </CodeBlock>
      )}
    </section>
  )
}

function Listener({ locale }: { locale: Locale }) {
  const copy = (key: string, vars: Record<string, string | number> = {}) => t(key, vars, locale)
  const [state, setState] = useState<Listening>({ kind: 'waiting' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    setState({ kind: 'waiting' })
    const since = new Date().toISOString()
    return startListening({
      read: (signal) => apiFetch('listConnectActivity', { query: { since }, signal }),
      change: setState,
      visibility: document
    })
  }, [attempt])
  return (
    <section aria-labelledby="activity-title" className="grid min-w-0 gap-3">
      <h2 id="activity-title" className="type-card-title">
        {copy('connect.activity')}
      </h2>
      <p
        role="status"
        data-connect-activity
        translate={state.kind === 'received' ? 'no' : undefined}
        className="type-body flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1"
      >
        {state.kind === 'received' ? (
          <>
            <time dateTime={state.request.at} data-numeric className="font-semibold">
              {formatTime(state.request.at, locale)}
            </time>
            <span className="[overflow-wrap:anywhere]">{state.request.tool}</span>
            <span className="text-muted-foreground [overflow-wrap:anywhere]">
              {state.request.client_name ?? copy('connect.unknown_client')}
            </span>
          </>
        ) : (
          <>
            {state.kind === 'error' ? <Glyph state="error" /> : <Glyph state="pending" />}
            <span>{copy(`connect.${state.kind === 'error' ? 'activity_error' : state.kind}`)}</span>
          </>
        )}
      </p>
      {(state.kind === 'timeout' || state.kind === 'error') && (
        <Button variant="outline" className="justify-self-start" onClick={() => setAttempt((value) => value + 1)}>
          {copy('connect.retry')}
        </Button>
      )}
    </section>
  )
}

function ToolList({ origin, locale }: { origin: string; locale: Locale }) {
  const copy = (key: string, vars: Record<string, string | number> = {}) => t(key, vars, locale)
  const read = useCallback((signal: AbortSignal) => readTools(origin, signal), [origin])
  const [tools, retry] = useResource(read)
  return (
    <section aria-labelledby="tools-title" className="grid min-w-0 gap-4">
      <div className="grid gap-1">
        <h2 id="tools-title" className="type-section">
          {copy('connect.tools')}
        </h2>
        <p className="type-card-title">{copy('connect.no_approval')}</p>
      </div>
      {tools.kind === 'loading' ? (
        <div className="grid gap-3">
          <Skeleton className="h-6 w-full rounded-full" />
          <Skeleton className="h-6 w-full rounded-full" />
          <p role="status" className="sr-only">
            {copy('connect.loading_tools')}
          </p>
        </div>
      ) : tools.kind === 'error' ? (
        <Failure
          source={copy('connect.source_tools')}
          error={tools.error}
          at={tools.at}
          retry={retry}
          locale={locale}
        />
      ) : tools.value.length === 0 ? (
        <div className="grid justify-items-start gap-3">
          <p className="type-body flex items-center gap-2">
            <Glyph state="pending" />
            <span>{copy('connect.empty_tools')}</span>
          </p>
          <Button variant="outline" onClick={retry}>
            {copy('connect.retry')}
          </Button>
        </div>
      ) : (
        <Table className="connect-tools">
          <TableHeader>
            <TableRow>
              <TableHead>{copy('connect.tool_name')}</TableHead>
              <TableHead>{copy('connect.tool_description')}</TableHead>
              <TableHead>{copy('connect.scopes')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tools.value.slice(0, TOOL_ROWS).map((tool) => (
              <TableRow key={tool.name}>
                <TableCell translate="no" className="font-semibold" truncate="32ch">
                  {tool.name}
                </TableCell>
                <TableCell className="whitespace-normal" phone="meta" label={copy('connect.tool_description')}>
                  {tool.description}
                </TableCell>
                <TableCell phone="meta" label={copy('connect.scopes')}>
                  {formatList(
                    tool.scopes.map((scope) => copy(`connect.scope_${scope}`)),
                    locale
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}

const segment =
  'relative inline-flex h-9 min-w-9 flex-none items-center justify-center gap-1.5 rounded-full border-2 border-transparent px-3.5 text-[14px] leading-5 font-medium whitespace-nowrap text-muted-foreground outline-none hover:text-foreground pointer-coarse:h-11'
const strip =
  'inline-flex w-fit max-w-full flex-wrap items-center gap-1 rounded-full border-2 border-input bg-muted p-1'

export function ConnectPanel({
  target,
  transport,
  mcpOrigin,
  orgId,
  locale = 'en'
}: {
  target: Target
  transport: Transport
  mcpOrigin: string
  orgId: string | null
  locale?: Locale
}) {
  const router = useRouter()
  const copy = (key: string, vars: Record<string, string | number> = {}) => t(key, vars, locale)
  const [verifications, retry] = useResource(readVerifications)
  const records =
    verifications.kind === 'ready'
      ? new Map(targets.map((id) => [id, verifications.value.find((record) => record.target === id)]))
      : undefined
  const verified =
    records && [...records.values()].filter((record) => verificationState(record?.result) === 'verified').length
  const record = records?.get(target)
  const state = verificationState(record?.result)
  return (
    <div className="connect-page grid min-w-0 gap-section" data-connect-page>
      <header className="grid gap-2">
        <h1 className="type-title">{copy('connect.title')}</h1>
        {verifications.kind === 'error' ? (
          <Failure
            source={copy('connect.source_verifications')}
            error={verifications.error}
            at={verifications.at}
            retry={retry}
            locale={locale}
          />
        ) : (
          <p role="status" className="type-text text-muted-foreground">
            {verified === undefined ? copy('connect.loading_verifications') : copy('connect.finding', { n: verified })}
          </p>
        )}
      </header>
      <div className="grid min-w-0 gap-4">
        <nav aria-label={copy('connect.pick')} className={cn('connect-targets', strip)}>
          {targets.map((id) => {
            const item = records?.get(id)
            const itemState = verificationState(item?.result)
            return (
              <Link
                key={id}
                href={`/connect?target=${id}&transport=${transport}`}
                aria-current={id === target ? 'page' : undefined}
                className={cn(
                  segment,
                  'current-mark aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground'
                )}
              >
                {records && <VerificationGlyph state={itemState} />}
                <span translate="no">{copy(`connect.targets.${id}`)}</span>
                {records && (
                  <span className="connect-verification sr-only">
                    {itemState === 'verified' && item
                      ? copy('connect.verified', { date: formatDate(item.tested_at, locale) })
                      : copy(`connect.${itemState}`)}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="grid min-w-0 gap-1">
            <h2 className="type-section" translate="no">
              {copy(`connect.targets.${target}`)}
            </h2>
            {records ? (
              <p className="type-body flex items-center gap-2" data-connect-verified>
                <VerificationGlyph state={state} />
                <span>
                  {state === 'verified' && record
                    ? copy('connect.verified', { date: formatDate(record.tested_at, locale) })
                    : copy(`connect.${state}`)}
                </span>
              </p>
            ) : (
              <Skeleton className="h-5 w-48 rounded-full" />
            )}
          </div>
          <fieldset className="grid gap-1.5">
            <legend className="type-small mb-1.5 text-muted-foreground">{copy('connect.transport')}</legend>
            <div className={strip}>
              {(['remote', 'stdio'] as const).map((method) => (
                <label
                  key={method}
                  className={cn(
                    segment,
                    'cursor-pointer has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-solid'
                  )}
                >
                  <input
                    type="radio"
                    name="transport"
                    value={method}
                    checked={transport === method}
                    className="sr-only"
                    onChange={() => router.push(`/connect?target=${target}&transport=${method}`)}
                  />
                  {copy(`connect.${method}`)}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </div>
      <Card className="overflow-visible">
        <CardContent className="grid min-w-0 gap-8">
          <Config key={`${target}-${transport}`} target={target} transport={transport} locale={locale} />
          <Listener locale={locale} />
        </CardContent>
      </Card>
      {target === 'gemini_enterprise' && <Enterprise orgId={orgId} locale={locale} />}
      <ToolList origin={mcpOrigin} locale={locale} />
    </div>
  )
}
