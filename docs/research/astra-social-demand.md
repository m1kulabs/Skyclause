# Astra social demand research

Fresh public-source research on campus operations pain, gathered on 3 November 2026 for the [hackathon brief](/docs/BRIEF.md). Thirteen Reddit threads below provide firsthand reports, contrary experiences, and non-APU analogues; none constitutes an APU interview, representative survey, current incident verification, or validation of a proposed product. Opportunity interpretations are labelled **Inference**.

Contents:

1. [Findings that change the shortlist](#findings-that-change-the-shortlist)
1. [Method and evidence limits](#method-and-evidence-limits)
1. [APU sources](#apu-sources)
   1. [S1: APU Wi-Fi loss has specific locations](#s1-apu-wi-fi-loss-has-specific-locations)
   1. [S2: A former student names classrooms and several service failures](#s2-a-former-student-names-classrooms-and-several-service-failures)
   1. [S3: A separate APU student reports intermittent service](#s3-a-separate-apu-student-reports-intermittent-service)
   1. [S4: A rider reports bearable morning waits](#s4-a-rider-reports-bearable-morning-waits)
   1. [S5: New students cannot confidently identify the correct shuttle procedure](#s5-new-students-cannot-confidently-identify-the-correct-shuttle-procedure)
   1. [S6: A Parkhill resident describes an alternative commute](#s6-a-parkhill-resident-describes-an-alternative-commute)
   1. [S7: City of Green laundry is blocked by uncollected clothes](#s7-city-of-green-laundry-is-blocked-by-uncollected-clothes)
1. [Accessibility and repair analogues](#accessibility-and-repair-analogues)
   1. [S8: A lift outage leaves a student outside the lecture hall](#s8-a-lift-outage-leaves-a-student-outside-the-lecture-hall)
   1. [S9: An existing lift can be unavailable because no one has the key](#s9-an-existing-lift-can-be-unavailable-because-no-one-has-the-key)
   1. [S10: A repair vendor cannot reproduce a recurring fault](#s10-a-repair-vendor-cannot-reproduce-a-recurring-fault)
1. [Laboratory alarm analogues](#laboratory-alarm-analogues)
   1. [S11: Power failure disables equipment and alerting](#s11-power-failure-disables-equipment-and-alerting)
   1. [S12: An alarm arrives but no one acts](#s12-an-alarm-arrives-but-no-one-acts)
   1. [S13: The person present cannot find a response procedure](#s13-the-person-present-cannot-find-a-response-procedure)
1. [Opportunity implications](#opportunity-implications)
1. [Disconfirming signals and validation tests](#disconfirming-signals-and-validation-tests)

## Findings that change the shortlist

- **Wi-Fi has the strongest directly relevant evidence.** A May 2026 commenter identifies the crowded cafeteria and stairs; a June 2025 former student identifies classrooms S0801 and E0903. Another student reports intermittent service. These are places and conditions to investigate, not measured diagnoses ([S1](#s1-apu-wi-fi-loss-has-specific-locations), [S2](#s2-a-former-student-names-classrooms-and-several-service-failures), [S3](#s3-a-separate-apu-student-reports-intermittent-service)).
- **The transport problem in the posts is queues, boarding capacity, and uncertain shuttle timing.** A newer rider describes the wait as bearable; a September 2026 resident gives shorter waits than the older complaint. No retained source establishes a missed connection between an APU shuttle and a Rapid feeder ([S2](#s2-a-former-student-names-classrooms-and-several-service-failures), [S4](#s4-a-rider-reports-bearable-morning-waits), [S6](#s6-a-parkhill-resident-describes-an-alternative-commute)).
- **Accessibility failures continue after someone reports a broken lift.** University users describe missing keycard access, unresolved room relocation, and lifts locked outside staffed hours. The operational question is whether a person can actually reach the class or service, including temporary arrangements ([S8](#s8-a-lift-outage-leaves-a-student-outside-the-lecture-hall), [S9](#s9-an-existing-lift-can-be-unavailable-because-no-one-has-the-key)).
- **Laundry evidence points first to clothes left in finished machines.** The direct City of Green resident complaint does not establish broken machines or failed repairs. A separate property manager's experience supports the narrower repair-verification hypothesis only as an analogue ([S7](#s7-city-of-green-laundry-is-blocked-by-uncollected-clothes), [S10](#s10-a-repair-vendor-cannot-reproduce-a-recurring-fault)).
- **The unusual laboratory opportunity is response reliability.** One user says an alarm reached the wrong person; another says two monitoring systems failed to notify anyone; a third had neither reachable contacts nor an accessible response procedure. Local APU demand remains unknown ([S11](#s11-power-failure-disables-equipment-and-alerting), [S12](#s12-an-alarm-arrives-but-no-one-acts), [S13](#s13-the-person-present-cannot-find-a-response-procedure)).

## Method and evidence limits

Searches covered APU and Malaysian student discussions, campus accessibility, recurring facilities repairs, laundry, laboratory freezer failures, and Hacker News university-network discussions. Selection favoured a named place, concrete failure, described workaround, or a contrary firsthand experience. The retained evidence consists of 13 Reddit threads: seven APU-related and six analogues. Hacker News results did not improve the specificity or recency of this set, so no HN source is presented as corroboration.

Each retained thread was opened on Reddit. Dates below are the dates displayed in the search tool's Reddit extraction, with the specific comment date distinguished from the parent thread date. Reddit's opened HTML sometimes shows relative ages from a different crawl date; those ages were not converted into dates. Direct Reddit JSON retrieval returned HTTP 403, so exact timestamps were not independently checked through the API. Comment permalinks are supplied where the claim belongs to a comment rather than the original post.

“Firsthand” means the writer describes their own experience or role; identities, enrolment, locations, logs, and outcomes were not independently authenticated. A report appearing in multiple search results counts once. Replies inside one thread are not independent population samples. Votes are not demand estimates. No promotional reply is used as evidence; for example, VPN advertising in S7 and an admissions representative's unrelated reply were excluded. General hostility toward a university and prejudice in some threads were excluded from the operational interpretation.

## APU sources

### S1: APU Wi-Fi loss has specific locations

**Source:** [APU Wi-Fi, 19 May 2026][s1], especially [the cafeteria/stairs comment by TheDrex-][s1-location]. **Type:** apparent firsthand student-device experience; direct APU relevance.

The commenter says both their phone and laptop lose signal near stairs and at the cafeteria when crowded. The original poster subsequently says [accommodation Wi-Fi was fine, 20 May][s1-counter]. This makes location and crowd conditions more useful than a campus-wide “bad Wi-Fi” claim. No measurements, access-point identifiers, incident tickets, or troubleshooting results are provided; another comment's congestion diagnosis is speculation.

**Inference:** capture repeatable endpoint tests in the same place and comparable conditions before and after intervention. The source establishes symptoms; it does not establish that IT closes tickets prematurely.

[s1]: https://www.reddit.com/r/malaysiauni/comments/1thgkyj/apu_wifi/
[s1-location]: https://www.reddit.com/r/malaysiauni/comments/1thgkyj/comment/omoci19/
[s1-counter]: https://www.reddit.com/r/malaysiauni/comments/1thgkyj/comment/omt32fq/

### S2: A former student names classrooms and several service failures

**Source:** [khelvin__'s comment, 3 June 2025][s2], in “Cybersecurity In APU,” whose parent post is dated 2 June. **Type:** firsthand retrospective complaint by a self-described former foundation student; direct APU relevance.

The writer names unstable Wi-Fi in S0801 and E0903, sometimes nonfunctional lifts, faulty AC and working-plug shortages, and a classroom finder showing rooms empty when occupied. They describe peak shuttle crowding and waits of 30 minutes to an hour. This is one person's account, and the underlying study period is unspecified; the durations are not measured campus statistics. Another current student's reply describes long queues but supplies no logs.

**Inference:** useful leads for Wi-Fi repeatability, room-readiness checks, lift-service continuity, and shuttle boarding observations. Do not count these as four independent validations.

[s2]: https://www.reddit.com/r/malaysiauni/comments/1l19a16/comment/mvov59z/

### S3: A separate APU student reports intermittent service

**Source:** [“I think I've hit rock bottom at this point,” 5 June 2025][s3]. **Type:** firsthand report by a self-described first-year APU student; direct APU relevance.

The author describes Wi-Fi disappearing intermittently or being very slow. A self-described campus resident also reports poor Wi-Fi and says their mobile signal in the room is weak. These accounts provide a second thread with similar symptoms but do not isolate network, application, device, authentication, or power causes. They appear inside broader dissatisfaction posts rather than a technical incident record.

**Inference:** “use your hotspot” may be an unreliable recovery option for some locations. Verify it locally rather than treating cellular access as guaranteed.

[s3]: https://www.reddit.com/r/malaysiauni/comments/1l3zujy/i_think_ive_hit_rock_bottom_at_this_point_i_keep/

### S4: A rider reports bearable morning waits

**Source:** [Realistic-Chef4977's reply, 19 January 2026][s4], in “Recommendations for accomodation near APU,” posted 26 December 2025. **Type:** firsthand commuting experience; direct APU relevance and counterevidence.

The rider says morning buses are more frequent because lines are longer, calls the wait bearable, and reports usually waiting no more than 20 minutes. They advise planning around time of day. The preceding question repeats a friend's experience of full buses, which is hearsay rather than another confirmed observation.

**Inference:** the project must distinguish queue length, number unable to board, and time until actual boarding. A bus appearing on a map does not answer those questions. A universal claim of hour-long waits is unsupported.

[s4]: https://www.reddit.com/r/malaysiauni/comments/1pw159i/comment/o0h2q01/

### S5: New students cannot confidently identify the correct shuttle procedure

**Source:** [“Anyone from APU?”, 18 April 2026][s5], with replies on 20 and 30 April. **Type:** firsthand uncertainty from an incoming student; community advice about boarding, not official policy.

The author does not know whether they can board before receiving a student card. Replies distinguish accommodation routes from the Bukit Jalil LRT route. A 20 April reply recommends reaching the station around 08:20–08:30 for a 09:00 campus arrival; a 30 April reply asks which bus goes to the LRT rather than accommodation.

**Inference:** route identity and boarding instructions are meaningful friction. This thread does not establish an actual denied boarding, missed bus, or missed connection; authoritative instructions could solve much of it without an agent.

[s5]: https://www.reddit.com/r/malaysiauni/comments/1souu9p/anyone_from_apu/

### S6: A Parkhill resident describes an alternative commute

**Source:** [“is parkhill residence good?”, posted 11 August 2026][s6]; the relevant i_burnmoney reply is dated 20 September 2026. **Type:** firsthand residence/commuting description; direct APU-area relevance.

The resident describes walking to the LRT, then taking the bus, with occasional waits of 10–15 minutes; they prefer buying a direct bus pass. Their quoted fare and travel durations are user estimates, not current verified operator information. In particular, the stated total journey duration does not exactly match the sum of all component times, so it should not become a routing calculation.

**Inference:** students choose between routes and certainty as well as price. This newer account weakens the claim that long waits are inevitable, while leaving peak capacity unresolved.

[s6]: https://www.reddit.com/r/malaysiauni/comments/1vllg0e/is_parkhill_residence_good/

### S7: City of Green laundry is blocked by uncollected clothes

**Source:** [“Don't ever come to APU's off-campus City of Green,” 6 June 2025][s7]. **Type:** firsthand resident complaint; direct accommodation relevance, with important counterevidence.

The writer reports roughly three washers and dryers serving the building and clothes left in machines for hours. The precise equipment count and current inventory are unverified. They also say rooms are maintained, wardens are helpful, and network speed is decent: their internet complaint is content restrictions. A reply says another block lacks those restrictions.

**Inference:** distinguish “cycle complete but still occupied” from “machine available.” The evidence does not justify a machine-failure predictor. A resident-agreed collection rule and reminder may solve the problem more simply; no repair backlog is established here.

[s7]: https://www.reddit.com/r/malaysiauni/comments/1l4ub3h/dont_ever_come_to_apus_offcampus_city_of_green/

## Accessibility and repair analogues

### S8: A lift outage leaves a student outside the lecture hall

**Source:** [“Finally had enough,” 3 July 2026][s8], especially [Ready-Falcon6029's university account on 3 July][s8-class] and [canijustbelancelot's account on 4 July][s8-card]. **Type:** firsthand comments about unnamed universities; non-APU analogues. The original post concerns a makerspace, not a university.

One commenter describes attending class through Zoom just outside the lecture hall for six weeks until a professor secured a room change. Another says they were assigned an accessible building without lift-keycard access, then the lift broke after access was granted. Exact incident dates and institutional responses are unknown.

**Inference:** a useful outcome is confirmed access or an agreed temporary class arrangement. A maintenance ticket alone cannot demonstrate that outcome. These stories do not establish Malaysian prevalence or APU's support process.

[s8]: https://www.reddit.com/r/wheelchairs/comments/1um77dr/finally_had_enough/
[s8-class]: https://www.reddit.com/r/wheelchairs/comments/1um77dr/comment/ove59xf/
[s8-card]: https://www.reddit.com/r/wheelchairs/comments/1um77dr/comment/ovkvwf0/

### S9: An existing lift can be unavailable because no one has the key

**Source:** [“Locked Elevators in University Residence Halls (US),” 3 September 2022][s9]. **Type:** campus participant's firsthand account of policy and attempts to get help; the two-hour wait involving another student is secondhand. Older US analogue, retained for its specific workflow.

The writer describes locked residence lifts, irregular desk staffing, and missing keys. A disabled commenter describes alternative lifts being switched off after 18:00 and on weekends despite classes and rehearsals. The author's account is now deleted, though the post remains readable. Legal interpretations in the thread are not relied upon.

**Inference:** access status includes opening hours, credentials, and reachable assistance. “Lift exists” and “lift works” still do not guarantee a usable journey.

[s9]: https://www.reddit.com/r/disability/comments/x51zfe/locked_elevators_in_university_residence_halls_us/

### S10: A repair vendor cannot reproduce a recurring fault

**Source:** [“Repeat issues not fixed when reported,” 22 January 2025][s10]. **Type:** firsthand account by a self-described onsite resident manager; non-campus property-management analogue, country unspecified.

The manager reports a washer repeatedly leaking despite a vendor testing it and finding no leak. They repeatedly stop the machine, report by email, and dry the unit below; eventually both washers are unavailable for weeks. They also describe a lift repeatedly resetting and failing again. This is a particularly clear report → visit → apparent clearance → recurrence loop. Only the manager's perspective is available; no service record confirms what was checked.

**Inference:** a repair-acceptance workflow should request the original failing condition, repeat the relevant check, and preserve recurrence history. This supports a hypothesis, not a claim about APU IT or facilities.

[s10]: https://www.reddit.com/r/PropertyManagement/comments/1i7m3iv/repeat_issues_not_fixed_when_reported/

## Laboratory alarm analogues

### S11: Power failure disables equipment and alerting

**Source:** [“I'm hoping everyone else is having a better start to the week,” 16 June 2026][s11]. **Type:** firsthand laboratory incident report; institution and country unspecified, no demonstrated APU connection.

The author says an electrical problem affected equipment on backup-generator outlets, and neither the freezer nor separate temperature monitors delivered alerts. They discovered the loss on returning to work and speculate about a network issue. The network cause is unconfirmed. The post also says replacement equipment arrived rapidly after discovery: detection, notification, and response must be measured separately.

**Inference:** alarm-path heartbeat and missing-data escalation may matter more than another temperature threshold. An agent that relies on the same failed network still has the same failure mode.

[s11]: https://www.reddit.com/r/labrats/comments/1u6xtkq/im_hoping_everyone_else_is_having_a_better_start/

### S12: An alarm arrives but no one acts

**Source:** [“-60 freezer died last night, are my samples viable?”, 19 July 2026][s12], especially [the author's midnight-alert reply][s12-alert]. **Type:** firsthand account of sample uncertainty; the manager's response is the author's report, not independently confirmed.

The author says a lab manager received the message but ignored it because it was midnight, while the author would have responded. Other commenters describe existing alarm and call-list arrangements. Actual sample viability is unresolved in the retained post, and commenters' biological advice is not treated as evidence of a safe threshold.

**Inference:** acknowledgement, timeout escalation, backup ownership, and confirmation of action are a stronger workflow than notification alone. Existing commercial systems already address parts of this; no novelty claim follows.

[s12]: https://www.reddit.com/r/labrats/comments/1v0uegd/60_freezer_died_last_night_are_my_samples_viable/
[s12-alert]: https://www.reddit.com/r/labrats/comments/1v0uegd/comment/oyi4a0x/

### S13: The person present cannot find a response procedure

**Source:** [“emergency (?!) query about -80 freezers,” 11 March 2025][s13]. **Type:** firsthand live incident narrative with later updates; campus laboratory analogue, institution and country unspecified.

A worker describes a freezer warming, no posted out-of-hours contacts, and no response from their lab or manager. They ask Reddit whether to move samples or wait for campus facilities. A later update says facilities judged the freezer to be recovering and the worker raised the protocol gap with management. The source does not establish that the samples were destroyed.

**Inference:** deliver an approved asset-specific procedure and reachable duty owner, then record acknowledgement and resolution. Generating biological safety thresholds from a model would not solve the documented ownership gap.

[s13]: https://www.reddit.com/r/labrats/comments/1j8ezj2/emergency_query_about_80_freezers_please_help/

## Opportunity implications

All proposals here are **Inference**, not features requested by the posters or validated products.

| Candidate workflow                       | Evidence supports                                                                             | Evidence does not yet support                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Wi-Fi repair acceptance                  | Place-specific symptoms; a reason to repeat the same user-visible check after a change        | Premature APU ticket closure, admin willingness, root cause, or a measurable repair backlog              |
| Shuttle boarding and connection evidence | Queues, variable waits, full buses, route confusion                                           | APU–Rapid missed-transfer frequency, public shuttle positions, or authority to dispatch extra vehicles   |
| Accessible service recovery              | Outages and credential/staffing failures can block education; room changes can restore access | Current APU cases, an accurate live lift feed, or an agreed assistance owner                             |
| Laundry turnover                         | Finished loads left in machines create avoidable waiting                                      | APU machine-failure prevalence, permission to install sensors, or willingness to follow collection rules |
| Room-readiness verification              | One former student reports false empty-room information, AC and socket problems               | A current failure rate or evidence that sensors outperform a booking/process fix                         |
| Laboratory alarm response                | Missing alerts, unacknowledged alerts, and missing procedures are distinct failure modes      | APU wet-lab need, authorised temperature data, or a safe response protocol                               |

The most defensible one-week starting point is a small Wi-Fi evidence study: two or three reported locations, a named endpoint, the same devices, observation times, and a clear unsuccessful-test state. Whether that becomes a repair-acceptance agent depends on learning the actual IT handoff. Count tests as observations, not proof that Wi-Fi itself is faulty: a remote service, authentication state, DNS, or the device can cause similar symptoms.

For transport, investigate an actual sequence: arrive at stop → identify route → bus arrives → board or remain behind → reach destination. The strongest distinction from an ETA screen would be verified left-behind incidents and an operations decision based on them. Public Rapid Bus positions cannot silently substitute for the private APU shuttle's movement.

For accessibility, ask the person what restores their intended activity: an available route, provisioned keycard, approved room change, or assistance they accept. Track confirmation of that outcome. A fresh outage flag is useful, but cannot establish that an alternative route is suitable or that a named person is actually available to help.

## Disconfirming signals and validation tests

- **Wi-Fi:** accommodation is fine in S1, and S7 explicitly separates decent speed from content restrictions. Interview IT about how it currently verifies fixes; stop positioning this as a missing workflow if comparable endpoint verification already exists and is used. Measure at busy and quiet times before attributing problems to crowding.
- **Transport:** S4 and S6 give substantially shorter waits than S2. Observe both successful and failed boardings. If the problem is simply insufficient capacity and staff already have reliable counts, another dashboard may have little effect. Do not claim saved connections until actual connections are observed.
- **Accessibility:** a software record cannot repair a lift or create staffing. Confirm an owner who can arrange alternatives and a user who wants the workflow. An unknown or stale status must remain unknown; never label an unverified route accessible.
- **Laundry:** S7 describes behaviour, not equipment breakdown. First test whether a collection rule, basket arrangement, or existing machine notifications already handles it. A vibration-free machine may still hold clothes; machine inactivity is not availability.
- **Facilities:** S10 is a single non-campus manager's account. Obtain a real APU example showing failed acceptance or recurrence before selling repair verification as an established local pain. Budget, parts availability, and contractor scope may explain delay without an information gap.
- **Laboratories:** named alarm products and call-list practices already appear in S12. Acknowledge established monitoring tools. Keep this a reserve until an APU lab owner, real permissible signal, and approved escalation procedure exist; a domestic-fridge demonstration would establish integration only, not laboratory protection.

Use the [context's real-data rules](/docs/CONTEXT.md#decisions-so-far) for any follow-on prototype. Public complaints can ground the problem narrative; they do not supply live operating state, authorised staff contacts, or fabricated incidents for a demo.
