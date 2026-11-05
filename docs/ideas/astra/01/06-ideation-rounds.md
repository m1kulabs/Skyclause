# Ideation rounds and decisions

Three rounds of desk-based ideation on 3 November 2026. Scores record changing judgments, not user tests. All use the five dimensions and weights defined in [the ranking](00-ranking.md#scoring-matrix): impact, technical build, research, time to impact, daily workflow. New social evidence and substitute checks changed the mechanisms as well as the order.

Contents:

1. [Round one: expand the mechanisms](#round-one-expand-the-mechanisms)
1. [Round two: challenge each criterion](#round-two-challenge-each-criterion)
1. [Round three: compare against substitutes](#round-three-compare-against-substitutes)
1. [Score changes across rounds](#score-changes-across-rounds)
1. [Related criteria and disconfirmation](#related-criteria-and-disconfirmation)

## Round one: expand the mechanisms

Begin with tasks and failures, before names. Candidate descriptions below are hypotheses, not assertions about APU operations.

| Mechanism                                                       | Track considered | Initial attraction                                                  | Disposition and reason                                                                          |
| --------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Verify a Wi-Fi repair from the original affected location       | Automation       | Direct APU connectivity complaints; team can measure real endpoints | Advance as Recheck; premature closure itself remains unproven                                   |
| Detect and act on missed campus transport connections           | Smart Campus     | Direct APU shuttle complaints and public GPS                        | Advance as LastLink, remove unsupported transfer prediction                                     |
| Follow a lift outage through to usable access or an alternative | Automation       | Severe consequences and a cross-office handoff                      | Advance as AccessRelay, remove automatic route-safety claims                                    |
| Verify a washer/dryer works after a fault report                | Automation       | Real state ambiguity; repeat equipment use                          | Advance as WashWitness, remove availability/payment app scope                                   |
| Follow a freezer alert through acknowledgement and recovery     | Automation       | Strong lab accounts of failed response                              | Advance as LabRelay, hardware/local-owner gate remains hard                                     |
| Preflight teaching rooms before sessions                        | Automation       | APU post mentions faulty AC/plugs and stale room availability       | Hold: private room schedules and access; overlaps mature AV monitoring; useful sensing unproven |
| Forecast library seating from ambient sound                     | Smart Campus     | Frequent student task                                               | Reject: sound cannot establish occupancy; privacy and calibration burden                        |
| Explain why research sensor intervals need recollection         | Research         | Real missingness and network failure are demonstrable               | Hold: no reachable research owner; a deterministic quality script may fully solve it            |
| Reconcile scholarship eligibility documents                     | Automation       | Strong administrative workflow                                      | Reject: private real records unavailable and a briefing example likely attracts duplicates      |
| Move outdoor activities when weather turns                      | Automation       | Real weather feed and coordination need                             | Hold: real event owner absent; forecast does not measure a campus hazard                        |
| Recover top-up kiosk faults and failed payments                 | Automation       | Specific APU complaints in older posts                              | Reject: no authorised payment records or machine telemetry; no fabricated transactions          |
| Estimate event transport demand from rail history               | Research         | Public OD data and planning task                                    | Hold: daily aggregates cannot establish event causality; weak immediate action and IoT role     |

The seven eliminated or held candidates fail a gate before full scoring. Giving them polished numerical totals would hide missing inputs. They remain documented so the shortlist is not a list of five unexplained favourites.

## Round two: challenge each criterion

| Finalist    | Impact challenge                                          | Technical challenge                             | Research challenge                                     | Time challenge                                              | Daily-workflow challenge                                               |
| ----------- | --------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| Recheck     | A faster ticket is not necessarily better Wi-Fi           | Browser HTTPS cannot diagnose RF or packet loss | Posts prove connectivity pain, not premature closure   | Can the desk use a packet without changing production Jira? | Closure needs a fresh comparable retest, not one green sample          |
| LastLink    | More dots on a map do not improve transport               | Public T580 data does not track the APU shuttle | No verified APU-to-feeder missed-transfer report found | No operator API or dispatch authority                       | Convert repeat measured gaps into owned service requests               |
| AccessRelay | Repair may take weeks; activity access can improve sooner | GPS cannot identify a lift or prove safe access | Strong analogous accounts, few local ones              | Needs support and facilities ownership                      | Acknowledged repair ticket is not confirmed access                     |
| WashWitness | The problem may be other residents leaving clothes        | Vibration cannot prove cleanliness or dryness   | Overseas fault accounts; local evidence differs        | Vendor permission may dominate development time             | Confirm a useful cycle, keep unknown separate from empty               |
| LabRelay    | Another alert may add alarm fatigue                       | Network and probe can fail together             | Strong lab pain, APU applicability unconfirmed         | Physical probe and supervised equipment access required     | Named acknowledgement and recovery matter more than notification count |

These challenges follow [social research](/docs/research/social.md#reddit), [X evidence](/docs/research/social.md#x), and [technical/substitute checks](/docs/research/competition.md). They produce actual scope changes in the next round.

## Round three: compare against substitutes

| Finalist    | Strongest substitute                                 | Revised mechanism and reason to try it                                                                | Reject when                                                                                           |
| ----------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Recheck     | NetBeez + Jira automation, or technician's checklist | Same-location comparison with missing-evidence requests and an auditable acceptance packet            | Existing desk workflow already collects comparable retests at lower effort                            |
| LastLink    | Transit/transport apps + a spreadsheet complaint log | Distinguish observed service gaps from telemetry gaps; prepare an office-ready change request         | No transport owner can act or manual recording is equally effective                                   |
| AccessRelay | Outage notice + a support phone call                 | Separate repair acknowledgement, agreed alternative and confirmed completion of the intended activity | A short phone call resolves the handoff reliably; no recurrence or office interest                    |
| WashWitness | Circuit-style status app + fault form                | Link fault, network state, inspection and the next successful real cycle                              | The only problem is occupied machines; no equipment access or outcome evidence                        |
| LabRelay    | Existing freezer monitor + duty rota                 | Audit missed acknowledgements and link independent temperature/network recovery evidence              | Existing alarm/rota already covers the gap, or a new system would become a safety-critical dependency |

## Score changes across rounds

Vectors are **I/T/R/H/W**, each 1–5; totals use 25/20/20/15/20. Round-one scores intentionally represent early optimism. Rounds two and three reduce unsupported assumptions; the final targeted mechanisms recover some fit without erasing evidence gaps.

| Idea        | Round one | Total | Round two | Total | Round three | Total | Why the score moved                                                                                                              |
| ----------- | --------- | ----- | --------- | ----- | ----------- | ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| Recheck     | 4/4/3/4/4 | 76    | 4/4/4/4/4 | 80    | 4/4/4/4/5   | 84    | Independent APU accounts strengthen R; explicit acceptance/retest cycle strengthens W; no claim that closure demand is validated |
| LastLink    | 5/4/4/4/4 | 85    | 4/3/4/3/3 | 69    | 4/4/4/3/4   | 77    | Remove promised transfer rescue; narrower evidence workflow restores T/W but keeps slower rollout                                |
| AccessRelay | 5/3/3/4/4 | 77    | 4/3/3/2/3 | 62    | 4/4/3/3/4   | 73    | Safety, maps and multiple owners hurt feasibility; observable alternative-access handoff improves bounded implementation         |
| WashWitness | 4/4/3/4/4 | 76    | 3/3/3/4/3 | 63    | 3/4/3/4/4   | 71    | Existing apps remove novelty; usable-cycle verification provides a narrower measurable workflow                                  |
| LabRelay    | 5/4/4/3/5 | 86    | 4/4/3/2/3 | 66    | 4/4/3/2/4   | 70    | Hardware, safety and lack of APU owner remove early lead; bounded acknowledgement audit restores daily fit only                  |

## Related criteria and disconfirmation

**Crowding:** shared AI tools make implementation speed easy to copy. The defensible hackathon evidence is an actual recurring workflow, a named willing reviewer, real before/after observations and an honest error log. This is a strategy hypothesis, not a claim about the other entrants' submissions.

**Theme:** each physical signal must change an action. Recheck's network is both measured and used to transport evidence. LastLink uses real vehicle GPS but must show route coverage. AccessRelay's camera/IMU proof is the weakest automated-sensing story; retain a human witness and label it participatory sensing. WashWitness needs a real cycle sensor and user outcome. LabRelay needs temperature and independent connectivity evidence.

**Adoption:** aim for one link or QR capture and an output in the office's existing queue. Do not require every student to install a background tracker. Staff must report that reviewing a packet costs less than reconstructing the case; measure correction and approval time.

**Disconfirmation:** positive transport experiences, working network reports, responsive wardens and existing product capabilities are retained in the evidence. No upvote count becomes prevalence. Interviewees should describe their last real incident before seeing the idea, and a second round should test the proposed packet with them. Declining to use it is evidence to change the ranking.

**Demo and delivery:** healthy live data is valid; invented incidents are not. Plan separate live and explicitly labelled real-log replay segments if needed, keep the live app reviewable, and report the actual number of distinct incidents. No extra hardware, connector or agent earns points merely by being present.
