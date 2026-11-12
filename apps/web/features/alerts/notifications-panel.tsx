'use client'

import { useEffect, useState } from 'react'
import { DeviceAlerts } from './device-alerts'
import { Inbox } from './inbox'
import { Devices } from './devices'
import { Preferences } from './preferences'
import { SettingsAside } from '../settings/parts'
import { t, type Locale } from './i18n'
import styles from './alerts.module.css'

export function NotificationsPanel({ accountId, locale }: { accountId: string; locale: Locale }) {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const registered = () => setVersion((value) => value + 1)
    window.addEventListener('skyclause:push-registered', registered)
    return () => window.removeEventListener('skyclause:push-registered', registered)
  }, [])
  return (
    <div className={styles.panel} data-alerts-panel lang={locale}>
      <SettingsAside>
        <p>{t('alerts.help', {}, locale)}</p>
      </SettingsAside>
      <Inbox locale={locale} />
      <DeviceAlerts embedded locale={locale} endpointVersion={version} />
      <Devices
        accountId={accountId}
        locale={locale}
        version={version}
        onRemoved={() => setVersion((value) => value + 1)}
      />
      <Preferences locale={locale} />
    </div>
  )
}
