import { describe, expect, test } from 'vitest'
import { validate } from '../src/validate'
import { designBody, ids, replayBundle, replayInput, sourceUrl } from './fixtures/replay'

describe('CAL-3: every number in a drafted notice equals an indicator value or a window time', () => {
  test("DESIGN's 2 November wording validates on the labelled replay", () => {
    expect(validate(replayBundle(), replayInput())).toEqual({ ok: true, bundle: replayBundle() })
  })

  test('the same body with 39.5 fails naming 39.5', () => {
    const result = validate(replayBundle(designBody.replace('39.0', '39.5')), replayInput())
    expect(result.ok).toBe(false)
    expect(result.ok ? [] : result.reasons).toEqual([expect.stringContaining('39.5')])
  })
})

describe('number rule', () => {
  const reasons = (body: string, input = replayInput()) => {
    const result = validate(replayBundle(body), input)
    return result.ok ? [] : result.reasons
  }

  test('compares as decimals, so 39 equals 39.0', () => {
    expect(reasons('Gauge 39 mm in 60 min to 15:00 MYT.')).toEqual([])
  })

  test('treats indicator names and input IDs as identifiers, not numbers', () => {
    expect(reasons(`Cited: site.rain_60m_mm and w.rain_max_60m_mm on window ${ids.window}.`)).toEqual([])
  })

  test('checks numbers glued to units or inside unknown codes', () => {
    expect(reasons('Gauge 39.5mm, 7min old.')).toEqual([
      expect.stringContaining('39.5 is not a quotable number'),
      expect.stringContaining('7 is not a quotable number')
    ])
    expect(reasons('Gauge X120 reports.')).toEqual([expect.stringContaining('120 is not a quotable number')])
  })

  test('checks times and ISO dates as whole tokens', () => {
    expect(reasons('Reading at 15:10 MYT.')).toEqual([expect.stringContaining('15:10')])
    expect(reasons('On 2026-11-02.')).toEqual([expect.stringContaining('2026-11-02')])
  })

  test('accepts strings the caller adds to quotable', () => {
    expect(reasons('Lebat starts at 31 mm.', { ...replayInput(), quotable: ['31 mm'] })).toEqual([])
  })
})

