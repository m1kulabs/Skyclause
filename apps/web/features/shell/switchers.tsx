'use client'

import type { ReactNode } from 'react'
import { ChevronDownIcon, CircleUserRoundIcon } from 'lucide-react'
import { Button } from '#ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '#ui/dropdown-menu'
import { t } from './i18n'
import type { Destination, DestinationKey } from './navigation'
import type { ShellScope } from './scope'

const ACCOUNT_KEYS: readonly DestinationKey[] = ['connect', 'account', 'appearance']

function MenuLink({ href, current, label }: { href: string; current?: boolean; label: string }) {
  return (
    <DropdownMenuItem
      className="shell-menu-item"
      render={<a href={href} aria-current={current ? 'page' : undefined} aria-label={label} />}
    >
      {label}
    </DropdownMenuItem>
  )
}

function DestinationLinks({ destinations, current }: { destinations: Destination[]; current?: DestinationKey }) {
  return destinations.map((destination) => (
    <MenuLink
      key={destination.key}
      href={destination.href}
      current={destination.key === current}
      label={t(`app-shell.${destination.key}`)}
    />
  ))
}

/** A state inside a menu (n=0, a failed read): announced with the items, not one of them to choose. */
function Note({ children }: { children: ReactNode }) {
  return (
    <DropdownMenuItem disabled className="shell-menu-note">
      {children}
    </DropdownMenuItem>
  )
}

function SwitcherTrigger({ label, name }: { label: string; name: string }) {
  return (
    <DropdownMenuTrigger render={<Button variant="ghost" className="shell-switcher" />} aria-label={label}>
      <span>{name}</span>
      <ChevronDownIcon data-icon="inline-end" aria-hidden="true" />
    </DropdownMenuTrigger>
  )
}

export function OrganisationSwitcher({ scope }: { scope: ShellScope }) {
  const { data, membership } = scope
  return (
    <DropdownMenu>
      <SwitcherTrigger label={t('app-shell.organisationLabel', { name: scope.orgName })} name={scope.orgName} />
      <DropdownMenuContent className="shell-menu">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('app-shell.switchOrganisation')}</DropdownMenuLabel>
          {data.membershipsError && <Note>{t('app-shell.organisationsUnavailable')}</Note>}
          {data.memberships.map((item) => (
            <DropdownMenuItem
              key={item.org_id}
              className="shell-menu-item"
              render={
                <a
                  href={`/${encodeURIComponent(item.org_slug)}`}
                  aria-current={item.org_id === membership?.org_id ? 'true' : undefined}
                  aria-label={t('app-shell.membershipLabel', {
                    name: item.org_name,
                    role: t(`app-shell.roles.${item.role}`)
                  })}
                />
              }
            >
              <span>{item.org_name}</span>
              <span className="shell-menu-meta">{t(`app-shell.roles.${item.role}`)}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <MenuLink href="/new" label={t('app-shell.createOrganisation')} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The next step when an organisation has no project: create one, or ask an admin to. */
export function canCreateProject(scope: ShellScope) {
  return scope.role === 'owner' || scope.role === 'admin'
}

export function ProjectSwitcher({ scope }: { scope: ShellScope }) {
  const { org, project, projects, projectsError } = scope
  return (
    <DropdownMenu>
      <SwitcherTrigger label={t('app-shell.projectLabel', { name: scope.projectName })} name={scope.projectName} />
      <DropdownMenuContent className="shell-menu">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('app-shell.switchProject')}</DropdownMenuLabel>
          {projectsError ? (
            <Note>{t('app-shell.projectsUnavailable')}</Note>
          ) : (
            !projects.length && <Note>{t('app-shell.noProjects')}</Note>
          )}
          {org &&
            projects.map((item) => (
              <MenuLink
                key={item.id}
                href={`/${encodeURIComponent(org)}/${encodeURIComponent(item.slug)}`}
                current={item.id === project?.id}
                label={item.name}
              />
            ))}
        </DropdownMenuGroup>
        {org && canCreateProject(scope) ? (
          <>
            <DropdownMenuSeparator />
            <MenuLink href={`/${encodeURIComponent(org)}/new`} label={t('app-shell.createProject')} />
          </>
        ) : (
          !projects.length && !projectsError && <Note>{t('app-shell.askProject')}</Note>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Overview, Analysis, Subscribers and Project settings: the project's pages beyond the four in the bar. */
export function ProjectMenu({ scope }: { scope: ShellScope }) {
  const current = scope.projectMenu.some((item) => item.key === scope.current)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<button type="button" className="shell-destination current-mark" />}
        aria-label={t('app-shell.moreLabel')}
        data-current={current ? '' : undefined}
      >
        <span>{t('app-shell.more')}</span>
        <ChevronDownIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="shell-menu">
        <DestinationLinks destinations={scope.projectMenu} current={scope.current} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The organisation's pages and the account's, behind one control at the bar's right end. */
export function AccountMenu({ scope }: { scope: ShellScope }) {
  const organisation = scope.organisationMenu.filter((item) => !ACCOUNT_KEYS.includes(item.key))
  const account = scope.organisationMenu.filter((item) => ACCOUNT_KEYS.includes(item.key))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="shell-account" />}
        aria-label={t('app-shell.accountMenu')}
      >
        <CircleUserRoundIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="shell-menu" align="end">
        {organisation.length > 0 && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>{scope.orgName}</DropdownMenuLabel>
              <DestinationLinks destinations={organisation} current={scope.current} />
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('app-shell.accountGroup')}</DropdownMenuLabel>
          <DestinationLinks destinations={account} current={scope.current} />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
