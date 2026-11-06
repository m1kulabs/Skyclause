import { describe, expect, test } from 'bun:test'
import type { ProbationRow } from '../../shared/probation.ts'
import { handleLabelPage, type LabelDeps, type LabelStore } from './label.ts'

function row(overrides: Partial<ProbationRow> & { capture_id: string }): ProbationRow {
  return {
    frame_file_id: `file-${overrides.capture_id}`,
    device_time: '2026-11-07T10:00:00+08:00',
    phone_flag: 'visible',
    label_a: '',
    label_b: '',
    settled: '',
    agrees: '',
    ...overrides
  }
}

function harness(rows: ProbationRow[]) {
  let state = rows.map((entry) => ({ ...entry }))
  const writes: string[] = []
  const frameReads: string[] = []
  let locks = 0
  const store: LabelStore = {
    probationRows: () => state.map((entry) => ({ ...entry })),
    writeLabel: (captureId, slot, label) => {
      writes.push(`label ${captureId} ${slot} ${label}`)
      state = state.map((entry) =>
        entry.capture_id === captureId ? { ...entry, [slot === 'a' ? 'label_a' : 'label_b']: label } : entry
      )
    },
    writeSettlement: (captureId, settled, agrees) => {
      writes.push(`settlement ${captureId} ${settled} ${agrees}`)
      state = state.map((entry) => (entry.capture_id === captureId ? { ...entry, settled, agrees } : entry))
    },
    frameDataUrl: (fileId) => {
      frameReads.push(fileId)
      return `data:image/jpeg;base64,FRAME-${fileId}`
    },
    writeFigures: (n, agreement) => {
      writes.push(`figures ${n} ${agreement}`)
    },
    recordVerdict: (note, passed, n, agreement) => {
      writes.push(`verdict passed=${passed} n=${n} agreement=${agreement} note=${note}`)
    }
  }
  const deps: LabelDeps = {
    getProperty: (name) =>
      (
        ({
          LABEL_TOKEN_A: 'aaa',
          LABEL_TOKEN_B: 'bbb',
          CAMERA_DAY_START: '07:15',
          CAMERA_DAY_END: '19:00'
        }) as Record<string, string>
      )[name] ?? null,
    withLock: <T>(fn: () => T): T => {
      locks += 1
      return fn()
    },
    store,
    scriptUrl: 'https://script.test/exec'
  }
  const page = (params: Record<string, string>): string => handleLabelPage({ page: 'label', ...params }, deps).html
  return { deps, writes, frameReads, locks: () => locks, page }
}

describe('access', () => {
  test('a visit without a valid slot key gets Team only and no frame', () => {
    const denied: Record<string, string>[] = [{}, { slot: 'a' }, { slot: 'a', key: 'guess' }, { slot: 'c', key: 'aaa' }]
    for (const params of denied) {
      const { page, frameReads } = harness([row({ capture_id: 'c-1' })])
      const html = page(params)
      expect(html).toContain('Team only')
      expect(frameReads).toEqual([])
      expect(html).not.toContain('data:image')
    }
  })

  test("each secret link loads its labeller's frame", () => {
    const { page } = harness([row({ capture_id: 'c-1', label_a: 'visible' })])
    expect(page({ slot: 'b', key: 'bbb' })).toContain('data:image/jpeg;base64,FRAME-file-c-1')
  })
})

describe('blindness', () => {
  test('the slot-a labelling view holds neither label_b nor the phone flag', () => {
    const { page } = harness([row({ capture_id: 'c-1', phone_flag: 'FLAG-SECRET', label_b: 'LABELB-SECRET' })])
    const html = page({ slot: 'a', key: 'aaa' })
    expect(html).toContain('2026-11-07T10:00:00+08:00')
    expect(html).toContain('data:image/jpeg;base64,FRAME-file-c-1')
    expect(html).not.toContain('FLAG-SECRET')
    expect(html).not.toContain('LABELB-SECRET')
    expect(html).not.toContain('label_b')
    expect(html).not.toContain('phone_flag')
  })

  test('the resolve view shows both labels but never the phone flag', () => {
    const { page } = harness([
      row({ capture_id: 'c-1', phone_flag: 'FLAG-SECRET', label_a: 'visible', label_b: 'obscured' })
    ])
    const html = page({ slot: 'a', key: 'aaa' })
    expect(html).toContain('Slot a labelled landmark visible')
    expect(html).toContain('Slot b labelled obscured')
    expect(html).not.toContain('FLAG-SECRET')
    expect(html).not.toContain('phone_flag')
  })
})

