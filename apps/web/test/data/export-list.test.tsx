// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ExportList } from '../../features/data/export-list'
import type { ExportView } from '../../features/data/model'

afterEach(cleanup)

function readyExport(index: number, over: Partial<ExportView> = {}): ExportView {
  return {
    id: `export-${index}`,
    scope: 'organisation',
    status: 'ready',
    formats: ['json', 'csv'],
    error: null,
    expires_at: '2099-11-18T00:00:00Z',
    created_at: '2026-11-10T02:00:00Z',
    download_url: null,
    ...over
  }
}

test('export list is the shared table and never draws more than 50 rows; paging walks the loaded jobs', () => {
  render(<ExportList jobs={Array.from({ length: 70 }, (_, index) => readyExport(index))} />)
  const region = screen.getByRole('region', { name: 'Export jobs' })

  expect(region.querySelector('[data-slot="table"]')).not.toBeNull()
  expect(region.querySelectorAll('[data-export-row]')).toHaveLength(50)
  expect(screen.getByText('Exports 1–50')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Newer exports' })).toBeDisabled()

  fireEvent.click(screen.getByRole('button', { name: 'Older exports' }))
  expect(region.querySelectorAll('[data-export-row]')).toHaveLength(20)
  expect(screen.getByText('Exports 51–70')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Older exports' })).toBeDisabled()
})

test('a download link is named by when the export was requested, never by its internal id', () => {
  render(<ExportList jobs={[readyExport(1, { id: '018f47a3-b2c1-7c00-8000-00000000abcd' })]} />)
  const link = screen.getByRole('link', { name: 'Download export from 10 November 2026, 10:00 MYT' })
  expect(link.getAttribute('href')).toBe('/api/exports/018f47a3-b2c1-7c00-8000-00000000abcd/download')
  expect(document.body.textContent).not.toContain('018f47a3')
})

test('a failed export says so in the catalogue words, not with the server string', () => {
  render(
    <ExportList jobs={[readyExport(1, { status: 'failed', expires_at: null, error: 'pg: relation "x" missing' })]} />
  )
  expect(screen.getByText('This export failed. Request a new export.')).toBeInTheDocument()
  expect(document.body.textContent).not.toContain('relation')
})

test('more exports load only from the last page, and the label follows the locale', () => {
  const onLoadMore = vi.fn()
  render(<ExportList jobs={[readyExport(1)]} hasMore onLoadMore={onLoadMore} locale="ms" />)
  fireEvent.click(screen.getByRole('button', { name: 'Muat lagi eksport' }))
  expect(onLoadMore).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('link', { name: /Muat turun eksport daripada/ })).toBeInTheDocument()
})
