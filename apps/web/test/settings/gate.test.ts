import { expect, test, vi } from 'vitest'
import { requireSettings } from '../../features/settings/gate'
import { getPrincipal } from '../../lib/principal'

vi.mock('../../lib/principal', () => ({ getPrincipal: vi.fn() }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_HTTP_ERROR_FALLBACK;404')
  }
}))

test('a missing principal gets Next not-found without a redirect', async () => {
  vi.mocked(getPrincipal).mockResolvedValue(null)
  await expect(requireSettings({ scope: 'account', section: 'appearance' })).rejects.toThrow(
    'NEXT_HTTP_ERROR_FALLBACK;404'
  )
})
