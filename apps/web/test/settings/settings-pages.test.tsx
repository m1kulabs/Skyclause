import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import BillingPanel from '../../features/settings/organisation/billing/panel'
import AuditPanel from '../../features/settings/organisation/audit/panel'
import OrganisationDataPanel from '../../features/settings/organisation/data/panel'
import AccountDataPanel from '../../features/settings/account/data/panel'

function render<Props extends object>(Panel: ComponentType<Props>, props: Props) {
  return renderToStaticMarkup(createElement(Panel, props))
}

test('the four #108 settings panels replace their unbuilt markers', () => {
  const markup = [
    render(BillingPanel, {
      organization: { id: '018f47a3-b2c1-7c00-8000-000000000702', slug: 'northstar', plan: 'team' }
    }),
    render(AuditPanel, { org: 'northstar', role: 'admin' }),
    render(OrganisationDataPanel, { org: 'northstar', role: 'owner' }),
    render(AccountDataPanel, { email: null })
  ].join('\n')

  expect(markup).not.toContain('data-unbuilt="a-settings-pages"')
})

test('billing reads the active plan and labels every proposal without payment controls', () => {
  const markup = render(BillingPanel, {
    organization: { id: '018f47a3-b2c1-7c00-8000-000000000702', slug: 'northstar', plan: 'team' }
  })
  const prices = [...markup.matchAll(/<p[^>]*data-price[^>]*>(.*?)<\/p>/g)].map((match) => match[1])

  expect(markup).toContain('data-current-plan="team"')
  expect(markup).toContain('Community')
  // The prices are ringgit in the reader's own format, with a no-break space so "RM" never parts from the amount.
  expect(markup).toContain('RM\u00a099 a month per organisation from May 2027')
  expect(markup).toContain('RM\u00a0990 a month per campus, billed yearly after May 2027')
  expect(markup).toContain('The beta collects no payment.')
  expect(prices).toHaveLength(4)
  expect(prices).toContain('Free · proposal, untested')
  expect(prices).toContain('RM\u00a099 a month per organisation from May 2027 · proposal, untested')
  expect(prices).toContain('RM\u00a0990 a month per campus, billed yearly after May 2027 · proposal, untested')
  expect(prices.every((price) => price?.includes('proposal, untested'))).toBe(true)
  expect(markup).not.toMatch(/<(?:form|input|iframe)\b|autocomplete="cc-/i)
})

test('billing in Malay keeps no English proposal label and prices the plans in ringgit', () => {
  const markup = render(BillingPanel, {
    organization: { id: '018f47a3-b2c1-7c00-8000-000000000702', slug: 'northstar', plan: 'team' },
    locale: 'ms'
  })
  const prices = [...markup.matchAll(/<p[^>]*data-price[^>]*>(.*?)<\/p>/g)].map((match) => match[1])

  expect(prices).toHaveLength(4)
  expect(prices.every((price) => price?.includes('cadangan, belum diuji'))).toBe(true)
  expect(markup).not.toContain('proposal, untested')
  expect(prices).toContain('RM\u00a099 sebulan bagi setiap organisasi mulai Mei 2027 · cadangan, belum diuji')
})

test('audit filter controls have names and autocomplete settings', () => {
  const markup = render(AuditPanel, { org: 'northstar', role: 'admin' })

  // A person, an action, a project and a kind of object are chosen from lists; only the two dates are typed.
  for (const name of ['actor_id', 'action', 'target_type', 'project_id', 'from', 'to']) {
    expect(markup).toMatch(
      new RegExp(`<(?:input|select)\\b(?=[^>]*name="${name}")(?=[^>]*autocomplete="off")[^>]*>`, 'i')
    )
  }
  expect(markup).not.toMatch(/<input\b[^>]*name="(?:actor_id|target_id|project_id|target_type)"/i)
  expect(markup).not.toContain('name="target_id"')
})
