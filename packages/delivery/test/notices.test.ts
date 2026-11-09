import type { Mode } from '@skyclause/contracts'
import { describe, expect, test } from 'vitest'
import { checkRequiredLines, findAttendanceExcuse, malayApprovalPolicy, renderNotice } from '../src/notices'
import { CONTEXT, LINKS, PERMALINK, SAFETY, callView } from './call-view'

// #152 c-notice-templates: renderNotice, the checks and the language policy, through the package's exports.

const MODES: Array<{ pack: 'sky' | 'crowd'; mode: Mode | null; watch?: boolean }> = [
  { pack: 'sky', mode: 'normal' },
  { pack: 'sky', mode: 'normal', watch: true },
  { pack: 'sky', mode: 'outdoor_limited' },
  { pack: 'sky', mode: 'commute_disruption' },
  { pack: 'sky', mode: 'hybrid_recommended' },
  { pack: 'sky', mode: null },
  { pack: 'crowd', mode: 'normal' },
  { pack: 'crowd', mode: 'surge_night' },
  { pack: 'crowd', mode: null }
]
const EVERY_TEMPLATE = MODES.flatMap((m) =>
  (['en', 'ms'] as const).flatMap((language) =>
    (['email', 'push', 'ics'] as const).map((channel) => ({ ...m, language, channel }))
  )
)

describe('NTC-3: the not-a-safety-service line', () => {
  test.each(EVERY_TEMPLATE)('$pack $mode (watch $watch), $language $channel', ({ language, channel, ...m }) => {
    const r = renderNotice(callView(m), { language, channel, links: LINKS, ...CONTEXT })
    expect(r.text).toContain(SAFETY[language])
    if (r.html !== undefined) expect(r.html).toContain(SAFETY[language])
    expect(r.html === undefined).toBe(channel !== 'email')
  })
})

describe('email (DESIGN "Email notice and ICS entry")', () => {
  test('the English email is the template around the approved wording, in MYT', () => {
    const r = renderNotice(callView(), { language: 'en', channel: 'email', links: LINKS, ...CONTEXT })
    expect(r.subject).toBe('Commute disruption: 15:30–16:30 MYT, Mon 2 Nov (Bukit Jalil)')
    expect(r.text).toBe(
      [
        'Commute disruption for 15:30–16:30 MYT, Monday 2 November 2026.',
        '',
        'Why: Storm confirmed. The gauge logged 39.0 mm.',
        `Approved by the approver on duty at 15:08 MYT. Details and readings: ${PERMALINK}`,
        '',
        SAFETY.en,
        'Not affiliated with APU, KPT, JPS, MET, DOE, Prasarana/Rapid KL or the stadium.',
        'Sources: JPS gauge 0232901RF (JPS Infobanjir, terms unpublished)',
        `Change your notices: ${LINKS.preferences}`,
        `Unsubscribe: ${LINKS.unsubscribe}`
      ].join('\n')
    )
  })
})

describe('ICS entry (DESIGN "Email notice and ICS entry", TRD "Channels and sends", D32)', () => {
  test('SUMMARY names the window by its MYT span; DESCRIPTION lists fired clauses with input ages, never values', () => {
    const r = renderNotice(callView(), { language: 'en', channel: 'ics', links: { permalink: PERMALINK }, ...CONTEXT })
    expect(r).toEqual({
      subject: 'Commute disruption · 15:30–16:30 MYT',
      text: [
        'Storm confirmed (gauge 5 min old)',
        'Approved 15:08 MYT.',
        SAFETY.en,
        'Not affiliated with APU, KPT, JPS, MET, DOE, Prasarana/Rapid KL or the stadium.',
        'Sources: JPS gauge 0232901RF (JPS Infobanjir, terms unpublished)',
        `Details: ${PERMALINK}`
      ].join('\n')
    })
  })

  test('renders from the call alone, as the feed calls it, with no wording, approver or window', () => {
    const r = renderNotice(callView({ notices: [] }), {
      language: 'en',
      channel: 'ics',
      links: { permalink: PERMALINK }
    })
    expect(r.subject).toBe('Commute disruption')
    expect(r.text).toContain(SAFETY.en)
    expect(r.text).not.toMatch(/39|mm/)
  })

  test('ages over 90 minutes print in hours; a custom clause and an unnamed input print their keys', () => {
    const call = callView({
      fired: [{ clause: 'campus_flood_gate', inputs: ['site.rain_60m_mm', 'site.pump_level'] }],
      shadow: {
        ...callView().shadow,
        clauses: [
          {
            key: 'campus_flood_gate',
            result: 'fired',
            blocked_by: [],
            inputs: [{ ...callView().shadow.clauses[0]!.inputs[0]!, age_s: 7_500 }]
          }
        ]
      }
    })
    const r = renderNotice(call, { language: 'en', channel: 'ics', links: { permalink: PERMALINK } })
    expect(r.text.split('\n')[0]).toBe('campus_flood_gate (gauge 2 h old, site.pump_level)')
  })
})

