import { setSourceProbation } from './sources/setSourceProbation'
import { getNextProbationFrame } from './sources/getNextProbationFrame'
import { createProbationLabel } from './sources/createProbationLabel'

export { setSourceProbation } from './sources/setSourceProbation'
export { getNextProbationFrame } from './sources/getNextProbationFrame'
export { createProbationLabel } from './sources/createProbationLabel'

export const routes = [setSourceProbation, getNextProbationFrame, createProbationLabel] as const
