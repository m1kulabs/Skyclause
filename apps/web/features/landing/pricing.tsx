/* eslint-disable skyclause-i18n/no-literal-jsx -- Landing copy is English in the component (no Malay landing route; LND-7 is P2). Prices are PRODUCT's, every one a proposal, untested (LND-6). */
import { Words } from './words'

export const PLANS_SOURCE = '/legal/terms#plans'

// "Two plans, two fields": what anyone can use now (Commons and Community, free) on the wider pink field, and the
// paid plans that come later on the narrower navy one. Each price itself carries "proposal, untested".
export function Pricing({ signInHref }: { signInHref: string }) {
  return (
    <section id="prices" className="pricing" aria-labelledby="pricing-heading" data-reveal-section>
      <h2 id="pricing-heading" className="sr-only">
        Prices, in MYR
      </h2>
      <article className="plan plan--free" aria-labelledby="plan-free">
        <h3 id="plan-free" className="plan-name" data-words>
          <Words text="Commons and Community" />
        </h3>
        <p className="plan-for" data-reveal>
          For guests, reviewers and one club or student group.
        </p>
        <p className="plan-includes" data-source={PLANS_SOURCE} data-reveal>
          Commons: the shared, live &ldquo;Bukit Jalil&rdquo; project for guests and reviewers; guest windows last 14
          days, and guests can&rsquo;t approve. Community: one project of your own with 3 approvers, 150 hosted-model
          runs a month, 200 subscribers, and email, the ICS calendar, in-app and one webhook.
        </p>
        <div className="plan-foot" data-reveal>
          <p className="plan-price" data-source={PLANS_SOURCE}>
            <span className="plan-figure">Free</span> <span className="plan-period">proposal, untested</span>
          </p>
          <a href={signInHref} className="landing-button plan-action">
            Sign in
          </a>
        </div>
      </article>
      <article className="plan plan--paid" aria-labelledby="plan-paid">
        <h3 id="plan-paid" className="plan-name" data-words>
          <Words text="Team and Campus" />
        </h3>
        <p className="plan-for" data-reveal>
          For clubs and offices with several sites or both packs.
        </p>
        <p className="plan-includes" data-source={PLANS_SOURCE} data-reveal>
          Team: 5 projects, 15 approvers, 1,500 hosted-model runs a month and 2,000 subscribers, on all P1 channels,
          with Microsoft 365 and Jira from P2. Campus, for a university office sending lecturer notices:{' '}
          <span className="plan-campus">RM 900 a month per campus, billed yearly, after GA, proposal, untested</span>.
        </p>
        <div className="plan-foot" data-reveal>
          <p className="plan-price" data-source={PLANS_SOURCE}>
            <span className="plan-figure">RM&nbsp;49</span>{' '}
            <span className="plan-period">a month per organisation, from P2, proposal, untested</span>
          </p>
          <a href={PLANS_SOURCE} className="landing-button plan-action">
            Plan terms
          </a>
        </div>
      </article>
    </section>
  )
}