describe('language, wording and preconditions', () => {
  test('the Malay email is the Malay template around the Malay wording', () => {
    const r = renderNotice(callView({ mode: 'hybrid_recommended' }), {
      language: 'ms',
      channel: 'email',
      links: LINKS,
      ...CONTEXT
    })
    expect(r.subject).toBe('Mod hibrid disyorkan: 15:30–16:30 MYT, Isn 2 Nov (Bukit Jalil)')
    expect(r.text).toBe(
      [
        'Mod hibrid disyorkan untuk 15:30–16:30 MYT, Isnin 2 November 2026.',
        '',
        'Sebab: Ribut disahkan. Tolok mencatat 39.0 mm.',
        `Diluluskan oleh pelulus yang bertugas pada 15:08 MYT. Butiran dan bacaan: ${PERMALINK}`,
        'Mod pengajaran ialah keputusan pensyarah dan universiti. Skyclause tidak sekali-kali memberi pengecualian kehadiran.',
        '',
        SAFETY.ms,
        'Tidak mempunyai hubungan dengan APU, KPT, JPS, MET, DOE, Prasarana/Rapid KL atau pihak stadium.',
        'Sumber: JPS gauge 0232901RF (JPS Infobanjir, terms unpublished)',
        `Tukar notis anda: ${LINKS.preferences}`,
        `Berhenti melanggan: ${LINKS.unsubscribe}`
      ].join('\n')
    )
  })

  test('the model subject is never sent; an edit or clause wording replaces the model body', () => {
    const r = renderNotice(callView(), {
      language: 'en',
      channel: 'email',
      links: LINKS,
      ...CONTEXT,
      wording: 'Storm confirmed over the campus gauge.'
    })
    expect(r.subject + r.text + r.html).not.toContain('Model subject')
    expect(r.text).toContain('Storm confirmed over the campus gauge.')
    expect(r.text).not.toContain('The gauge logged')
  })

  test('push carries the email text without HTML', () => {
    const o = { language: 'en', links: LINKS, ...CONTEXT } as const
    const email = renderNotice(callView(), { ...o, channel: 'email' })
    expect(renderNotice(callView(), { ...o, channel: 'push' })).toEqual({ subject: email.subject, text: email.text })
  })

  test('a Crowd notice with a reply link asks for the plan (CAL-17)', () => {
    const reply = 'https://skyclause.m1ku.tech/subscribe/reply-token/reply'
    const r = renderNotice(callView({ pack: 'crowd', mode: 'surge_night' }), {
      language: 'en',
      channel: 'email',
      links: { ...LINKS, reply },
      ...CONTEXT
    })
    expect(r.text).toContain(
      `Your plan? Reply "keep", "shift to HH:MM" or "shuttle" to this email, or answer here: ${reply}`
    )
  })

  test('a zero-length commute wave is named by its one time', () => {
    const at = '2026-11-02T07:30:00Z'
    const r = renderNotice(callView(), {
      language: 'en',
      channel: 'ics',
      links: LINKS,
      window: { startsAt: at, endsAt: at }
    })
    expect(r.subject).toBe('Commute disruption · 15:30 MYT')
  })

  test('refuses what would hide a missing approval or a LOC-5 fallback', () => {
    const o = { language: 'en', channel: 'email', links: LINKS, ...CONTEXT } as const
    expect(() => renderNotice(callView({ approved_at: null }), o)).toThrow(/approval time/)
    expect(
      renderNotice(callView({ approved_at: null }), { ...o, approver: { role: 'admin', at: '2026-11-02T07:08:00Z' } })
        .text
    ).toContain('Approved by the admin on duty at 15:08 MYT.')
    expect(() => renderNotice(callView({ notices: [] }), o)).toThrow(/no en wording/)
    expect(() => renderNotice(callView(), { ...o, approver: undefined })).toThrow(/approver/)
  })
})

