'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { useParams, usePathname } from 'next/navigation'
import { SearchIcon } from 'lucide-react'
import { Button, buttonVariants } from '#ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '#ui/empty'
import { Kbd } from '#ui/kbd'
import { SourceError } from '../data-components/states'
import { openPalette } from '../palette/open'
import { ShellClock } from './clock'
import { t } from './i18n'
import { PhoneMenu } from './phone-menu'
import { ReviewLink } from './review'
import { shellScope, type ShellScope } from './scope'
import { AccountMenu, OrganisationSwitcher, ProjectMenu, ProjectSwitcher } from './switchers'
import type { ShellData } from './types'
import './shell.css'

export interface AppShellProps {
  data: ShellData
  children: ReactNode
  palette?: ReactNode
  /** The request's time, so the bar's clock renders the same minute on the server and in the first client render. */
  now: string
  /** Optional explicit scope for the planted test route. */
  scope?: { org?: string; project?: string; tab?: string }
}

/** The mark: one window (the capsule) lying on its day (the strip), as in @skyclause/elements, in the current ink. */
function Mark() {
  return (
    <svg className="shell-mark" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect x="0.5" y="10.25" width="15" height="2.5" rx="1.25" />
      <rect x="6" y="3.25" width="9.5" height="5.5" rx="2.75" />
    </svg>
  )
}

function Wordmark({ org }: { org?: string }) {
  const content = (
    <>
      <Mark />
      <span translate="no">{t('app-shell.brand')}</span>
    </>
  )
  if (!org) return <span className="shell-wordmark">{content}</span>
  return (
    <a className="shell-wordmark" href={`/${encodeURIComponent(org)}`} aria-label={t('app-shell.home')}>
      {content}
    </a>
  )
}

function Destinations({ scope }: { scope: ShellScope }) {
  return (
    <nav className="shell-destinations" aria-label={t('app-shell.projectNavigation')}>
      {scope.core.map((destination) => (
        <a
          key={destination.key}
          href={destination.href}
          className="shell-destination current-mark"
          aria-current={scope.current === destination.key ? 'page' : undefined}
        >
          {t(`app-shell.${destination.key}`)}
        </a>
      ))}
      <ProjectMenu scope={scope} />
    </nav>
  )
}

/** The shell-level states: a failed memberships read names itself; a successful empty one offers the next step. */
function ShellState({ data, pathname }: { data: ShellData; pathname: string }) {
  if (data.membershipsError) {
    return (
      <div className="shell-state">
        <SourceError
          source={t('app-shell.membershipsSource')}
          status={data.membershipsError.status}
          at={data.membershipsError.at}
          retry={
            <Button variant="secondary" onClick={() => window.location.reload()}>
              {t('app-shell.reload')}
            </Button>
          }
        />
      </div>
    )
  }
  if (data.signedOut || data.memberships.length || pathname === '/new') return null
  return (
    <Empty className="shell-state">
      <EmptyHeader>
        <EmptyTitle>{t('app-shell.noOrganisations')}</EmptyTitle>
        <EmptyDescription>{t('app-shell.noOrganisationsDescription')}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Next's greedy dynamic-route regexp mistakes the camera path for this unbuilt route. */}
        <a href="/new" className={buttonVariants({ variant: 'default' })}>
          {t('app-shell.createOrganisation')}
        </a>
      </EmptyContent>
    </Empty>
  )
}

/** Publishes the bar's height for scroll padding, and marks it once the page scrolls beneath it. */
function useStickyBar() {
  const bar = useRef<HTMLElement>(null)
  useEffect(() => {
    const element = bar.current
    if (!element) return
    const root = document.documentElement
    const measure = () => root.style.setProperty('--shell-bar-height', `${Math.ceil(element.offsetHeight)}px`)
    const scrolled = () => element.toggleAttribute('data-scrolled', window.scrollY > 0)
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    scrolled()
    window.addEventListener('scroll', scrolled, { passive: true })
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', scrolled)
      root.style.removeProperty('--shell-bar-height')
    }
  }, [])
  return bar
}

export function AppShell({ data, children, palette, now, scope: explicit }: AppShellProps) {
  const params = useParams<{ org?: string; project?: string }>()
  const pathname = usePathname()
  const scope = shellScope(data, pathname, {
    org: explicit?.org ?? params.org,
    project: explicit?.project ?? params.project,
    tab: explicit?.tab
  })
  const bar = useStickyBar()
  const accountCurrent = scope.organisationMenu.some((item) => item.key === scope.current)

  return (
    <div className="app-shell" data-project={scope.core.length ? '' : undefined}>
      <a className="skip-link" href="#shell-content">
        {t('app-shell.skip')}
      </a>
      <header ref={bar} className="shell-bar">
        <div className="shell-bar-row shell-column">
          <div className="shell-start">
            <Wordmark org={scope.org} />
            <div className="shell-scope">
              <OrganisationSwitcher scope={scope} />
              <span className="shell-scope-divider" aria-hidden="true" />
              <ProjectSwitcher scope={scope} />
            </div>
          </div>
          {scope.core.length > 0 && <Destinations scope={scope} />}
          <p className="shell-live">
            <ShellClock now={now} />
          </p>
          <div className="shell-end">
            {scope.org && <ReviewLink org={scope.org} />}
            <Button
              variant="secondary"
              className="shell-search"
              onClick={() => openPalette()}
              aria-label={t('app-shell.paletteShortcut', { hint: t('app-shell.paletteHint') })}
              aria-keyshortcuts="Meta+K Control+K"
            >
              <SearchIcon aria-hidden="true" />
              <Kbd aria-hidden="true">{t('app-shell.paletteHint')}</Kbd>
            </Button>
            <div className="shell-account-wrap current-mark" data-current={accountCurrent ? '' : undefined}>
              <AccountMenu scope={scope} />
            </div>
            <PhoneMenu scope={scope} now={now} />
          </div>
        </div>
      </header>
      <main id="shell-content" tabIndex={-1} className="shell-content shell-column">
        <ShellState data={data} pathname={pathname} />
        {children}
      </main>
      {palette}
    </div>
  )
}
