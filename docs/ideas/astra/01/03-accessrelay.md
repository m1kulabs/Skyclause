# AccessRelay: confirm access after a lift disruption

AccessRelay helps a facilities and student-support liaison follow a disruption through repair acknowledgement, an agreed alternative, completion of the intended activity, and verified recovery. Proposed track: **Intelligent Automation & Digital Transformation**. Rank: **3**, score **73/100**; local demand and adoption remain unvalidated.

Contents:

1. [Evidence and limits](#evidence-and-limits)
1. [User and workflow](#user-and-workflow)
1. [MVP and technical boundaries](#mvp-and-technical-boundaries)
1. [Five judging dimensions](#five-judging-dimensions)
1. [Adoption and substitutes](#adoption-and-substitutes)
1. [Demonstration and evaluation](#demonstration-and-evaluation)
1. [Costs and dated rollout](#costs-and-dated-rollout)
1. [Selection gates](#selection-gates)

## Evidence and limits

The strongest local lead is [a former APU student's 3 June 2025 comment](https://www.reddit.com/r/malaysiauni/comments/1l19a16/comment/mvov59z/), which includes sometimes nonfunctional lifts among several complaints. This retrospective account provides no outage count or accessibility outcome.

In [this exact wheelchair-community comment](https://www.reddit.com/r/wheelchairs/comments/1um77dr/comment/ove59xf/), dated 3 July 2026, the writer describes joining class through Zoom outside the lecture hall for six weeks before a professor secured a room change. The university is unnamed; this unverified account motivates investigating the support handoff.

Malaysian X evidence separates acknowledgement from usable access: [a witness reported an unusable Ampang Park lift](https://x.com/xXpearlyXx/status/1526821246708555781), and [the operator confirmed maintenance and suggested staff assistance](https://x.com/askrapidkl/status/1526830222108426241). A [separate operator correction](https://x.com/askrapidkl/status/1458331642653597696) says an escalator falls outside its maintenance responsibility. X's public syndication endpoint verified these historical posts; authenticated search failed. They establish neither current APU conditions nor premature ticket closure. See [X methodology](/docs/research/social.md#x) and [social evidence limits](/docs/research/social.md#reddit).

## User and workflow

The proposed user is a facilities/student-support liaison authorised to coordinate alternatives. None has agreed to participate.

1. Record an observed obstruction against an asset identifier, observation time, and coarse activity requirement, without identities or a personal timetable.
1. Confirm responsibility and obtain repair acknowledgement. Keep the estimated repair time explicitly a promise.
1. Ask the responsible support person to propose an alternative, such as an approved room change. Record whether the affected person accepts it.
1. Obtain separate confirmation that the intended activity actually happened. An offered room or promised helper does not satisfy this state.
1. Record facilities' recovery confirmation and fresh observational evidence separately. Retain unresolved access questions even after repair work is acknowledged as complete.

Repair and activity access progress independently. Missing confirmation triggers a draft request, never inferred success.

## MVP and technical boundaries

Inherit the [shared delivery contract](00-ranking.md#shared-delivery-contract), including account gates, quotas, approval coverage, privacy, deduplication, and reviewer access. Build one asset record, review queue, and workflow.

A team phone captures timestamped camera observations of permitted public signage or a physical access point, with consent and without bystanders. Optional IMU readings describe phone movement only. This is **participatory sensing**: a person identifies the asset and explains the observation. Phone readings never certify a lift operational or a route safe.

The phone sends evidence over HTTPS to a current Workspace Sheet. Gemini Enterprise performs a verified live 1P Sheets read, identifies missing context, and prepares a reviewed 3P Jira create. A real observation creates an observation-review task. Jira updates, comments, and transitions remain unverified capabilities: the reviewer manually links and transitions the existing issue rather than creating duplicates.

Rules handle identifiers, heartbeat, timestamps, and duplicates. Compare Gemini's interpretation of narrative reports and missing ownership evidence against a form and template.

Network failure changes current status to **unknown**. Retained observations remain dated history. No cached green state or inferred recovery is allowed. Pending approval stays pending outside published coverage. Exclude live route-safety advice, diagnoses, personal schedules, emergency dispatch, and automated lift control.

## Five judging dimensions

These are prospective scores using [the shortlist's unofficial weights](00-ranking.md#scoring-matrix), not achieved results.

| Dimension           | Score | Rationale and proof required                                                                                                                            |
| ------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Impact              | 4     | Completing an otherwise blocked activity is consequential; establish local recurrence and count confirmed completions.                                  |
| Technical build     | 4     | Physical evidence, live 1P reads, and reviewed 3P records serve distinct steps; demonstrate the complete chain and failed-source behavior.              |
| Research            | 3     | Specific Malaysian and university analogues support consequences, but APU evidence is limited; obtain local process observations and contrary accounts. |
| Time to impact      | 3     | A small coordination pilot is plausible; facilities and support ownership add adoption dependencies.                                                    |
| Day-to-day workflow | 4     | Repeated ownership, acceptance, and recovery checks form a recurring task; show real run history and approval delays.                                   |

## Adoption and substitutes

An outage notice plus a support phone call is the strongest substitute. [Campus outage notices](https://news.vt.edu/notices/facilities/2026/09/08-01.html) already publish disruptions. AccessRelay's untested distinction is retaining accepted alternatives and confirmed activity completion across owners. Start with one capture link and the existing queue. Reject the product if a checklist or call provides the same outcome with less effort.

## Demonstration and evaluation

Show a real, intact access point and a consenting teammate completing an ordinary activity; label this a healthy-path observation, not proof of wheelchair accessibility. Disconnect the team's collector, show unknown status, reconnect, and require fresh evidence. Create the real observation task after review. Explain the untested disruption branch; a separately selected, published real incident log may be replayed with provenance, never substituted for a failed live source.

Measure distinct cases, reviewer correction time, approval delay, unconfirmed alternatives, and confirmed activity completions against the current process. Report denominators and observed versus projected results. There are **zero interviews, operational cases, or measured savings**.

## Costs and dated rollout

Planning assumption: RM0 incremental prototype spend using existing phones, sponsored Gemini access, an eligible Workspace account, and available Jira capacity. Verify entitlements, staff time, and any purchase before commitment.

By **3 February 2027**, a proposed support liaison and facilities owner would run one-building coordination with agreed coverage. By **3 May 2027**, those owners would consider expansion only after reviewing completion rates, correction burden, and unresolved cases. Roles, dates, and outcomes remain proposals.

## Selection gates

By **4 November 2026**, obtain one willing liaison, a consented local process example, permissible physical evidence, and a working live-read/reviewed-create chain. Use the shared interview plan. Kill or rerank if no actionable handoff recurs, no owner can arrange alternatives, sensing adds no decision value, or the simpler substitute wins. Require measurable review effort and human-confirmed outcomes; set improvement targets after observing the baseline.
