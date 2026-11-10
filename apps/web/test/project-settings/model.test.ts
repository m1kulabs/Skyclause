import { expect, test } from 'vitest'
import { defaultSlaSeconds, slaUpdateBody } from '../../features/project-settings/model'

test('project SLA defaults follow the pack', () => {
  expect(defaultSlaSeconds('sky')).toBe(600)
  expect(defaultSlaSeconds('crowd')).toBe(7200)
})

test('an SLA patch carries the existing enabled state and the saved sla_s value', () => {
  expect(slaUpdateBody({ pack: 'sky', enabled: true }, 900)).toEqual({ enabled: true, sla_s: 900 })
})
