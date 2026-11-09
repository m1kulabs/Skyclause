import { getProjectAnalysis } from './analysis/getProjectAnalysis'
import { getOrganisationAnalysis } from './analysis/getOrganisationAnalysis'
import { evaluateWhatIf } from './analysis/evaluateWhatIf'

export { getProjectAnalysis } from './analysis/getProjectAnalysis'
export { getOrganisationAnalysis } from './analysis/getOrganisationAnalysis'
export { evaluateWhatIf } from './analysis/evaluateWhatIf'

export const routes = [getProjectAnalysis, getOrganisationAnalysis, evaluateWhatIf] as const