describe('validate after the schema', () => {
  const failing = (change: (bundle: ReturnType<typeof replayBundle>) => void, input = replayInput()) => {
    const bundle = replayBundle()
    change(bundle)
    const result = validate(bundle, input)
    return result.ok ? [] : result.reasons
  }

  test('rejects a schema miss, naming the path', () => {
    expect(failing((b) => Object.assign(b.calls[0]!, { mode: 'cancelled' }))).toEqual([
      expect.stringContaining('calls.0.mode')
    ])
  })

  test('rejects another pack, an unknown window and an unknown night', () => {
    expect(failing((b) => Object.assign(b, { pack: 'crowd' }))).toEqual([expect.stringContaining('pack crowd')])
    expect(failing((b) => (b.calls[0]!.window_id = ids.night))).toContainEqual(
      expect.stringContaining('is not a window of this run')
    )
    expect(failing((b) => (b.items = [{ kind: 'surge_night_entry', night_id: ids.night }] as never))).toEqual([
      expect.stringContaining(`night ${ids.night} is not in the snapshot`)
    ])
  })

  test('requires fired clauses in the pinned version and cited inputs in the snapshot', () => {
    expect(failing((b) => b.calls[0]!.fired.push({ clause: 'gauge_flood', inputs: [] }))).toEqual([
      expect.stringContaining('clause gauge_flood is not in the pinned sheet')
    ])
    expect(failing((b) => (b.calls[0]!.fired[0]!.inputs = ['site.api_max']))).toEqual([
      expect.stringContaining('input site.api_max is not in the snapshot')
    ])
    expect(failing((b) => Object.assign(b.calls[0]!, { mode: null, no_call: ['site.camera_far_low_frames'] }))).toEqual(
      [expect.stringContaining('input site.camera_far_low_frames is not in the snapshot')]
    )
  })

  test("keeps recipients to that window's candidates", () => {
    expect(failing((b) => b.calls[0]!.recipients.push(ids.night))).toEqual([
      expect.stringContaining(`recipient ${ids.night} is not a candidate`)
    ])
  })

  test('allows links only to source URLs and Skyclause origins', () => {
    const body = (text: string) => (b: ReturnType<typeof replayBundle>) => (b.calls[0]!.notices[0]!.body = text)
    expect(failing(body(`See ${sourceUrl} and https://skyclause.m1ku.tech/c/${ids.window}.`))).toEqual([])
    expect(failing(body('See https://evil.example/x, www.evil.example and evil.example/claim.'))).toEqual([
      expect.stringContaining('link https://evil.example/x'),
      expect.stringContaining('link www.evil.example'),
      expect.stringContaining('link evil.example/claim')
    ])
    expect(failing(body('Write to help@evil.example.'))).toEqual([expect.stringContaining('link help@evil.example')])
    expect(failing(body('Mirror: https://skyclause.m1ku.tech.evil.example/c'))).toEqual([
      expect.stringContaining('link https://skyclause.m1ku.tech.evil.example/c')
    ])
  })

  test('checks numbers inside the path of an allowed Skyclause link', () => {
    const body = (text: string) => (b: ReturnType<typeof replayBundle>) => (b.calls[0]!.notices[0]!.body = text)
    const reason = (text: string) => (b: ReturnType<typeof replayBundle>) => (b.calls[0]!.reason = text)
    const projectId = replayInput().snapshot.projectId
    expect(failing(body('See https://skyclause.m1ku.tech/rain-reached-120-mm today.'))).toEqual([
      expect.stringContaining(
        'notices[0].body (link https://skyclause.m1ku.tech/rain-reached-120-mm): 120 is not a quotable number'
      )
    ])
    expect(failing(body('Doors: https://skyclause.m1ku.tech/doors/19:45'))).toEqual([
      expect.stringContaining('19:45 is not a quotable number')
    ])
    expect(failing(body('See https://skyclause.m1ku.tech/a?n=%31%32%30'))).toEqual([
      expect.stringContaining('120 is not a quotable number')
    ])
    expect(failing(reason('See https://skyclause.m1ku.tech/rain-reached-120-mm'))).toEqual([
      expect.stringContaining(
        '.reason (link https://skyclause.m1ku.tech/rain-reached-120-mm): 120 is not a quotable number'
      )
    ])
    for (const link of [
      'https://skyclause.m1ku.tech/rain-120-mm/../c',
      'https://skyclause.m1ku.tech/rain-120-mm/%2e%2e/c',
      'https://skyclause.m1ku.tech:443/c',
      'https://skyclause.m1ku.tech/rain_one_hundred_mm',
      'https://skyclause.m1ku.tech/rain-%',
      `${sourceUrl.replace('/75', '/rain-120-mm/../75')}`
    ]) {
      expect(failing(body(`See ${link}`)), link).not.toEqual([])
    }
    // Real input identifiers, quotable figures and listed source URLs stay fine.
    expect(
      failing(
        body(`See https://skyclause.m1ku.tech/calls/${ids.window} and https://app.skyclause.m1ku.tech/p/${projectId}`)
      )
    ).toEqual([])
    expect(failing(reason(`See https://skyclause.m1ku.tech/c/${ids.window}?gauge=39.0`))).toEqual([])
    expect(failing(body(`See ${sourceUrl}`))).toEqual([])
  })

  test('checks links and numbers in the reason approvers read', () => {
    const reason = (text: string) => (b: ReturnType<typeof replayBundle>) => (b.calls[0]!.reason = text)
    expect(failing(reason(`Storm confirmed, 39.0 mm per ${sourceUrl}.`))).toEqual([])
    expect(failing(reason('Storm confirmed; see https://evil.example/x or help@evil.example.'))).toEqual([
      expect.stringContaining('.reason: link https://evil.example/x'),
      expect.stringContaining('.reason: link help@evil.example')
    ])
    expect(failing(reason('Storm confirmed, gauge 41.5 mm, ~120 mm soon.'))).toEqual([
      expect.stringContaining('.reason: 41.5 is not a quotable number'),
      expect.stringContaining('.reason: 120 is not a quotable number')
    ])
    expect(failing(reason('Rain reached one hundred mm, ١٢٠ mm.'))).toEqual([
      expect.stringContaining('.reason: ١٢٠'),
      expect.stringContaining('.reason: spelled-out number hundred')
    ])
  })

  test('refuses template lines the model must not write', () => {
    for (const line of [
      'Skyclause is not a safety or emergency service.',
      "Teaching mode is the lecturer's and the university's decision.",
      'Skyclause never excuses attendance.',
      'Reply unsubscribe to stop.',
      'MET Malaysia via data.gov.my, CC BY 4.0.'
    ]) {
      expect(failing((b) => (b.calls[0]!.notices[0]!.body = line))).toContainEqual(
        expect.stringContaining('template line')
      )
    }
  })

  test('drops Malay notices unless an on-duty approver reads Malay', () => {
    const malay = { language: 'ms' as const, subject: 'Gangguan perjalanan', body: 'Hujan lebat 39.0 mm.' }
    const bundle = replayBundle()
    bundle.calls[0]!.notices.push(malay)
    const english = validate(bundle, replayInput())
    expect(english.ok && english.bundle.calls[0]!.notices.map((n) => n.language)).toEqual(['en'])
    const both = validate(bundle, { ...replayInput(), malay_reader: true })
    expect(both.ok && both.bundle.calls[0]!.notices.map((n) => n.language)).toEqual(['en', 'ms'])
  })
})

