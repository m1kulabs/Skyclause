import AxeBuilder from '@axe-core/playwright'
import { test as base, type Page } from '@playwright/test'

// TRD testing: axe against WCAG 2.2 AA; a serious or critical finding fails.
const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const BLOCKING = new Set(['serious', 'critical'])

type Violation = Awaited<ReturnType<AxeBuilder['analyze']>>['violations'][number]

/** The serious and critical axe violations on the page, against WCAG 2.2 AA. */
export async function blockingViolations(page: Page): Promise<Violation[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze()
  return violations.filter((violation) => violation.impact && BLOCKING.has(violation.impact))
}

export async function expectAxeClean(page: Page) {
  const blocking = await blockingViolations(page)
  if (blocking.length) {
    const lines = blocking.map(
      (v) => `${v.id} (${v.impact}): ${v.help} at ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`
    )
    throw new Error(
      `axe found ${blocking.length} serious or critical violation(s) on ${page.url()}:\n${lines.join('\n')}`
    )
  }
}

export const test = base.extend<{ expectAxeClean: typeof expectAxeClean }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take their dependencies by destructuring.
  expectAxeClean: async ({}, use) => {
    await use(expectAxeClean)
  }
})

export { expect } from '@playwright/test'
