import { withLock } from './gas.ts'

// The 5-minute evaluation tick. #51's JPS handler calls it at the end of every poll; #54 fills it.
export function executeEvaluationTick(): void {}

export function runEvaluationTick(): void {
  withLock(() => {
    executeEvaluationTick()
  })
}
