'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, usePathname } from 'next/navigation'
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react'
import type { Role } from '@skyclause/contracts'
import { t } from './catalogue'
import { Button } from '#ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '#ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#ui/dialog'
import { Kbd } from '#ui/kbd'
import { Skeleton } from '#ui/skeleton'
import { ApiProblem } from '../../lib/api-fetch'
import { SourceError } from '../data-components/states'
import { OPEN_PALETTE_EVENT, type OpenPaletteDetail } from './open'
import {
  paletteSources,
  sourcesForRole,
  type PaletteContext,
  type PaletteItem,
  type PaletteKind,
  type PaletteSource
} from './sources'
import { palettePreferencesApi } from './operations'

interface CommandPaletteProps {
  memberRole?: Role | null
  locale?: 'en' | 'ms'
  sources?: readonly PaletteSource[]
}

type LoadedData = Pick<PaletteContext, 'memberships' | 'projects'>
type SearchItems = Record<string, readonly PaletteItem[]>
interface ReadFailure {
  status: number | null
  at: string
}
interface Group {
  id: string
  heading: string
  items: PaletteItem[]
}

/** Groups in reading order. Search results come first while searching: the server matched them to the words typed. */
const KIND_ORDER: readonly PaletteKind[] = ['results', 'actions', 'pages', 'places', 'appearance']
/** Search results are grouped by what they are; their IDs read `search:<org>:<kind>:<id>`. */
const RESULT_KINDS = ['project', 'source', 'window', 'bundle', 'call', 'ledger']

function navigate(href: string) {
  const target = new URL(href, window.location.origin)
  if (target.origin !== window.location.origin) return
  window.location.assign(`${target.pathname}${target.search}${target.hash}`)
}

function failure(error: unknown): ReadFailure {
  return { status: error instanceof ApiProblem ? error.status : null, at: new Date().toISOString() }
}

function kindOf(item: PaletteItem): PaletteKind {
  if (item.kind) return item.kind
  if (item.id.startsWith('search:')) return 'results'
  if (item.id.startsWith('theme:')) return 'appearance'
  if (/^(organisation|project|choose-\w+):/.test(item.id)) return 'places'
  return 'actions'
}

function resultKind(item: PaletteItem) {
  const kind = item.id.split(':')[2] ?? ''
  return RESULT_KINDS.includes(kind) ? kind : 'project'
}

/** Every word typed appears in the item's label or keywords (not its ID: "go" would match every destination). */
function matchesItem(item: PaletteItem, words: readonly string[], locale: 'en' | 'ms') {
  const fields = [item.label, ...(item.keywords ?? [])].map((value) =>
    value.toLocaleLowerCase(locale === 'ms' ? 'ms-MY' : 'en-MY')
  )
  return words.every((word) => fields.some((field) => field.includes(word)))
}

const SUGGESTED_ACTIONS = new Set(['declare-window', 'search-ledger'])

