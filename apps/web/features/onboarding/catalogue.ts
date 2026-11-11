import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import en from '../../../../packages/i18n/catalogue/en/onboarding.json'
import ms from '../../../../packages/i18n/catalogue/ms/onboarding.json'

catalogueFiles['../catalogue/en/onboarding.json'] = { default: en }
catalogueFiles['../catalogue/ms/onboarding.json'] = { default: ms }

export { t } from '@skyclause/i18n'
