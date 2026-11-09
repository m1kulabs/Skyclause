import { notBuilt, type BudgetGate } from '@skyclause/contracts'

// #79 §1 `BudgetGate` is d-guest-rules' (#181): the daily guest and reviewer-link budgets (GST-8, PRJ-6).
export const budgetGate: BudgetGate = notBuilt('d-guest-rules')
