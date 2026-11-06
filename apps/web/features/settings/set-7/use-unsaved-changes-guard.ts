'use client'

import { useEffect, useMemo } from 'react'
import { t } from './catalogue'
import { createUnsavedChangesGuard } from './unsaved-changes'

interface NavigationEvent extends Event {
  canIntercept: boolean
  hashChange: boolean
  navigationType: string
  destination: { url: string; sameDocument: boolean }
}

/** Links are guarded automatically. Wrap imperative router calls in guardNavigation. */
export function useUnsavedChangesGuard(dirty: boolean, locale: 'en' | 'ms' = 'en') {
  const guard = useMemo(
    () =>
      createUnsavedChangesGuard(
        () => dirty,
        () => window.confirm(t('set7.unsaved', {}, locale))
      ),
    [dirty, locale]
  )

  useEffect(() => {
    if (!dirty) return
    const navigation = (window as Window & { navigation?: EventTarget }).navigation
    // Links and imperative calls are checked before Next changes its route state.
    // Native history traversal needs its own cancellable event.
    const onNavigate = (rawEvent: Event) => {
      const event = rawEvent as NavigationEvent
      if (
        event.navigationType !== 'traverse' ||
        !event.cancelable ||
        !event.canIntercept ||
        event.hashChange ||
        !event.destination.sameDocument
      )
        return
      if (!guard.navigate(() => {})) event.preventDefault()
    }
    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(link instanceof HTMLAnchorElement) || link.download || (link.target && link.target !== '_self')) return
      const destination = new URL(link.href, location.href)
      if (destination.origin !== location.origin || destination.href === location.href) return
      if (destination.pathname === location.pathname && destination.search === location.search) return
      if (!guard.navigate(() => {})) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    window.addEventListener('beforeunload', guard.beforeUnload)
    // Next Link handles clicks before native navigation. Capture them even with Navigation API.
    document.addEventListener('click', onClick, true)
    navigation?.addEventListener('navigate', onNavigate)
    return () => {
      window.removeEventListener('beforeunload', guard.beforeUnload)
      document.removeEventListener('click', onClick, true)
      navigation?.removeEventListener('navigate', onNavigate)
    }
  }, [dirty, guard])

  return { guardNavigation: guard.navigate }
}
