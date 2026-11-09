import { describe, expect, test } from 'vitest'
import { renderSubscriberEmail } from '../src/subscriber-emails'

// #157: the confirmation and preference-link emails, in the subscriber's notice language.

const url = 'https://app.skyclause.m1ku.tech/subscribe/abc/confirm'

describe('renderSubscriberEmail', () => {
  test('a confirmation names the project, carries the link and the not-a-safety-service line', () => {
    const email = renderSubscriberEmail('confirmation', { language: 'en', projectName: 'Bukit Jalil', url })
    expect(email.subject).toBe('Confirm your notices for Bukit Jalil')
    expect(email.text).toContain(`Confirm here: ${url}`)
    expect(email.text).toContain('Nothing is sent until you confirm.')
    expect(email.text.endsWith('Skyclause is not a safety or emergency service. In an emergency, call 999.')).toBe(true)
  })

  test('a preference link renders in Malay', () => {
    const email = renderSubscriberEmail('preference_link', { language: 'ms', projectName: 'Bukit Jalil', url })
    expect(email.subject).toBe('Pilihan notis anda untuk Bukit Jalil')
    expect(email.text).toContain(`berhenti melanggan, di sini: ${url}`)
    expect(
      email.text.endsWith(
        'Skyclause bukan perkhidmatan keselamatan atau kecemasan. Jika berlaku kecemasan, hubungi 999.'
      )
    ).toBe(true)
  })
})
