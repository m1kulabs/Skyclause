import { expect, test } from 'vitest'
import { resolveSourceAt, type ReadingHistory } from '../src'
const at = (minute: number) => `2026-11-10T10:${String(minute).padStart(2, '0')}:00Z`
function history(events: Array<[number, 'ok' | 'error']>): ReadingHistory {
  return {
    sources: [
      {
        id: 'gauge',
        kind: 'jps_rain',
        cadenceS: 300,
        staleAfterS: 600,
        freshness: 'observed',
        probation: false,
        meta: {}
      }
    ],
    polls: events.map(([minute, outcome]) => ({
      id: 'p' + minute,
      sourceId: 'gauge',
      startedAt: at(minute),
      receivedAt: at(15),
      outcome,
      httpStatus: outcome === 'error' ? 503 : 200
    })),
    readings: events
      .filter((e) => e[1] === 'ok')
      .map(([minute]) => ({
        id: 'r' + minute,
        pollId: 'p' + minute,
        sourceId: 'gauge',
        metric: 'rain_5m_mm',
        observedAt: at(minute),
        receivedAt: at(15),
        value: 0,
        valueText: null,
        valueJson: null,
        itemKey: '',
        revision: 0
      }))
  }
}
test('an older success in the same receipt batch cannot supersede a later physical error', () => {
  expect(
    resolveSourceAt(
      history([
        [5, 'ok'],
        [10, 'error']
      ]),
      'gauge',
      at(15)
    ).state
  ).toBe('error')
})
test('the first physical success after error is recovered and a second later capture becomes fresh', () => {
  const h = history([
    [0, 'ok'],
    [5, 'error'],
    [10, 'ok']
  ])
  expect(resolveSourceAt(h, 'gauge', at(15)).state).toBe('recovered')
  h.polls.push({ id: 'p15', sourceId: 'gauge', startedAt: at(15), receivedAt: at(20), outcome: 'ok', httpStatus: 200 })
  h.readings.push({
    id: 'r15',
    pollId: 'p15',
    sourceId: 'gauge',
    metric: 'rain_5m_mm',
    observedAt: at(15),
    receivedAt: at(20),
    value: 0,
    valueText: null,
    valueJson: null,
    itemKey: '',
    revision: 0
  })
  expect(resolveSourceAt(h, 'gauge', at(20)).state).toBe('fresh')
})