export function CommandPalette({ memberRole, locale = 'en', sources = paletteSources }: CommandPaletteProps) {
  const pathname = usePathname() ?? '/'
  const params = useParams<{ org?: string; project?: string }>()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [commandValue, setCommandValue] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [loadFailure, setLoadFailure] = useState<ReadFailure | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [data, setData] = useState<LoadedData>({ memberships: [], projects: [] })
  const [searchItems, setSearchItems] = useState<SearchItems>({})
  const [searching, setSearching] = useState(false)
  const [searchFailure, setSearchFailure] = useState<ReadFailure | null>(null)
  const [searchAttempt, setSearchAttempt] = useState(0)
  const [projectChoice, setProjectChoice] = useState<PaletteContext['projectChoice']>(null)
  const [projectQuery, setProjectQuery] = useState('')
  const [themeStatus, setThemeStatus] = useState<'saved' | 'failed' | null>(null)
  const paletteReadyMarker = useRef<HTMLSpanElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  const org = params?.org
  const activeMembership = data.memberships.find(
    (membership) => membership.org_slug === (org ?? pathname.split('/')[1])
  )
  const role = memberRole ?? activeMembership?.role ?? null
  const visibleSources = useMemo(() => sourcesForRole(sources, role), [role, sources])

  const chooseProject = useCallback(
    (purpose: 'window' | 'ledger') => {
      setProjectChoice(purpose)
      setProjectQuery(purpose === 'ledger' ? query.trim() : '')
      setQuery('')
      setCommandValue('')
    },
    [query]
  )

  const changeTheme = useCallback(async (theme: 'light' | 'dark' | 'system') => {
    const root = document.documentElement
    const previous = root.dataset.theme
    root.dataset.theme = theme
    setThemeStatus(null)
    try {
      await palettePreferencesApi('updateMyPreferences', { body: { theme }, cache: 'no-store' })
      setThemeStatus('saved')
    } catch {
      if (previous) root.dataset.theme = previous
      else delete root.dataset.theme
      setThemeStatus('failed')
    }
  }, [])

  const context = useMemo<PaletteContext>(
    () => ({
      pathname,
      org,
      project: params?.project,
      memberships: data.memberships,
      projects: data.projects,
      query,
      projectQuery,
      projectChoice,
      changeTheme,
      chooseProject,
      navigate
    }),
    [changeTheme, chooseProject, data, org, params?.project, pathname, projectChoice, projectQuery, query]
  )

  const show = useCallback((returnTo?: HTMLElement | null) => {
    if (returnTo) previousFocus.current = returnTo
    else if (document.activeElement instanceof HTMLElement) previousFocus.current = document.activeElement
    setQuery('')
    setCommandValue('')
    setProjectChoice(null)
    setProjectQuery('')
    setOpen(true)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey) || event.altKey) return
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      )
        return
      event.preventDefault()
      if (event.repeat || open) return
      show()
    }
    const onOpen = (event: Event) => {
      if (!open) show((event as CustomEvent<OpenPaletteDetail>).detail?.returnTo)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener(OPEN_PALETTE_EVENT, onOpen)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener(OPEN_PALETTE_EVENT, onOpen)
    }
  }, [open, show])

  useEffect(() => {
    const marker = paletteReadyMarker.current
    marker?.setAttribute('data-palette-ready', 'true')
    return () => marker?.removeAttribute('data-palette-ready')
  }, [])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoaded(false)
    setLoadFailure(null)
    setData({ memberships: [], projects: [] })
    const readers = sources.flatMap((source) => (source.load ? [source.load(controller.signal)] : []))
    void Promise.all(readers)
      .then((loadedSources) => {
        if (controller.signal.aborted) return
        setData({
          memberships: loadedSources.flatMap((loadedSource) => loadedSource.memberships),
          projects: loadedSources.flatMap((loadedSource) => loadedSource.projects)
        })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadFailure(failure(error))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoaded(true)
      })
    return () => controller.abort()
  }, [open, sources, loadAttempt])

  useEffect(() => {
    const term = query.trim()
    setSearchFailure(null)
    if (!open || !loaded || !term || projectChoice) {
      setSearchItems({})
      setSearching(false)
      return
    }
    const controller = new AbortController()
    setSearchItems({})
    const timer = setTimeout(() => {
      setSearching(true)
      void Promise.all(
        visibleSources.map(
          async (source) =>
            [source.id, source.search ? await source.search(term, context, controller.signal) : []] as const
        )
      )
        .then((results) => {
          if (!controller.signal.aborted) setSearchItems(Object.fromEntries(results))
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) setSearchFailure(failure(error))
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false)
        })
    }, 150)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [context, loaded, open, projectChoice, query, visibleSources, searchAttempt])

  const groups = useMemo<Group[]>(() => {
    const words = query
      .trim()
      .toLocaleLowerCase(locale === 'ms' ? 'ms-MY' : 'en-MY')
      .split(/\s+/)
      .filter(Boolean)
    const results = visibleSources.flatMap((source) => searchItems[source.id] ?? [])
    const available = visibleSources
      .flatMap((source) => [...(source.items ?? []), ...(source.itemsFor?.(context) ?? [])])
      .filter((item) => !projectChoice || item.id.startsWith(`choose-${projectChoice}:`))
      .filter((item) => matchesItem(item, words, locale))
    if (projectChoice) return [{ id: 'choose', heading: t('palette.groups.choose', {}, locale), items: available }]

    const suggested =
      words.length === 0 ? available.filter((item) => item.suggested || SUGGESTED_ACTIONS.has(item.id)) : []
    const rest = available.filter((item) => !suggested.includes(item))
    const grouped: Group[] = [
      { id: 'suggestions', heading: t('palette.groups.suggestions', {}, locale), items: suggested }
    ]
    for (const kind of RESULT_KINDS) {
      grouped.push({
        id: `results-${kind}`,
        heading: t(`palette.groups.${kind}`, {}, locale),
        items: results.filter((item) => resultKind(item) === kind)
      })
    }
    for (const kind of KIND_ORDER) {
      if (kind === 'results') continue
      grouped.push({
        id: kind,
        heading: t(`palette.groups.${kind}`, {}, locale),
        items: rest.filter((item) => kindOf(item) === kind)
      })
    }
    return grouped.filter((group) => group.items.length > 0)
  }, [context, locale, projectChoice, query, searchItems, visibleSources])

  const visible = groups.flatMap((group) => group.items)
  const selectedCommandValue = visible.some((item) => item.id === commandValue) ? commandValue : (visible[0]?.id ?? '')

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) {
            setProjectChoice(null)
            setProjectQuery('')
            setQuery('')
            setCommandValue('')
          }
        }}
      >
        <DialogContent
          className="palette top-[12svh] flex max-h-[76svh] translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
          showCloseButton={false}
          finalFocus={previousFocus}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{t('palette.title', {}, locale)}</DialogTitle>
            <DialogDescription>{t('palette.description', {}, locale)}</DialogDescription>
          </DialogHeader>
          <Command
            label={t('palette.search', {}, locale)}
            value={selectedCommandValue}
            onValueChange={setCommandValue}
            shouldFilter={false}
            className="min-h-0 flex-1 rounded-none! [&_[cmdk-label]]:hidden"
          >
            <CommandInput
              aria-label={t('palette.search', {}, locale)}
              name="command-search"
              autoComplete="off"
              spellCheck={false}
              inputMode="search"
              value={query}
              onValueChange={(next) => {
                setQuery(next)
                setCommandValue('')
              }}
              placeholder={t(projectChoice ? 'palette.choose_project' : 'palette.placeholder', {}, locale)}
              className="h-10 min-w-0"
            />
            {/* One scroll area: the listbox holds only options; loading and failed reads sit after it, outside. */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <CommandList label={t('palette.results', {}, locale)} className="max-h-none overflow-visible">
                {groups.map((group) => (
                  <CommandGroup key={group.id} heading={group.heading}>
                    {group.items.map((item) => (
                      <CommandItem
                        key={item.id}
                        value={item.id}
                        className="min-h-11 whitespace-normal break-words"
                        onSelect={() => {
                          if (!item.keepOpen) setOpen(false)
                          item.onSelect()
                        }}
                      >
                        <span translate={item.translateNo ? 'no' : undefined}>{item.label}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
                {loaded && !searching && !searchFailure && (
                  <CommandEmpty className="px-4 py-6 text-[14px] break-words" aria-live="polite">
                    {projectChoice
                      ? t('palette.choose_project_empty', {}, locale)
                      : t(query.trim() ? 'palette.no_matches' : 'palette.empty', {}, locale)}
                  </CommandEmpty>
                )}
              </CommandList>
              {(!loaded || searching) && (
                <div className="flex flex-col gap-3 px-3 py-3" role="status" aria-live="polite">
                  <span className="sr-only">{t(searching ? 'palette.searching' : 'palette.loading', {}, locale)}</span>
                  <Skeleton className="h-5 w-56 max-w-full rounded-full" />
                  <Skeleton className="h-5 w-40 max-w-full rounded-full" />
                  <Skeleton className="h-5 w-48 max-w-full rounded-full" />
                </div>
              )}
              {loadFailure && (
                <div className="px-1.5 py-1.5">
                  <SourceError
                    source={t('palette.load_source', {}, locale)}
                    status={loadFailure.status}
                    at={loadFailure.at}
                    locale={locale}
                    retry={
                      <Button variant="secondary" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
                        {t('palette.retry', {}, locale)}
                      </Button>
                    }
                  />
                </div>
              )}
              {searchFailure && (
                <div className="px-1.5 py-1.5">
                  <SourceError
                    source={t('palette.search_source', {}, locale)}
                    status={searchFailure.status}
                    at={searchFailure.at}
                    locale={locale}
                    retry={
                      <Button variant="secondary" onClick={() => setSearchAttempt((attempt) => attempt + 1)}>
                        {t('palette.retry', {}, locale)}
                      </Button>
                    }
                  />
                </div>
              )}
            </div>
          </Command>
          <div
            className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[13px] leading-[18px] text-muted-foreground *:inline-flex *:items-center *:gap-1.5"
            aria-hidden="true"
          >
            <span>
              <Kbd>
                <ArrowUpIcon />
              </Kbd>
              <Kbd>
                <ArrowDownIcon />
              </Kbd>
              {t('palette.footer.move', {}, locale)}
            </span>
            <span>
              <Kbd>{t('palette.footer.enter', {}, locale)}</Kbd>
              {t('palette.footer.choose', {}, locale)}
            </span>
            <span>
              <Kbd>{t('palette.footer.escape', {}, locale)}</Kbd>
              {t('palette.footer.close', {}, locale)}
            </span>
          </div>
        </DialogContent>
      </Dialog>
      <p className="sr-only" role="status" aria-live="polite">
        {themeStatus === 'saved'
          ? t('palette.theme_saved', {}, locale)
          : themeStatus === 'failed'
            ? t('palette.theme_failed', {}, locale)
            : ''}
      </p>
      <span ref={paletteReadyMarker} className="sr-only" />
    </>
  )
}

export { paletteSources, sourcesForRole } from './sources'
export type {
  PaletteContext,
  PaletteItem,
  PaletteKind,
  PaletteProject,
  PaletteMembership,
  PaletteSource
} from './sources'
