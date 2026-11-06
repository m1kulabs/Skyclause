import type { Page } from '@playwright/test'

/** NFR-12: detect text clipped by its own box or any ancestor, including ellipsis and line clamps. */
export async function expectUnclippedText(page: Page): Promise<void> {
  const findings = await page.locator('body').evaluate((body) => {
    const failures = new Set<string>()
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      const parent = node.parentElement
      if (!parent || !node.textContent?.trim() || parent.closest('script,style,noscript')) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      if (!range.getClientRects().length) continue
      // Visually hidden labels and the offscreen skip link are deliberate, not clipped visible copy.
      if (parent.closest('.sr-only') || (parent.closest('.skip-link') && !parent.matches(':focus'))) continue
      for (let element: HTMLElement | null = parent; element; element = element.parentElement) {
        const style = getComputedStyle(element)
        if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) break
        const clipsX = ['hidden', 'clip'].includes(style.overflowX) || style.textOverflow === 'ellipsis'
        const clipsY = ['hidden', 'clip'].includes(style.overflowY)
        if (
          (clipsX && element.scrollWidth > element.clientWidth) ||
          (clipsY && element.scrollHeight > element.clientHeight)
        ) {
          failures.add(`${element.tagName.toLowerCase()}: ${node.textContent.trim()}`)
        }
      }
    }
    return [...failures]
  })
  if (findings.length) throw new Error(`Clipped text on ${page.url()}:\n${findings.join('\n')}`)
}
