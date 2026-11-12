'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { Role } from '@skyclause/contracts'
import { t } from './catalogue'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '#ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#ui/dialog'
import { OPEN_PALETTE_EVENT, type OpenPaletteDetail } from './open'
import { paletteSources, sourcesForRole, type PaletteContext, type PaletteItem, type PaletteSource } from './sources'
import { palettePreferencesApi } from './operations'

interface CommandPaletteProps {
  memberRole?: Role | null
  locale?: 'en' | 'ms'
  sources?: readonly PaletteSource[]
}

type LoadedData = Pick<PaletteContext, 'memberships' | 'projects'>
type SearchItems = Record<string, readonly PaletteItem[]>

function navigate(href: string) {
  const target = new URL(href, window.location.origin)
  if (target.origin !== window.location.origin) return
  window.location.assign(`${target.pathname}${target.search}${target.hash}`)
}

function matchesItem(item: PaletteItem, term: string, locale: 'en' | 'ms') {
  return [item.id, item.label, ...(item.keywords ?? [])].some((value) =>
    value.toLocaleLowerCase(locale === 'ms' ? 'ms-MY' : 'en-MY').includes(term)
  )
}

export function CommandPalette({ memberRole, locale = 'en', sources = paletteSources }: CommandPaletteProps) {
  const pathname = usePathname() ?? '/'
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [commandValue, setCommandValue] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [data, setData] = useState<LoadedData>({ memberships: [], projects: [] })
  const [searchItems, setSearchItems] = useState<SearchItems>({})
  const [searching, setSearching] = useState(false)
  const [projectChoice, setProjectChoice] = useState<PaletteContext['projectChoice']>(null)
  const [projectQuery, setProjectQuery] = useState('')
  const [themeStatus, setThemeStatus] = useState<'saved' | 'failed' | null>(null)
  const paletteReadyMarker = useRef<HTMLSpanElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  const activeOrg = pathname.split('/').filter(Boolean)[0]
  const activeMembership = data.memberships.find((membership) => membership.org_slug === activeOrg)
  const role = memberRole ?? activeMembership?.role ?? null
  const visibleSources = useMemo(() => sourcesForRole(sources, role), [role, sources])

  const chooseProject = useCallback(
    (purpose: 'window' | 'ledger') => {
      setProjectChoice(purpose)
      setProjectQuery(purpose === 'ledger' ? query.trim() : '')
      setQuery('')
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
      memberships: data.memberships,
      projects: data.projects,
      query,
      projectQuery,
      projectChoice,
      changeTheme,
      chooseProject,
      navigate
    }),
    [changeTheme, chooseProject, data.memberships, data.projects, pathname, projectChoice, projectQuery, query]
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
      .catch(() => {
        if (!controller.signal.aborted) setData({ memberships: [], projects: [] })
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoaded(true)
      })
    return () => controller.abort()
  }, [open, sources])

  useEffect(() => {
    const term = query.trim()
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
        .catch(() => {
          if (!controller.signal.aborted) setSearchItems({})
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false)
        })
    }, 150)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [context, loaded, open, projectChoice, query, visibleSources])

  const items = useMemo(() => {
    const available = visibleSources.flatMap((source) => [
      ...(source.items ?? []),
      ...(source.itemsFor?.(context) ?? []),
      ...(searchItems[source.id] ?? [])
    ])
    if (!projectChoice) return available
    return available.filter((item) => item.id.startsWith(`choose-${projectChoice}:`))
  }, [context, projectChoice, searchItems, visibleSources])
  const defaultCommandValue = useMemo(() => {
    const term = query.trim().toLocaleLowerCase(locale === 'ms' ? 'ms-MY' : 'en-MY')
    if (!term) return items[0]?.id ?? ''
    const searchResult = visibleSources
      .flatMap((source) => searchItems[source.id] ?? [])
      .find((item) => matchesItem(item, term, locale))
    return (
      searchResult?.id ??
      items.find((item) => !item.id.startsWith('search:') && matchesItem(item, term, locale))?.id ??
      ''
    )
  }, [items, locale, query, searchItems, visibleSources])
  const term = query.trim().toLocaleLowerCase(locale === 'ms' ? 'ms-MY' : 'en-MY')
  const currentCommand = items.find((item) => item.id === commandValue)
  const selectedCommandValue =
    currentCommand && (projectChoice || (term && matchesItem(currentCommand, term, locale)))
      ? commandValue
      : defaultCommandValue

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
          className="max-h-[80svh] gap-0 overflow-y-auto p-0 sm:max-w-lg"
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
            className="rounded-md! [&_[cmdk-label]]:hidden"
          >
            <CommandInput
              aria-label={t('palette.search', {}, locale)}
              name="command-search"
              autoComplete="off"
              spellCheck={false}
              inputMode="search"
              value={query}
              onValueChange={setQuery}
              placeholder={t(projectChoice ? 'palette.choose_project' : 'palette.placeholder', {}, locale)}
              className="h-10 min-w-0"
            />
            <CommandList label={t('palette.results', {}, locale)}>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  keywords={[item.label, ...(item.keywords ?? [])]}
                  className="min-h-11 whitespace-normal break-words"
                  onSelect={() => {
                    if (!item.keepOpen) setOpen(false)
                    item.onSelect()
                  }}
                >
                  <span translate={item.translateNo ? 'no' : undefined}>{item.label}</span>
                </CommandItem>
              ))}
              <CommandEmpty className="px-4 py-6 text-sm break-words" aria-live="polite">
                {searching
                  ? t('palette.searching', {}, locale)
                  : !loaded
                    ? t('palette.loading', {}, locale)
                    : projectChoice && items.length === 0
                      ? t('palette.choose_project_empty', {}, locale)
                      : t(items.length === 0 ? 'palette.empty' : 'palette.no_matches', {}, locale)}
              </CommandEmpty>
            </CommandList>
          </Command>
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
export type { PaletteContext, PaletteItem, PaletteProject, PaletteMembership, PaletteSource } from './sources'
