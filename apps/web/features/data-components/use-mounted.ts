import { useSyncExternalStore } from 'react'

const noSubscription = () => () => {}

/** False on the server and during hydration, true once the page is live: what depends on the clock waits for it. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false
  )
}
