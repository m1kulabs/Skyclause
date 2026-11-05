// Next.js calls this once as the server starts; the Node-only start-up is imported only on the Node runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startServer } = await import('./lib/start')
    startServer()
  }
}
