// Imported before the base config, which reads E2E_PORT as it loads: the flow stack's own ports, away from the 3100
// default other worktrees' `test:e2e` runs take. Test workers inherit both.
process.env.E2E_PORT ??= '49194'
process.env.E2E_WORKER_PORT ??= '49195'
