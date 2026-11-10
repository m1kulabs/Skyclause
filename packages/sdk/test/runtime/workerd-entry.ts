import { runSdkRuntimeSuite } from './suite'

export default {
  async fetch(): Promise<Response> {
    try {
      const checks = await runSdkRuntimeSuite()
      return Response.json({ checks })
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
    }
  }
}
