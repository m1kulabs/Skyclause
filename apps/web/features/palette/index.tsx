'use client'

import { useEffect, useRef, useState } from 'react'
import type { Role } from '@skyclause/contracts'
import { t } from './catalogue'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '#ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#ui/dialog'
import { paletteSources, sourcesForRole, type PaletteSource } from './sources'

interface CommandPaletteProps {
  memberRole?: Role | null
  locale?: 'en' | 'ms'
  sources?: readonly PaletteSource[]
}

export function CommandPalette({ memberRole = null, locale = 'en', sources = paletteSources }: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const previousFocus = useRef<HTMLElement | null>(null)
  const items = sourcesForRole(sources, memberRole).flatMap((source) =>
    source.items.map((item) => ({ ...item, sourceId: source.id }))
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey) || event.altKey) return
      event.preventDefault()
      if (event.repeat || open) return
      if (document.activeElement instanceof HTMLElement) previousFocus.current = document.activeElement
      setOpen(true)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="max-h-[80svh] gap-0 overflow-y-auto p-0 sm:max-w-lg"
        showCloseButton={false}
        finalFocus={previousFocus}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t('palette.title', {}, locale)}</DialogTitle>
          <DialogDescription>{t('palette.description', {}, locale)}</DialogDescription>
        </DialogHeader>
        <Command label={t('palette.search', {}, locale)} className="rounded-md! [&_[cmdk-label]]:hidden">
          <CommandInput
            aria-label={t('palette.search', {}, locale)}
            name="command-search"
            inputMode="search"
            placeholder={t('palette.placeholder', {}, locale)}
            className="h-10 min-w-0"
          />
          <CommandList label={t('palette.results', {}, locale)}>
            {items.map((item) => (
              <CommandItem
                key={`${item.sourceId}:${item.id}`}
                value={`${item.sourceId}:${item.id}`}
                keywords={[item.label, ...(item.keywords ?? [])]}
                className="min-h-11 whitespace-normal break-words"
                onSelect={() => {
                  setOpen(false)
                  item.onSelect()
                }}
              >
                {item.label}
              </CommandItem>
            ))}
          </CommandList>
          <CommandEmpty className="px-4 py-6 text-sm break-words" aria-live="polite">
            {t(items.length === 0 ? 'palette.empty' : 'palette.no_matches', {}, locale)}
          </CommandEmpty>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

export { paletteSources, sourcesForRole } from './sources'
export type { PaletteItem, PaletteSource } from './sources'
