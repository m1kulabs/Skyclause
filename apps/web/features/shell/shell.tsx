'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useParams, usePathname } from 'next/navigation'
import { t } from './i18n'
import { MenuIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react'
import { Button } from '#ui/button'
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbSeparator } from '#ui/breadcrumb'
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton
} from '#ui/sidebar'
import { Tooltip, TooltipTrigger, TooltipContent } from '#ui/tooltip'
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from '#ui/sheet'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '#ui/empty'
import { Kbd } from '#ui/kbd'
import { shellNavigation, projectTabs } from './navigation'
import { OrganisationSwitcher, ProjectSwitcher, ScopeSheet } from './switchers'
import type { ShellData } from './types'
import { saveSidebarPreference } from './preferences'
import './shell.css'

export interface AppShellProps {
  data: ShellData
  children: ReactNode
  approvalsCount?: ReactNode
  freshnessStamp?: ReactNode
  palette?: ReactNode
  /** Optional explicit scope for embedded shells and the planted test route. */
  scope?: { org?: string; project?: string; tab?: string }
}

export function AppShell({ data, children, approvalsCount, freshnessStamp, palette, scope }: AppShellProps) {
  const params = useParams<{ org?: string; project?: string }>()
  const pathname = usePathname()
  const orgSlug = scope?.org ?? params.org
  const projectSlug = scope?.project ?? params.project
  const membership = data.memberships.find((item) => item.org_slug === orgSlug)
  const project = data.projects.find((item) => item.org_id === membership?.org_id && item.slug === projectSlug)
  const navigation = shellNavigation(membership?.org_slug)
  const [collapsed, setCollapsed] = useState(data.sidebarCollapsed ?? false)
  const [saving, setSaving] = useState(false)
  const [preferenceError, setPreferenceError] = useState(false)
  const activeTab = scope?.tab ?? pathname.split('/')[3] ?? 'overview'
  const navigationPath = scope?.org && !scope.project ? `/${encodeURIComponent(scope.org)}` : pathname
  const activeNav = project ? undefined : navigation.find((item) => item.href === navigationPath)?.key

  useEffect(() => {
    const syncPreference = (event: Event) => {
      const preference = (event as CustomEvent<{ sidebarCollapsed?: boolean }>).detail
      if (typeof preference.sidebarCollapsed === 'boolean') setCollapsed(preference.sidebarCollapsed)
    }
    window.addEventListener('skyclause:account-preferences', syncPreference)
    return () => window.removeEventListener('skyclause:account-preferences', syncPreference)
  }, [])

  async function changeCollapsed(next: boolean) {
    if (saving) return
    setSaving(true)
    setPreferenceError(false)
    setCollapsed(next)
    try {
      await saveSidebarPreference(next)
    } catch {
      setCollapsed(collapsed)
      setPreferenceError(true)
    } finally {
      setSaving(false)
    }
  }

  function navLinks(start: number, end: number) {
    return navigation.slice(start, end).map((item) => (
      <SidebarMenuItem key={item.key}>
        <Tooltip>
          <TooltipTrigger
            render={
              <SidebarMenuButton
                render={<a href={item.href} aria-label={t(`app-shell.${item.key}`)} />}
                className="shell-nav-link"
                isActive={activeNav === item.key}
                aria-label={t(`app-shell.${item.key}`)}
                aria-current={activeNav === item.key ? 'page' : undefined}
              />
            }
          >
            <item.icon aria-hidden="true" />
            <span className="shell-nav-label">{t(`app-shell.${item.key}`)}</span>
            {item.key === 'approvals' && <span className="shell-approvals-count">{approvalsCount}</span>}
          </TooltipTrigger>
          <TooltipContent role="tooltip" side="right" className={collapsed ? '' : 'shell-expanded-tooltip'}>
            {t(`app-shell.${item.key}`)}
          </TooltipContent>
        </Tooltip>
      </SidebarMenuItem>
    ))
  }

  return (
    <SidebarProvider
      open={!collapsed}
      onOpenChange={(open) => void changeCollapsed(!open)}
      className="app-shell"
      data-collapsed={collapsed}
    >
      <a className="skip-link" href="#shell-content">
        {t('app-shell.skip')}
      </a>
      <Sidebar collapsible="none" className="shell-sidebar">
        <SidebarHeader>
          <span className="shell-brand" translate="no">
            {t('app-shell.brand')}
          </span>
          <div className="shell-sidebar-scope">
            <OrganisationSwitcher data={data} membership={membership} />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label={t('app-shell.navigation')}>
            <SidebarMenu>{navLinks(0, 4)}</SidebarMenu>
            <SidebarMenu className="shell-secondary-nav">{navLinks(4, 6)}</SidebarMenu>
          </nav>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>{navLinks(6, 9)}</SidebarMenu>
          <Button
            variant="ghost"
            className="shell-collapse"
            aria-label={t(collapsed ? 'app-shell.expand' : 'app-shell.collapse')}
            aria-pressed={collapsed}
            disabled={saving}
            onClick={() => void changeCollapsed(!collapsed)}
          >
            {collapsed ? <PanelLeftOpenIcon aria-hidden="true" /> : <PanelLeftCloseIcon aria-hidden="true" />}
            <span className="shell-nav-label">{t(collapsed ? 'app-shell.expand' : 'app-shell.collapse')}</span>
          </Button>
        </SidebarFooter>
      </Sidebar>
      <div className="shell-body">
        <header className="shell-topline">
          <div className="shell-desktop-scope">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <OrganisationSwitcher data={data} membership={membership} />
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <ProjectSwitcher data={data} membership={membership} project={project} />
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="shell-phone-scope">
            <ScopeSheet data={data} membership={membership} project={project} />
          </div>
          <div className="shell-freshness" role="status" aria-label={t('app-shell.freshness')}>
            {freshnessStamp}
          </div>
          <Button
            variant="ghost"
            className="shell-palette-hint"
            onClick={() =>
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
            }
          >
            <span className="sr-only">{t('app-shell.palette')}</span>
            <Kbd>{t('app-shell.paletteHint')}</Kbd>
          </Button>
        </header>
        {project && (
          <nav className="shell-project-tabs" aria-label={t('app-shell.projectNavigation')}>
            {projectTabs.map((tab) => (
              <a
                key={tab}
                aria-current={activeTab === tab ? 'page' : undefined}
                href={`/${encodeURIComponent(membership!.org_slug)}/${encodeURIComponent(project.slug)}${tab === 'overview' ? '' : `/${tab}`}`}
              >
                <span>{t(`app-shell.${tab}`)}</span>
              </a>
            ))}
          </nav>
        )}
        <main id="shell-content" tabIndex={-1} className="shell-content">
          {preferenceError && <p role="alert">{t('app-shell.preferenceFailed')}</p>}
          {!data.memberships.length && (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t('app-shell.noOrganisations')}</EmptyTitle>
                <EmptyDescription>{t('app-shell.loadUnavailable')}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Next's greedy dynamic-route regexp mistakes the camera path for this unbuilt route. */}
                <a href="/new">{t('app-shell.createOrganisation')}</a>
                <Button variant="ghost" onClick={() => window.location.reload()}>
                  {t('app-shell.reload')}
                </Button>
              </EmptyContent>
            </Empty>
          )}
          {children}
        </main>
      </div>
      <nav className="shell-bottom-bar" aria-label={t('app-shell.mobileNavigation')}>
        {navigation.slice(0, 4).map((item) => (
          <a key={item.key} href={item.href} aria-current={activeNav === item.key ? 'page' : undefined}>
            <item.icon aria-hidden="true" />
            <span>{t(`app-shell.${item.key}`)}</span>
          </a>
        ))}
        <Sheet>
          <SheetTrigger className="shell-more">
            <MenuIcon aria-hidden="true" />
            <span>{t('app-shell.more')}</span>
          </SheetTrigger>
          <SheetContent side="bottom">
            <SheetHeader>
              <SheetTitle>{t('app-shell.more')}</SheetTitle>
            </SheetHeader>
            <nav className="shell-more-links" aria-label={t('app-shell.more')}>
              {navigation.slice(4).map((item) => (
                <a key={item.key} href={item.href}>
                  <item.icon aria-hidden="true" />
                  <span>{t(`app-shell.${item.key}`)}</span>
                </a>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </nav>
      {palette}
    </SidebarProvider>
  )
}
