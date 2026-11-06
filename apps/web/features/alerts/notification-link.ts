import type { Notification } from '@skyclause/contracts'

export function notificationHref(item: Pick<Notification, 'project' | 'ref'>): string | null {
  if (!item.project) return null
  const root = `/${encodeURIComponent(item.project.org_slug)}/${encodeURIComponent(item.project.slug)}`
  const id = encodeURIComponent(item.ref.id)
  switch (item.ref.type) {
    case 'bundle':
      return `${root}/bundles/${id}`
    case 'review_item':
      return `${root}/analysis?review_item=${id}`
    case 'source':
      return `${root}/signals/${id}`
    default:
      return null
  }
}