describe('labelling', () => {
  test('a matching second label settles the frame and writes the figures', () => {
    const { page, writes } = harness([row({ capture_id: 'c-1', label_b: 'visible' })])
    const html = page({ slot: 'a', key: 'aaa', action: 'label', capture_id: 'c-1', value: 'visible' })
    expect(writes).toEqual(['label c-1 a visible', 'settlement c-1 visible true', 'figures 1 1'])
    expect(html).toContain('Recorded landmark visible for c-1.')
  })

  test('a differing second label waits for resolve instead of settling', () => {
    const { page, writes } = harness([row({ capture_id: 'c-1', label_b: 'obscured' })])
    page({ slot: 'a', key: 'aaa', action: 'label', capture_id: 'c-1', value: 'visible' })
    expect(writes).toEqual(['label c-1 a visible', 'figures 0 null'])
  })

  test('resolve records the agreed label and the figures', () => {
    const { page, writes } = harness([
      row({ capture_id: 'c-1', phone_flag: 'obscured', label_a: 'visible', label_b: 'obscured' })
    ])
    page({ slot: 'a', key: 'aaa', action: 'resolve', capture_id: 'c-1', value: 'obscured' })
    expect(writes).toContain('settlement c-1 obscured true')
    expect(writes).toContain('figures 1 1')
  })

  test('a bad value writes nothing and says what to pick', () => {
    const { page, writes } = harness([row({ capture_id: 'c-1' })])
    const html = page({ slot: 'a', key: 'aaa', action: 'label', capture_id: 'c-1', value: 'maybe' })
    expect(writes).toEqual([])
    expect(html).toContain('Pick &quot;Landmark visible&quot; or &quot;Obscured&quot;.')
  })

  test('state-changing actions run under the script lock', () => {
    const fixture = harness([row({ capture_id: 'c-1' })])
    fixture.page({ slot: 'a', key: 'aaa' })
    expect(fixture.locks()).toBe(0)
    fixture.page({ slot: 'a', key: 'aaa', action: 'label', capture_id: 'c-1', value: 'visible' })
    expect(fixture.locks()).toBe(1)
  })
})

describe('daylight', () => {
  test('night frames never reach a slot', () => {
    const { page } = harness([row({ capture_id: 'c-night', device_time: '2026-11-07T20:00:00+08:00' })])
    const html = page({ slot: 'a', key: 'aaa' })
    expect(html).toContain('n=0')
    expect(html).not.toContain('c-night')
  })

  test('labelling a night frame is refused', () => {
    const { page, writes } = harness([row({ capture_id: 'c-night', device_time: '2026-11-07T20:00:00+08:00' })])
    const html = page({ slot: 'a', key: 'aaa', action: 'label', capture_id: 'c-night', value: 'visible' })
    expect(writes).toEqual([])
    expect(html).toContain('outside daylight hours')
  })
})

describe('verdict', () => {
  function settledSet(n: number, obscured: number, agreeing: number): ProbationRow[] {
    return Array.from({ length: n }, (_, i) =>
      row({
        capture_id: `c-${i}`,
        phone_flag: i < obscured ? 'obscured' : 'visible',
        label_a: i < obscured ? 'obscured' : 'visible',
        label_b: i < obscured ? 'obscured' : 'visible',
        settled: i < obscured ? 'obscured' : 'visible',
        agrees: i < agreeing
      })
    )
  }

  test('the verdict view prints the figures and offers to record', () => {
    const { page } = harness(settledSet(100, 10, 90))
    const html = page({ slot: 'a', key: 'aaa', view: 'verdict' })
    expect(html).toContain('100 frames · 10 obscured · agreement 0.90 (n=100, 95% 0.83–0.94) · 0 disagreements')
    expect(html).toContain('Record verdict')
  })

  test('recording a passing verdict writes pass and the counts', () => {
    const { page, writes } = harness(settledSet(100, 10, 90))
    page({ slot: 'a', key: 'aaa', view: 'verdict', action: 'record' })
    expect(writes).toEqual([
      'verdict passed=true n=100 agreement=0.9 note=pass: 100 frames · 10 obscured · agreement 0.90 (n=100, 95% 0.83–0.94) · 0 disagreements'
    ])
  })

  test('recording with too few frames writes pending', () => {
    const { page, writes } = harness(settledSet(3, 1, 3))
    page({ slot: 'b', key: 'bbb', view: 'verdict', action: 'record' })
    expect(writes[0]).toMatch(/^verdict passed=false n=3 /)
    expect(writes[0]).toContain('note=pending: ')
  })
})

describe('look and access', () => {
  test('the page has one h1, keyboard-and-touch buttons and no single-key shortcuts', () => {
    const { page } = harness([row({ capture_id: 'c-1' })])
    const html = page({ slot: 'a', key: 'aaa' })
    expect(html.match(/<h1/g)?.length).toBe(1)
    expect(html).toContain('min-height:44px')
    expect(html).not.toContain('accesskey')
    expect(html).not.toContain('onkeydown')
    expect(html).not.toContain('<script')
  })

  test('the figures never leak into the labelling view', () => {
    const { page } = harness([
      row({ capture_id: 'c-1', label_a: 'visible', label_b: 'visible', settled: 'visible', agrees: true }),
      row({ capture_id: 'c-2' })
    ])
    const html = page({ slot: 'a', key: 'aaa' })
    expect(html).not.toContain('agreement')
    expect(html).not.toContain('95%')
  })
})
