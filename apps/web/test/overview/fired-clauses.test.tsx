import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { FiredClauses } from '../../features/overview/project-overview'
import type { ProjectVerdicts } from '../../features/overview/operations'

// An HTTP test double of getProjectVerdicts' answer, never application data.
const verdicts = {
  packs: [
    {
      pack: 'sky',
      site: [
        {
          scope: { kind: 'site' },
          clauses: [
            { key: 'storm_confirmed', result: 'fired' },
            { key: 'gate_queue_long', result: 'fired' },
            { key: 'haze_watch', result: 'not_fired' }
          ]
        }
      ],
      windows: [],
      nights: []
    }
  ]
} as unknown as ProjectVerdicts

test('without the verdicts read the block is left out, never "No clause has fired"', () => {
  for (const status of [501, 503, null]) {
    const html = renderToStaticMarkup(
      <FiredClauses verdicts={{ ok: false, status, at: '2026-11-13T04:00:00Z' }} pack="sky" locale="en" />
    )
    expect(html).toBe('')
  }
})

test('fired clauses print their names in the interface’s language, never their keys', () => {
  const english = renderToStaticMarkup(<FiredClauses verdicts={{ ok: true, value: verdicts }} pack="sky" locale="en" />)
  expect(english).toContain('Fired clauses')
  expect(english).toContain('Storm confirmed')
  expect(english).toContain('Gate queue long')
  expect(english).not.toContain('storm_confirmed')
  expect(english).not.toContain('Haze watch')
  const malay = renderToStaticMarkup(<FiredClauses verdicts={{ ok: true, value: verdicts }} pack="sky" locale="ms" />)
  expect(malay).toContain('Ribut disahkan')
})

test('a read that answered with nothing fired says so', () => {
  const html = renderToStaticMarkup(
    <FiredClauses verdicts={{ ok: true, value: { packs: [] } as unknown as ProjectVerdicts }} pack="sky" locale="en" />
  )
  expect(html).toContain('No clause has fired.')
})
