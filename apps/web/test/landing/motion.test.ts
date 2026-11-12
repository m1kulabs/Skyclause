import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'

// The static check (static.spec) reads only built CSS, and the crawl's reduced-motion check sees only CSS animations,
// so GSAP's inline tweens need their own guard (PLAN-REVIEW I5): what they may move, what may load them, and how.
const features = path.join(import.meta.dirname, '../../features')
const source = (file: string) => readFileSync(path.join(features, file), 'utf8')
const landingFiles = ['landing', 'landing-hero'].flatMap((folder) =>
  readdirSync(path.join(features, folder))
    .filter((file) => /\.(ts|tsx|css)$/.test(file))
    .map((file) => `${folder}/${file}`)
)

test('tweens move only transform and opacity, and nothing pins', () => {
  const motion = source('landing/motion.ts')
  // Every key of every object literal in the module (comments dropped): tween vars, triggers and setup options.
  let code = motion
    .replace(/\/\/.*$/gm, '')
    .replace(/'[^']*'/g, "''")
    .replace(/\([^()]*\)\s*=>/g, '() =>')
  const keys = new Set<string>()
  // Innermost literals first, so nested ones (a tween's scrollTrigger) are read and then folded away.
  for (let pass = 0; pass < 12 && code.includes('{'); pass++) {
    code = code.replace(/\{([^{}]*)\}/g, (_, body: string) => {
      for (const match of body.matchAll(/\b([A-Za-z]+)\s*:/g)) keys.add(match[1]!)
      return '0'
    })
  }
  const moved = ['x', 'y', 'xPercent', 'yPercent', 'scale', 'rotation', 'opacity']
  const controls = ['duration', 'ease', 'stagger', 'clearProps', 'scrollTrigger', 'trigger', 'start', 'end', 'scrub']
  const setup = ['once', 'onEnter', 'lerp', 'smoothWheel', 'anchors', 'attributes', 'attributeFilter']
  expect([...keys].filter((key) => ![...moved, ...controls, ...setup].includes(key))).toEqual([])
  expect(motion).not.toMatch(/\bpin\s*:/)
  expect(motion).not.toMatch(/\bpinSpacing\b|\bnormalizeScroll\b/)
})

test('GSAP, ScrollTrigger and Lenis load only by dynamic import from the first-interaction boot', () => {
  const importers = landingFiles.filter((file) => /from ['"](gsap|lenis)|import ['"](gsap|lenis)/.test(source(file)))
  expect(importers).toEqual(['landing/motion.ts'])
  const statics = landingFiles.filter((file) => /from ['"]\.\/motion['"]/.test(source(file)))
  expect(statics).toEqual([])
  const boot = source('landing/motion-boot.tsx')
  expect(boot).toContain("import('./motion')")
  for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) expect(boot).toContain(`'${event}'`)
  // Reduced motion, from the OS or the account, stops the load before it starts.
  expect(boot).toContain('(prefers-reduced-motion: reduce)')
  expect(boot).toContain("dataset.motion === 'reduce'")
})

test('no SplitText, no Draggable, no Three.js and never lenis.css; cleanup destroys Lenis and kills the triggers', () => {
  for (const file of landingFiles) {
    const text = source(file)
    expect(text, file).not.toMatch(/SplitText|Draggable|from ['"]three['"]/)
    expect(text, file).not.toMatch(/lenis\/dist\/lenis\.css|['"]lenis\.css['"]/)
  }
  const motion = source('landing/motion.ts')
  expect(motion).toContain('lenis.destroy()')
  expect(motion).toContain('trigger.kill()')
  expect(motion).toContain('context.revert()')
})
