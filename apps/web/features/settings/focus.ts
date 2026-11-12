/**
 * Focuses an element as soon as it can take focus. A confirm dialog closes after its work is done, and while it
 * closes the rest of the page is still inert; the control that opened it may also be gone with its row. This waits
 * for the page to be free (a few tries, 50 ms apart) and then focuses what `find` returns, so focus never drops to
 * the document.
 */
export function focusWhenFree(find: () => HTMLElement | null, tries = 20) {
  let attempt = 0
  const run = () => {
    const element = find()
    element?.focus()
    if (element && document.activeElement === element) return
    if (attempt++ < tries) window.setTimeout(run, 50)
  }
  window.setTimeout(run, 0)
}

/** `focusWhenFree` for a part's heading (`SettingsPart` headings take focus), by the id given to the part. */
export function focusHeadingWhenFree(id: string) {
  focusWhenFree(() => document.getElementById(id))
}
