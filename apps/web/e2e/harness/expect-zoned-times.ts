import type { Page } from '@playwright/test'

export async function expectZonedTimes(page: Page): Promise<void> {
  const offenders = await page.locator('body').evaluate((body) => {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
    const visibleText: string[] = []

    while (walker.nextNode()) {
      const node = walker.currentNode
      const element = node.parentElement
      if (!element || element.closest('time[datetime]')) continue

      const range = document.createRange()
      range.selectNodeContents(node)
      if (!range.getClientRects().length) continue
      let hidden = false
      for (let current: HTMLElement | null = element; current; current = current.parentElement) {
        const style = window.getComputedStyle(current)
        if (
          current.hidden ||
          style.visibility === 'hidden' ||
          style.display === 'none' ||
          style.contentVisibility === 'hidden' ||
          Number(style.opacity) === 0
        ) {
          hidden = true
          break
        }
      }
      if (hidden) continue
      visibleText.push(node.textContent ?? '')
    }

    const text = visibleText.join(' ')
    const findings: string[] = []
    const times = /\b\d{2}:\d{2}\b/g
    for (const match of text.matchAll(times)) {
      const start = (match.index ?? 0) + match[0].length
      const nextTime = text.slice(start).search(times)
      const end = nextTime === -1 ? Math.min(text.length, start + 12) : Math.min(text.length, start + nextTime)
      if (!/\bMYT\b/.test(text.slice(start, end))) findings.push(match[0])
    }
    return findings
  })

  if (offenders.length) {
    throw new Error(`Visible times without MYT on ${page.url()}: ${[...new Set(offenders)].join(', ')}`)
  }
}
