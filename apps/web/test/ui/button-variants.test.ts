import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { buttonVariants } from '../../components/ui/button'
import { buttonVariants as recipe } from '../../components/ui/button-variants'
import { cn } from '../../lib/utils'

const variants = ['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'] as const
const sizes = ['default', 'xs', 'sm', 'lg', 'icon', 'icon-xs', 'icon-sm', 'icon-lg'] as const

describe('buttonVariants', () => {
  test('the recipe module imports nothing but the class helper, so a public page can style a link as a capsule for free', () => {
    const source = readFileSync(new URL('../../components/ui/button-variants.tsx', import.meta.url), 'utf8')
    expect(source).not.toMatch(/['"]use client['"]/)
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1])
    expect(imports).toEqual(['class-variance-authority'])
  })

  test('#ui/button still exports the same recipe for the callers that import it there', () => {
    expect(buttonVariants).toBe(recipe)
    expect(recipe({ size: 'lg', variant: 'outline' })).toContain('h-12')
    expect(recipe()).toContain('bg-primary')
  })

  test.each(variants.flatMap((variant) => sizes.map((size) => [variant, size] as const)))(
    '%s %s lists no two classes for one property, so it renders the same without cn() merging',
    (variant, size) => {
      const classes = recipe({ variant, size }).split(/\s+/)
      expect(cn(classes.join(' ')).split(/\s+/).sort()).toEqual([...classes].sort())
    }
  )

  test('an outline link keeps its edge and a large capsule its 16px type, with no merge step', () => {
    const outline = recipe({ variant: 'outline' }).split(/\s+/)
    expect(outline).toContain('border-input')
    expect(outline).not.toContain('border-transparent')
    const large = recipe({ size: 'lg' }).split(/\s+/)
    expect(large).toContain('text-[16px]')
    expect(large).not.toContain('text-[14px]')
  })
})