describe('checkRequiredLines: one problem per missing fixed line', () => {
  const hybrid = callView({ mode: 'hybrid_recommended' })
  const render = (language: 'en' | 'ms', channel: 'email' | 'push' | 'ics') =>
    renderNotice(hybrid, { language, channel, links: LINKS, ...CONTEXT })
  const without = (text: string, line: string) => text.replace(line, '')

  test.each(EVERY_TEMPLATE)('a full render passes: $pack $mode, $language $channel', ({ language, channel, ...m }) => {
    const call = callView(m)
    expect(checkRequiredLines(renderNotice(call, { language, channel, links: LINKS, ...CONTEXT }), call)).toEqual([])
  })

  test('removing the teaching-mode line from a Hybrid recommended render fails (CAL-15)', () => {
    const r = render('en', 'email')
    const line = "Teaching mode is the lecturer's and the university's decision. Skyclause never excuses attendance."
    expect(checkRequiredLines({ ...r, text: without(r.text, line) }, hybrid)).toEqual([
      {
        type: 'https://docs.skyclause.m1ku.tech/problems/validation-failed',
        title: 'A required notice line is missing',
        status: 422,
        detail: `The text is missing the teaching-mode line: "${line}"`,
        instance: `/v1/calls/${hybrid.id}#teaching-line-missing`
      }
    ])
  })

  test.each([
    ['safety-line-missing', SAFETY.ms],
    [
      'non-affiliation-missing',
      'Tidak mempunyai hubungan dengan APU, KPT, JPS, MET, DOE, Prasarana/Rapid KL atau pihak stadium.'
    ],
    ['approval-line-missing', 'Diluluskan oleh pelulus yang bertugas pada 15:08 MYT.'],
    ['permalink-missing', PERMALINK],
    ['sources-missing', 'Sumber: JPS gauge 0232901RF (JPS Infobanjir, terms unpublished)']
  ])('removing a Malay line yields %s alone, from the text or the HTML', (slug, line) => {
    const r = render('ms', 'email')
    const fromText = checkRequiredLines({ ...r, text: without(r.text, line) }, hybrid)
    const fromHtml = checkRequiredLines({ ...r, html: r.html!.replaceAll(line, '') }, hybrid)
    for (const problems of [fromText, fromHtml]) {
      expect(problems.map((p) => p.instance)).toEqual([`/v1/calls/${hybrid.id}#${slug}`])
    }
  })

  test('the ICS approval line counts as the approval line', () => {
    const r = render('en', 'ics')
    expect(checkRequiredLines(r, hybrid)).toEqual([])
    expect(checkRequiredLines({ ...r, text: without(r.text, 'Approved 15:08 MYT.') }, hybrid)).toHaveLength(1)
  })

  test('a call citing no source needs no Sources line', () => {
    const quiet = callView({
      shadow: {
        ...callView().shadow,
        clauses: [
          {
            ...callView().shadow.clauses[0]!,
            inputs: [{ ...callView().shadow.clauses[0]!.inputs[0]!, source_ids: [] }]
          }
        ]
      }
    })
    const r = renderNotice(quiet, { language: 'en', channel: 'email', links: LINKS, ...CONTEXT, sources: [] })
    expect(checkRequiredLines(r, quiet)).toEqual([])
  })
})

describe('findAttendanceExcuse: the English and Malay deny-lists (D23, CAL-15)', () => {
  test.each([
    ['en', 'Attendance is NOT  required for the 15:30 class.', 'attendance is not required'],
    ['en', 'You don’t need to attend today.', "don't need to attend"],
    ['en', 'Classes are cancelled this afternoon.', 'classes are cancelled'],
    ['en', 'Feel free to skip class.', 'skip class'],
    ['ms', 'Pelajar TIDAK perlu hadir ke kelas petang ini.', 'tidak perlu hadir'],
    ['ms', 'Kuliah dibatalkan kerana ribut.', 'kuliah dibatalkan'],
    // Drafts and edits pass both lists, whatever their language.
    ['en', 'Students tak perlu hadir.', 'tak perlu hadir'],
    ['ms', 'Kelas: attendance is optional.', 'attendance is optional']
  ])('%s: "%s" matches "%s"', (lang, text, phrase) => {
    expect(findAttendanceExcuse(text, lang)).toBe(phrase)
  })

  test('phrases match whole words only', () => {
    expect(findAttendanceExcuse('The subclass cancelled flag is unrelated.', 'en')).toBeNull()
    expect(findAttendanceExcuse('Leave early; the LRT is crowded.', 'en')).toBeNull()
  })

  test.each(EVERY_TEMPLATE)(
    'no template line trips it: $pack $mode, $language $channel',
    ({ language, channel, ...m }) => {
      const r = renderNotice(callView(m), {
        language,
        channel,
        links: LINKS,
        ...CONTEXT,
        wording: 'Leave before 15:30.'
      })
      expect(findAttendanceExcuse(`${r.subject}\n${r.text}`, language)).toBeNull()
    }
  )
})

describe('LOC-5: malayApprovalPolicy', () => {
  const modelMalay = callView()
  const englishOnly = callView({ notices: callView().notices.filter((n) => n.language === 'en') })

  test('an approver without the flag cannot send a model-written Malay notice', () => {
    expect(malayApprovalPolicy(modelMalay, { readsMalay: false })).toEqual({
      action: 'fallback_en',
      reason: 'malay-reader-required'
    })
  })

  test('a Malay-reading approver sends it', () => {
    expect(malayApprovalPolicy(modelMalay, { readsMalay: true })).toEqual({ action: 'send' })
  })

  test('with no model-written Malay (template Malay), anyone sends', () => {
    expect(malayApprovalPolicy(englishOnly, { readsMalay: false })).toEqual({ action: 'send' })
  })
})
