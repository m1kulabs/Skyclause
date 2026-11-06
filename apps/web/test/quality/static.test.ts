import { expect, test } from 'vitest'
import { catalogueFindings, cssFindings } from '../../e2e/quality/static'

const checks = (css: string) => cssFindings(css).map((finding) => finding.detail)

test('transition: all, in any spelling, fails (NFR-7)', () => {
  expect(checks('.a{transition:all .2s ease}')).toEqual(['transition animates all: transition:all .2s ease'])
  expect(checks('.a{transition-property:all}')).toHaveLength(1)
  expect(checks('.a{transition:opacity .2s,all 1s}')).toHaveLength(1)
  // A shorthand without a property animates every property.
  expect(checks('.a{transition:.2s ease-in}')).toHaveLength(1)
})

test('transitions of anything but transform and opacity fail', () => {
  expect(checks('.a{transition:color .15s cubic-bezier(.4,0,.2,1)}')).toEqual([
    'transition animates color: transition:color .15s cubic-bezier(.4,0,.2,1)'
  ])
  expect(checks('.a{transition-property:color,background-color,opacity}')).toHaveLength(2)
})

test('transform, opacity and the individual transform properties pass', () => {
  expect(checks('.a{transition:transform .2s cubic-bezier(.32,.72,0,1),opacity .15s}')).toEqual([])
  expect(checks('.a{transition-property:transform,translate,scale,rotate,opacity}')).toEqual([])
  expect(checks('.a{transition:none}')).toEqual([])
})

test('keyframes may animate only transform and opacity', () => {
  expect(checks('@keyframes pulse{0%{opacity:1;box-shadow:0 0 0 red}to{opacity:.5}}')).toEqual([
    '@keyframes pulse animates box-shadow'
  ])
  expect(checks('@keyframes in{from{transform:translateY(4px);opacity:0}to{transform:none;opacity:1}}')).toEqual([])
})

test('loading strings end with "…" and no string uses three dots (NFR-6, NFR-8)', () => {
  const catalogue = {
    windows: { loading: 'Loading windows…', saving: 'Saving...', list: { loadingMore: 'Loading more' } },
    title: 'Windows'
  }
  expect(catalogueFindings(catalogue).map((finding) => finding.detail)).toEqual([
    'windows.saving uses "..." instead of "…": "Saving..."',
    'windows.list.loadingMore is loading text without a closing "…": "Loading more"'
  ])
})

test('minified important declarations keep the same transition properties', () => {
  expect(checks('.a{transition:none!important}')).toEqual([])
  expect(checks('.a{transition:transform .2s,opacity .1s!important}')).toEqual([])
  expect(checks('.a{transition:color .2s!important}')).toHaveLength(1)
})
