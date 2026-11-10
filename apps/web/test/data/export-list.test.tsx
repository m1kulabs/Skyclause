// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { ExportList } from '../../features/data/export-list'
import type { ExportView } from '../../features/data/model'

afterEach(cleanup)

function readyExport(index: number): ExportView {
  return {
    id: `export-${index}`,
    scope: 'organisation',
    status: 'ready',
    formats: ['json', 'csv'],
    error: null,
    expires_at: '2026-11-18T00:00:00Z',
    created_at: '2026-11-10T02:00:00Z',
    download_url: null
  }
}

test('export list renders a bounded window and aligns it to the mobile row pitch', () => {
  render(<ExportList jobs={Array.from({ length: 70 }, (_, index) => readyExport(index))} />)
  const region = screen.getByRole('region', { name: 'Export jobs' })

  expect(region.querySelectorAll('[data-export-row]')).toHaveLength(13)
  expect(region.querySelector('[data-export-row] a')?.getAttribute('aria-label')).toBe('Download export export-0')

  Object.defineProperty(region, 'scrollTop', { configurable: true, value: 50 * 124 })
  fireEvent.scroll(region)

  expect(region.querySelectorAll('[data-export-row]')).toHaveLength(13)
  expect(region.querySelector('[data-export-row] a')?.getAttribute('aria-label')).toBe('Download export export-47')
})
