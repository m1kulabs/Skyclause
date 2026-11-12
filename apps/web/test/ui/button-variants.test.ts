import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { buttonVariants } from '../../components/ui/button'
import { buttonVariants as recipe } from '../../components/ui/button-variants'

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
})
