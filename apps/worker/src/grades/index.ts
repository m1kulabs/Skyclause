import type { WorkerPart } from '../server'
import { gradeCrowd } from './crowd'
import { gradeEngine } from './engine'
import { gradeSky } from './sky'

export { gradeEngine, setGradeEngine, type GradeEngine } from './engine'

/** #161 c-grades (D26): `node main.js job grade-sky` at 23:55 and 06:30 MYT, `job grade-crowd` hourly. */
export const grades: WorkerPart = {
  owner: 'c-grades',
  jobs: {
    'grade-sky': () => gradeSky(gradeEngine(), new Date()),
    'grade-crowd': () => gradeCrowd(gradeEngine(), new Date())
  }
}
