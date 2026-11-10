'use client'

import { t } from './i18n'
import { ChevronDownIcon } from 'lucide-react'
import { Button } from '#ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem
} from '#ui/dropdown-menu'
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '#ui/sheet'
import type { ShellData, ShellMembership, ShellProject } from './types'

function OrgChoices({ data }: { data: ShellData }) {
  return data.memberships.map((membership) => (
    <DropdownMenuItem
      key={membership.org_id}
      render={
        <a
          href={`/${encodeURIComponent(membership.org_slug)}`}
          aria-label={t('app-shell.membershipLabel', {
            name: membership.org_name,
            role: t(`app-shell.roles.${membership.role}`)
          })}
        />
      }
    >
      <span>{membership.org_name}</span>
      <span className="text-muted-foreground">{t(`app-shell.roles.${membership.role}`)}</span>
    </DropdownMenuItem>
  ))
}

export function OrganisationSwitcher({ data, membership }: { data: ShellData; membership?: ShellMembership }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" className="shell-switcher" />}
        aria-label={t('app-shell.organisationLabel', { name: membership?.org_name ?? t('app-shell.noOrganisations') })}
      >
        <span>{membership?.org_name ?? t('app-shell.noOrganisations')}</span>
        <ChevronDownIcon data-icon="inline-end" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="shell-menu">
        <DropdownMenuGroup>
          <OrgChoices data={data} />
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Next's greedy dynamic-route regexp mistakes the camera path for this unbuilt route. */}
          <DropdownMenuItem render={<a href="/new" aria-label={t('app-shell.createOrganisation')} />}>
            {t('app-shell.createOrganisation')}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ProjectNextAction({ membership, menu = false }: { membership?: ShellMembership; menu?: boolean }) {
  if (!membership || !['admin', 'owner'].includes(membership.role)) return <p>{t('app-shell.askProject')}</p>
  const href = `/${encodeURIComponent(membership.org_slug)}/new`
  return menu ? (
    <DropdownMenuItem render={<a href={href} aria-label={t('app-shell.createProject')} />}>
      {t('app-shell.createProject')}
    </DropdownMenuItem>
  ) : (
    <a href={href}>{t('app-shell.createProject')}</a>
  )
}

export function ProjectSwitcher({
  data,
  membership,
  project
}: {
  data: ShellData
  membership?: ShellMembership
  project?: ShellProject
}) {
  const projects = data.projects.filter((item) => item.org_id === membership?.org_id)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" className="shell-switcher" />}
        aria-label={t('app-shell.projectLabel', { name: project?.name ?? t('app-shell.noProjects') })}
      >
        <span>{project?.name ?? t('app-shell.noProjects')}</span>
        <ChevronDownIcon data-icon="inline-end" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="shell-menu">
        <DropdownMenuGroup>
          {projects.map((item) => (
            <DropdownMenuItem
              key={item.id}
              render={
                <a
                  href={`/${encodeURIComponent(membership!.org_slug)}/${encodeURIComponent(item.slug)}`}
                  aria-label={item.name}
                />
              }
            >
              {item.name}
            </DropdownMenuItem>
          ))}
          {!projects.length && (
            <div className="p-3">
              <p>{t('app-shell.noProjects')}</p>
              <ProjectNextAction membership={membership} menu />
            </div>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ScopeSheet({
  data,
  membership,
  project
}: {
  data: ShellData
  membership?: ShellMembership
  project?: ShellProject
}) {
  return (
    <Sheet>
      <SheetTrigger
        render={<Button variant="ghost" className="shell-switcher" />}
        aria-label={t('app-shell.scopeLabel', {
          name: project?.name ?? membership?.org_name ?? t('app-shell.noOrganisations')
        })}
      >
        <span>{project?.name ?? membership?.org_name ?? t('app-shell.noOrganisations')}</span>
        <ChevronDownIcon data-icon="inline-end" aria-hidden="true" />
      </SheetTrigger>
      <SheetContent side="bottom" className="shell-scope-sheet">
        <SheetHeader>
          <SheetTitle>{t('app-shell.switchScope')}</SheetTitle>
          <SheetDescription>{t('app-shell.scopeDescription')}</SheetDescription>
        </SheetHeader>
        <nav aria-label={t('app-shell.organisations')} className="shell-scope-list">
          {!data.memberships.length && <p>{t('app-shell.noOrganisations')}</p>}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Next's greedy dynamic-route regexp mistakes the camera path for this unbuilt route. */}
          <a href="/new">{t('app-shell.createOrganisation')}</a>
          {data.memberships.map((item) => {
            const projects = data.projects.filter((candidate) => candidate.org_id === item.org_id)
            return (
              <section key={item.org_id}>
                <a href={`/${encodeURIComponent(item.org_slug)}`}>
                  {item.org_name}
                  <span>{t(`app-shell.roles.${item.role}`)}</span>
                </a>
                {projects.map((candidate) => (
                  <a
                    key={candidate.id}
                    href={`/${encodeURIComponent(item.org_slug)}/${encodeURIComponent(candidate.slug)}`}
                  >
                    {candidate.name}
                  </a>
                ))}
                {!projects.length && (
                  <>
                    <p>{t('app-shell.noProjects')}</p>
                    <ProjectNextAction membership={item} />
                  </>
                )}
              </section>
            )
          })}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
