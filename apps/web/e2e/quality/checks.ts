// The per-page checks of #116 (NFR-4 to NFR-9): each returns findings rather than throwing, so the crawl can
// report every route, role, theme and rule that failed at once.
import type { Page } from '@playwright/test'
import { blockingViolations } from '../fixtures'

export interface Finding {
  check: string
  detail: string
}

export interface InspectOptions {
  /** axe needs page timers, so it can't run with JavaScript off. */
  axe: boolean
  /** Only meaningful at 320 px (WCAG 1.4.10). */
  reflow: boolean
}

export async function inspectPage(page: Page, options: InspectOptions): Promise<Finding[]> {
  const findings: Finding[] = []
  if (options.axe) {
    for (const violation of await blockingViolations(page)) {
      const where = violation.nodes.map((node) => node.target.join(' ')).join(', ')
      findings.push({ check: 'axe', detail: `${violation.id} (${violation.impact}): ${violation.help} at ${where}` })
    }
  }
  findings.push(...(await page.evaluate(domFindings, options.reflow)))
  findings.push(...(await keyboardFindings(page)))
  return findings
}

/** Under reduced motion (OS or account), nothing is left animating once the page has painted. */
export async function motionFindings(page: Page): Promise<Finding[]> {
  return page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return document
      .getAnimations()
      .filter((animation) => animation.playState === 'running')
      .map((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target
        const name =
          (animation as CSSAnimation).animationName ?? (animation as CSSTransition).transitionProperty ?? 'animation'
        return { check: 'reduced-motion', detail: `${name} still runs on ${target?.tagName.toLowerCase() ?? 'page'}` }
      })
  })
}

