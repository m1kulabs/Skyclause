import { notBuilt, type BudgetGate } from '@skyclause/contracts'

// #79 §1 BudgetGate (d-guest-rules, #181); the run orchestrator (#151) calls it from the API and the worker.
export const budgetGate: BudgetGate = notBuilt('d-guest-rules')
