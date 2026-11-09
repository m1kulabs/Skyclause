import { listRuns } from './runs/listRuns'
import { createRun } from './runs/createRun'
import { getRun } from './runs/getRun'

export { listRuns } from './runs/listRuns'
export { createRun } from './runs/createRun'
export { getRun } from './runs/getRun'

export const routes = [listRuns, createRun, getRun] as const
