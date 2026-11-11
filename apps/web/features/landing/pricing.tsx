/* eslint-disable skyclause-i18n/no-literal-jsx -- Landing copy is the DESIGN copy deck verbatim (English P1; Malay LND-7 P2). Images are cropped-only Wikimedia Commons files loaded lazily. */
import { StadiumDrift } from './drift'

// Pricing: "What it costs" — inverted to #efefef. Every price element also holds "proposal, untested" (LND-6).
// MYR prices and inclusions from PRODUCT pricing. No crimson in this section.
const PLANS = [
  {
    group: 'Free',
    tiers: [
      {
        name: 'Commons',
        price: 'Free',
        for: 'Guests and reviewers',
        desc: 'One shared live project for Bukit Jalil; guest windows last 14 days',
        limits: {
          Projects: 'The shared "Bukit Jalil" project',
          Approvers: 'None; guests can’t approve',
          'Hosted-model runs': 'Per-device and per-IP budgets',
          BYOK: 'No',
          Subscribers: 'None',
          Channels: 'In-app; the pilot’s public conditions calendar',
          Support: 'Docs and the status page',
          'SSO and data residency': 'No'
        }
      },
      {
        name: 'Community',
        price: 'Free',
        for: 'One club or student group',
        desc: 'One project of your own',
        limits: {
          Projects: '1',
          Approvers: '3',
          'Hosted-model runs': '150',
          BYOK: 'Yes',
          Subscribers: '200',
          Channels: 'Email, ICS calendar, in-app, one webhook',
          Support: 'Docs, status page and email, best effort',
          'SSO and data residency': 'No'
        }
      }
    ]
  },
  {
    group: 'Paid',
    tiers: [
      {
        name: 'Team',
        price: 'RM 49 a month per organisation, from P2',
        for: 'Clubs and offices with several sites or both packs',
        desc: 'Clubs and offices with several sites or both packs',
        limits: {
          Projects: '5',
          Approvers: '15',
          'Hosted-model runs': '1,500',
          BYOK: 'Yes',
          Subscribers: '2,000',
          Channels: 'All P1 channels; Microsoft 365 and Jira from P2',
          Support: 'Email, best effort, ahead of the free tiers',
          'SSO and data residency': 'No'
        }
      },
      {
        name: 'Campus',
        price: 'RM 900 a month per campus, billed yearly, after GA',
        for: 'A university office sending lecturer notices',
        desc: 'A university office sending lecturer notices',
        limits: {
          Projects: '50',
          Approvers: 'No limit',
          'Hosted-model runs': '15,000',
          BYOK: 'Yes',
          Subscribers: '25,000',
          Channels: 'All channels',
          Support: 'A named contact; any SLA is an open question',
          'SSO and data residency': 'Only once verified'
        }
      }
    ]
  }
] as const

export function Pricing() {
  return (
    <section aria-labelledby="pricing-heading" className="landing-section landing-inverted landing-reveal-0">
      <div className="landing-inner">
        <h2 id="pricing-heading" className="landing-head landing-reveal-0">
          What it costs
        </h2>
        <p className="landing-reveal-1">Prices in MYR. Every price is a proposal, untested.</p>
      </div>
      {PLANS.map((group) => (
        <div key={group.group} className="landing-reveal-2">
          <h3>{group.group}</h3>
          {group.tiers.map((tier) => (
            <article key={tier.name} aria-label={tier.name}>
              <h4>{tier.name}</h4>
              <p data-source="/legal/terms#plans">
                <span className="font-medium">{tier.price}</span> · proposal, untested
              </p>
              <p data-source="/legal/terms#service">{tier.for}</p>
              <p data-source="/legal/terms#service">{tier.desc}</p>
              <table>
                <caption data-source="/legal/terms#plans">{tier.name} inclusions · proposal, untested</caption>
                <thead>
                  <tr>
                    <th scope="col">Limit</th>
                    <th scope="col">{tier.name}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(tier.limits).map(([limit, value]) => (
                    <tr key={limit}>
                      <th scope="row">{limit}</th>
                      <td data-source="/legal/terms#plans">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ))}
        </div>
      ))}
      <StadiumDrift />
    </section>
  )
}
