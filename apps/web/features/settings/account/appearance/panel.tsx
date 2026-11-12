'use client'

import type { ReactNode } from 'react'
import { CheckIcon } from 'lucide-react'
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

export default function Panel({ locale = 'en' }: { locale?: Locale }) {
  const copy = (key: string, vars: Record<string, string | number> = {}) =>
    t(`account-settings.appearance.${key}`, vars, locale)
  const { preferences, save, saving, saved, error } = useAccountPreferences(DEFAULT_PREFERENCES, locale)
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
            <legend className="sr-only">{copy('theme')}</legend>
            {themes.map((item) => (
              <Tile
                key={item.value}
                name="theme"
                value={item.value}
                checked={preferences.theme === item.value}
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
            <legend className="sr-only">{copy('contrast')}</legend>
            {contrasts.map((item) => (
              <Tile
                key={item.key}
                name="contrast"
                value={item.key}
                checked={preferences.high_contrast === item.value}
                label={copy(item.key)}
                note={copy(`${item.key}Note`)}
                onSelect={() => void save({ high_contrast: item.value })}
              >
                {item.value ? (
                  // Drawn in the scheme the page is in, chosen by the page's own class so nothing switches after paint.
                  <>
                    <span className={styles.whenDark}>
                      <Specimen scheme="dark" contrast locale={locale} />
                    </span>
                    <span className={styles.whenLight}>
                      <Specimen scheme="light" contrast locale={locale} />
                    </span>
                  </>
                ) : (
                  <Specimen contrast={false} locale={locale} />
                )}
              </Tile>
            ))}
          </fieldset>
        </SettingsPart>

        <SettingsPart title={copy('motion')} description={copy('motionDescription')}>
          <fieldset className={styles.choices}>
            <legend className="sr-only">{copy('motion')}</legend>
            {motions.map((item) => (
              <Tile
                key={item.key}
                name="motion"
                value={item.key}
                checked={preferences.reduced_motion === item.value}
                label={copy(item.key)}
                note={copy(`${item.key}Note`)}
                onSelect={() => void save({ reduced_motion: item.value })}
              >
                <div className={styles.preview} aria-hidden="true">
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
            <legend className="sr-only">{copy('density')}</legend>
            {densities.map((density) => (
              <Tile
                key={density}
                name="density"
                value={density}
                checked={preferences.density === density}
                label={copy(density)}
                note={copy(`${density}Note`)}
                onSelect={() => void save({ density })}
              >
                <div className={styles.preview} aria-hidden="true">
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
  label,
  note,
  onSelect,
  wide = false,
  children
}: {
  name: string
  value: string
  checked: boolean
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
    >
      <input type="radio" name={name} value={value} checked={checked} aria-checked={checked} onChange={onSelect} />
      {children}
      {checked ? (
        // The chosen card carries a mark as well as the ink edge and the heavier name, so it never rests on colour.
        <span className={styles.check} aria-hidden="true">
          <CheckIcon />
        </span>
      ) : null}
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
  /** Omitted, the specimen takes the page's own scheme. */
  scheme?: Scheme
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
