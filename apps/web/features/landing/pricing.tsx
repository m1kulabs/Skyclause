/* eslint-disable skyclause-i18n/no-literal-jsx -- Landing copy is English in the component (no Malay landing route; LND-7 is P2). Prices are PRODUCT's, every one a proposal, untested (LND-6). */
import { Words } from './words'

export const PLANS_SOURCE = '/legal/terms#plans'

// "Two plans, two fields": what anyone can use now (Commons and Community, free) on the wider pink field, and the
// paid plans that come later on the narrower navy one. Each price itself carries "proposal, untested". Dates are
// PRODUCT's roadmap in plain words: the beta to February 2027, general availability (Team billing, Microsoft 365 and
// Jira) by May 2027, Campus after it.
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
        <div className="plan-includes" data-source={PLANS_SOURCE} data-reveal>
          <p>
            <strong>Commons:</strong> the shared, live &ldquo;Bukit Jalil&rdquo; project for guests and reviewers; guest
            windows last 14&nbsp;days, and guests can&rsquo;t approve.
          </p>
          <p>
            <strong>Community:</strong> 1&nbsp;project of your own with 3&nbsp;approvers, 150 hosted-model runs a month,
            200&nbsp;subscribers, and email, the ICS calendar, in-app and 1&nbsp;webhook.
          </p>
        </div>
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
        <div className="plan-includes" data-source={PLANS_SOURCE} data-reveal>
          <p>
            <strong>Team:</strong> 5&nbsp;projects, 15&nbsp;approvers, 1,500 hosted-model runs a month and
            2,000&nbsp;subscribers, with email, the ICS calendar, webhooks and in-app, and Microsoft 365 and Jira from
            May 2027.
          </p>
          <p>
            <strong>Campus,</strong> for a university office sending lecturer notices:{' '}
            <span className="plan-campus">
              RM&nbsp;990 a month per campus, billed yearly, after May 2027, proposal, untested
            </span>
            .
          </p>
        </div>
        <div className="plan-foot" data-reveal>
          <p className="plan-price" data-source={PLANS_SOURCE}>
            <span className="plan-figure">RM&nbsp;99</span>{' '}
            <span className="plan-period">a month per organisation, from May 2027, proposal, untested</span>
          </p>
          <a href={PLANS_SOURCE} className="landing-button plan-action">
            Plan terms
          </a>
        </div>
      </article>
    </section>
  )
}
