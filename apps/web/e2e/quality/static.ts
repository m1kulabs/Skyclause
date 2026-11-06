// Static checks over built CSS (NFR-7) and i18n catalogues (NFR-6, NFR-8).
import type { Finding } from './checks'

/** NFR-7: animate only `transform` and `opacity`; `translate`, `scale` and `rotate` are transforms too. */
const ANIMATABLE = new Set(['transform', 'translate', 'scale', 'rotate', 'opacity'])
const TIMING = /^(-?[\d.]+m?s|ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end|allow-discrete|normal)$/

/** Splits on commas outside parentheses, so `cubic-bezier(.4,0,.2,1)` stays whole. */
function topLevel(value: string, separator: RegExp): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of value) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (depth === 0 && separator.test(char)) {
      if (current.trim()) parts.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function transitionedProperties(name: string, value: string): string[] {
  return topLevel(value, /,/).flatMap((item) => {
    if (name === 'transition-property') return [item]
    const words = topLevel(item, /\s/).filter((word) => !TIMING.test(word) && !/^[a-z-]+\(/.test(word))
    return [words[0] ?? 'all']
  })
}

export function cssFindings(css: string): Finding[] {
  const findings: Finding[] = []
  const keyframes = /@(?:-webkit-)?keyframes\s+([\w-]+)\s*\{/g
  const blocks: Array<{ name: string; start: number; end: number }> = []
  for (let match = keyframes.exec(css); match; match = keyframes.exec(css)) {
    let depth = 1
    let end = match.index + match[0].length
    while (depth > 0 && end < css.length) {
      if (css[end] === '{') depth++
      if (css[end] === '}') depth--
      end++
    }
    blocks.push({ name: match[1]!, start: match.index, end })
  }
  for (const block of blocks) {
    const body = css.slice(block.start, block.end)
    const properties = new Set([...body.matchAll(/[{;]\s*([-a-z]+)\s*:/g)].map((match) => match[1]!))
    for (const property of properties) {
      if (!ANIMATABLE.has(property) && property !== 'animation-timing-function') {
        findings.push({ check: 'css-animation', detail: `@keyframes ${block.name} animates ${property}` })
      }
    }
  }
  for (const match of css.matchAll(/(?:^|[{;\s])(transition(?:-property)?)\s*:\s*([^;}]+)/g)) {
    const [, name, value] = match as unknown as [string, string, string]
    if (value.trim() === 'none') continue
    for (const property of transitionedProperties(name, value.trim())) {
      if (property === 'none' || ANIMATABLE.has(property) || property.startsWith('var(')) continue
      findings.push({ check: 'css-transition', detail: `transition animates ${property}: ${name}:${value.trim()}` })
    }
  }
  return findings
}

/** NFR-8: loading text ends with "…"; NFR-6 and DESIGN voice: the ellipsis is one character, never three dots. */
export function catalogueFindings(catalogue: unknown, path: string[] = []): Finding[] {
  if (typeof catalogue === 'string') {
    const key = path.join('.')
    if (catalogue.includes('...')) {
      return [{ check: 'catalogue', detail: `${key} uses "..." instead of "…": "${catalogue}"` }]
    }
    if (/loading/i.test(path.at(-1) ?? '') && !catalogue.endsWith('…')) {
      return [{ check: 'catalogue', detail: `${key} is loading text without a closing "…": "${catalogue}"` }]
    }
    return []
  }
  if (catalogue && typeof catalogue === 'object') {
    return Object.entries(catalogue).flatMap(([key, value]) => catalogueFindings(value, [...path, key]))
  }
  return []
}