/** Runs in the page, so it stays self-contained. */
function domFindings(reflow: boolean): Finding[] {
  const findings: Finding[] = []
  const describe = (el: Element) => {
    const id = el.id ? `#${el.id}` : ''
    const name = el.getAttribute('name') ? `[name="${el.getAttribute('name')}"]` : ''
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
    return `${el.tagName.toLowerCase()}${id}${name}${text ? ` "${text}"` : ''}`
  }
  const exposed = (el: Element) =>
    el.checkVisibility({ visibilityProperty: true }) && !el.closest('[aria-hidden="true"]')

  // NFR-5, DESIGN accessibility: one h1 per screen and ordered headings.
  const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')].filter(exposed)
  const levels = headings.map((el) => Number(el.getAttribute('aria-level') ?? el.tagName.slice(1)) || 2)
  const h1s = levels.filter((level) => level === 1).length
  if (h1s !== 1) findings.push({ check: 'headings', detail: `${h1s} h1 elements; a screen has exactly one` })
  let previous = 1
  headings.forEach((el, i) => {
    if (levels[i]! > previous + 1) {
      findings.push({ check: 'headings', detail: `h${levels[i]} follows h${previous}: ${describe(el)}` })
    }
    previous = levels[i]!
  })

  // NFR-6: label, name and autocomplete; spellcheck off for emails, codes, slugs and station IDs; paste allowed.
  const unnamed = new Set(['hidden', 'submit', 'reset', 'button', 'image'])
  const autofilled = new Set(
    'text search url tel email password number date month week time datetime-local range color'.split(' ')
  )
  const controls = [
    ...document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')
  ].filter((el) => !(el instanceof HTMLInputElement && unnamed.has(el.type)) && exposed(el))
  for (const el of controls) {
    const type = el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase()
    const labelledBy = (el.getAttribute('aria-labelledby') ?? '')
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean)
    const labelled =
      [...(el.labels ?? [])].some((label) => label.textContent?.trim()) ||
      !!el.getAttribute('aria-label')?.trim() ||
      labelledBy.length > 0
    if (!labelled) findings.push({ check: 'form-fields', detail: `${describe(el)} has no label` })
    if (!el.getAttribute('name')?.trim()) findings.push({ check: 'form-fields', detail: `${describe(el)} has no name` })
    const needsAutocomplete = !(el instanceof HTMLInputElement) || autofilled.has(type)
    if (needsAutocomplete && !el.getAttribute('autocomplete')?.trim()) {
      findings.push({ check: 'form-fields', detail: `${describe(el)} has no autocomplete` })
    }
    if (el instanceof HTMLSelectElement) continue
    const words = `${el.getAttribute('name') ?? ''} ${el.id} ${el.getAttribute('autocomplete') ?? ''}`
    const literal =
      type === 'email' || el.getAttribute('inputmode') === 'email' || /email|code|slug|station/i.test(words)
    if (literal && el.getAttribute('spellcheck') !== 'false') {
      findings.push({ check: 'spellcheck', detail: `${describe(el)} needs spellcheck="false"` })
    }
    const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() })
    if (!el.dispatchEvent(paste)) findings.push({ check: 'paste', detail: `${describe(el)} cancels paste` })
  }

  // NFR-4, DESIGN accessibility: nothing under 24×24 px. Links inside a sentence are WCAG 2.5.8's inline exception,
  // and a labelled checkbox or radio is clicked through its label.
  const pointable =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"]'
  for (const el of document.querySelectorAll<HTMLElement>(
    `${pointable}, [role="checkbox"], [role="radio"], [role="tab"]`
  )) {
    if (!exposed(el) || el.getClientRects().length === 0) continue
    const inSentence = [...(el.parentElement?.childNodes ?? [])].some(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
    )
    if (el instanceof HTMLAnchorElement && getComputedStyle(el).display === 'inline' && inSentence) continue
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio') && el.labels?.length) continue
    const { width, height } = el.getBoundingClientRect()
    if (width < 23.5 || height < 23.5) {
      findings.push({
        check: 'target-size',
        detail: `${describe(el)} is ${Math.round(width)}×${Math.round(height)} px`
      })
    }
  }

  // NFR-8: tables of numbers use tabular figures.
  const numeric = /^[-+−]?\d[\d.,:\s]*%?$/
  for (const cell of document.querySelectorAll('td, [role="cell"], [role="gridcell"]')) {
    if (!numeric.test(cell.textContent?.trim() ?? '')) continue
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
    let plain = false
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement
      if (node.textContent?.trim() && parent && !getComputedStyle(parent).fontVariantNumeric.includes('tabular-nums')) {
        plain = true
      }
    }
    if (plain)
      findings.push({ check: 'tabular-nums', detail: `${describe(cell)} lacks font-variant-numeric: tabular-nums` })
  }

  // NFR-9: lists over 50 rows are virtualised, so no list renders more than 50 at once.
  const lists = 'ul, ol, tbody, [role="list"], [role="listbox"], [role="grid"], [role="rowgroup"], [role="feed"]'
  for (const list of document.querySelectorAll(lists)) {
    if (list.children.length > 50) {
      findings.push({
        check: 'virtualised',
        detail: `${list.tagName.toLowerCase()} renders ${list.children.length} rows; lists over 50 rows are virtualised`
      })
    }
  }

  // NFR-4: reflow at 320 CSS pixels and 200% zoom, without scrolling in two dimensions.
  const { scrollWidth, clientWidth } = document.documentElement
  if (reflow && scrollWidth > clientWidth + 1) {
    findings.push({ check: 'reflow', detail: `the page is ${scrollWidth} px wide in a ${clientWidth} px viewport` })
  }
  return findings
}

const RING_SELECTOR = [
  'a[href]',
  'area[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  'iframe',
  '[tabindex]',
  '[contenteditable=""]',
  '[contenteditable="true"]'
].join(', ')

interface Stop {
  id: string | null
  label: string
  skipLink: boolean
  visible: boolean
  ring: boolean
}

