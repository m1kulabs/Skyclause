const ANNOUNCER_ID = 'skyclause-announcer'
let timer: ReturnType<typeof setTimeout> | undefined

/** Write a message to the single polite live region mounted by the app layout. */
export function announce(message: string): void {
  if (typeof document === 'undefined') return
  const region = document.getElementById(ANNOUNCER_ID)
  if (!region) return

  if (timer) clearTimeout(timer)
  region.textContent = ''
  timer = setTimeout(() => {
    region.textContent = message
    timer = undefined
  }, 30)
}

export function Announcer() {
  return <div id={ANNOUNCER_ID} className="sr-only" role="status" aria-live="polite" aria-atomic="true" />
}
