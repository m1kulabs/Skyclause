import type { Page } from '@playwright/test'

/** NFR-12: detect text clipped by its own box or any ancestor, including ellipsis and line clamps. */
export async function expectUnclippedText(page: Page): Promise<void> {
  // An entrance animation's transform overflows its mask until it ends: check the settled page. Infinite animations
  // keep running; the wait is bounded at 3 s.
  await page.evaluate(() =>
    Promise.race([
      Promise.allSettled(
        document.getAnimations().map((animation) => {
          const timing = (animation.effect as KeyframeEffect | null)?.getTiming()
          if (timing && (timing.iterations === Infinity || timing.duration === Infinity)) return null
          return animation.finished.catch(() => null)
        })
      ),
      new Promise((resolve) => setTimeout(resolve, 3000))
    ])
  )
  const findings = await page.locator('body').evaluate((body) => {
    const failures = new Set<string>()
    const modalOpen = !!body.querySelector(
      '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]'
    )
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      const parent = node.parentElement
      if (!parent || !node.textContent?.trim() || parent.closest('script,style,noscript')) continue
      if (parent.closest('[inert], [aria-hidden="true"]')) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      if (!range.getClientRects().length) continue
      // Visually hidden labels (the sr-only class, or a library's own 1px clipped box) and the offscreen skip link are
      // deliberate, not clipped visible copy.
      // The box may be an ancestor's: the shared table hides its header strip on a phone in a 1px clipped thead.
      let visuallyHidden = false
      for (let element: HTMLElement | null = parent; element && !visuallyHidden; element = element.parentElement) {
        const box = element.getBoundingClientRect()
        visuallyHidden = box.width <= 1 && box.height <= 1 && getComputedStyle(element).overflow === 'hidden'
      }
      if (parent.closest('.sr-only') || visuallyHidden || (parent.closest('.skip-link') && !parent.matches(':focus')))
        continue
      for (let element: HTMLElement | null = parent; element; element = element.parentElement) {
        const style = getComputedStyle(element)
        if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) break
        // The shared table's one-line truncation is deliberate when its cell's title carries the whole text.
        const cell = element.matches('[data-slot="table-truncate"]') ? element.closest('td, th') : null
        if (cell && (cell.getAttribute('title') ?? '').includes(element.textContent?.trim() ?? '\u0000')) continue
        const clipsX = ['hidden', 'clip'].includes(style.overflowX) || style.textOverflow === 'ellipsis'
        const clipsY = ['hidden', 'clip'].includes(style.overflowY)
        // Modal scroll locks freeze the background document. Fixed overlay text can still scroll in its own frame.
        const modalScrollLock = element === body && modalOpen && style.overflowY === 'hidden'
        if (
          (clipsX && element.scrollWidth > element.clientWidth) ||
          (clipsY && !modalScrollLock && element.scrollHeight > element.clientHeight)
        ) {
          failures.add(`${element.tagName.toLowerCase()}: ${node.textContent.trim()}`)
        }
      }
    }
    return [...failures]
  })
  if (findings.length) throw new Error(`Clipped text on ${page.url()}:\n${findings.join('\n')}`)
}
