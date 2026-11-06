import type { Notification } from '@skyclause/contracts'

export function newestNotifications(items: Notification[]): Notification[] {
  return items.toSorted((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
}