/** NFR-5: the skip link is the first Tab stop, Tab reaches every control, and each shows a `:focus-visible` ring. */
async function keyboardFindings(page: Page): Promise<Finding[]> {
  // macOS WebKit Tabs between form fields only; Option+Tab is its "every control" order.
  const browser = page.context().browser()?.browserType().name()
  const tab = browser === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab'
  const targets = await page.evaluate((selector) => {
    const groups = new Map<string, string>()
    return [...document.querySelectorAll<HTMLElement>(selector)]
      .filter(
        (el) =>
          el.tabIndex >= 0 &&
          !el.matches(':disabled') &&
          !el.closest('[inert]') &&
          !el.closest('nextjs-portal') &&
          el.checkVisibility({ visibilityProperty: true }) &&
          el.getClientRects().length > 0
      )
      .map((el, i) => {
        // One stop per radio group: Tab enters the group, arrows move inside it.
        const radio = el instanceof HTMLInputElement && el.type === 'radio' && el.name ? `radio:${el.name}` : null
        const id = radio ? (groups.get(radio) ?? String(i)) : String(i)
        if (radio) groups.set(radio, id)
        el.dataset.qualityStop = id
        el.dataset.qualityShadow = getComputedStyle(el).boxShadow
        const text = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
        return { id, label: `${el.tagName.toLowerCase()}${text ? ` "${text}"` : ''}` }
      })
  }, RING_SELECTOR)

  const findings: Finding[] = []
  const reached = new Set<string>()
  const stops: Stop[] = []
  for (let step = 0; step < targets.length + 10 && step < 300; step++) {
    await page.keyboard.press(tab)
    const stop = await page.evaluate((): Stop | null => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body || el === document.documentElement || el.closest('nextjs-portal')) return null
      const style = getComputedStyle(el)
      const outline =
        style.outlineStyle !== 'none' &&
        parseFloat(style.outlineWidth) > 0 &&
        !/rgba\(.*, 0\)$/.test(style.outlineColor)
      const shadow = style.boxShadow !== 'none' && style.boxShadow !== el.dataset.qualityShadow
      const rect = el.getBoundingClientRect()
      const href = el.getAttribute('href') ?? ''
      const text = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
      const ringOwner = el.closest<HTMLElement>('[data-focus-ring]')
      const ownerStyle = ringOwner ? getComputedStyle(ringOwner) : null
      const ownerOutline =
        ownerStyle !== null &&
        ownerStyle.outlineStyle !== 'none' &&
        parseFloat(ownerStyle.outlineWidth) > 0 &&
        !/rgba\(.*, 0\)$/.test(ownerStyle.outlineColor)
      return {
        id: el.dataset.qualityStop ?? null,
        label: `${el.tagName.toLowerCase()}${text ? ` "${text}"` : ''}`,
        skipLink:
          el instanceof HTMLAnchorElement &&
          href.length > 1 &&
          href.startsWith('#') &&
          !!document.getElementById(href.slice(1)),
        visible: rect.width >= 1 && rect.height >= 1 && rect.bottom > 0 && rect.right > 0,
        ring:
          (el.matches(':focus-visible') && (outline || shadow)) ||
          (!!ringOwner?.matches(':focus-within') && ownerOutline)
      }
    })
    if (!stop) {
      if (stops.length) break
      continue
    }
    if (stop.id !== null && stop.id === stops[0]?.id) break
    stops.push(stop)
    if (stop.id !== null) reached.add(stop.id)
  }

  const first = stops[0]
  if (!first?.skipLink) {
    const detail = first
      ? `the first Tab stop is ${first.label}, not a skip link`
      : 'Tab reaches nothing, not even a skip link'
    findings.push({ check: 'skip-link', detail })
  } else if (!first.visible) {
    findings.push({ check: 'skip-link', detail: 'the skip link stays hidden when focused' })
  }
  for (const stop of stops) {
    if (!stop.ring) findings.push({ check: 'focus-visible', detail: `${stop.label} shows no :focus-visible ring` })
  }
  for (const target of targets) {
    if (!reached.has(target.id)) {
      reached.add(target.id)
      findings.push({ check: 'reachability', detail: `Tab never reaches ${target.label}` })
    }
  }
  return findings
}
