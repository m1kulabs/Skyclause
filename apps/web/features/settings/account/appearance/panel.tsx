'use client'

import { DEFAULT_PREFERENCES } from '@skyclause/contracts'
import { t } from '@skyclause/i18n'
import { Label } from '#ui/label'
import { Switch } from '#ui/switch'
import styles from '../../../account/account-settings.module.css'
import { useAccountPreferences } from '../../../account/use-account-preferences'
import '../../catalogue'

const themes = ['light', 'dark', 'system'] as const
const densities = ['compact', 'comfortable'] as const

export default function Panel() {
  const { preferences, save, saving, error } = useAccountPreferences(DEFAULT_PREFERENCES)

  return (
    <div className={styles.panel} data-account-panel="appearance" aria-busy={saving}>
      <section className={styles.section} aria-labelledby="appearance-theme">
        <div>
          <h3 id="appearance-theme" className={styles.sectionTitle}>
            {t('account-settings.appearance.theme')}
          </h3>
          <p className={styles.description}>{t('account-settings.appearance.themeDescription')}</p>
        </div>
        <fieldset className="grid min-w-0 gap-2">
          <legend className="sr-only">{t('account-settings.appearance.theme')}</legend>
          <div className={styles.radioGrid}>
            {themes.map((theme) => (
              <label className={styles.radioCard} key={theme}>
                <input
                  type="radio"
                  name="theme"
                  value={theme}
                  aria-label={t(`account-settings.appearance.${theme}`)}
                  checked={preferences.theme === theme}
                  disabled={saving}
                  onChange={() => void save({ theme })}
                />
                <span className={styles.fieldTitle}>{t(`account-settings.appearance.${theme}`)}</span>
                <span className={styles.preview} data-preview-theme={theme} aria-hidden="true">
                  <span className={styles.previewLine}>{t('account-settings.appearance.previewWindow')}</span>
                  <span className={styles.previewLine}>
                    <span className={styles.previewStatus}>{t('account-settings.appearance.previewWatch')}</span>
                    <span className={styles.previewRain}>{t('account-settings.appearance.previewRain')}</span>
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className={styles.section} aria-labelledby="appearance-details">
        <div>
          <h3 id="appearance-details" className={styles.sectionTitle}>
            {t('account-settings.appearance.display')}
          </h3>
          <p className={styles.description}>{t('account-settings.appearance.displayDescription')}</p>
        </div>
        <PreferenceSwitch
          id="high-contrast"
          title={t('account-settings.appearance.highContrast')}
          description={t('account-settings.appearance.highContrastDescription')}
          checked={preferences.high_contrast}
          disabled={saving}
          onChange={(checked) => void save({ high_contrast: checked })}
        />
        <fieldset className="grid min-w-0 gap-2">
          <legend className={styles.fieldTitle}>{t('account-settings.appearance.density')}</legend>
          <p className={styles.help}>{t('account-settings.appearance.densityDescription')}</p>
          <div className="flex flex-wrap gap-4">
            {densities.map((density) => (
              <label className="inline-flex min-h-11 items-center gap-2" key={density}>
                <input
                  type="radio"
                  name="density"
                  value={density}
                  checked={preferences.density === density}
                  disabled={saving}
                  onChange={() => void save({ density })}
                />
                <span>{t(`account-settings.appearance.${density}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <PreferenceSwitch
          id="sidebar-collapsed"
          title={t('account-settings.appearance.collapseSidebar')}
          description={t('account-settings.appearance.collapseSidebarDescription')}
          checked={preferences.sidebar_collapsed}
          disabled={saving}
          onChange={(checked) => void save({ sidebar_collapsed: checked })}
        />
        <PreferenceSwitch
          id="reduced-motion"
          title={t('account-settings.appearance.reducedMotion')}
          description={t('account-settings.appearance.reducedMotionDescription')}
          checked={preferences.reduced_motion}
          disabled={saving}
          onChange={(checked) => void save({ reduced_motion: checked })}
        />
      </section>

      <section className={styles.section} aria-labelledby="appearance-language">
        <div>
          <h3 id="appearance-language" className={styles.sectionTitle}>
            {t('account-settings.appearance.languageAndShortcuts')}
          </h3>
          <p className={styles.description}>{t('account-settings.appearance.languageDescription')}</p>
        </div>
        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <Label htmlFor="account-language" className={styles.fieldTitle}>
              {t('account-settings.appearance.language')}
            </Label>
            <p className={styles.help}>{t('account-settings.appearance.languageHelp')}</p>
          </div>
          <select
            id="account-language"
            className="min-h-11 rounded-lg border border-input bg-background px-3 text-[13px]"
            value={preferences.language}
            disabled={saving}
            onChange={(event) => void save({ language: event.target.value as 'en' | 'ms' })}
          >
            <option value="en">{t('account-settings.appearance.english')}</option>
            <option value="ms">{t('account-settings.appearance.bahasaMelayu')}</option>
          </select>
        </div>
        <PreferenceSwitch
          id="keyboard-shortcuts"
          title={t('account-settings.appearance.keyboardShortcuts')}
          description={t('account-settings.appearance.keyboardShortcutsDescription')}
          checked={preferences.shortcuts}
          disabled={saving}
          onChange={(checked) => void save({ shortcuts: checked })}
        />
      </section>
      {error && (
        <p className={styles.alert} role="alert">
          {error}
        </p>
      )}
      {saving && (
        <p className={styles.status} role="status">
          {t('account-settings.appearance.saving')}
        </p>
      )}
    </div>
  )
}

function PreferenceSwitch({
  id,
  title,
  description,
  checked,
  disabled,
  onChange
}: {
  id: string
  title: string
  description: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className={styles.field} data-density-row>
      <div className={styles.fieldLabel}>
        <Label htmlFor={id} className={styles.fieldTitle}>
          {title}
        </Label>
        <p className={styles.help}>{description}</p>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={title} />
    </div>
  )
}
