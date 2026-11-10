import { runSdkRuntimeSuite } from './suite'

const checks = await runSdkRuntimeSuite()
console.log(`passed ${checks} checks`)
