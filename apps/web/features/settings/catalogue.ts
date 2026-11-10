import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import enSettings from '../../../../packages/i18n/catalogue/en/settings.json'
import msSettings from '../../../../packages/i18n/catalogue/ms/settings.json'
import enAccountSettings from '../../../../packages/i18n/catalogue/en/account-settings.json'

// Register only when the settings surface loads, keeping its copy out of marketing imports.
catalogueFiles['../catalogue/en/settings.json'] = { default: enSettings }
catalogueFiles['../catalogue/ms/settings.json'] = { default: msSettings }
catalogueFiles['../catalogue/en/account-settings.json'] = { default: enAccountSettings }
