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
    const text = `Gauge 5${char}60 mm.`
    for (const set of [
      (b: ReturnType<typeof replayBundle>) => (b.calls[0]!.notices[0]!.body = text),
      (b: ReturnType<typeof replayBundle>) => (b.calls[0]!.notices[0]!.subject = text),
      (b: ReturnType<typeof replayBundle>) => (b.calls[0]!.reason = text)
    ]) {
      expect(failing(set)).toEqual([expect.stringContaining(`invisible character ${code}; remove it`)])
    }
  })

  test('refuses an invisible character a link path hides as a percent escape', () => {
    expect(failing((b) => (b.calls[0]!.reason = 'See https://skyclause.m1ku.tech/r/x-5%E2%80%8B60'))).toEqual([
      expect.stringContaining('invisible character U+200B')
    ])
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

describe('look-alike separators in figures', () => {
  const failing = (change: (bundle: ReturnType<typeof replayBundle>) => void) => {
    const bundle = replayBundle()
    change(bundle)
    const result = validate(bundle, replayInput())
    return result.ok ? [] : result.reasons
  }
  const where = {
    body: (b: ReturnType<typeof replayBundle>, text: string) => (b.calls[0]!.notices[0]!.body = text),
    subject: (b: ReturnType<typeof replayBundle>, text: string) => (b.calls[0]!.notices[0]!.subject = text),
    reason: (b: ReturnType<typeof replayBundle>, text: string) => (b.calls[0]!.reason = text)
  }
  const refused = (text: string, expected: string) => {
    for (const [name, set] of Object.entries(where)) {
      expect(
        failing((b) => set(b, text)),
        name
      ).toContainEqual(expect.stringContaining(expected))
    }
  }

  test.each(['\u{307}', '\u{301}', '\u{20DD}', '\u{1AB0}'])('refuses combining mark %j after a digit', (mark) => {
    refused(`Gauge 5${mark}60 mm.`, 'combining mark')
  })

  test.each(['\u{0}', '\u{1}', '\u{1B}', '\u{7F}', '\u{80}', '\u{85}', '\u{9F}'])(
    'refuses control character %j',
    (char) => {
      refused(`Gauge 5${char}60 mm.`, 'control character')
    }
  )

  test.each(['\u{2009}', '\u{200A}', '\u{202F}', '\u{2006}', '\u{A0}', '\u{3000}'])(
    'refuses the space %j between digits',
    (space) => {
      refused(`Gauge 5${space}60 mm.`, 'space between digits')
    }
  )

  test.each(['\u{5D0}', '\u{627}', '\u{710}', '\u{FB1D}', '\u{10800}'])(
    'refuses the right-to-left character %j next to a digit',
    (letter) => {
      refused(`Gauge 5${letter}60 mm.`, 'right-to-left')
      refused(`Gauge ${letter} 60 mm.`, 'right-to-left')
    }
  )

  test('refuses look-alike letters in a spelled-out number', () => {
    refused('Rain reached one hundrеd mm.', 'spelled-out number')
    refused('Rain reached twеnty mm.', 'spelled-out number')
    refused('Rain reached ѕіхtу mm.', 'spelled-out number')
    refused('Rain reached ＨＵＮＤＲＥＤ mm.', 'spelled-out number')
  })

  test('refuses look-alike capital I, m written as rn, and marks inside spelled-out numbers', () => {
    for (const text of ['FІFTY', 'MӀLLION', 'ՠillion', 'hundṛed', 'hundr\u0332ed', 'THІRTY']) {
      refused(`Rain reached ${text} mm.`, 'spelled-out number')
    }
    for (const text of ['Reply UNSUBSCRІBE to stop.', 'Skyclause is nọt a safety service.']) {
      for (const set of [where.body, where.subject]) {
        expect(failing((b) => set(b, text))).toContainEqual(expect.stringContaining('template line'))
      }
    }
  })

  test('refuses right-to-left punctuation, thin spaces beside a separator and line separators between digits', () => {
    refused('Gauge 5\u05F360 mm.', 'right-to-left')
    refused('Gauge 5\u061F60 mm.', 'right-to-left')
    refused('Gauge א\u05B060 mm.', 'right-to-left')
    refused('Gauge 2,\u2009060 mm.', 'space between digits')
    refused('Gauge 39.\u200A60 mm.', 'space between digits')
    refused('Gauge 5\u202860 mm.', 'space between digits')
  })

  test('refuses a thin space hidden as a percent escape in an allowed link path', () => {
    refused('See https://skyclause.m1ku.tech/n/5%E2%80%8A60 now.', 'space between digits')
    refused('See https://skyclause.m1ku.tech/n/5%C2%A060 now.', 'space between digits')
  })

  test('accepts text pasted from a word processor: no-break space before a unit, soft line break, CRLF, smart quotes', () => {
    const text = 'Hujan lebat\u000B“kuat”\r\n\tGauge 39.0\u00A0mm in 60\u00A0min – ‘amaran’.'
    for (const set of Object.values(where)) expect(failing((b) => set(b, text))).toEqual([])
  })

  test('refuses a template line written with look-alike letters', () => {
    for (const text of ['Skyclause is nоt a safety service.', 'Reply unѕubscribe to stop.']) {
      for (const set of [where.body, where.subject]) {
        expect(failing((b) => set(b, text))).toContainEqual(expect.stringContaining('template line'))
      }
    }
  })

  test('still accepts Malay and English text with spaces, new lines, accents and plain figures', () => {
    const text = 'Hujan lebat di Cheras.\n\tGauge 39.0 mm in 60 min; café, naïve, résumé, Zürich, Çelik, Ñandú, 5 mm.'
    for (const set of Object.values(where)) expect(failing((b) => set(b, text))).toEqual([])
  })
})

describe('look-alike punctuation, letter-digits and small capitals', () => {
  const failing = (change: (bundle: ReturnType<typeof replayBundle>) => void) => {
    const bundle = replayBundle()
    change(bundle)
    const result = validate(bundle, replayInput())
    return result.ok ? [] : result.reasons
  }
  const where = {
    body: (b: ReturnType<typeof replayBundle>, text: string) => (b.calls[0]!.notices[0]!.body = text),
    subject: (b: ReturnType<typeof replayBundle>, text: string) => (b.calls[0]!.notices[0]!.subject = text),
    reason: (b: ReturnType<typeof replayBundle>, text: string) => (b.calls[0]!.reason = text)
  }
  const refused = (text: string, expected: string) => {
    for (const [name, set] of Object.entries(where)) {
      expect(
        failing((b) => set(b, text)),
        name
      ).toContainEqual(expect.stringContaining(expected))
    }
  }

  test.each(['\u{201A}', '\u{2236}', '\u{B7}', '\u{2D9}', '\u{2800}', '\u{F0B}', '\u{3001}', '\u{66B}', '\u{FF0C}'])(
    'refuses the look-alike punctuation %j between digits',
    (char) => {
      refused(`Gauge 5${char}60 mm.`, 'look-alike punctuation')
    }
  )

  test.each(['ꓹ', 'ꓸ', 'ꓽ', 'ː', 'ˑ', 'ꞏ', 'ᐧ', 'ʼ', "'", '`', '.\u0323'])(
    'refuses %j between digits, a letter or ASCII mark that reads as a separator',
    (char) => {
      refused(`Gauge 5${char}60 mm.`, char === '.\u0323' ? 'combining mark' : 'look-alike punctuation')
    }
  )

  test.each(['5,OOO mm', 'At 5:OO MYT', '5OMM', '5Ominit', 'O.5 mm'])('refuses %j, letters read as digits', (text) => {
    refused(`Gauge ${text}.`, 'letters read as digits')
  })

  test.each(['тwenтy', 'нundred', 'seraтus', 'seriвu', 'lima puluн', 'lima ᴩuluh'])(
    'refuses %j, letters UTS #39 maps onto small capitals',
    (text) => {
      refused(`Rain reached ${text} mm.`, 'spelled-out number')
    }
  )

  test('refuses a comma between digits that is not a thousands group', () => {
    refused('Gauge 5,60 mm.', 'comma between digits')
    refused('Gauge 5,6000 mm.', 'comma between digits')
  })

  test.each(['5OO mm', '5l mm', '5Ο mm', '5ОО mm', '5ᴏᴏ mm', '5I mm', '5oo mm', 'l5 mm', 'O5 mm'])(
    'refuses %j, letters read as digits',
    (text) => {
      refused(`Gauge ${text}.`, 'letters read as digits')
    }
  )

  test.each(['ʜᴜɴᴅʀᴇᴅ', 'ᴛᴡᴇɴᴛʏ', 'ꜰɪꜰᴛʏ', 'ᴍɪʟʟɪᴏɴ', 'ᴛʜᴏᴜꜱᴀɴᴅ', 'sɪxᴛʏ'])(
    'refuses the small capitals %j in a spelled-out number',
    (text) => {
      refused(`Rain reached ${text} mm.`, 'spelled-out number')
    }
  )

  test('refuses a template line written in small capitals', () => {
    for (const set of [where.body, where.subject]) {
      expect(failing((b) => set(b, 'Reply ᴜɴꜱᴜʙꜱᴄʀɪʙᴇ to stop.'))).toContainEqual(
        expect.stringContaining('template line')
      )
    }
  })

  test('still accepts Malay and English text, ranges, ordinals, units and thousands groups', () => {
    const text =
      'Hujan lebat 5–60 mm, 5mm, 60min, 5ml, 5th, 5 mm, 60 min. Cuaca: ok, Ill Oloo olive lol, 5 l, I 5, hello, Cheras.'
    for (const set of Object.values(where)) expect(failing((b) => set(b, text))).toEqual([])
    const crowd = { ...replayInput(), quotable: ['27,044', '3,928'] }
    for (const text of ['Forecast 27,044, then rain.', 'Baseline 3,928, forecast 27,044.']) {
      const result = validate(replayBundle(text), crowd)
      expect(result.ok ? [] : result.reasons).toEqual([])
    }
    for (const set of Object.values(where)) expect(failing((b) => set(b, 'Gauge 5, then 60 mm; 39.0 mm.'))).toEqual([])
  })
})

describe('more exotic look-alikes (#512)', () => {
  const failing = (change: (bundle: ReturnType<typeof replayBundle>) => void) => {
    const bundle = replayBundle()
    change(bundle)
    const result = validate(bundle, replayInput())
    return result.ok ? [] : result.reasons
  }
  const where = {
    body: (b: ReturnType<typeof replayBundle>, text: string) => (b.calls[0]!.notices[0]!.body = text),
    subject: (b: ReturnType<typeof replayBundle>, text: string) => (b.calls[0]!.notices[0]!.subject = text),
    reason: (b: ReturnType<typeof replayBundle>, text: string) => (b.calls[0]!.reason = text)
  }
  // In a body, a subject and the reason, and inside the path of an allowed Skyclause link (spaces written as %20).
  const refused = (text: string, expected: string) => {
    for (const [name, set] of Object.entries(where)) {
      expect(
        failing((b) => set(b, text)),
        name
      ).toContainEqual(expect.stringContaining(expected))
    }
    const link = `See https://skyclause.m1ku.tech/r/${encodeURIComponent(text)} now.`
    expect(
      failing((b) => where.body(b, link)),
      link
    ).toContainEqual(expect.stringContaining(expected))
  }

  test.each(['|5 mm', '।5', '︱5'])('refuses %j, punctuation read as the digit 1', (text) => {
    refused(`Gauge ${text}.`, 'look-alike punctuation')
  })

  test.each(['5S mm', '5B mm', '5б mm', 'Ƽ60 mm'])('refuses %j, letters read as digits', (text) => {
    refused(`Gauge ${text}.`, 'letters read as digits')
  })

  test.each(['2 060 mm', '2_060 mm', '2  060 mm'])(
    'refuses %j, a figure grouped with a space or underscore',
    (text) => {
      refused(`Gauge ${text}.`, 'grouped with a space or underscore')
    }
  )

  test('refuses a look-alike separator after a space', () => {
    refused('Gauge 5 ·60 mm.', 'look-alike punctuation U+00B7')
  })

  test.each(['\u{E000}', '\u{F8FF}', '\u{378}'])('refuses the private-use or unassigned character %j', (char) => {
    refused(`Gauge 5${char}60 mm.`, 'private-use, unassigned or surrogate character')
    refused(`Gauge ${char} mm.`, 'private-use, unassigned or surrogate character')
  })

  test('refuses U+12562, newer than the Unicode tables of Node 22 and Bun', () => {
    // Node 26 (Unicode 18) reads it as a digit outside 0-9; Node 22 and Bun see an unassigned character. Either refuses.
    refused('Gauge 5\u{12562}60 mm.', '')
  })

  test('refuses a lone surrogate', () => {
    // encodeURIComponent throws on it, so no link case; decodeURIComponent of its escape throws, which refuses the link.
    for (const set of Object.values(where)) {
      expect(failing((b) => set(b, 'Gauge 5\uD83D60 mm.'))).toContainEqual(expect.stringContaining('U+D83D'))
    }
  })

  test.each(['ŧwenŧy', 'thøusand', 'milłion', 'ħundred', 'seraŧus'])(
    'refuses %j, letters with a stroke in a spelled-out number',
    (text) => {
      refused(`Rain reached ${text} mm.`, 'spelled-out number')
    }
  )

  test.each(['мillion', 'ʜᴜɴᴅʀᴇᴆ', 'ᴍᵻʟʟᵻᴏɴ', 'ᴍɪᴌᴌɪᴏɴ'])(
    'refuses %j, letters UTS #39 maps onto characters with no ASCII skeleton',
    (text) => {
      refused(`Rain reached ${text} mm.`, 'spelled-out number')
    }
  )

  test.each(['🆃🆆🅴🅽🆃🆈', '🅣🅦🅔🅝🅣🅨'])('refuses %j, enclosed letters NFKC leaves alone', (text) => {
    refused(`Rain reached ${text} mm.`, 'spelled-out number')
  })

  test.each(['|hundred|', '｜hundred｜', '🅰hundred'])(
    'still refuses %j: a symbol that folds to a letter keeps word edges',
    (text) => {
      refused(`Rain reached ${text} mm.`, 'spelled-out number hundred')
    }
  )

  test('refuses enclosed letters read as digits', () => {
    refused('Gauge 5🅾🅾 mm.', 'letters read as digits')
  })

  test('accepts an arrow or a minus sign between figures, list separators and a date before a time', () => {
    const text =
      'Gauge 5→60 mm, 5−60 mm; 15:30 · 5 min old; Monday 2 November 2026 15:30 MYT; café, naïve, Zürich; 5 mm.'
    for (const set of Object.values(where)) expect(failing((b) => set(b, text))).toEqual([])
    const crowd = { ...replayInput(), quotable: ['120 people', '2026-11-02'] }
    for (const text of [
      'At 15:30 120 people.',
      'On 2026-11-02 120 people.',
      'Gauge 39.0 120 people.',
      'Gauge 5_60 mm.'
    ]) {
      const result = validate(replayBundle(text), crowd)
      expect(result.ok ? [] : result.reasons, text).toEqual([])
    }
  })

  test.each(['O2', '5lb', '5oz'])('keeps refusing %j: notices quote "{value} {unit}" with a space', (text) => {
    refused(`Gauge ${text}.`, 'letters read as digits')
  })

  test.each(['五十', '廿', '壹佰'])('refuses the CJK numerals %j', (text) => {
    refused(`Rain reached ${text} mm.`, `${text} uses CJK ideographs`)
  })
})
