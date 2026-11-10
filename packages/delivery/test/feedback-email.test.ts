import { describe, expect, test } from 'vitest'
import { renderFeedbackEmail } from '../src/feedback-email'

// #163 (ANL-7): the "Did the weather change your plan?" email after a graded Sky window, in the notice language.

const links = {
  url: 'https://app.skyclause.m1ku.tech/subscribe/abc/feedback',
  unsubscribeUrl: 'https://app.skyclause.m1ku.tech/subscribe/xyz/unsubscribe'
}
const window = { projectName: 'Bukit Jalil', windowTitle: 'CT047 Lecture', windowStartsAt: '2026-11-20T06:00:00Z' }

describe('renderFeedbackEmail', () => {
  test('asks the question about the window, links the answer and unsubscribe pages, and ends with the safety line', () => {
    const email = renderFeedbackEmail({ language: 'en', ...window, ...links })
    expect(email.subject).toBe('Did the weather change your plan?')
    expect(email.text).toContain('CT047 Lecture on 20 November 2026 (Bukit Jalil)')
    expect(email.text).toContain(`Answer yes or no here: ${links.url}`)
    expect(email.text).toContain('Only the number of yes and no answers is kept')
    expect(email.text).toContain(`Stop all notices for Bukit Jalil: ${links.unsubscribeUrl}`)
    expect(email.text.endsWith('Skyclause is not a safety or emergency service. In an emergency, call 999.')).toBe(true)
  })

  test('renders in Malay', () => {
    const email = renderFeedbackEmail({ language: 'ms', ...window, ...links })
    expect(email.subject).toBe('Adakah cuaca mengubah rancangan anda?')
    expect(email.text).toContain(`Jawab ya atau tidak di sini: ${links.url}`)
    expect(email.text).toContain(`Hentikan semua notis untuk Bukit Jalil: ${links.unsubscribeUrl}`)
    expect(
      email.text.endsWith(
        'Skyclause bukan perkhidmatan keselamatan atau kecemasan. Jika berlaku kecemasan, hubungi 999.'
      )
    ).toBe(true)
  })
})
