import AxeBuilder from '@axe-core/playwright'
import { test as base, type Page } from '@playwright/test'

// TRD testing: axe against WCAG 2.2 AA; a serious or critical finding fails.
const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const BLOCKING = new Set(['serious', 'critical'])

type Violation = Awaited<ReturnType<AxeBuilder['analyze']>>['violations'][number]

/**
 * Entrance animations (the landing's staggered rise) run once after paint; audit the settled page, not a mid-fade
 * frame. Infinite animations (the stadium drift) are left running. Bounded so a long animation delays the audit by
 * 3 s at most.
 */
export async function settleAnimations(page: Page) {
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
}

/** The serious and critical axe violations on the page, against WCAG 2.2 AA. */
export async function blockingViolations(page: Page): Promise<Violation[]> {
  await settleAnimations(page)
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
