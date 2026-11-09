import { describe, expect, test } from 'vitest'
import { createProject } from '../../src/api/first-party/orgs'
import { archiveProject, restoreProject, updateProject } from '../../src/api/first-party/projects'
import { Project, ProjectPack } from '../../src/api/shared'
import { RESERVED_SLUGS } from '../../src/slugs'

const createBodySchema = createProject.request.body.content['application/json'].schema
const updateBodySchema = updateProject.request.body.content['application/json'].schema
const settingsSchema = updateProject.responses[200].content['application/json'].schema

describe('project core contracts (#137)', () => {
  test('Project and ProjectPack allow null on nullable database columns without fabricated values', () => {
    const skyPack = {
      pack: 'sky' as const,
      enabled: true,
      sheet_id: '01950000-0000-7000-8000-000000000001',
      schedule: null,
      sla_s: 600
    }
    const crowdPack = {
      pack: 'crowd' as const,
      enabled: false,
      sheet_id: '01950000-0000-7000-8000-000000000002',
      schedule: null,
      sla_s: 7200
    }
    expect(ProjectPack.safeParse(skyPack).success).toBe(true)
    expect(ProjectPack.safeParse({ ...skyPack, schedule: { cron: '0 6 * * *' } }).success).toBe(true)

    const minimalProject = {
      id: '01950000-0000-7000-8000-000000000010',
      org_id: '01950000-0000-7000-8000-000000000020',
      name: 'Bukit Jalil',
      slug: 'bukit-jalil',
      time_zone: 'Asia/Kuala_Lumpur',
      public: false,
      semester_ends_on: null,
      site_name: 'APU Campus',
      site_lat: 3.0553,
      site_lon: 101.7005,
      archived_at: null,
      camera_day_start: null,
      camera_day_end: null,
      warning_area_terms: [],
      packs: [skyPack, crowdPack]
    }
    expect(Project.safeParse(minimalProject).success).toBe(true)
    expect(
      Project.safeParse({
        ...minimalProject,
        site_name: null,
        site_lat: null,
        site_lon: null
      }).success
    ).toBe(true)
    expect(
      settingsSchema.safeParse({
        ...minimalProject,
        rota_override: null
      }).success
    ).toBe(true)
    expect(
      archiveProject.responses[200].content['application/json'].schema.safeParse({
        ...minimalProject,
        rota_override: null
      }).success
    ).toBe(true)
    expect(
      restoreProject.responses[200].content['application/json'].schema.safeParse({
        ...minimalProject,
        rota_override: null
      }).success
    ).toBe(true)
  })

  test('createProject requires name, slug, site and packs, defaults time_zone, and separates slug format from reserved words', () => {
    const valid = createBodySchema.safeParse({
      name: 'Bukit Jalil',
      slug: 'bukit-jalil',
      site_name: 'APU Campus',
      site_lat: 3.0553,
      site_lon: 101.7005,
      packs: ['sky']
    })
    expect(valid.success).toBe(true)
    if (valid.success) {
      expect(valid.data.time_zone).toBe('Asia/Kuala_Lumpur')
    }

    for (const missingSite of [
      { name: 'Bukit Jalil', slug: 'bukit-jalil', packs: ['sky'] },
      { name: 'Bukit Jalil', slug: 'bukit-jalil', site_name: null, site_lat: 3.05, site_lon: 101.7, packs: ['sky'] },
      { name: 'Bukit Jalil', slug: 'bukit-jalil', site_name: 'APU', site_lat: null, site_lon: 101.7, packs: ['sky'] },
      { name: 'Bukit Jalil', slug: 'bukit-jalil', site_name: 'APU', site_lat: 3.05, site_lon: 101.7, packs: [] }
    ]) {
      expect(createBodySchema.safeParse(missingSite).success).toBe(false)
    }

    for (const badSlug of ['a', '-ab', 'a--b', 'UPPER', 'bad_slug']) {
      expect(
        createBodySchema.safeParse({
          name: 'Bukit Jalil',
          slug: badSlug,
          site_name: 'APU Campus',
          site_lat: 3.0553,
          site_lon: 101.7005,
          packs: ['sky']
        }).success
      ).toBe(false)
    }

    // Format-valid reserved slugs pass route pre-validation so the service can return 422 slug-reserved.
    for (const reserved of ['new', 'v1', 'commons'] as const) {
      expect(RESERVED_SLUGS).toContain(reserved)
      expect(
        createBodySchema.safeParse({
          name: 'Bukit Jalil',
          slug: reserved,
          site_name: 'APU Campus',
          site_lat: 3.0553,
          site_lon: 101.7005,
          packs: ['sky']
        }).success
      ).toBe(true)
    }
  })

  test('time-zone strings reach authoritative database validation on both owned write contracts', () => {
    expect(
      createBodySchema.parse({
        name: 'Valid zone',
        slug: 'valid-zone',
        site_name: 'APU',
        site_lat: 3.05,
        site_lon: 101.7,
        packs: ['sky'],
        time_zone: 'America/New_York'
      }).time_zone
    ).toBe('America/New_York')
    expect(updateBodySchema.parse({ name: 'Mixed patch', time_zone: 'America/New_York' }).time_zone).toBe(
      'America/New_York'
    )
    expect(updateBodySchema.parse({ time_zone: 'not-a-time-zone' }).time_zone).toBe('not-a-time-zone')
    expect(createProject.responses[422]).toBeDefined()
    expect(updateProject.responses[422]).toBeDefined()
  })

  test('updateProject accepts nullable owned fields and format-valid reserved slugs while rejecting malformed slugs', () => {
    expect(
      updateBodySchema.safeParse({
        name: 'Updated Name',
        semester_ends_on: null,
        camera_day_start: null,
        camera_day_end: null,
        warning_area_terms: ['Kuala Lumpur'],
        public: true
      }).success
    ).toBe(true)
    expect(updateBodySchema.safeParse({ slug: 'new' }).success).toBe(true)
    expect(updateBodySchema.safeParse({ slug: 'BAD SLUG' }).success).toBe(false)
    // Schema parses packs and rota_override (including empty arrays) so requests reach the service after visibility
    // and permission checks, where #137 explicitly refuses #138/#156 mutations with a 422 problem.
    expect(updateBodySchema.safeParse({ packs: [] }).success).toBe(true)
    expect(updateBodySchema.safeParse({ rota_override: [] }).success).toBe(true)
    expect(updateProject.responses[422]).toBeDefined()
  })
})
