// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { t } from '../../features/data-components/catalogue'
import { SourceError } from '../../features/data-components/states'

describe('SourceError on a rate-limited read (429)', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })
  const retry = <button type="button">{t('data.source_error.retry')}</button>

  test('says Skyclause is busy and when to try again, in words and the MYT clock, never the status', () => {
    const markup = renderToStaticMarkup(
      <SourceError
        source="the windows list"
        status={429}
        at="2026-11-12T07:31:00Z"
        retryAt="2026-11-12T07:33:00Z"
        retry={retry}
      />
    )
    expect(markup).toContain('Skyclause is busy just now.')
    expect(markup).toContain('Try again after 15:33 MYT.')
    expect(markup).toContain('dateTime="2026-11-12T07:33:00Z"')
    expect(markup).toContain('data-source-error="429"')
    expect(markup).not.toContain('Couldn’t read')
    expect(markup).not.toMatch(/>[^<]*429/)
    const malay = renderToStaticMarkup(
      <SourceError source="senarai tetingkap" status={429} retryAt="2026-11-12T07:33:00Z" locale="ms" />
    )
    expect(malay).toContain('Skyclause sibuk buat masa ini.')
    expect(malay).toContain('Cuba lagi selepas 15:33 MYT.')
  })

  test('Retry stays disabled until that time, then is offered again', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-12T07:31:00Z') })
    render(
      <SourceError
        source="the windows list"
        status={429}
        at="2026-11-12T07:31:00Z"
        retryAt="2026-11-12T07:31:30Z"
        retry={retry}
      />
    )
    expect((screen.getByRole('button', { name: 'Try again' }) as HTMLButtonElement).matches(':disabled')).toBe(true)
    await act(async () => {
      vi.advanceTimersByTime(30_000)
    })
    expect((screen.getByRole('button', { name: 'Try again' }) as HTMLButtonElement).matches(':disabled')).toBe(false)
  })

  test('without a time from the API it waits a minute from the failure', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-12T07:31:00Z') })
    render(<SourceError source="the windows list" status={429} at="2026-11-12T07:31:00Z" retry={retry} />)
    expect(screen.getByText('Try again after 15:32 MYT.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Try again' }) as HTMLButtonElement).matches(':disabled')).toBe(true)
    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })
    expect((screen.getByRole('button', { name: 'Try again' }) as HTMLButtonElement).matches(':disabled')).toBe(false)
  })
})
