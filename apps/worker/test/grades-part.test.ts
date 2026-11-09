// #161: the two Cloud Run jobs are registered, and until a composition root sets the engine's missing parts each
// refuses, naming them, before it opens a database connection.
import { expect, test } from 'vitest'
import { registry } from '../src/registry'

test('node main.js job grade-sky and grade-crowd refuse until the engine is composed', async () => {
  await expect(registry.jobs['grade-sky']!([])).rejects.toThrow(
    'grade-sky needs the reading history (#133) and the indicator registry (packages/sources), not yet set by setGradeEngine'
  )
  await expect(registry.jobs['grade-crowd']!([])).rejects.toThrow(
    'grade-crowd needs ForecastSource (#127) and the indicator registry (packages/sources), not yet set by setGradeEngine'
  )
})
