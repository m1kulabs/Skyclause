'use client'

import { useRef, useState, type ReactNode } from 'react'
import { MenuIcon, SearchIcon } from 'lucide-react'
import { Button } from '#ui/button'
import { PhoneSheet, PhoneSheetItem } from '#ui/phone-sheet'
import { openPalette } from '../palette/open'
import { ShellClock } from './clock'
import { t } from './i18n'
import type { Destination } from './navigation'
import type { ShellScope } from './scope'
import { canCreateProject } from './switchers'

const ACCOUNT_KEYS = new Set(['connect', 'account', 'appearance'])

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="shell-sheet-section" aria-labelledby={id}>
      <h3 id={id} className="shell-sheet-heading">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Links({ destinations, scope }: { destinations: Destination[]; scope: ShellScope }) {
  return destinations.map((destination) => (
    <PhoneSheetItem key={destination.key} href={destination.href} current={scope.current === destination.key}>
      {t(`app-shell.${destination.key}`)}
    </PhoneSheetItem>
  ))
}

/**
 * At 640px and below the bar keeps the wordmark, Review and this button: every destination and both switchers live in
 * the sheet it opens.
 */
export function PhoneMenu({ scope, now }: { scope: ShellScope; now: string }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const { data, org, projects } = scope

  // Two modals can't hold focus at once: close the sheet, wait for it to leave the page, then open the palette.
  function searchFromSheet() {
    setOpen(false)
    let frames = 0
    const whenClosed = () => {
      if (document.querySelector('[data-slot="phone-sheet"]') && frames++ < 60) requestAnimationFrame(whenClosed)
      else openPalette(trigger.current)
    }
    requestAnimationFrame(whenClosed)
  }
  const organisation = scope.organisationMenu.filter((item) => !ACCOUNT_KEYS.has(item.key))
  const account = scope.organisationMenu.filter((item) => ACCOUNT_KEYS.has(item.key))

  return (
    <PhoneSheet
      open={open}
      onOpenChange={setOpen}
      title={t('app-shell.menuTitle')}
      className="shell-sheet"
      trigger={
        <Button ref={trigger} variant="secondary" className="shell-phone-menu">
          <MenuIcon aria-hidden="true" />
          <span>{t('app-shell.menu')}</span>
        </Button>
      }
    >
      <div className="shell-sheet-tools">
        <Button variant="secondary" onClick={searchFromSheet}>
          <SearchIcon aria-hidden="true" />
          <span>{t('app-shell.palette')}</span>
        </Button>
        <p className="shell-live">
          <ShellClock now={now} />
        </p>
      </div>
      {scope.core.length > 0 && (
        <Section id="shell-sheet-project" title={scope.projectName}>
          <Links destinations={[...scope.core, ...scope.projectMenu]} scope={scope} />
        </Section>
      )}
      {organisation.length > 0 && (
        <Section id="shell-sheet-organisation" title={scope.orgName}>
          <Links destinations={organisation} scope={scope} />
        </Section>
      )}
      <Section id="shell-sheet-account" title={t('app-shell.accountGroup')}>
        <Links destinations={account} scope={scope} />
      </Section>
      <Section id="shell-sheet-organisations" title={t('app-shell.switchOrganisation')}>
        {data.membershipsError && <p className="shell-sheet-note">{t('app-shell.organisationsUnavailable')}</p>}
        {data.memberships.map((item) => (
          <PhoneSheetItem
            key={item.org_id}
            href={`/${encodeURIComponent(item.org_slug)}`}
            aria-label={t('app-shell.membershipLabel', {
              name: item.org_name,
              role: t(`app-shell.roles.${item.role}`)
            })}
          >
            <span>{item.org_name}</span>
            <span className="shell-menu-meta" aria-hidden="true" data-role={t(`app-shell.roles.${item.role}`)} />
          </PhoneSheetItem>
        ))}
        <PhoneSheetItem href="/new">{t('app-shell.createOrganisation')}</PhoneSheetItem>
      </Section>
      {org && (
        <Section id="shell-sheet-projects" title={t('app-shell.switchProject')}>
          {scope.projectsError ? (
            <p className="shell-sheet-note">{t('app-shell.projectsUnavailable')}</p>
          ) : (
            !projects.length && <p className="shell-sheet-note">{t('app-shell.noProjects')}</p>
          )}
          {projects.map((item) => (
            <PhoneSheetItem key={item.id} href={`/${encodeURIComponent(org)}/${encodeURIComponent(item.slug)}`}>
              {item.name}
            </PhoneSheetItem>
          ))}
          {canCreateProject(scope) ? (
            <PhoneSheetItem href={`/${encodeURIComponent(org)}/new`}>{t('app-shell.createProject')}</PhoneSheetItem>
          ) : (
            !projects.length && !scope.projectsError && <p className="shell-sheet-note">{t('app-shell.askProject')}</p>
          )}
        </Section>
      )}
    </PhoneSheet>
  )
}
