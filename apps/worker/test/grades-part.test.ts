// #161: the two Cloud Run jobs are registered, and until a composition root sets the engine's missing parts each
// refuses, naming them, before it opens a database connection.
import { expect, test } from 'vitest'
import { registry } from '../src/registry'

test('production Sky grading has real history; Crowd still explicitly requires the forecast provider', async () => {
  await expect(registry.jobs['grade-sky']!([])).resolves.toBeUndefined()
  await expect(registry.jobs['grade-crowd']!([])).rejects.toThrow('grade-crowd needs ForecastSource (#127)')
})
