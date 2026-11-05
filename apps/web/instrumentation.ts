// Next.js calls this once as the server starts; the Node-only check is imported only on the Node runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { checkEnv } = await import('./lib/env')
    checkEnv()
  }
}