describe('review findings: bypasses and false results', () => {
  const reasons = (body: string, input = replayInput()) => {
    const result = validate(replayBundle(body), input)
    return result.ok ? [] : result.reasons
  }

  test('rejects digits outside 0-9 and spelled-out numbers from eleven up', () => {
    for (const body of ['Rain reached １２０ mm.', 'Rain reached ١٢٠ mm.', 'Rain reached ¹²⁰ mm.']) {
      expect(reasons(body)).not.toEqual([])
    }
    expect(reasons('Rain reached one hundred and twenty millimetres.')).toEqual([
      expect.stringContaining('spelled-out number hundred'),
      expect.stringContaining('spelled-out number twenty')
    ])
    expect(reasons('One window is at risk.')).toEqual([])
  })

  test('rejects internationalised domains and leaves trusted indicator names alone', () => {
    expect(reasons('Claim at refund.рф/claim or refund.xn--p1ai/claim.')).toEqual([
      expect.stringContaining('link refund.рф/claim'),
      expect.stringContaining('link refund.xn--p1ai/claim')
    ])
    const input = replayInput()
    input.snapshot.inputs.push({ ...input.snapshot.inputs[0]!, name: 'site.night.forecast' })
    expect(reasons('Cited: site.night.forecast.', input)).toEqual([])
  })

  test('quotes rain at its own precision, never rounded', () => {
    const input = replayInput()
    input.snapshot.site['site.rain_60m_mm']!.value = 12.25
    expect(reasons('Gauge 12.25 mm.', input)).toEqual([])
    expect(reasons('Gauge 12.3 mm.', input)).toEqual([expect.stringContaining('12.3 is not a quotable number')])
  })

  test('treats a station ID the input names as an identifier, and any other code as numbers', () => {
    const input = replayInput()
    input.sheet.clauses[0]!.wording.en = 'Storm confirmed at JPS gauge 0232901RF (Lebat class)'
    expect(reasons('Gauge 0232901RF at 15:00 MYT.', input)).toEqual([])
    expect(reasons('Gauge 0232902RF at 15:00 MYT.', input)).toEqual([
      expect.stringContaining('0232902 is not a quotable number')
    ])
  })

  test('a call left without an English notice once Malay is dropped gets a reason', () => {
    const bundle = replayBundle()
    bundle.calls[0]!.notices = [{ language: 'ms', subject: 'Gangguan perjalanan', body: 'Hujan lebat.' }]
    const result = validate(bundle, replayInput())
    expect(result.ok ? [] : result.reasons).toEqual([expect.stringContaining('no English notice')])
  })

  test('catches reworded template lines', () => {
    for (const line of [
      'Skyclause is not an emergency service.',
      'Reply STOP to opt out.',
      'Data licensed under the Open Government Licence.'
    ]) {
      expect(reasons(line)).toContainEqual(expect.stringContaining('template line'))
    }
  })
})

describe('invisible characters', () => {
  const failing = (change: (bundle: ReturnType<typeof replayBundle>) => void) => {
    const bundle = replayBundle()
    change(bundle)
    const result = validate(bundle, replayInput())
    return result.ok ? [] : result.reasons
  }
  // Zero width space, word joiner, byte order mark, soft hyphen, Mongolian vowel separator, a tag, a variation selector, Hangul filler.
  const invisible = ['\u{200B}', '\u{2060}', '\u{FEFF}', '\u{AD}', '\u{180E}', '\u{E0041}', '\u{FE0F}', '\u{3164}']

  test.each(invisible)('refuses invisible character %j inside a figure in a body, a subject and the reason', (char) => {
    const code = `U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`
    const text = `Rain reached 12${char}0 mm.`
    for (const set of [
      (b: ReturnType<typeof replayBundle>) => (b.calls[0]!.notices[0]!.body = text),
      (b: ReturnType<typeof replayBundle>) => (b.calls[0]!.notices[0]!.subject = text),
      (b: ReturnType<typeof replayBundle>) => (b.calls[0]!.reason = text)
    ]) {
      expect(failing(set)).toContainEqual(expect.stringContaining(`invisible character ${code}`))
    }
  })

  test('refuses the character even where no figure is split', () => {
    expect(failing((b) => (b.calls[0]!.notices[0]!.body = `Gauge 39.0 mm\u{200B} in 60 min.`))).toEqual([
      expect.stringContaining('invisible character U+200B')
    ])
  })

  test('still accepts Malay and English text with accents, curly quotes, dashes and ellipses', () => {
    const text = 'Hujan lebat di Cheras — “jangan” keluar; it’s 39.0 mm per jam… Jalan ditutup. Kuala Lumpur ≥ rendah.'
    expect(failing((b) => (b.calls[0]!.notices[0]!.body = text))).toEqual([])
    expect(
      failing((b) => (b.calls[0]!.reason = 'Hujan lebat di Cheras — “jangan” keluar; it’s 39.0 mm per jam…'))
    ).toEqual([])
  })
})
