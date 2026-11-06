import { expect, test } from 'vitest'
import type { Notification } from '@skyclause/contracts'
import { newestNotifications } from '../../features/alerts/notification-order'

const older: Notification = {
  id: 'older',
  kind: 'needs_review',
  ref: { type: 'bundle', id: 'bundle-1' },
  project: null,
  recovered: false,
  created_at: '2026-11-06T02:00:00Z',
  read_at: null
}
const newer = { ...older, id: 'newer', created_at: '2026-11-06T02:00:00.500Z' }

test('newest notifications compare instants with mixed fractional-second precision', () => {
  expect(newestNotifications([newer, older]).map((item) => item.id)).toEqual(['newer', 'older'])
})
