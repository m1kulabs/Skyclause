import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { ReadingsUpdated, SOURCE_METRICS } from '../src/contract'
import type { PollContext, ReadingInput, Source, SourceAdapter } from '../src/contract'

test('each source kind declares exactly its documented metrics and units', () => {
  expect(
    Object.fromEntries(Object.entries(SOURCE_METRICS).map(([kind, metrics]) => [kind, Object.keys(metrics)]))
  ).toEqual({
    jps_rain: ['rain_5m_mm'],
    met_warning: ['warning'],
    met_forecast: ['forecast_day'],
    apims: ['api'],
    rapidrail_od: ['exits_daily', 'metadata'],
    gtfs_static: ['feed'],
    gtfs_rt: ['segment_s'],
    golive: ['listing'],
    wikipedia: ['listing'],
    camera: ['contrast_near', 'contrast_far', 'flag'],
    pi: ['exits_daily', 'segment']
  })
  expect(SOURCE_METRICS.jps_rain.rain_5m_mm.unit).toBe('mm')
  expect(SOURCE_METRICS.apims.api.unit).toBe('API')
  expect(SOURCE_METRICS.rapidrail_od.exits_daily.unit).toBe('exits')
  expect(SOURCE_METRICS.gtfs_rt.segment_s.unit).toBe('s')
  expect(SOURCE_METRICS.camera.contrast_far.unit).toBe('ratio')
})

describe('value_json contracts', () => {
  test('APIMS preserves published class and parameter text', () => {
    const schema = SOURCE_METRICS.apims.api.value_json
    expect(schema.parse({ class: 'Moderate', param: 'PM2.5' })).toEqual({ class: 'Moderate', param: 'PM2.5' })
    expect(schema.safeParse({ class: 'Moderate' }).success).toBe(false)
    expect(schema.safeParse({ class: 62, param: 'PM2.5' }).success).toBe(false)
  })

  test('Rapid Rail metadata requires next_update and its UTC copy', () => {
    const schema = SOURCE_METRICS.rapidrail_od.metadata.value_json
    const metadata = {
      data_as_of: '2026-11-03 23:59',
      last_updated: '2026-11-05 22:00',
      next_update: '2026-11-06 22:00',
      data_as_of_utc: '2026-11-03T15:59:00Z',
      last_updated_utc: '2026-11-05T14:00:00Z',
      next_update_utc: '2026-11-06T14:00:00Z'
    }
    expect(schema.safeParse(metadata).success).toBe(true)
    expect(schema.safeParse({ ...metadata, next_update: undefined }).success).toBe(false)
    expect(schema.safeParse({ ...metadata, next_update_utc: 'not an instant' }).success).toBe(false)
  })

  test('derived bus and Pi rows refuse positions and vehicle identifiers', () => {
    const segment = {
      route_id: 'T5800',
      from_stop: 'KL149',
      to_stop: 'KL2009',
      trip_id: 'test-trip',
      depart_at: '2026-11-05T10:00:00Z',
      scheduled_s: 339,
      header_age_s: 30
    }
    const schema = SOURCE_METRICS.gtfs_rt.segment_s.value_json
    expect(schema.safeParse(segment).success).toBe(true)
    for (const field of ['latitude', 'longitude', 'vehicle_id', 'plate']) {
      expect(schema.safeParse({ ...segment, [field]: 'private' }).success).toBe(false)
      expect(
        SOURCE_METRICS.pi.segment.value_json.safeParse({
          header_age_s: 30,
          posted_at: '2026-11-05T10:00:00Z',
          note: null,
          [field]: 'private'
        }).success
      ).toBe(false)
    }
  })

  test('every declared value_json schema rejects undefined and carries no examples', () => {
    for (const metrics of Object.values(SOURCE_METRICS)) {
      for (const metric of Object.values(metrics)) {
        expect(metric.value_json.safeParse(undefined).success).toBe(false)
        expect(JSON.stringify(z.toJSONSchema(metric.value_json))).not.toMatch(/"examples?":/)
      }
    }
  })
})

test('readings-updated is the exact snake_case Pub/Sub body', () => {
  const body = {
    source_id: '019a5300-0000-7000-8000-000000000001',
    kind: 'jps_rain',
    poll_id: '019a5300-0000-7000-8000-000000000002',
    new_rows: 1
  }
  expect(ReadingsUpdated.parse(body)).toEqual(body)
  expect(ReadingsUpdated.safeParse({ ...body, new_rows: -1 }).success).toBe(false)
  expect(ReadingsUpdated.safeParse({ ...body, kind: 'invented' }).success).toBe(false)
  expect(
    ReadingsUpdated.safeParse({ sourceId: body.source_id, kind: body.kind, pollId: body.poll_id, newRows: 1 }).success
  ).toBe(false)
})

test('adapter types take all bound sources and expose the Spec §1 additions', () => {
  expectTypeOf<SourceAdapter<unknown>['fetch']>().parameter(0).toEqualTypeOf<Source[]>()
  expectTypeOf<SourceAdapter<unknown>['parse']>().parameter(1).toEqualTypeOf<Source[]>()
  expectTypeOf<ReadingInput['itemKey']>().toEqualTypeOf<string | undefined>()
  expectTypeOf<SourceAdapter<unknown>['batch']>().toEqualTypeOf<'all_bound' | 'per_source'>()
  expectTypeOf<SourceAdapter<unknown>['licence']>().toEqualTypeOf<{ id: string | null; label: string }>()
  expectTypeOf<PollContext['openCrowdPeriods']>().toBeFunction()
  expectTypeOf<SourceAdapter<unknown>['discover']>().toBeNullable()
})
