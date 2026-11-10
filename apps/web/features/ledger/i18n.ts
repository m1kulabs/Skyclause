import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import ledgerEn from '../../../../packages/i18n/catalogue/en/ledger.json'
import ledgerMs from '../../../../packages/i18n/catalogue/ms/ledger.json'
import evidenceEn from '../../../../packages/i18n/catalogue/en/evidence.json'
import evidenceMs from '../../../../packages/i18n/catalogue/ms/evidence.json'

catalogueFiles['../catalogue/en/ledger.json'] = { default: ledgerEn }
catalogueFiles['../catalogue/ms/ledger.json'] = { default: ledgerMs }
catalogueFiles['../catalogue/en/evidence.json'] = { default: evidenceEn }
catalogueFiles['../catalogue/ms/evidence.json'] = { default: evidenceMs }

export { t } from '@skyclause/i18n'
