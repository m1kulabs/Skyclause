import './catalogue'
import type { ReactNode } from 'react'
import type { Principal } from '@skyclause/contracts'
import { t } from '@skyclause/i18n'
import Link from 'next/link'
import { Separator } from '#ui/separator'
import { maySeeSettings, type SettingsScope } from './access'
import { settingsHref, settingsSections } from './sections'
import styles from './frame.module.css'

export interface SettingsFrameProps {
  scope: SettingsScope
  section: string
  principal: Principal | null
  org?: string
  project?: string
  children: ReactNode
}

export function SettingsFrame({ scope, section, principal, org, project, children }: SettingsFrameProps) {
  const labelId = `settings-${scope}-${section}`
  // The gate admitted this page, so a session's orgId is the URL organisation's: its ID for a real session (#94,
  // filled by the page helper), the URL's name for a test principal. `org` names it in links.
  const orgId = principal?.kind === 'session' ? (principal.orgId ?? undefined) : org
  return (
    <div className={styles.frame} data-settings-frame>
      <h1 className={styles.title} tabIndex={-1}>
        {t(`settings.scopes.${scope}`)}
      </h1>
      <nav className={styles.nav} aria-label={t(`settings.scopes.${scope}`)} data-settings-nav>
        {settingsSections[scope]
          .filter((item) => maySeeSettings(principal, { scope, section: item, orgId }))
          .map((item) => (
            <Link
              className={styles.link}
              key={item}
              href={settingsHref(scope, item, org, project)}
              aria-current={item === section ? 'page' : undefined}
            >
              <span>{t(`settings.sections.${scope}.${item}.title`)}</span>
            </Link>
          ))}
      </nav>
      <Separator className="h-px w-full" />
      <section className={styles.columns} aria-labelledby={labelId} data-settings-columns>
        <div className={styles.label} data-settings-label>
          <h2 id={labelId}>{t(`settings.sections.${scope}.${section}.title`)}</h2>
          <p>{t(`settings.sections.${scope}.${section}.description`)}</p>
        </div>
        <div className={styles.panel} data-settings-panel>
          {children}
        </div>
      </section>
      <Separator className="h-px w-full" />
    </div>
  )
}
