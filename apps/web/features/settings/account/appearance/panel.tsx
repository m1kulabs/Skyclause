'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_PREFERENCES } from '@skyclause/contracts'
import { t } from '@skyclause/i18n'
import { cn } from '#lib/utils'
import { StatusMark } from '../../../brand/status-mark'
import { useAccountPreferences } from '../../../account/use-account-preferences'
import {
  NativeSelect,
  SettingsAside,
  SettingsError,
  SettingsField,
  SettingsParts,
  SettingsPart,
  SettingsStatus,
  SettingsSummaryLine,
  SettingsSwitchRow
} from '../../parts'
import styles from './appearance.module.css'
import '../../catalogue'

type Scheme = 'dark' | 'light'
type Locale = 'en' | 'ms'

const themes = [
  { value: 'dark', key: 'dusk' },
  { value: 'light', key: 'day' },
  { value: 'system', key: 'system' }
] as const
const contrasts = [
  { value: false, key: 'contrastSystem' },
  { value: true, key: 'contrastMore' }
] as const
const motions = [
  { value: false, key: 'motionSystem' },
  { value: true, key: 'motionReduce' }
] as const
const densities = ['comfortable', 'compact'] as const

/** The scheme the document is drawn in now, followed live: the contrast previews are drawn in it. */
function useDocumentScheme(): Scheme {
  const [scheme, setScheme] = useState<Scheme>('dark')
  useEffect(() => {
    const root = document.documentElement
    const read = () => setScheme(root.classList.contains('light') ? 'light' : 'dark')
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return scheme
}

export default function Panel({ locale = 'en' }: { locale?: Locale }) {
  const copy = (key: string, vars: Record<string, string | number> = {}) =>
    t(`account-settings.appearance.${key}`, vars, locale)
  const { preferences, save, saving, saved, error } = useAccountPreferences(DEFAULT_PREFERENCES)
  const scheme = useDocumentScheme()
  const theme = themes.find((item) => item.value === preferences.theme) ?? themes[0]
  const contrast = contrasts.find((item) => item.value === preferences.high_contrast) ?? contrasts[0]
  const motion = motions.find((item) => item.value === preferences.reduced_motion) ?? motions[0]

  return (
    <div data-account-panel="appearance" aria-busy={saving}>
      <SettingsAside>
        <SettingsSummaryLine label={copy('theme')}>{copy(theme.key)}</SettingsSummaryLine>
        <SettingsSummaryLine label={copy('contrast')}>{copy(contrast.key)}</SettingsSummaryLine>
        <SettingsSummaryLine label={copy('motion')}>{copy(motion.key)}</SettingsSummaryLine>
        <SettingsSummaryLine label={copy('density')}>{copy(preferences.density)}</SettingsSummaryLine>
        <SettingsSummaryLine label={copy('language')}>
          {preferences.language === 'ms' ? copy('bahasaMelayu') : copy('english')}
        </SettingsSummaryLine>
      </SettingsAside>
      <SettingsParts>
        <SettingsPart title={copy('theme')} description={copy('themeDescription')}>
          <fieldset className={styles.choices}>
            <legend>{copy('theme')}</legend>
            {themes.map((item) => (
              <Tile
                key={item.value}
                name="theme"
                value={item.value}
                checked={preferences.theme === item.value}
                disabled={saving}
                label={copy(item.key)}
                note={copy(`${item.key}Note`)}
                wide={item.value === 'system'}
                onSelect={() => void save({ theme: item.value })}
              >
                {item.value === 'system' ? (
                  <div className={styles.pair} aria-hidden="true">
                    <Specimen scheme="dark" locale={locale} compact />
                    <Specimen scheme="light" locale={locale} compact />
                  </div>
                ) : (
                  <Specimen scheme={item.value} locale={locale} />
                )}
              </Tile>
            ))}
          </fieldset>
        </SettingsPart>

        <SettingsPart title={copy('contrast')} description={copy('contrastDescription')}>
          <fieldset className={styles.choices}>
            <legend>{copy('contrast')}</legend>
            {contrasts.map((item) => (
              <Tile
                key={item.key}
                name="contrast"
                value={item.key}
                checked={preferences.high_contrast === item.value}
                disabled={saving}
                label={copy(item.key)}
                note={copy(`${item.key}Note`)}
                onSelect={() => void save({ high_contrast: item.value })}
              >
                <Specimen scheme={scheme} contrast={item.value} locale={locale} />
              </Tile>
            ))}
          </fieldset>
        </SettingsPart>

        <SettingsPart title={copy('motion')} description={copy('motionDescription')}>
          <fieldset className={styles.choices}>
            <legend>{copy('motion')}</legend>
            {motions.map((item) => (
              <Tile
                key={item.key}
                name="motion"
                value={item.key}
                checked={preferences.reduced_motion === item.value}
                disabled={saving}
                label={copy(item.key)}
                note={copy(`${item.key}Note`)}
                onSelect={() => void save({ reduced_motion: item.value })}
              >
                <div className={cn(styles.preview, scheme)} aria-hidden="true">
                  <div className={styles.track} data-motion={item.value ? 'reduce' : 'full'}>
                    <span className={styles.traveller} />
                  </div>
                </div>
              </Tile>
            ))}
          </fieldset>
        </SettingsPart>

        <SettingsPart title={copy('density')} description={copy('densityDescription')}>
          <fieldset className={styles.choices}>
            <legend>{copy('density')}</legend>
            {densities.map((density) => (
              <Tile
                key={density}
                name="density"
                value={density}
                checked={preferences.density === density}
                disabled={saving}
                label={copy(density)}
                note={copy(`${density}Note`)}
                onSelect={() => void save({ density })}
              >
                <div className={cn(styles.preview, scheme)} aria-hidden="true">
                  <div className={styles.rows} data-density={density}>
                    {(['previewRowWindows', 'previewRowCalls'] as const).map((row) => (
                      <div className={styles.row} key={row}>
                        <span>{copy(row)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Tile>
            ))}
          </fieldset>
        </SettingsPart>

        <SettingsPart title={copy('languageAndShortcuts')} description={copy('languageDescription')}>
          <SettingsField label={copy('language')} hint={copy('languageHelp')} className="max-w-80">
            {(aria) => (
              <NativeSelect
                {...aria}
                name="language"
                autoComplete="off"
                value={preferences.language}
                disabled={saving}
                onChange={(event) => void save({ language: event.target.value as Locale })}
              >
                <option value="en">{copy('english')}</option>
                <option value="ms">{copy('bahasaMelayu')}</option>
              </NativeSelect>
            )}
          </SettingsField>
          <SettingsSwitchRow
            id="keyboard-shortcuts"
            title={copy('keyboardShortcuts')}
            description={copy('keyboardShortcutsDescription')}
            state={preferences.shortcuts ? copy('on') : copy('off')}
            checked={preferences.shortcuts}
            disabled={saving}
            onCheckedChange={(checked) => void save({ shortcuts: checked })}
          />
        </SettingsPart>

        {error ? <SettingsError>{error}</SettingsError> : null}
        <SettingsStatus>{saving ? copy('saving') : saved ? copy('saved') : null}</SettingsStatus>
      </SettingsParts>
    </div>
  )
}

/** One selectable choice: its preview, its name and what it does. The radio is real; the tile is its label. */
function Tile({
  name,
  value,
  checked,
  disabled,
  label,
  note,
  onSelect,
  wide = false,
  children
}: {
  name: string
  value: string
  checked: boolean
  disabled: boolean
  label: string
  note: string
  onSelect: () => void
  wide?: boolean
  children: ReactNode
}) {
  return (
    <label
      data-wide={wide || undefined}
      className={cn(styles.tile, 'current-mark')}
      data-current={checked || undefined}
      data-disabled={disabled || undefined}
    >
      <input type="radio" name={name} value={value} checked={checked} disabled={disabled} onChange={onSelect} />
      {children}
      <span className={styles.name}>{label}</span>
      <span className={styles.note}>{note}</span>
    </label>
  )
}

/** A piece of the real interface in one scheme: mode capsules, primary and quiet controls. Drawn, never clicked. */
function Specimen({
  scheme,
  contrast = false,
  compact = false,
  locale
}: {
  scheme: Scheme
  contrast?: boolean
  compact?: boolean
  locale: Locale
}) {
  const copy = (key: string) => t(`account-settings.appearance.${key}`, {}, locale)
  return (
    <div className={cn(styles.preview, scheme, contrast && 'hc')} aria-hidden="true">
      <div className={styles.marks}>
        <StatusMark state="normal" locale={locale} />
        {compact ? null : (
          <span className={styles.optional}>
            <StatusMark state="outdoor_limited" locale={locale} />
          </span>
        )}
      </div>
      <div className={styles.marks}>
        <span className={styles.capsule}>{copy('previewApprove')}</span>
        {compact ? null : <span className={cn(styles.capsule, styles.quiet)}>{copy('previewEdit')}</span>}
      </div>
    </div>
  )
}
