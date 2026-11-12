'use client'

import { useId, type ReactNode } from 'react'
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
import { t, type Locale } from './i18n'
import type { Destination, DestinationKey } from './navigation'
import type { ShellScope } from './scope'
import { signOutStatus, useSignOut } from './sign-out'

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

function DestinationLinks({
  destinations,
  current,
  locale
}: {
  destinations: Destination[]
  current?: DestinationKey
  locale: Locale
}) {
  return destinations.map((destination) => (
    <MenuLink
      key={destination.key}
      href={destination.href}
      current={destination.key === current}
      label={t(`app-shell.${destination.key}`, {}, locale)}
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
  const { data, membership, locale } = scope
  return (
    <DropdownMenu>
      <SwitcherTrigger label={t('app-shell.organisationLabel', { name: scope.orgName }, locale)} name={scope.orgName} />
      <DropdownMenuContent className="shell-menu">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('app-shell.switchOrganisation', {}, locale)}</DropdownMenuLabel>
          {data.membershipsError && <Note>{t('app-shell.organisationsUnavailable', {}, locale)}</Note>}
          {data.memberships.map((item) => (
            <DropdownMenuItem
              key={item.org_id}
              className="shell-menu-item"
              render={
                <a
                  href={`/${encodeURIComponent(item.org_slug)}`}
                  aria-current={item.org_id === membership?.org_id ? 'true' : undefined}
                  aria-label={t(
                    'app-shell.membershipLabel',
                    { name: item.org_name, role: t(`app-shell.roles.${item.role}`, {}, locale) },
                    locale
                  )}
                />
              }
            >
              <span>{item.org_name}</span>
              <span
                className="shell-menu-meta"
                aria-hidden="true"
                data-role={t(`app-shell.roles.${item.role}`, {}, locale)}
              />
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        {!scope.guestAccount && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <MenuLink href="/new" label={t('app-shell.createOrganisation', {}, locale)} />
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The next step when an organisation has no project: create one, or ask an admin to. */
export function canCreateProject(scope: ShellScope) {
  return scope.role === 'owner' || scope.role === 'admin'
}

export function ProjectSwitcher({ scope }: { scope: ShellScope }) {
  const { org, project, projects, projectsError, locale } = scope
  return (
    <DropdownMenu>
      <SwitcherTrigger
        label={t('app-shell.projectLabel', { name: scope.projectName }, locale)}
        name={scope.projectName}
      />
      <DropdownMenuContent className="shell-menu">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('app-shell.switchProject', {}, locale)}</DropdownMenuLabel>
          {projectsError ? (
            <Note>{t('app-shell.projectsUnavailable', {}, locale)}</Note>
          ) : (
            !projects.length && <Note>{t('app-shell.noProjects', {}, locale)}</Note>
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
            <DropdownMenuGroup>
              <MenuLink href={`/${encodeURIComponent(org)}/new`} label={t('app-shell.createProject', {}, locale)} />
            </DropdownMenuGroup>
          </>
        ) : (
          !projects.length &&
          !projectsError && (
            <DropdownMenuGroup>
              <Note>{t('app-shell.askProject', {}, locale)}</Note>
            </DropdownMenuGroup>
          )
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
        aria-label={t('app-shell.moreLabel', {}, scope.locale)}
        data-current={current ? '' : undefined}
      >
        <span>{t('app-shell.more', {}, scope.locale)}</span>
        <ChevronDownIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="shell-menu">
        <DropdownMenuGroup>
          <DestinationLinks destinations={scope.projectMenu} current={scope.current} locale={scope.locale} />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Ends this session; the menu stays open while it does, so a failure is read where it was chosen. The item is named
 * Sign out in every state; progress and failure are its description, a status line mounted inside it (a menu may hold
 * only items, so the line cannot sit beside it).
 */
function SignOutItem({ locale }: { locale: Locale }) {
  const { state, signOut } = useSignOut()
  const statusId = useId()
  const status = signOutStatus[state]
  return (
    <DropdownMenuItem
      className="shell-menu-item"
      closeOnClick={false}
      aria-label={t('app-shell.signOut', {}, locale)}
      aria-describedby={statusId}
      onClick={() => void signOut()}
    >
      <span>{t('app-shell.signOut', {}, locale)}</span>
      <span id={statusId} role="status" className="basis-full type-small text-muted-foreground empty:sr-only">
        {status ? t(status, {}, locale) : ''}
      </span>
    </DropdownMenuItem>
  )
}

/** A visitor without a session has nothing to sign out of; a guest's session could never be signed back into. */
export function offersSignOut(scope: ShellScope) {
  return !scope.data.signedOut && !scope.guestAccount
}

/** The organisation's pages and the account's, behind one control at the bar's right end. */
export function AccountMenu({ scope }: { scope: ShellScope }) {
  const organisation = scope.organisationMenu.filter((item) => !ACCOUNT_KEYS.includes(item.key))
  const account = scope.organisationMenu.filter((item) => ACCOUNT_KEYS.includes(item.key))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="shell-account" />}
        aria-label={t('app-shell.accountMenu', {}, scope.locale)}
      >
        <CircleUserRoundIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="shell-menu" align="end">
        {organisation.length > 0 && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>{scope.orgName}</DropdownMenuLabel>
              <DestinationLinks destinations={organisation} current={scope.current} locale={scope.locale} />
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('app-shell.accountGroup', {}, scope.locale)}</DropdownMenuLabel>
          <DestinationLinks destinations={account} current={scope.current} locale={scope.locale} />
        </DropdownMenuGroup>
        {offersSignOut(scope) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <SignOutItem locale={scope.locale} />
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
