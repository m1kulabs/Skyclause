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
  expect(markup).toContain('RM 49 a month per organisation from P2')
  expect(markup).toContain('RM 900 a month per campus, billed yearly after GA')
  expect(markup).toContain('The beta collects no payment.')
  expect(prices).toHaveLength(4)
  expect(prices).toContain('Free · proposal, untested')
  expect(prices).toContain('RM 49 a month per organisation from P2 · proposal, untested')
  expect(prices).toContain('RM 900 a month per campus, billed yearly after GA · proposal, untested')
  expect(prices.every((price) => price?.includes('proposal, untested'))).toBe(true)
  expect(markup).not.toMatch(/<(?:form|input|iframe)\b|autocomplete="cc-/i)
})

test('audit filter controls have names and autocomplete settings', () => {
  const markup = render(AuditPanel, { org: 'northstar', role: 'admin' })

  for (const name of ['actor_id', 'action', 'target_type', 'target_id', 'project_id', 'from', 'to']) {
    expect(markup).toMatch(
      new RegExp(`<(?:input|select)\\b(?=[^>]*name="${name}")(?=[^>]*autocomplete="off")[^>]*>`, 'i')
    )
  }
})
