import { runSdkRuntimeSuite } from './suite'

declare global {
  interface Window {
    __runSdkRuntimeSuite: () => Promise<number>
  }
}

window.__runSdkRuntimeSuite = runSdkRuntimeSuite
