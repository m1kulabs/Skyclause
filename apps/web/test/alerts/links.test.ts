import { expect, test } from 'vitest'
import { notificationHref } from '../../features/alerts/notification-link'

const project = { id: 'p1', org_slug: 'org one', slug: 'project/one' }
for (const [type, id, expected] of [
  ['bundle', 'bundle/1', '/org%20one/project%2Fone/bundles/bundle%2F1'],
  ['review_item', 'review/1', '/org%20one/project%2Fone/analysis?review_item=review%2F1'],
  ['source', 'source/1', '/org%20one/project%2Fone/signals/source%2F1']
]) {
  test(`notification links encode the project and ${type} reference`, () => {
    expect(notificationHref({ project, ref: { type: type!, id: id! } })).toBe(expected)
  })
}
test('an account-level or unknown reference never invents a destination', () => {
  expect(notificationHref({ project: null, ref: { type: 'source', id: 's' } })).toBeNull()
  expect(notificationHref({ project, ref: { type: 'unknown', id: 's' } })).toBeNull()
})
