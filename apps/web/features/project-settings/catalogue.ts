import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import en from '../../../../packages/i18n/catalogue/en/project-settings.json'
import ms from '../../../../packages/i18n/catalogue/ms/project-settings.json'

catalogueFiles['../catalogue/en/project-settings.json'] = { default: en }
catalogueFiles['../catalogue/ms/project-settings.json'] = { default: ms }

export { t } from '@skyclause/i18n'
